// Usage: bun scripts/benchmark-dashboards.mjs [from] [to]
// Requires the dev server. Clears its report cache once; no database writes.
import assert from "node:assert/strict";

const base = process.env.BENCHMARK_URL || "http://dmmarket.localhost:1355";
const from = process.argv[2] || "2026-09-01";
const to = process.argv[3] || "2026-09-29";
const maxWarmMs = Number(process.env.BENCHMARK_MAX_WARM_MS || 100);
const paths = [
  ["clients/sin-facturar", { page: 1, limit: 50, sortBy: "revenue_historico", sortDir: "desc", showNoe: false }],
  ["clients/dashboard", { showNoe: false }],
  ["dashboard/sales", { showNoe: false }],
  ["dashboard/pareto", { showNoe: false }],
  ["purchases/dashboard", {}],
  ["purchases/pareto", {}],
  ["providers/list", { page: 1, limit: 20, showNoe: false }],
];

async function measure(path, query) {
  const params = new URLSearchParams({ from, to, ...query });
  const start = performance.now();
  const response = await fetch(`${base}/api/${path}?${params}`, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  const body = await response.json();
  return { ms: performance.now() - start, state: response.headers.get("x-report-cache"), body };
}

const cleared = await fetch(`${base}/api/cache/clear`, { method: "POST", signal: AbortSignal.timeout(10000) });
assert.equal(cleared.status, 200, "Cannot clear report cache");
await cleared.json();
for (const [path, query] of paths) {
  const cold = await measure(path, query);
  const warm = await measure(path, query);
  assert.equal(warm.state, "HIT", `${path}: expected a cache hit`);
  assert.deepEqual(warm.body, cold.body, `${path}: cached data differs`);
  assert.ok(warm.ms < maxWarmMs, `${path}: warm request ${Math.round(warm.ms)}ms exceeds ${maxWarmMs}ms`);
  console.log(`${path}: ${Math.round(cold.ms)}ms (${cold.state}) → ${Math.round(warm.ms)}ms (HIT), identical JSON`);
}
