# 06 — Aplicar update + restart + limpieza

**Status:** done

**Blocked by:** 05 (necesita el binario descargado y verificado en `.dmmarket-update/`).

## What to build

El usuario reinicia la app y queda en la versión nueva, con su `.env` intacto y el browser abierto. Backend: `POST /api/update/apply` solo en `process.platform === "win32"` (en cualquier otro responde 400 "solo Windows"). Escribe `update.bat` junto al binario y lo lanza detached; responde OK al frontend y el proceso sale (pequeño delay para dejar flush de la respuesta). El bat implementa el truco del rename (ver PRD): `timeout /t 3` (deja morir el proceso viejo) → `rename dmmarket-app.exe dmmarket-app.old.exe` → `move /y .dmmarket-update\new.exe dmmarket-app.exe` → `start "" dmmarket-app.exe` → `del /q dmmarket-app.old.exe` (best-effort; el race lo cubre la limpieza de arranque). El binario al arrancar: borra `dmmarket-app.old.exe` si existe y limpia `.dmmarket-update/`. El nuevo proceso hereda el mismo cwd (`.env`), el server arranca en puerto libre (ya existe retry EADDRINUSE) y abre el browser (ya existe lógica standalone). Frontend: botón "Reiniciar ahora" que llama apply y muestra "Actualizando — la app se reiniciará…".

## Acceptance criteria

- [ ] En Windows: ciclo completo termina con la app nueva corriendo desde el mismo directorio, `.env` intacto, browser abierto, `.old.exe` y `.dmmarket-update/` limpiados (ahora o en el próximo arranque).
- [ ] El bat generado contiene exactamente la secuencia rename → move → start → del con el nombre del binario real.
- [ ] En plataforma ≠ win32, apply responde 400 sin efectos secundarios (no se escribe bat, no se sale del proceso).
- [ ] El proceso responde al frontend antes de salir (no se corta la request).
- [ ] Limpieza de arranque: `dmmarket-app.old.exe` sobrante se borra; `.dmmarket-update/` vacío o residual se elimina.
- [ ] Con la DB con migraciones pendientes (ticket 02), la app nueva las aplica sola al arrancar.
