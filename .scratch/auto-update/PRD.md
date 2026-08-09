# Auto-update — Sistema de actualizaciones

**Status:** done

## Goal

Botón "Buscar actualizaciones" en la UI que detecta versión nueva, descarga el binario, lo verifica y reemplaza el ejecutable en ejecución. App local (binario único Bun + Express + frontend embebido) corriendo en la máquina del cliente.

## Decisiones de diseño

- **Fuente de updates:** GitHub Releases del repo público `jorgerojas26/dmmarket` (API sin token, HTTPS, 60 req/hora por IP — suficiente para un botón de check manual). `GET https://api.github.com/repos/jorgerojas26/dmmarket/releases/latest`.
- **Plataforma target:** solo Windows (`dmmarket-app.exe`). En macOS/dev el apply se rechaza (400). La versión compilada actual también corre en macOS, pero el auto-update es Windows-only.
- **Contrato de assets del release:** dos archivos por release — `dmmarket-app.exe` (binario) y `dmmarket-app.exe.sha256` (contenido: hash hex de 64 chars). Lo consume el flujo de descarga.
- **Comparación semver:** función propia de ~20 líneas (las versiones son `X.Y.Z` simples); no se agrega dependencia.
- **Reemplazo atómico en Windows — truco del rename:** un exe en ejecución NO se puede sobrescribir ni borrar, pero SÍ se puede renombrar. `update.bat` detached: `rename dmmarket-app.exe dmmarket-app.old.exe` → `move /y .dmmarket-update\new.exe dmmarket-app.exe` → `start "" dmmarket-app.exe` → `del /q dmmarket-app.old.exe` (con `timeout /t 3` al inicio para dejar morir el proceso viejo). Al arranque el binario borra cualquier `dmmarket-app.old.exe` sobrante (cubre race del del).
- **Respawn:** nuevo proceso hereda el mismo cwd (carga `.env` de ahí), browser se abre solo (lógica `IS_STANDALONE` ya existente).
- **Migraciones:** hoy corren manuales (`knex migrate:latest`). Para que un update con migración nueva no rompa el cliente, el binario compilado corre migraciones pendientes automáticamente al arranque (mini-migrator que lee las migraciones embebidas en assets.js). Dev no cambia: sigue manual.
- **Versión embebida:** el paso de build genera un módulo de versión desde `package.json` (single source of truth); el binario lo expone por API.
- **Estado de descarga:** polling simple del frontend a un endpoint de progreso (bytes/total); nada de SSE.
- **Riesgo aceptado:** SmartScreen/Defender puede quejarse de bat+exe sin firmar. Carpeta de instalación debe ser escribible por el usuario (nada de Program Files).

## Flujo

1. UI: "Buscar actualizaciones" → check (GitHub) → muestra `{ updateAvailable, latestVersion, notes }`.
2. UI: "Descargar" → descarga a `.dmmarket-update/new.exe` + verifica sha256 → "Descargado — Reiniciar para actualizar" (barra de progreso).
3. UI: "Reiniciar ahora" → apply escribe `update.bat`, spawn detached, responde, `exit`.
4. Bat: rename → move → start → limpieza. Nuevo binario arranca, migraciones corren solas, browser se abre.

## Tickets

- [01 — Versión embebida + status endpoint](issues/01-version-embebida-status.md) — sin blockers
- [02 — Migraciones automáticas al arranque del binario](issues/02-migraciones-auto-arranque.md) — sin blockers
- [03 — Check de actualizaciones (backend + UI botón)](issues/03-check-actualizaciones.md) — bloqueado por 01
- [04 — Script de release](issues/04-script-release.md) — sin blockers
- [05 — Descarga + verificación sha256 (backend + UI progreso)](issues/05-descarga-verificacion.md) — bloqueado por 03, 04
- [06 — Aplicar update + restart + limpieza](issues/06-aplicar-update-restart.md) — bloqueado por 05
