## Rules
- DO NOT WRITE UNIT TESTS
- Always use bun as the package manager and task runner (never pnpm). Workspace globs live in the `workspaces` field of the root `package.json`.
- `bun run` executes Node-shebang package binaries with the system Node runtime (not Bun's runtime). That is expected — do not add `--bun` for react-scripts/jest.
- The project uses an older `react-scripts` (CRA 4) that fails under Node ≥17 OpenSSL and trips its preflight check because bun hoists `jest` (from `@dmmarket/backend`) into the root `node_modules`. Both workarounds — `NODE_OPTIONS=--openssl-legacy-provider` and `SKIP_PREFLIGHT_CHECK=true` — are already embedded in the `start`/`build` scripts of `packages/frontend/package.json`. Do not remove them.
- Bun may install dependencies with an isolated or hoisted linker. Use package scripts rather than hardcoded paths to `react-scripts`. `bun run build` from `packages/frontend` retains the required OpenSSL/preflight settings.
- Root-level build/test convenience scripts use `bun --filter <package> <script>` (e.g. `bun --filter @dmmarket/backend test`). Parallel test runs use `bun run --parallel <script> <script>`.
- Development uses `bun run dev` from the worktree root: `scripts/dev.mjs` prepares an isolated Compose/MySQL environment and opens `mprocs.yaml`. See `docs/development.md`. Backend and frontend have `autostart: false` in mprocs; start them manually with `s`. `dev:backend` and `dev:frontend` wrap each service in Portless without output elision; package `start` scripts are internal commands without worktree coordination. Do not reintroduce fixed service ports, container names, or a shared frontend API proxy.
- Never adopt or delete the legacy `dm_mysql` container / `main_mysql_data_57` volume automatically. Worktree resets require explicit project confirmation; automatic development migrations only apply `config.scope = "dmmarket"`.
- Single-binary build: `bun --filter @dmmarket/backend build` produces `packages/backend/dmmarket-app` — one executable with Bun runtime + backend + frontend build + SQL migrations embedded. `build:windows` cross-compiles `dmmarket-app.exe` (`--target=bun-windows-x64`). How it works: `scripts/generate-assets.js` walks `client/build` and emits `assets.js` (one `import ... with { type: "file" }` per file, the only asset-embedding mechanism that works on bun 1.3 — the `--asset` flag does not embed anything in this version). `index.js` serves assets from `Bun.embeddedFiles` paths when running compiled; `controllers/employees/index.js` reads its SQL migration the same way. Standalone detection: `Bun.embeddedFiles.length > 0` — `Bun.isStandaloneExecutable` does NOT exist in bun 1.3.14. The binary opens the browser at startup (only when compiled). knex needs `client: require("knex/lib/dialects/mysql2")` (class, not string) because bun cannot bundle the dynamic `require("../../dialects/...")`, and `--external mysql` because knex's mysql dialect lazy-requires the uninstalled `mysql` package. The binary reads `.env` from cwd at runtime (dotenv autoload).

## Agent skills

### Issue tracker

Use Notion as the only issue tracker: `Project Manager / Tasks`, linked to the `DMMarket` project. Do not recreate `.scratch/` or maintain local ticket copies. See `docs/agents/issue-tracker.md`.

### Triage labels

All five triage roles use their default string names in the Notion ticket body; the native `Status` property tracks execution separately. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo — one `CONTEXT.md` + `docs/adr/` at the root. See `docs/agents/domain.md`.

### Release

Publicar una release de DMMarket con changelog curado (legible para no técnicos). Carga el skill `skills/release/SKILL.md`. La fuente única de las notas de cada release es `CHANGELOG.md` (la lee `scripts/release.mjs`).
