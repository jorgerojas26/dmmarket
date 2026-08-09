# 04 — Script de release

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

Un comando que publica una versión nueva para los clientes: `scripts/release.mjs` toma la versión de `package.json`, corre el build de Windows (frontend + binario), calcula el sha256 del exe, crea la release en GitHub con el tag `v<version>` y sube los dos assets que define el contrato: `dmmarket-app.exe` y `dmmarket-app.exe.sha256` (contenido: hash hex de 64 chars, nada más). Usa `gh` CLI (asume autenticado). Termina con un resumen legible (versión, URLs de assets, hash). El script debe: fallar si el tag ya existe en el repo remoto, fallar si el build falla, y no tocar nada de GitHub si algo previo falló. El release queda listo para que el flujo de check/descarga (tickets 03/05) lo consuma.

## Acceptance criteria

- [ ] `bun run release` (o equivalente) desde la raíz produce: build Windows OK + sha256 correcto (verificable con `shasum -a 256` local) + release `v<version>` en GitHub con los 2 assets y sus nombres exactos.
- [ ] El tag `v<version>` queda pusheado al remoto.
- [ ] Si el tag ya existe, aborta antes de crear nada.
- [ ] Si el build falla, no crea release ni push.
- [ ] El contenido del archivo `.sha256` es exactamente el hash hex (64 chars, sin saltos de línea extra que rompan la verificación).
