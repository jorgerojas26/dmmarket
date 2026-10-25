const { test: base, expect, login } = require("./fixtures.cjs");
const { seedSales } = require("../support/sales-fixtures.cjs");
const { startEnvironment } = require("../support/auth-environment.cjs");
const test = base.extend({
  environment: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium") throw new Error("Esta suite requiere Chrome.");
      const environment = await startEnvironment({ web: true });
      try {
        await seedSales(environment.db);
        await use(environment);
      } finally {
        await environment.close();
      }
    },
    { scope: "worker" },
  ],
});
async function enter(page, environment, permissions) {
  await seedSales(environment.db);
  const user = await environment.seedUser({ permissions });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  const sales = page.getByRole("region", { name: "Consulta de ventas", exact: true });
  await sales.getByLabel("Ventas desde", { exact: true }).fill("2026-01-01");
  await sales.getByLabel("Ventas hasta", { exact: true }).fill("2026-01-31");
  return sales;
}
const grant = (capability, scope = "global") => ({ capability, scope });

test("tarjetas, rankings y categorías muestran sólo ventas propias, sin utilidad ni llamadas de otros módulos", async ({
  page,
  environment,
}) => {
  const forbiddenRequests = [];
  page.on("request", (request) => {
    if (/\/api\/(purchases|dashboard\/pareto|providers|auth\/exports)/.test(request.url()))
      forbiddenRequests.push(request.url());
  });
  const sales = await enter(page, environment, [grant("sales.read", "assigned")]);
  await sales.getByRole("button", { name: "Consultar ventas", exact: true }).click();
  const summary = page.getByRole("region", { name: "Resumen de ventas", exact: true });
  await expect(
    summary.getByRole("group", { name: "Total ventas", exact: true }).getByText("$100,00", { exact: true }),
  ).toBeVisible();
  await expect(summary.getByRole("group", { name: "Utilidad total", exact: true })).toHaveCount(0);
  await expect(summary.getByRole("group", { name: "Margen promedio", exact: true })).toHaveCount(0);
  const products = summary.getByRole("region", { name: "Ranking autorizado de productos vendidos", exact: true });
  await expect(products.getByText("Producto sintético", { exact: true })).toBeVisible();
  await expect(products.getByText("$100,00", { exact: true })).toBeVisible();
  const clients = summary.getByRole("region", { name: "Ranking autorizado de clientes compradores", exact: true });
  await expect(clients.getByText("Cliente sintético", { exact: true })).toBeVisible();
  await expect(clients.getByText("$100,00", { exact: true })).toBeVisible();
  await expect(
    summary
      .getByRole("region", { name: "Vendedor destacado en ventas autorizadas", exact: true })
      .getByText("Vendedor A", { exact: true }),
  ).toBeVisible();
  await expect(summary.getByText("Vendedor B", { exact: true })).toHaveCount(0);
  await expect(summary.getByRole("list", { name: "Categorías de ventas", exact: true })).toBeVisible();
  const arc = summary.locator(".donut-overview-chart svg path").first();
  const box = await arc.boundingBox();
  await arc.hover({ position: { x: 8, y: box.height / 2 }, timeout: 5000 });
  await expect(page.getByText("Bruto", { exact: true })).toBeVisible();
  await expect(page.getByText("Utilidad", { exact: true })).toHaveCount(0);
  await expect(summary.getByText(/NaN|PRIVATE-/)).toHaveCount(0);
  expect(forbiddenRequests).toEqual([]);
});

test("indicadores y rankings financieros desaparecen al ampliar de vendedor propio a ventas globales", async ({
  page,
  environment,
}) => {
  const sales = await enter(page, environment, [
    grant("sales.read"),
    grant("sales.costs", "assigned"),
    grant("sales.profit", "assigned"),
  ]);
  await sales.getByLabel("Filtrar vendedor", { exact: true }).fill("A");
  await sales.getByRole("button", { name: "Consultar ventas", exact: true }).click();
  const summary = page.getByRole("region", { name: "Resumen de ventas", exact: true });
  await expect(
    summary.getByRole("group", { name: "Utilidad total", exact: true }).getByText("$39,00", { exact: true }),
  ).toBeVisible();
  await expect(summary.getByRole("heading", { name: "Productos por utilidad autorizada", exact: true })).toBeVisible();
  await sales.getByLabel("Filtrar vendedor", { exact: true }).fill("");
  await sales.getByRole("button", { name: "Consultar ventas", exact: true }).click();
  await expect(summary.getByRole("group", { name: "Utilidad total", exact: true })).toHaveCount(0);
  await expect(summary.getByRole("heading", { name: "Productos por utilidad autorizada", exact: true })).toHaveCount(0);
  await expect(
    summary.getByRole("group", { name: "Total ventas", exact: true }).getByText("$300,00", { exact: true }),
  ).toBeVisible();
  await expect(summary.getByRole("heading", { name: "Productos por ventas autorizadas", exact: true })).toBeVisible();
  await expect(
    summary
      .getByRole("region", { name: "Vendedor destacado en ventas autorizadas", exact: true })
      .getByText("Vendedor B", { exact: true }),
  ).toBeVisible();
  await expect(summary.getByText("$39,00", { exact: true })).toHaveCount(0);
});

test("ventas negativas y períodos vacíos no inventan una distribución circular válida", async ({
  page,
  environment,
}) => {
  const sales = await enter(page, environment, [grant("sales.read", "assigned")]);
  await environment
    .db("masterfact")
    .insert({ IdFactura: "NEG-UI", IdVend: "A", IdCliente: "C", Fecha: "2027-01-01", Anulada: false });
  await environment.db("slavefact").insert({
    IdFactura: "NEG-UI",
    IdProducto: "P",
    Descripcion: "Línea negativa de prueba",
    Precio: -10,
    Costo: 1,
    Cantidad: 1,
  });
  await sales.getByLabel("Ventas desde", { exact: true }).fill("2027-01-01");
  await sales.getByLabel("Ventas hasta", { exact: true }).fill("2027-01-31");
  await sales.getByRole("button", { name: "Consultar ventas", exact: true }).click();
  const summary = page.getByRole("region", { name: "Resumen de ventas", exact: true });
  await expect(
    summary.getByRole("group", { name: "Total ventas", exact: true }).getByText("$-10,00", { exact: true }),
  ).toBeVisible();
  await expect(summary.getByRole("list", { name: "Categorías de ventas", exact: true })).toHaveCount(0);
  await expect(
    summary.getByText(
      "No se muestra un gráfico de participación sin una base completa, no negativa y mayor que cero.",
      { exact: true },
    ),
  ).toBeVisible();
  await sales.getByLabel("Ventas desde", { exact: true }).fill("2000-01-01");
  await sales.getByLabel("Ventas hasta", { exact: true }).fill("2000-01-02");
  await sales.getByRole("button", { name: "Consultar ventas", exact: true }).click();
  await expect(summary.getByText("Sin ventas autorizadas en el período.", { exact: true })).toBeVisible();
  await expect(
    summary.getByRole("group", { name: "Total ventas", exact: true }).getByText("$0,00", { exact: true }),
  ).toBeVisible();
  await expect(summary.getByRole("list", { name: "Categorías de ventas", exact: true })).toHaveCount(0);
});
