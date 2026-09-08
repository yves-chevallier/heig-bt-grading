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

Cette bascule a été faite le 2026-09-07 ; l'ancien fichier monolithique est
conservé en `/etc/caddy/Caddyfile.bak-2026-09-07`. **Recharger seulement une
fois le DNS propagé** : sur un nom qui ne résout pas, Caddy échoue au challenge
ACME et son backoff peut retarder l'émission de plusieurs heures.

Caddy obtient le certificat de `tb.chevallier.io` automatiquement (ACME
HTTP-01, ports 80/443 déjà ouverts dans ufw). Aucune règle de pare-feu à
ajouter : le conteneur n'écoute que sur `127.0.0.1:3001`.

## 3. Code et secrets sur la VM

```bash
sudo git clone git@github.com:yves-chevallier/heig-bt-grading.git /opt/evaluation-tb
cd /opt/evaluation-tb && sudo mkdir -p secrets backups && sudo chmod 700 secrets

# Le conteneur tourne en USER node (uid 1000). Sans ces chown, les deux
# bind-mounts appartiennent à root et sont inutilisables depuis l'application :
#   - ./backups  -> scripts/backup.mjs échoue en « unable to open database file »
#   - ./secrets  -> la clé edu-ID est illisible, et comme oidc.ts la charge
#     paresseusement, la panne n'apparaît qu'au premier login réel, pas au
#     démarrage. Constaté en production les 2026-09-07 et 2026-09-08.
sudo chown 1000:1000 backups
sudo chown -R 1000:1000 secrets   # à refaire après tout dépôt de clé

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

Le dépôt étant public, le package GHCR l'est aussi : la VM tire l'image sans
credential. Le `docker login` de `deploy.sh` ne sert que si le dépôt repasse en
privé.

**Piège vérifié le 2026-09-07** : les deux services partagent
`/root/.docker/config.json`. Le login de heig-classroom (utilisateur
`heig-tin-info`) y reste stocké et fait échouer le pull de l'image de tb en
`denied`, alors qu'elle est publique — docker envoie des identifiants valides
mais sans droit sur ce package, et le registre refuse au lieu de retomber en
anonyme. `deploy.sh` isole donc son authentification dans un `DOCKER_CONFIG`
jetable. Le `deploy.sh` de heig-classroom mériterait le même traitement.

### Rollback

```bash
IMAGE_TAG=<sha du commit sain> docker compose -f compose.prod.yml \
  --env-file .env.prod up -d
```

## 6. Sauvegardes

`scripts/backup.mjs` produit une copie cohérente par `VACUUM INTO` sans arrêter
l'application (la base est en WAL : une simple copie du fichier ne le serait
pas). Rétention 30 jours dans `/opt/evaluation-tb/backups`, hors du volume de
la base, et ce répertoire doit appartenir à l'uid 1000 (§3). Cron quotidien sur
l'hôte :

```cron
17 3 * * * cd /opt/evaluation-tb && docker compose -f compose.prod.yml --env-file .env.prod exec -T web node scripts/backup.mjs >> /var/log/tb-backup.log 2>&1
```

Restauration : arrêter `web`, remplacer `evaluations.sqlite` dans le volume par
le dump (et supprimer les `-wal` / `-shm` résiduels), redémarrer.

**À câbler**, comme pour heig-classroom : la copie hors droplet
(`rclone copy backups remote:tb-backups`).

## 7. SWITCH edu-ID (AAI)

La ressource « HEIG BT Grading » est enregistrée dans l'AAI Resource Registry,
fédération **edu-ID OIDC** (production). Authentification client par
`private_key_jwt` / ES256 : aucun secret partagé, seule la clé publique est
déposée chez SWITCH.

| Réglage                 | Valeur                                                                 |
| ----------------------- | ---------------------------------------------------------------------- |
| `OIDC_ISSUER`           | `https://login.eduid.ch/` (le test est `https://login.test.eduid.ch/`) |
| `OIDC_CLIENT_ID`        | délivré par le registre                                                |
| `OIDC_PRIVATE_KEY_PATH` | `/app/secrets/eduid-private-key.pem`                                   |
| `OIDC_PRIVATE_KEY_KID`  | `tb-eduid-2026`                                                        |
| Redirect URI            | `https://tb.chevallier.io/auth/callback`                               |
| Scopes                  | `openid profile email`                                                 |

Le `kid` doit être identique des deux côtés : c'est lui que le serveur place
dans l'en-tête du client assertion et qui permet à SWITCH de retrouver la clé.
La clé publique se redérive à tout moment depuis la clé privée, sans jamais
exposer celle-ci :

```bash
node -e 'const c=require("node:crypto"),f=require("node:fs");
const j=c.createPublicKey(c.createPrivateKey(f.readFileSync(process.argv[1]))).export({format:"jwk"});
console.log(JSON.stringify({keys:[{...j,use:"sig",alg:"ES256",kid:"tb-eduid-2026"}]},null,2))' \
  secrets/eduid-private-key.pem
```

### Diagnostic des erreurs de login

L'IdP ne renvoie pas d'`error` OAuth mais une page HTML ; le message y est
explicite et distingue bien les cas :

- « The application you have accessed is not registered for use with this
  service » — client inconnu de cet IdP : soit on vise le mauvais issuer
  (test contre production), soit le registre n'a pas encore propagé. La
  propagation a pris quelques minutes le 2026-09-08.
- « An error occurred: InvalidRedirectionURI » — le client est bien enregistré,
  mais la redirect URI appelée ne figure pas parmi celles déclarées. La
  comparaison est exacte : ni barre oblique finale, ni différence de casse.

Un simple `curl` sur `/auth/login` suffit à tester sans navigateur : il renvoie
un 302 dont le `location` peut être appelé directement.

## 8. Contraintes de la VM partagée

- **Disque** : 24 Go depuis le redimensionnement du 2026-09-07 (31 % occupés).
  Auparavant 8,6 Go saturés à 98 % ; les stores pnpm laissés par d'anciens
  builds sur VM ont été supprimés à cette occasion (~1,5 Go). Surveiller
  `df -h /` ; `docker image prune -f` est fait à chaque déploiement.
- **RAM** : 956 Mio pour les deux services (453 Mio avant le redimensionnement),
  plus 2 Gio de swap. tb (SQLite, un seul processus Node) est léger, mais toute
  nouvelle dépendance lourde se paierait sur le Postgres de heig-classroom.
- **Redémarrage de Caddy** : `systemctl reload caddy` recharge les deux vhosts.
  Toujours `caddy validate` avant : une erreur de syntaxe dans `tb.caddy`
  empêcherait aussi heig-classroom de recharger sa configuration.
