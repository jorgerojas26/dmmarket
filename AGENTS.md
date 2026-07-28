## Rules
- Always use pnpm as the package manager.
- This is a monorepo using pnpm workspaces. See `pnpm-workspace.yaml`.
- The project uses an older `react-scripts` that doesn't support Node.js ≥17 OpenSSL. Always prefix `react-scripts build` and `react-scripts start` with `NODE_OPTIONS=--openssl-legacy-provider`.
- `react-scripts` is hoisted to the monorepo root `node_modules`, not the frontend package. Run build/start from `packages/frontend`:
  `NODE_OPTIONS=--openssl-legacy-provider ../../node_modules/.bin/react-scripts build`
  `NODE_OPTIONS=--openssl-legacy-provider ../../node_modules/.bin/react-scripts start`

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

All five roles use their default string names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo — one `CONTEXT.md` + `docs/adr/` at the root. See `docs/agents/domain.md`.
