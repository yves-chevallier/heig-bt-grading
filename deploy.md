# Déploiement — `tb.chevallier.io`

L'application tourne sur la VM Hetzner Cloud `heig-portal` (CPX12, Ubuntu
26.04 LTS, `portal.heig.chevallier.io`), partagée avec **heig-quiz** et
**heig-classroom**. Jusqu'au 2026-09-25, elle tournait sur un droplet
DigitalOcean, en root sous `/opt`. Les trois services partagent le Caddy natif
de l'hôte et le démon Docker rootless du compte `srv` ; tout le reste est
cloisonné.

|                       | heig-quiz                      | heig-classroom                        | evaluation-tb                        |
| --------------------- | ------------------------------ | ------------------------------------- | ------------------------------------ |
| Domaine               | `quiz.chevallier.io`           | `classroom.chevallier.io`             | `tb.chevallier.io`                   |
| Port loopback         | 3002                           | 3000                                  | **3001**                             |
| Répertoire            | `/srv/quiz`                    | `/srv/heig-classroom`                 | `/srv/evaluation-tb`                 |
| Image GHCR            | `heig-tin-info/quiz`           | `heig-tin-info/heig-classroom`        | `yves-chevallier/heig-bt-grading`    |
| Base                  | PostgreSQL 17 (conteneur)      | PostgreSQL 17 (conteneur)             | SQLite (volume `evaluations`)        |
| Vhost Caddy           | `/etc/caddy/conf.d/quiz.caddy` | `/etc/caddy/conf.d/classroom.caddy`   | `/etc/caddy/conf.d/tb.caddy`         |
| Clé de déploiement CI | épinglée à `quiz/deploy.sh`    | épinglée à `heig-classroom/deploy.sh` | épinglée à `evaluation-tb/deploy.sh` |

Les répertoires gardent les noms de base de `/opt` : les noms de projet compose
et de volumes n'ont pas changé.

**Comptes.** `srv` est le compte de service : il possède `/srv` (groupe `srv`,
mode 2775) et les trois checkouts, fait tourner Docker rootless dans sa session
systemd (socket `/run/user/1000/docker.sock`, `DOCKER_HOST` exporté dans son
profil, `loginctl enable-linger srv` pour redémarrer au boot ; aucun démon
Docker root). Son sudo se limite à `caddy validate` et `systemctl reload caddy`
(`/etc/sudoers.d/srv-caddy`). C'est le compte du CI et des agents : il lit les
secrets et les bases des services, mais ne touche pas au système. Les humains
(`ycr`, `tmz`) ont sudo avec mot de passe et passent en `srv` par
`sudo machinectl shell srv@`. Login SSH root refusé
(`/etc/ssh/sshd_config.d/10-hardening.conf`, `AllowUsers ycr tmz srv`).

## 1. DNS

`tb.chevallier.io` est un **CNAME** (Gandi, TTL 300) vers
`portal.heig.chevallier.io` (A `128.140.71.35`, AAAA `2a01:4f8:1c19:1164::1`),
comme `quiz` et `classroom`. Un nouveau service sur la VM = un CNAME de plus.
Vérifier la résolution avant un premier déploiement, sinon Caddy ne pourra pas
obtenir de certificat et le job `deploy` du CI ne résoudra pas l'hôte :

```bash
dig +short tb.chevallier.io
```

## 2. Caddy : un vhost par service

Le `/etc/caddy/Caddyfile` de l'hôte ne contient qu'un import ; chaque projet
dépose son fragment dans `conf.d/`, ce qui évite qu'un déploiement écrase le
vhost d'un autre service (découpage fait le 2026-09-07 sur l'ancien droplet).

```caddyfile
# /etc/caddy/Caddyfile
import /etc/caddy/conf.d/*.caddy
```

`conf.d/` est `root:srv` en mode 2775 (fragments en 664) : `srv` installe son
vhost lui-même, sudo ne sert qu'à valider et recharger.

```bash
# en srv, depuis /srv/evaluation-tb — vhost versionné dans ce dépôt :
cp Caddyfile /etc/caddy/conf.d/tb.caddy
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile   # avant tout reload
sudo systemctl reload caddy
```

**Recharger seulement une fois le DNS propagé** : sur un nom qui ne résout
pas, Caddy échoue au challenge ACME et son backoff peut retarder l'émission de
plusieurs heures.

