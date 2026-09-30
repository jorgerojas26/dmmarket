# Handoff — sales dashboard redesign

## State
- Repo: `/Users/jorgerojas/projects/dmmarket`, branch `main`.
- Implementation commit: `fadfcc3` — `feat(frontend): redesign sales dashboard metrics and insights layout`.
- Implementation is committed. This handoff is saved in a separate documentation commit.
- User requested this handoff to continue in another session. No next problem has been specified.

## User preferences / history
The user wants efficient use of space, compact KPIs and responsive layouts. They explicitly rejected the first sales-dashboard design: a floating donut with a scrolling legend and a detached best-seller badge. They require **visual verification of the actual application with Playwright CLI**, not just tests or synthetic HTML fixtures.

Earlier work already committed:
- `46d7164`: responsive Clients and Inventory layouts. Clients Pareto immediately follows KPIs; desktop filters retain compact widths; Inventory has no visible filter labels.
- `e43bb24`: provider selectors use lightweight `/api/providers/options` instead of the slow full report, with a stable 250 ms debounce. Local API timing improved from ~4.2 seconds to milliseconds. Report endpoint remains unchanged.

## Latest design
- Six sales metrics grouped in a compact grid.
- One coherent insights panel contains the category donut, ranked category shares, and best seller as its footer. No detached seller card.
- Desktop: three KPI columns / two rows beside a 360 px insights panel, with matched height.
- Layout uses container queries against available content width, accounting for sidebar expansion:
  - >=1120 px: metrics and insights side by side.
  - 600–1119 px: insights below metrics, category breakdown and seller arranged horizontally inside it.
  - Smaller widths: stacked layout.
- Donut highlights the four largest categories; remaining categories use a muted color. The chart still contains **all original category records**.
- Summary legend shows four leaders plus the combined remaining share. “Ver las N categorías” opens a responsive full breakdown modal; there is no arbitrary 24-category limit.
- Tooltips still show gross sales and utility. Category help now correctly describes gross sales, the actual chart measure.
- Existing non-compact `GroupSales` rendering remains supported.
- Clients dashboard only gained the shared compact-grid CSS class; its existing layout is preserved.

## Main files
- `packages/frontend/src/components/Dashboard/SalesDashboard.js`
- `packages/frontend/src/components/Cards/GroupSales/index.js`
- `packages/frontend/src/index.css`
- Tests: `SalesDashboard.test.js`, `Cards/GroupSales/index.test.js`
- Small shared-class change: `Dashboard/ClientsDashboard.js`

## Validation completed
- `bun run test:frontend -- --watchAll=false --runInBand`: **143 tests passed**.
- `bun run build:frontend`: passed.
- `git diff --check`: passed.
- Real app checked with Playwright CLI at 320, 375, 768, 1024, 1512 and 1920 px, plus expanded/collapsed sidebar.
- Reviewed screenshots; checked overflow, matched desktop heights, integrated seller, full category modal on desktop/mobile, donut tooltip and KPI help.
- The console has an existing React missing-key warning from the Pareto `Table`; not introduced or fixed here.

## Local visual artifacts (not committed)
- Full desktop screenshot: `/tmp/dmmarket-sales-redesign-final-page.png`
- Expanded-sidebar overview: `/tmp/dmmarket-sales-redesign-verified-expanded.png`
- Per-width overview: `/tmp/dmmarket-sales-redesign-verified-{width}.png`
- Per-width insights: `/tmp/dmmarket-sales-insights-verified-{width}.png`
- Modal mobile: `/tmp/dmmarket-sales-redesign-details-mobile.png`
- Verification script: `/tmp/dmmarket-sales-redesign-verify.js`.
  - This temporary script asserts 24 rows because that is the current local dataset. Adapt this assertion if data changes; it is not a business rule.
- Browser session `sales-redesign` was closed.

To repeat the visual checks on this machine:
```bash
playwright-cli -s=sales-redesign open 'http://dmmarket.localhost:1355/ventas?view=dashboard'
playwright-cli -s=sales-redesign run-code --filename=/tmp/dmmarket-sales-redesign-verify.js
```
The frontend was also reachable at `http://localhost:3000`, backend at `http://localhost:8000`.

## Next session
Read this note, check `git status`, and ask for / follow the user's next requested change. Use bun exclusively, follow `AGENTS.md`, and use CodeGraph for structural navigation. Do not reintroduce the rejected floating-chart / standalone-seller composition. Continue reviewing actual Playwright screenshots for visual work.
