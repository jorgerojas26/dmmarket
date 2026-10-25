const { test: base, expect, login, openModule } = require("./fixtures.cjs");
const { startEnvironment } = require("../support/auth-environment.cjs");
const { seedSales } = require("../support/sales-fixtures.cjs");
const { seedPurchases } = require("../support/purchase-fixtures.cjs");
const test = base.extend({
  environment: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium") throw new Error("Esta suite requiere Chrome.");
      const environment = await startEnvironment({ web: true });
      try {
        await seedSales(environment.db);
        await seedPurchases(environment.db);
        await use(environment);
      } finally {
        await environment.close();
      }
    },
    { scope: "worker" },
  ],
});
const grant = (capability) => ({ capability, scope: "global" });
async function enter(page, environment, capabilities, view = "Resumen") {
  const user = await environment.seedUser({ permissions: capabilities.map(grant) });
  await login(page, environment, user);
  await openModule(page, "Compras", view);
  const report = page.getByRole("region", {
    name: view === "Resumen" ? "Resumen de compras" : "Pareto de compras",
    exact: true,
  });
  await dates(report, "2026-08-01", "2026-08-31");
  return report;
}
async function dates(report, from, to) {
  await report.getByLabel("Resumen de compras desde", { exact: true }).fill(from);
  await report.getByLabel("Resumen de compras hasta", { exact: true }).fill(to);
}

test("compras básicas usan unidades en tarjetas, rankings, leyendas y tooltips sin dinero ni proveedores", async ({
  page,
  environment,
}) => {
  const forbidden = [];
  page.on("request", (request) => {
    if (/\/api\/(sales|dashboard\/sales|providers|auth\/exports)/.test(request.url())) forbidden.push(request.url());
  });
  const report = await enter(page, environment, ["purchases.read"]);
  await report.getByLabel("Comparar compras desde", { exact: true }).fill("2026-07-01");
  await report.getByLabel("Comparar compras hasta", { exact: true }).fill("2026-07-31");
  await report.getByRole("button", { name: "Consultar resumen de compras", exact: true }).click();
  await expect(
    report.getByRole("group", { name: "Unidades compradas", exact: true }).getByText("6", { exact: true }),
  ).toBeVisible();
  await expect(report.getByRole("group", { name: "Total Compras autorizado", exact: true })).toHaveCount(0);
  await expect(
    report
      .getByRole("region", { name: "Ranking visual de productos comprados", exact: true })
      .getByText("5", { exact: true }),
  ).toBeVisible();
  await expect(
    report.getByRole("region", { name: "Proveedor destacado en compras autorizadas", exact: true }),
  ).toHaveCount(0);
  const legend = report.getByRole("list", { name: "Categorías de compras", exact: true });
  await expect(legend).toBeVisible();
  expect(await legend.getByRole("listitem").first().getAttribute("title")).not.toContain("$");
  const arc = report.locator(".donut-overview-chart svg path").first();
  const box = await arc.boundingBox();
  await arc.hover({ position: { x: 8, y: box.height / 2 }, timeout: 5000 });
  await expect(report.locator(".donut-overview-chart").getByText("Unidades compradas", { exact: true })).toBeVisible();
  await expect(report.getByText(/\$|PRIVATE-PUR/)).toHaveCount(0);
  await expect(report.getByText("Unidades del período comparado: 2", { exact: true })).toBeVisible();
  expect(forbidden).toEqual([]);
});

test("importes y proveedores autorizados conservan comparación y cambian con el filtro", async ({
  page,
  environment,
}) => {
  const report = await enter(page, environment, ["purchases.read", "purchases.costs", "providers.read"]);
  await report.getByLabel("Comparar compras desde", { exact: true }).fill("2026-07-01");
  await report.getByLabel("Comparar compras hasta", { exact: true }).fill("2026-07-31");
  await report.getByRole("button", { name: "Consultar resumen de compras", exact: true }).click();
  const amount = report.getByRole("group", { name: "Total Compras autorizado", exact: true });
  await expect(amount.getByText("$130,00", { exact: true })).toBeVisible();
  await expect(report.getByText("Total Compras autorizado del período comparado: 16", { exact: true })).toBeVisible();
  const best = report.getByRole("region", { name: "Proveedor destacado en compras autorizadas", exact: true });
  await expect(best.getByText("Proveedor compras A", { exact: true })).toBeVisible();
  await expect(best.getByText("$80,00", { exact: true })).toBeVisible();
  await report.getByLabel("Proveedor del resumen de compras", { exact: true }).fill("PUR-B");
  await report.getByRole("button", { name: "Consultar resumen de compras", exact: true }).click();
  await expect(amount.getByText("$50,00", { exact: true })).toBeVisible();
  await expect(best.getByText("Proveedor compras B", { exact: true })).toBeVisible();
  await expect(
    report
      .getByRole("region", { name: "Ranking visual de productos comprados", exact: true })
      .getByText("$80,00", { exact: true }),
  ).toHaveCount(0);
  await expect(report.getByText(/PRIVATE-PUR/)).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 780 });
  const geometry = await report.evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
});

