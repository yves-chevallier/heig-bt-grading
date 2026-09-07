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

cd /opt/evaluation-tb

# Login GHCR facultatif (package privé) : le token arrive par SSH, est passé
# directement sur stdin de docker login (jamais eval'é), puis oublié.
if [ -n "${SSH_ORIGINAL_COMMAND:-}" ]; then
  printf '%s' "$SSH_ORIGINAL_COMMAND" \
    | docker login ghcr.io -u yves-chevallier --password-stdin >/dev/null
fi

git pull --ff-only
docker compose -f compose.prod.yml --env-file .env.prod pull web
docker compose -f compose.prod.yml --env-file .env.prod up -d
docker image prune -f
echo "deploy: done ($(git rev-parse --short HEAD))"
