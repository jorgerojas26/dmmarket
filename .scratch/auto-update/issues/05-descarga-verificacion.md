# 05 — Descarga + verificación sha256 (backend + UI progreso)

**Status:** done

**Blocked by:** 03 (necesita las URLs de assets del check), 04 (necesita un release real con el asset `.sha256` para verificar end-to-end).

## What to build

El usuario descarga la actualización y la app la verifica antes de tocarla. Backend: `POST /api/update/download` descarga el exe de la release a `.dmmarket-update/new.exe` (carpeta al lado del binario actual), descarga el asset `.sha256` y compara: hash ≠ esperado → borra lo descargado y responde error (nunca se aplica un binario corrupto). Endpoint de progreso (ej. `GET /api/update/progress`) devuelve bytes descargados / total para polling. Un arranque posterior del binario limpia `.dmmarket-update/` si quedó basura de una descarga interrumpida (misma limpieza de arranque que 06). Frontend: tras el check con update disponible, botón "Descargar actualización" → barra de progreso → estado "Descargado — Reiniciar para actualizar" (el botón de reiniciar llega en 06). Fallos de red durante la descarga: estado intermedio claro, reintentar posible.

## Acceptance criteria

- [ ] `POST /api/update/download` descarga el binario completo y verifica sha256 contra el asset de la release; responde OK solo si el hash coincide.
- [ ] Con hash que no coincide (corrupto/tercero) responde error y NO deja archivo en `.dmmarket-update/`.
- [ ] El endpoint de progreso reporta bytes/total durante la descarga (polling desde el frontend funciona).
- [ ] Descarga interrumpida no rompe arranques siguientes (basura limpia al boot).
- [ ] UI: botón descargar → progreso → "Descargado"; reintentar tras error funciona.
- [ ] En dev responde 400 (solo binario).
