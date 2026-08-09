# 02 — Migraciones automáticas al arranque del binario

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

El binario compilado aplica solo las migraciones pendientes al arrancar, antes de levantar el server. Sin esto, un update con migración nueva rompe la DB del cliente (hoy las migraciones son manuales). Implementación: mini-migrator (~40 líneas) que lee los archivos de migración embebidos en el binario (mismo mecanismo assets.js), los ordena por nombre, consulta la tabla `knex_migrations` para saber cuáles ya corrieron, y ejecuta las pendientes (cada una en su transacción, registrando batch/name). Solo corre en binario compilado (`standalone`); en dev no toca nada (sigue el flujo manual actual). La conexión a DB ya existe y el `.env` se lee desde cwd.

## Acceptance criteria

- [ ] Binario compilado con una migración nueva pendiente la aplica en el primer arranque, antes de que el server escuche.
- [ ] Arranques posteriores no re-ejecutan migraciones ya aplicadas (idempotente, respeta `knex_migrations`).
- [ ] En dev (nodemon) el arranque NO ejecuta migraciones automáticamente; `bun run migrate` sigue funcionando igual.
- [ ] Si una migración falla, el proceso loguea el error y aborta el arranque con código de salida ≠ 0 (no levanta el server con DB medio migrada).
- [ ] Migraciones embebidas se leen con el mismo mecanismo de archivos embebidos existente (no se duplica el mecanismo).