Caddy obtient le certificat de `tb.chevallier.io` automatiquement (ACME
HTTP-01). Les ports 80/443 sont ouverts dans les deux pare-feu (Cloud Firewall
Hetzner et ufw) ; rien à ajouter : le conteneur n'écoute que sur
`127.0.0.1:3001`.

## 3. Code et secrets sur la VM

En `srv` (`sudo machinectl shell srv@`). Le dépôt est public : clone https,
pas de clé de déploiement GitHub.

```bash
git clone https://github.com/yves-chevallier/heig-bt-grading.git /srv/evaluation-tb
cd /srv/evaluation-tb && mkdir -p secrets backups && chmod 700 secrets

# Clé privée edu-ID (EC P-256, PKCS#8) — jamais dans git :
#   secrets/eduid-private-key.pem   (chmod 600)
# Sa clé publique (JWK, kid tb-eduid-2026) est enregistrée auprès de l'AAI.

# Le conteneur tourne en USER node (uid 1000). Sans ce chown, les deux
# bind-mounts sont inutilisables depuis l'application :
#   - ./backups  -> scripts/backup.mjs échoue en « unable to open database file »
#   - ./secrets  -> la clé edu-ID est illisible, et comme oidc.ts la charge
#     paresseusement, la panne n'apparaît qu'au premier login réel, pas au
#     démarrage. Constaté en production les 2026-09-07 et 2026-09-08.
# Docker est rootless : l'uid 1000 du conteneur est l'uid 100999 de l'hôte.
# Un `chown 1000:1000` côté hôte est donc FAUX ; le chown passe par un conteneur.
docker run --rm -v "$PWD":/w alpine chown -R 1000:1000 /w/secrets /w/backups   # à refaire après tout dépôt de clé

cp .env.prod.example .env.prod && chmod 600 .env.prod
nano .env.prod   # ADMIN_PASSWORD_HASH (pnpm admin:password) + client edu-ID
```

Après ce chown, `srv` ne lit plus la clé directement (propriétaire 100999,
mode 600) ; passer par un conteneur :
`docker run --rm -v /srv/evaluation-tb/secrets:/s:ro alpine cat /s/eduid-private-key.pem`.

Copie chiffrée des secrets dans le coffre (`age`), comme pour heig-classroom.

## 4. Premier démarrage

En `srv`. Le package GHCR est public : aucun `docker login` nécessaire.

```bash
cd /srv/evaluation-tb
docker compose -f compose.prod.yml --env-file .env.prod pull web
docker compose -f compose.prod.yml --env-file .env.prod up -d
docker compose -f compose.prod.yml logs -f web
curl -s https://tb.chevallier.io/healthz    # {"ok":true}
```

Déploiement manuel (CI indisponible), en `srv` : `cd /srv/evaluation-tb &&
./deploy.sh` (avec `SSH_ORIGINAL_COMMAND=<PAT read:packages>` devant si le
package redevient privé). Logs à distance :

```bash
ssh srv@portal.heig.chevallier.io 'cd /srv/evaluation-tb && docker compose -f compose.prod.yml --env-file .env.prod logs --tail 50 web'
```

## 5. Mises à jour (CI)

Chaque push sur `main` passe les checks, construit l'image sur GitHub Actions,
la pousse sur GHCR (`latest` + sha), puis déclenche `deploy.sh` sur la VM par
SSH, en `srv` (pull + `up -d`).

**Ne jamais builder sur la VM** (1 vCPU, 2 Go). Un build local y fait swapper
l'hôte, étrangle le Postgres des autres services (timeouts `Connection
terminated` de heig-classroom, vécu le 2026-07-10 sur le droplet) et remplit le
disque.

### Clé de déploiement (une fois)

La clé du CI de tb est **distincte** de celles de heig-quiz et heig-classroom :
chacune est épinglée à son propre script dans `/home/srv/.ssh/authorized_keys`,
donc aucune ne peut déployer un autre service ni ouvrir un shell.

```bash
ssh-keygen -t ed25519 -f tb_ci_deploy -N "" -C tb-ci-deploy@evaluation-tb
gh secret set DEPLOY_SSH_KEY --repo yves-chevallier/heig-bt-grading < tb_ci_deploy
gh variable set DEPLOY_USER --repo yves-chevallier/heig-bt-grading --body srv
# sur la VM, en srv :
printf 'command="/srv/evaluation-tb/deploy.sh",restrict %s\n' \
  "$(cat tb_ci_deploy.pub)" >> /home/srv/.ssh/authorized_keys
