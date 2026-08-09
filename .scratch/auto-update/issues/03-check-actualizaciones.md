# 03 — Check de actualizaciones (backend + UI botón)

**Status:** done

**Blocked by:** 01 (necesita la versión embebida para comparar).

## What to build

El usuario ve su versión actual y un botón "Buscar actualizaciones" que consulta GitHub Releases y le dice si hay versión nueva, cuál, y qué trae (notas). Backend: `POST /api/update/check` hace fetch a `https://api.github.com/repos/jorgerojas26/dmmarket/releases/latest` (el server hace el fetch, no el browser — mismo origin, sin CORS), compara semver contra `currentVersion` y responde `{ updateAvailable, latestVersion, notes, publishedAt, assetUrl, sha256AssetUrl }` (assetUrl = el `dmmarket-app.exe` de la release, sha256AssetUrl = su archivo de hash; contrato definido en el PRD). En dev/standalone=false responde 400 explicando que el check solo aplica al binario. Frontend: badge con versión actual + botón "Buscar actualizaciones" en la zona global (header/barra superior, visible en todas las páginas). Estados: "Buscando…", "Estás al día (vX)", "Versión X disponible" + notas del release. Errores de red/GitHub (sin internet, rate limit, release sin asset) se muestran como mensaje claro, no crash.

## Acceptance criteria

- [ ] `POST /api/update/check` con release más nuevo en GitHub responde `updateAvailable: true` con versión, notas y URLs de assets correctos.
- [ ] Con versión actual ≥ latest responde `updateAvailable: false`.
- [ ] Semver compara correctamente `X.Y.Z` (mayor/menor/parche, incluye `1.10.0 > 1.9.0`).
- [ ] Sin release en GitHub o error de red responde error descriptivo (no 500 genérico).
- [ ] En dev responde 400 "solo disponible en binario compilado".
- [ ] UI muestra versión actual + botón en zona global; los tres estados (buscando / al día / disponible+notas) funcionan; error de red se muestra sin romper la app.
