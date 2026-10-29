import assert from "node:assert/strict";

const base = process.env.DMMARKET_TEST_URL;
assert.ok(base, "Indica DMMARKET_TEST_URL de un ambiente disposable.");

async function request(path, options) {
  const response = await fetch(new URL(path, base), options);
  const body = await response.json();
  return { response, body };
}

async function save(reportCurrency) {
  return request("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportCurrency }),
  });
}

const original = await request("/api/settings");
assert.equal(original.response.status, 200);
assert.ok(["USD", "Bs"].includes(original.body.reportCurrency));
const dashboard = "/api/dashboard/sales?from=2026-01-01&to=2026-10-28&showNoe=true";
const before = await request(dashboard, { headers: { "Cache-Control": "no-cache" } });
assert.equal(before.response.status, 200);

try {
  for (const currency of ["Bs", "USD"]) {
    const saved = await save(currency);
    assert.equal(saved.response.status, 200);
    assert.equal(saved.body.reportCurrency, currency);
    const loaded = await request("/api/settings");
    assert.equal(loaded.body.reportCurrency, currency);
    const report = await request(dashboard, { headers: { "Cache-Control": "no-cache" } });
    assert.equal(report.response.status, 200);
    assert.deepEqual(report.body.kpis, before.body.kpis);
  }
  for (const invalid of ["EUR", "BsS", "", null, 1]) {
    const result = await save(invalid);
    assert.equal(result.response.status, 400);
    assert.equal((await request("/api/settings")).body.reportCurrency, "USD");
  }
  console.log("Configuración USD/Bs persistida, entradas inválidas rechazadas e importes sin conversión.");
} finally {
  assert.equal((await save(original.body.reportCurrency)).response.status, 200);
}