```

Sans la variable `DEPLOY_USER`, le workflow retombe sur `root`, dont le login
SSH est refusé. Les clés d'hôte SSH sont celles de l'ancien droplet (recopiées) :
la ligne `known_hosts` épinglée dans `ci.yml` n'a pas changé.

Le dépôt étant public, le package GHCR l'est aussi : la VM tire l'image sans
credential. Le `docker login` de `deploy.sh` ne sert que si le dépôt repasse en
privé.

**Piège vérifié le 2026-09-07, puis le 2026-09-25** : un
`~/.docker/config.json` partagé entre services. Sur le droplet, le login de
heig-classroom (utilisateur `heig-tin-info`) y restait stocké et faisait
échouer le pull de l'image de tb en `denied`, alors qu'elle est publique —
docker envoie des identifiants valides mais sans droit sur ce package, et le
registre refuse au lieu de retomber en anonyme. Sur la VM Hetzner, quiz et
classroom partagent le compte `srv` : deux déploiements simultanés écrasaient
le login l'un de l'autre entre login et pull (`denied`). Les trois `deploy.sh`
isolent donc leur authentification dans un `DOCKER_CONFIG` jetable.

### Rollback

```bash
IMAGE_TAG=<sha du commit sain> docker compose -f compose.prod.yml \
  --env-file .env.prod up -d
```

## 6. Sauvegardes

`scripts/backup.mjs` produit une copie cohérente par `VACUUM INTO` sans arrêter
l'application (la base est en WAL : une simple copie du fichier ne le serait
pas). Rétention 30 jours dans `/srv/evaluation-tb/backups`, hors du volume de
la base, et ce répertoire doit appartenir à l'uid 1000 du conteneur (§3). Cron
quotidien dans la crontab de `srv` (`crontab -e` en `srv`) — documenté mais
jamais installé sur l'ancien droplet :

```cron
DOCKER_HOST=unix:///run/user/1000/docker.sock
17 3 * * * cd /srv/evaluation-tb && docker compose -f compose.prod.yml --env-file .env.prod exec -T web node scripts/backup.mjs >> /home/srv/tb-backup.log 2>&1
```

Restauration : arrêter `web`, remplacer `evaluations.sqlite` dans le volume par
le dump (et supprimer les `-wal` / `-shm` résiduels), redémarrer.

Couche fournisseur : **Hetzner Backups** (onglet Backups du serveur dans la
console Hetzner, 7 sauvegardes quotidiennes de toute la VM), qui remplace le
snapshot quotidien du droplet. À activer dans la console : vérifier qu'il
l'est.

**À câbler**, comme pour heig-classroom : la copie hors VM
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

- **Taille** : 1 vCPU, 2 Go de RAM + 2 Go de swap (`/swapfile`), 38 Go de
  disque, pour trois services (heig-quiz, heig-classroom, tb) dont deux
  PostgreSQL (~50 Mo chacun mesurés). Surveiller `df -h /` ;
  `docker image prune -f` est fait à chaque déploiement.
- **RAM** : tb (SQLite, un seul processus Node) est léger, mais toute nouvelle
  dépendance lourde se paierait sur les Postgres de heig-quiz et
  heig-classroom. Chaque PDF lance un processus `typst` embarqué dans l'image
  (~45 Mio, 0,4 s), qui disparaît aussitôt.
- **Redémarrage de Caddy** : `systemctl reload caddy` recharge les trois
  vhosts. Toujours `caddy validate` avant : une erreur de syntaxe dans
  `tb.caddy` empêcherait aussi heig-quiz et heig-classroom de recharger leur
  configuration.
- **Docker rootless** : Ubuntu restreint les user namespaces non privilégiés ;
  c'est le profil AppArmor livré `/etc/apparmor.d/rootlesskit` qui laisse
  passer rootlesskit. Ne pas en ajouter un second pour `/usr/bin/rootlesskit`
  (« conflicting profile attachments »).
