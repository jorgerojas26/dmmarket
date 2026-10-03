#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
if [[ ! -t 0 && -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]] && command -v x-terminal-emulator >/dev/null 2>&1; then
  exec x-terminal-emulator -e bash "$DIR/Instalar.sh"
fi
failure() {
  printf '\nNo se pudo abrir el instalador. Revisa el mensaje anterior.\n'
  if [[ -t 0 ]]; then read -r -p 'Pulsa Enter para cerrar…' _ || true; fi
}
trap failure ERR
cd "$DIR"
printf '\nDMMarket — Instalación guiada\n\nSe abrirá un asistente en tu navegador. No necesitas crear un archivo .env.\n\n'
EXPECTED="$(tr -d '\r\n' < dmmarket-app-linux.sha256 | tr 'A-F' 'a-f')"
ACTUAL="$(sha256sum dmmarket-app-linux | awk '{print $1}')"
if [[ ! "$EXPECTED" =~ ^[0-9a-f]{64}$ || "$ACTUAL" != "$EXPECTED" ]]; then
  printf 'La verificación del ejecutable falló. Descarga el paquete nuevamente.\n' >&2
  exit 1
fi
chmod +x dmmarket-app-linux
if [[ "$EUID" -eq 0 ]]; then
  ./dmmarket-app-linux --setup
else
  printf 'Necesitamos permisos de administrador para configurar el arranque automático.\n'
  sudo env DISPLAY="${DISPLAY:-}" WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-}" XAUTHORITY="${XAUTHORITY:-}" DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-}" XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-}" "$DIR/dmmarket-app-linux" --setup
fi
