# 01 — Versión embebida + GET /api/update/status

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

El binario compilado conoce su propia versión y la expone por API. El paso de build genera un módulo de versión leyendo `package.json` del paquete (single source of truth — la versión del release sale de ahí). Endpoint `GET /api/update/status` devuelve `{ currentVersion, platform, standalone }` donde `platform` es el `process.platform` en runtime y `standalone` indica binario compilado vs dev. En dev, `currentVersion` es la versión de `package.json` igualmente (útil para debug).

## Acceptance criteria

- [ ] El paso de build (`build:prepare`) genera el módulo de versión con el valor correcto de `package.json`; el módulo queda embebido en el binario compilado (mismo mecanismo que los assets existentes).
- [ ] En dev (no compilado), el módulo de versión también existe y responde la versión de `package.json` (nodemon no se rompe).
- [ ] `GET /api/update/status` responde 200 con `{ currentVersion, platform, standalone }` correctos tanto en dev como en binario.
- [ ] El endpoint se registra bajo `/api/update` en el server principal.
- [ ] No se agregan dependencias nuevas.