test("Pareto dibuja cuarenta productos sin recalcular ABC al buscar, filtrar o paginar el universo completo", async ({
  page,
  environment,
}) => {
  await environment
    .db("mastercomp")
    .insert({ IdFactura: "UI-PARETO", Fecha: "2027-04-01", IdProveedor: "PUR-A", Anulada: false });
  await environment.db("slavecomp").insert(
    Array.from({ length: 45 }, (_, index) => ({
      IdFactura: "UI-PARETO",
      IdProducto: `UI-${index}`,
      Descripcion: `Visual producto ${String(index).padStart(2, "0")}`,
      Precio: 45 - index,
      Cantidad: 1,
    })),
  );
  const report = await enter(page, environment, ["purchases.read", "purchases.costs"], "Pareto");
  await dates(report, "2027-04-01", "2027-04-30");
  await report.getByRole("button", { name: "Consultar Pareto de compras", exact: true }).click();
  await expect(report.getByText("Productos analizados en compras: 45", { exact: true })).toBeVisible();
  const graph = report.getByRole("img", { name: "Gráfico ABC autorizado de compras", exact: true });
  await expect(graph.locator("svg")).toBeVisible();
  await expect(graph.locator('svg rect:not([fill="transparent"])')).toHaveCount(40);
  expect(await graph.locator("svg path").getAttribute("d")).not.toContain("NaN");
  await graph.locator('svg rect[fill="#22c55e"]').first().hover({ timeout: 5000 });
  await expect(graph.getByText("Acumulado", { exact: true })).toBeVisible();
  await expect(report.getByText(/^Gráfico de los primeros 40 productos/)).toBeVisible();
  const table = report.getByRole("table", { name: "Clasificación autorizada de compras", exact: true });
  await expect(table.getByRole("row")).toHaveCount(21);
  await report.getByRole("button", { name: "Pareto de compras: página siguiente", exact: true }).click();
  await expect(table.getByText("Visual producto 20", { exact: true })).toBeVisible();
  const classA = await report.getByRole("group", { name: "Clase A de compras", exact: true }).innerText();
  await report.getByLabel("Clase del Pareto de compras", { exact: true }).selectOption("C");
  await report.getByLabel("Buscar producto en el Pareto de compras", { exact: true }).fill("44");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table.getByRole("cell", { name: "45", exact: true })).toBeVisible();
  await expect(table.getByRole("cell", { name: "100", exact: true })).toBeVisible();
  expect(await report.getByRole("group", { name: "Clase A de compras", exact: true }).innerText()).toBe(classA);
  await expect(report.getByText("Productos analizados en compras: 45", { exact: true })).toBeVisible();
  await report.getByLabel("Clase del Pareto de compras", { exact: true }).selectOption("A");
  await expect(table.getByRole("row")).toHaveCount(1);
});

test("datos incompletos y compras negativas no se convierten en cero ni en un Pareto válido", async ({
  page,
  environment,
}) => {
  await environment
    .db("mastercomp")
    .insert({ IdFactura: "UI-UNKNOWN", Fecha: "2028-01-01", IdProveedor: "PUR-A", Anulada: false });
  await environment.db("slavecomp").insert([
    { IdFactura: "UI-UNKNOWN", IdProducto: "UI-NEG", Descripcion: "Compra negativa", Precio: -10, Cantidad: 1 },
    { IdFactura: "UI-UNKNOWN", IdProducto: "UI-NULL", Descripcion: "Compra incompleta", Precio: null, Cantidad: null },
  ]);
  const report = await enter(page, environment, ["purchases.read", "purchases.costs"]);
  await dates(report, "2028-01-01", "2028-01-31");
  await report.getByRole("button", { name: "Consultar resumen de compras", exact: true }).click();
  await expect(
    report
      .getByRole("group", { name: "Total Compras autorizado", exact: true })
      .getByText("No disponible", { exact: true }),
  ).toBeVisible();
  await expect(
    report.getByRole("group", { name: "Unidades compradas", exact: true }).getByText("No disponible", { exact: true }),
  ).toBeVisible();
  await expect(report.getByRole("list", { name: "Categorías de compras", exact: true })).toHaveCount(0);
  await openModule(page, "Compras", "Pareto");
  const pareto = page.getByRole("region", { name: "Pareto de compras", exact: true });
  await dates(pareto, "2028-01-01", "2028-01-31");
  await pareto.getByRole("button", { name: "Consultar Pareto de compras", exact: true }).click();
  await expect(pareto.getByText("Productos sin clasificación válida: 2", { exact: true })).toBeVisible();
  await expect(pareto.getByRole("img", { name: "Gráfico ABC autorizado de compras", exact: true })).toHaveCount(0);
  await expect(
    pareto.getByText("No se dibuja el Pareto sin una base completa, no negativa y mayor que cero.", { exact: true }),
  ).toBeVisible();
});
