---
name: release
description: "Trigger: release, publicar release, nueva versión, changelog, notas de versión, bump. Prepara y publica una release de DMMarket con changelog curado, en español, legible para una persona no técnica."
license: Apache-2.0
metadata:
  author: "jorgerojas26"
  version: "1.0"
---

## Activation Contract

Se activa cuando el usuario pide publicar una release o nueva versión, actualizar el changelog, redactar notas de versión, o hacer bump de versión.

## Hard Rules

- El changelog (`CHANGELOG.md`) es la **única fuente** de las notas de la release: `scripts/release.mjs` las lee de ahí. Nunca uses commits crudos como notas.
- Las notas son para un **usuario no técnico** del sistema de distribución. Escríbelas en español, en lenguaje de producto.
- **Prohibido** en el changelog: nombres de archivos, hashes de commits, librerías, frameworks, "API", "backend", "frontend", "refactor", "migración", siglas internas.
- Cada ítem del changelog debe describir el **efecto visible** para el usuario (qué puede hacer ahora o qué cambió), nunca el cómo se implementó.
- Todo ítem traza a un commit real (`git log <prevTag>..HEAD`). Un commit sin efecto visible para el usuario (chore, bump, docs internas) se **omite**.
- **No** commits, pushes ni releases sin confirmación explícita del usuario.
- No tocar `packages/backend/version.js` a mano: se regenera en `build:prepare`.

## Decision Gates

| Situación | Acción |
|---|---|
| ¿El commit cambia algo que el usuario final ve o usa? | No → fuera del changelog. |
| ¿Cambio nuevo, mejora de algo existente, o corrección? | `### Nuevas funciones`, `### Mejoras` o `### Correcciones` (omitir categorías vacías). |
| Tipo de bump en `packages/backend/package.json` | patch = correcciones/ajustes; minor = funcionalidad nueva visible; major = cambios que rompen. |
| ¿Un commit no se entiende para redactar su efecto? | Pregunta al usuario antes de inventar. |

## Execution Steps

1. Pre-check: `git branch --show-current` = main, `git status` sin pendientes sin commitear (o ya commiteados), `gh auth status`.
2. Inventario: `git log --oneline $(git describe --tags --abbrev=0)..HEAD`.
3. Clasifica cada commit en su categoría y redacta el efecto visible en español, siguiendo el estilo de `assets/entrada-ejemplo.md`.
4. Inserta en `CHANGELOG.md` la sección `## [vX.Y.Z] - AAAA-MM-DD` al inicio (bajo `# Changelog`), con las categorías no vacías.
5. Bump de versión solo en `packages/backend/package.json`.
6. Verifica: `bun run test` y `bunx biome check` sobre los archivos tocados.
7. Muestra el changelog + versión y pide confirmación. Al confirmar: commit del changelog + bump, luego `bun run release`.
8. Verifica la release creada y reporta URL + hashes sha256 (win y mac).

## Output Contract

Devuelve: la sección nueva de `CHANGELOG.md` escrita, la versión nueva, y —tras la confirmación— la URL de la release con sus hashes. Sin confirmación, entrega solo changelog + bump preparados y pide el visto bueno.

## References

- `../../CHANGELOG.md` — changelog curado (fuente única de notas).
- `../../scripts/release.mjs` — script de release (lee el changelog, compila binarios, sube 4 assets).
- `assets/entrada-ejemplo.md` — ejemplo de sección de changelog bien redactada.
