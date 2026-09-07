# Déploiement — `tb.chevallier.io`

L'application est colocalisée avec **heig-classroom** sur le même droplet
DigitalOcean (`classroom.chevallier.io`, 453 Mio de RAM / 1 CPU / 8,6 Go de
disque). Les deux services partagent le Caddy natif de l'hôte et le démon
Docker ; tout le reste est cloisonné.

|                       | heig-classroom                        | evaluation-tb                        |
| --------------------- | ------------------------------------- | ------------------------------------ |
| Domaine               | `classroom.chevallier.io`             | `tb.chevallier.io`                   |
| Port loopback         | 3000                                  | **3001**                             |
| Répertoire            | `/opt/heig-classroom`                 | `/opt/evaluation-tb`                 |
| Image GHCR            | `heig-tin-info/heig-classroom`        | `yves-chevallier/heig-bt-grading`    |
| Base                  | PostgreSQL 17 (conteneur)             | SQLite (volume `evaluations`)        |
| Vhost Caddy           | `/etc/caddy/conf.d/classroom.caddy`   | `/etc/caddy/conf.d/tb.caddy`         |
| Clé de déploiement CI | épinglée à `heig-classroom/deploy.sh` | épinglée à `evaluation-tb/deploy.sh` |

## 1. DNS

`tb.chevallier.io` → IP du droplet (A, et AAAA si IPv6). Vérifier la
propagation avant le premier déploiement, sinon Caddy ne pourra pas obtenir de
certificat et le job `deploy` du CI ne résoudra pas l'hôte :

```bash
dig +short tb.chevallier.io
```

## 2. Caddy : deux vhosts sur un seul serveur

Le `/etc/caddy/Caddyfile` de l'hôte ne contient plus qu'un import ; chaque
projet dépose son fragment dans `conf.d/`, ce qui évite qu'un déploiement
écrase le vhost de l'autre service.

```caddyfile
# /etc/caddy/Caddyfile
import /etc/caddy/conf.d/*.caddy
```

```bash
sudo mkdir -p /etc/caddy/conf.d
# vhost de tb, versionné dans ce dépôt :
sudo cp Caddyfile /etc/caddy/conf.d/tb.caddy
sudo caddy validate --config /etc/caddy/Caddyfile   # avant tout reload
sudo systemctl reload caddy
```

Caddy obtient le certificat de `tb.chevallier.io` automatiquement (ACME
HTTP-01, ports 80/443 déjà ouverts dans ufw). Aucune règle de pare-feu à
ajouter : le conteneur n'écoute que sur `127.0.0.1:3001`.

## 3. Code et secrets sur la VM

```bash
sudo git clone git@github.com:yves-chevallier/heig-bt-grading.git /opt/evaluation-tb
cd /opt/evaluation-tb && sudo mkdir -p secrets backups && sudo chmod 700 secrets

# Clé privée edu-ID (EC P-256, PKCS#8) — jamais dans git :
#   secrets/eduid-private-key.pem   (chmod 600)
# Sa clé publique (JWK, kid tb-eduid-2026) est enregistrée auprès de l'AAI.

sudo cp .env.prod.example .env.prod && sudo chmod 600 .env.prod
sudo nano .env.prod   # ADMIN_PASSWORD_HASH (pnpm admin:password) + client edu-ID
```

Copie chiffrée des secrets dans le coffre (`age`), comme pour heig-classroom.

## 4. Premier démarrage

```bash
cd /opt/evaluation-tb
echo <PAT read:packages> | docker login ghcr.io -u yves-chevallier --password-stdin
docker compose -f compose.prod.yml --env-file .env.prod pull web
docker compose -f compose.prod.yml --env-file .env.prod up -d
docker compose -f compose.prod.yml logs -f web
curl -s https://tb.chevallier.io/healthz    # {"ok":true}
```

## 5. Mises à jour (CI)

Chaque push sur `main` passe les checks, construit l'image sur GitHub Actions,
la pousse sur GHCR (`latest` + sha), puis déclenche `deploy.sh` sur la VM par
SSH (pull + `up -d`).

**Ne jamais builder sur la VM.** Un build local y fait swapper l'hôte et
étrangle le Postgres de heig-classroom (timeouts `Connection terminated`, vécu
le 2026-07-10) et remplit le disque.

### Clé de déploiement (une fois)

La clé du CI de tb est **distincte** de celle de heig-classroom : chacune est
épinglée à son propre script dans `authorized_keys`, donc aucune ne peut
déployer l'autre service ni ouvrir un shell.

```bash
ssh-keygen -t ed25519 -f tb_ci_deploy -N "" -C tb-ci-deploy@evaluation-tb
gh secret set DEPLOY_SSH_KEY --repo yves-chevallier/heig-bt-grading < tb_ci_deploy
# sur la VM :
printf 'command="/opt/evaluation-tb/deploy.sh",restrict %s\n' \
  "$(cat tb_ci_deploy.pub)" >> /root/.ssh/authorized_keys
```

Le package GHCR étant privé, il faut aussi autoriser le dépôt à le tirer :
page du package sur GitHub → _Package settings_ → _Manage Actions access_ →
ajouter `yves-chevallier/heig-bt-grading` en `Read`.

### Rollback

```bash
IMAGE_TAG=<sha du commit sain> docker compose -f compose.prod.yml \
  --env-file .env.prod up -d
```

## 6. Sauvegardes

`scripts/backup.mjs` produit une copie cohérente par `VACUUM INTO` sans arrêter
l'application (la base est en WAL : une simple copie du fichier ne le serait
pas). Rétention 30 jours dans `/opt/evaluation-tb/backups`, hors du volume de
la base. Cron quotidien sur l'hôte :

```cron
17 3 * * * cd /opt/evaluation-tb && docker compose -f compose.prod.yml --env-file .env.prod exec -T web node scripts/backup.mjs >> /var/log/tb-backup.log 2>&1
```

Restauration : arrêter `web`, remplacer `evaluations.sqlite` dans le volume par
le dump (et supprimer les `-wal` / `-shm` résiduels), redémarrer.

**À câbler**, comme pour heig-classroom : la copie hors droplet
(`rclone copy backups remote:tb-backups`).

## 7. Contraintes de la VM partagée

- **Disque** : 8,6 Go, historiquement saturé à 98 %. Les stores pnpm laissés
  par d'anciens builds sur VM ont été supprimés (2026-09-07, ~1,5 Go
  récupérés). Surveiller `df -h /` ; `docker image prune -f` est fait à chaque
  déploiement.
- **RAM** : 453 Mio pour les deux services. tb (SQLite, un seul processus Node)
  est léger, mais toute nouvelle dépendance lourde se paierait sur le Postgres
  de heig-classroom.
- **Redémarrage de Caddy** : `systemctl reload caddy` recharge les deux vhosts.
  Toujours `caddy validate` avant : une erreur de syntaxe dans `tb.caddy`
  empêcherait aussi heig-classroom de recharger sa configuration.
