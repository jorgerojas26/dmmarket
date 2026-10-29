---
name: release
description: "Trigger: release, publicar release, nueva versión, changelog, notas de versión, bump. Prepara y publica una release de DMMarket con changelog curado, en español, legible para una persona no técnica."
license: Apache-2.0
metadata:
  author: "jorgerojas26"
  version: "1.1"
---

## Activation Contract

Se activa cuando el usuario pide publicar una release o nueva versión, actualizar el changelog, redactar notas de versión, o hacer bump de versión.

## Hard Rules

- El changelog (`CHANGELOG.md`) es la **única fuente** del resumen de producto de cada release; `scripts/release.mjs` lo coloca al principio.
- Después del resumen, la release muestra una sección separada con la lista de commits incluidos. Esa lista nunca reemplaza ni precede al resumen para usuarios.
- El resumen es para un **usuario no técnico** del sistema de distribución. Escríbelo en español, en lenguaje de producto.
- **Prohibido** en el changelog: nombres de archivos, hashes de commits, librerías, frameworks, "API", "backend", "frontend", "refactor", "migración", siglas internas.
- Cada ítem del changelog debe describir el **efecto visible** para el usuario (qué puede hacer ahora o qué cambió), nunca el cómo se implementó.
- Todo ítem traza a un commit real (`git log <prevTag>..HEAD`). Un commit sin efecto visible para el usuario (chore, bump, docs internas) se **omite**.
- Clasifica por **capacidad visible para el usuario**, no por commit, archivo ni detalle de implementación. Varios commits de una misma capacidad se agrupan en una sola entrada.
- **Mejoras** solo admite capacidades que ya existían en la última versión publicada. Antes de usar esa categoría, identifica la capacidad previa y comprueba su existencia en esa versión; si no puedes comprobarlo, no la clasifiques como mejora.
- Una capacidad presentada por primera vez en esta release va en **Nuevas funciones**, junto con sus opciones, presentación, historial, validaciones y ajustes realizados durante su desarrollo. No repartas su descripción entre Nuevas funciones y Mejoras ni presentes sus ajustes previos al lanzamiento como Correcciones.
- Que el módulo contenedor ya existiera no convierte los detalles de una capacidad nueva en mejoras: un cierre residual nuevo sigue siendo una novedad aunque Cuentas por cobrar ya existiera.
- No rellenes categorías: una release puede contener únicamente **Nuevas funciones**. Omite cualquier categoría sin cambios independientes que correspondan a ella.
- **No** commits, pushes ni releases sin confirmación explícita del usuario.
- No tocar `packages/backend/version.js` a mano: se regenera en `build:prepare`.

## Decision Gates

| Situación | Acción |
|---|---|
| ¿El commit cambia algo que el usuario final ve o usa? | No → fuera del changelog. |
| ¿La capacidad aparece por primera vez desde la última versión publicada? | `### Nuevas funciones`; agrupa allí todos sus detalles de lanzamiento. |
| ¿La capacidad ya estaba publicada y ahora se amplía o facilita su uso? | `### Mejoras`, solo con evidencia de esa capacidad en la versión anterior. |
| ¿Se corrige un comportamiento incorrecto que ya estaba publicado? | `### Correcciones`; no incluye ajustes de una capacidad aún sin publicar. |
| ¿La supuesta mejora solo describe una opción o detalle de la novedad de esta release? | Integrarla en la entrada de Nuevas funciones, sin duplicarla en otra categoría. |
| Tipo de bump en `packages/backend/package.json` | patch = correcciones/ajustes; minor = funcionalidad nueva visible; major = cambios que rompen. |
| ¿Un commit no se entiende para redactar su efecto? | Pregunta al usuario antes de inventar. |

## Execution Steps

1. Pre-check: `git branch --show-current` = main, `git status` sin pendientes sin commitear (o ya commiteados), `gh auth status`.
2. Identifica la última versión publicada y usa su tag como base del inventario: `git log --oneline <prevTag>..HEAD`. No uses commits intermedios de la release actual como evidencia de una capacidad preexistente.
3. Agrupa los commits por capacidad visible y compara cada capacidad con la versión base. Clasifica cada grupo, no cada commit; redacta el efecto visible en español siguiendo `assets/entrada-ejemplo.md`. Para cada entrada en Mejoras, verifica qué capacidad ya publicada mejora y evita repetir detalles de una entrada en Nuevas funciones.
4. Inserta en `CHANGELOG.md` la sección `## [vX.Y.Z] - AAAA-MM-DD` al inicio (bajo `# Changelog`), con las categorías no vacías.
5. Bump de versión solo en `packages/backend/package.json`.
6. Verifica: `bun run test` y `bunx biome check` sobre los archivos tocados.
7. Antes de mostrar el changelog, revisa que cada mejora afecte una capacidad preexistente, que los detalles de cada novedad estén agrupados y que no haya categorías de relleno. Muestra el changelog + versión y pide confirmación. Al confirmar: commit del changelog + bump, luego `bun run release`.
8. Verifica la release creada y reporta URL + hashes sha256 (win, mac y Linux).

## Output Contract

Devuelve: la sección nueva de `CHANGELOG.md` escrita, la versión nueva, y —tras la confirmación— la URL de la release con sus hashes. Sin confirmación, entrega solo changelog + bump preparados y pide el visto bueno.

## References

- `../../CHANGELOG.md` — changelog curado (fuente única de notas).
- `../../scripts/release.mjs` — script de release (lee el changelog, compila binarios, sube 6 assets).
- `assets/entrada-ejemplo.md` — ejemplo de sección de changelog bien redactada.
