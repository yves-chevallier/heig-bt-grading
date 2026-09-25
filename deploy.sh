#!/usr/bin/env bash
# Cible de déploiement de la clé SSH à commande forcée du CI. Le authorized_keys
# de la VM épingle cette clé à ce script :
#   command="/opt/evaluation-tb/deploy.sh",restrict ssh-ed25519 AAAA… tb-ci-deploy
# le runner ne peut donc QUE déployer — jamais ouvrir un shell, même si le
# secret fuit. C'est une clé distincte de celle de heig-classroom : chacune est
# épinglée à son propre script, aucune ne peut déployer l'autre service.
#
# Le runner passe son token GHCR éphémère comme « commande » SSH ; il arrive
# dans $SSH_ORIGINAL_COMMAND et ne sert qu'au login pour tirer l'image privée,
# puis expire avec le job — aucun credential de registre n'est stocké sur la VM.
#
# NE JAMAIS builder ici : un build sur la VM (453 Mio / 1 CPU) fait swapper
# l'hôte et étrangle le Postgres de heig-classroom (deploy.md §7). Ce script se
# contente de tirer une image préconstruite et de redémarrer.
set -euo pipefail

# Le checkout du script lui-même : /opt/evaluation-tb sur la VM DigitalOcean (root,
# Docker rootful), /srv/evaluation-tb sur la VM Hetzner (compte `srv`, Docker rootless).
cd "$(dirname "$(readlink -f "$0")")"

# Docker rootless écoute sur un socket par utilisateur ; une session SSH à
# commande forcée ne charge pas toujours le profil qui l'exporte.
if [ "$(id -u)" != 0 ] && [ -z "${DOCKER_HOST:-}" ]; then
  export DOCKER_HOST="unix:///run/user/$(id -u)/docker.sock"
fi

# Les deux services de la VM partageaient /root/.docker/config.json : le login
# de heig-classroom (utilisateur heig-tin-info) y restait stocké et faisait
# échouer le pull de CETTE image en « denied », alors qu'elle est publique.
# On isole donc l'authentification dans un répertoire jetable, que docker et
# docker compose héritent par DOCKER_CONFIG ; le fichier partagé n'est plus
# touché, dans un sens comme dans l'autre.
DOCKER_CONFIG="$(mktemp -d)"
export DOCKER_CONFIG
trap 'rm -rf "$DOCKER_CONFIG"' EXIT

# Login GHCR facultatif (utile seulement si le package redevient privé) : le
# token arrive par SSH, est passé directement sur stdin de docker login
# (jamais eval'é), et disparaît avec le répertoire ci-dessus.
if [ -n "${SSH_ORIGINAL_COMMAND:-}" ]; then
  printf '%s' "$SSH_ORIGINAL_COMMAND" \
    | docker login ghcr.io -u yves-chevallier --password-stdin >/dev/null
fi

git pull --ff-only
docker compose -f compose.prod.yml --env-file .env.prod pull web
docker compose -f compose.prod.yml --env-file .env.prod up -d
docker image prune -f
echo "deploy: done ($(git rev-parse --short HEAD))"
