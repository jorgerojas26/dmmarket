#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
failure() {
  printf '\nNo se pudo abrir el instalador. Revisa el mensaje anterior.\n'
  read -r -p 'Pulsa Enter para cerrar…' _ || true
}
trap failure ERR
cd "$DIR"
printf '\nDMMarket — Instalación guiada\n\nSe abrirá un asistente en tu navegador. No necesitas crear un archivo .env.\n\n'
EXPECTED="$(tr -d '\r\n' < dmmarket-app-mac.sha256 | tr 'A-F' 'a-f')"
ACTUAL="$(shasum -a 256 dmmarket-app-mac | awk '{print $1}')"
if [[ ! "$EXPECTED" =~ ^[0-9a-f]{64}$ || "$ACTUAL" != "$EXPECTED" ]]; then
  printf 'La verificación del ejecutable falló. Descarga el paquete nuevamente.\n' >&2
  read -r -p 'Pulsa Enter para cerrar…' _ || true
  exit 1
fi
chmod +x dmmarket-app-mac
printf 'Necesitamos permisos de administrador para configurar el arranque automático.\n'
sudo "$DIR/dmmarket-app-mac" --setup
