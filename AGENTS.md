## Rules
- Always use bun as the package manager and task runner (never pnpm). Workspace globs live in the `workspaces` field of the root `package.json`.
- `bun run` executes Node-shebang package binaries with the system Node runtime (not Bun's runtime). That is expected — do not add `--bun` for react-scripts/jest.
- The project uses an older `react-scripts` (CRA 4) that fails under Node ≥17 OpenSSL and trips its preflight check because bun hoists `jest` (from `@dmmarket/backend`) into the root `node_modules`. Both workarounds — `NODE_OPTIONS=--openssl-legacy-provider` and `SKIP_PREFLIGHT_CHECK=true` — are already embedded in the `start`/`build` scripts of `packages/frontend/package.json`. Do not remove them.
- `react-scripts` is hoisted to the monorepo root `node_modules`, not the frontend package. Run build/start from `packages/frontend`:
  `SKIP_PREFLIGHT_CHECK=true NODE_OPTIONS=--openssl-legacy-provider ../../node_modules/.bin/react-scripts build`
  `SKIP_PREFLIGHT_CHECK=true NODE_OPTIONS=--openssl-legacy-provider ../../node_modules/.bin/react-scripts start`
- Root-level convenience scripts use `bun --filter <package> <script>` (e.g. `bun --filter @dmmarket/backend test`). Parallel runs use `bun run --parallel <script> <script>`.
- `bun run --filter`/`--parallel` TUI elides script output to the last 10 lines by default — that hides the portless URL banner (`-> http://dmmarket.localhost:1355`) from `dev:frontend`/`dev`. The dev scripts already pass `--elide-lines=0`; if running `bun --filter @dmmarket/frontend start` manually, add `--elide-lines=0`.
- Single-binary build: `bun --filter @dmmarket/backend build` produces `packages/backend/dmmarket-app` — one executable with Bun runtime + backend + frontend build + SQL migrations embedded. `build:windows` cross-compiles `dmmarket-app.exe` (`--target=bun-windows-x64`). How it works: `scripts/generate-assets.js` walks `client/build` and emits `assets.js` (one `import ... with { type: "file" }` per file, the only asset-embedding mechanism that works on bun 1.3 — the `--asset` flag does not embed anything in this version). `index.js` serves assets from `Bun.embeddedFiles` paths when running compiled; `controllers/employees/index.js` reads its SQL migration the same way. Standalone detection: `Bun.embeddedFiles.length > 0` — `Bun.isStandaloneExecutable` does NOT exist in bun 1.3.14. The binary opens the browser at startup (only when compiled). knex needs `client: require("knex/lib/dialects/mysql2")` (class, not string) because bun cannot bundle the dynamic `require("../../dialects/...")`, and `--external mysql` because knex's mysql dialect lazy-requires the uninstalled `mysql` package. The binary reads `.env` from cwd at runtime (dotenv autoload).

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

All five roles use their default string names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo — one `CONTEXT.md` + `docs/adr/` at the root. See `docs/agents/domain.md`.

### Release

Publicar una release de DMMarket con changelog curado (legible para no técnicos). Carga el skill `skills/release/SKILL.md`. La fuente única de las notas de cada release es `CHANGELOG.md` (la lee `scripts/release.mjs`).
