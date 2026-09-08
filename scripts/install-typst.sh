#!/usr/bin/env bash
# Installe le binaire typst (version épinglée, somme de contrôle vérifiée) dans le
# répertoire donné (défaut : /usr/local/bin). Utilisé par le Dockerfile et le CI ;
# utilisable aussi en local :  scripts/install-typst.sh ~/.local/bin
set -euo pipefail

VERSION=0.14.2
DEST=${1:-/usr/local/bin}

case "$(uname -m)" in
  x86_64) ARCH=x86_64; SHA256=a6044cbad2a954deb921167e257e120ac0a16b20339ec01121194ff9d394996d ;;
  aarch64 | arm64) ARCH=aarch64; SHA256=491b101aa40a3a7ea82a3f8a6232cabb4e6a7e233810082e5ac812d43fdcd47a ;;
  *) echo "install-typst: architecture non prise en charge : $(uname -m)" >&2; exit 1 ;;
esac

NAME="typst-$ARCH-unknown-linux-musl"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

curl -fsSL -o "$TMP/typst.tar.xz" \
  "https://github.com/typst/typst/releases/download/v$VERSION/$NAME.tar.xz"
echo "$SHA256  $TMP/typst.tar.xz" | sha256sum -c - >/dev/null
tar -xJf "$TMP/typst.tar.xz" -C "$TMP" "$NAME/typst"
mkdir -p "$DEST"
install -m 755 "$TMP/$NAME/typst" "$DEST/typst"
"$DEST/typst" --version
