const { test, expect, login } = require("./fixtures.cjs");

async function readFromServer(page, environment, route) {
  const cookie = (await page.context().cookies()).find((value) => value.name === "__Host-dmmarket.sid");
  const client = environment.client();
  if (cookie) client.jar.cookie = `${cookie.name}=${cookie.value}`;
  const url = new URL(route.request().url());
  return client.request(`${url.pathname}${url.search}`);
}

async function salesUser(environment) {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  const user = await environment.seedUser({ permissions: [{ capability: "sales.read", scope: "assigned" }] });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  return user;
}

async function openSales(page, environment) {
  await login(page, environment, await salesUser(environment));
  await page.goto(`${environment.origin}/ventas?view=dashboard&from=2026-01-01&to=2026-01-31`);
  await expect(page.locator(".dashboard-kpi-card").filter({ hasText: "Venta Bruta" })).toContainText("$100,00");
}

test("refresh conserva el marco de la app sin pantalla de comprobación ni datos antes de validar", async ({
  page,
  environment,
}) => {
  await openSales(page, environment);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let waiting = false;
  await page.route("**/api/auth/session", async (route) => {
    const response = await readFromServer(page, environment, route);
    waiting = true;
    await gate;
    await route
      .fulfill({ status: response.status, contentType: "application/json", body: response.text })
      .catch(() => {});
  });
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(() => waiting).toBe(true);
    await expect(page.locator(".app-navbar-brand")).toHaveText("SISTEMA DE REPORTES");
    await expect(page.getByText("Comprobando sesión…", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "DMMarket", exact: true })).toHaveCount(0);
    await expect(page.locator(".dashboard-kpi-card")).toHaveCount(0);
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toHaveCount(0);
    release();
    await expect(page.locator(".dashboard-kpi-card").filter({ hasText: "Venta Bruta" })).toContainText("$100,00");
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("un cierre de sesión invalida una comprobación anterior que todavía está en curso", async ({
  page,
  environment,
}) => {
  await openSales(page, environment);
  const cookie = (await page.context().cookies()).find((value) => value.name === "__Host-dmmarket.sid");
  const client = environment.client();
  client.jar.cookie = `${cookie.name}=${cookie.value}`;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let waiting = false;
  await page.route("**/api/auth/session", async (route) => {
    const response = await client.request("/api/auth/session");
    if (!waiting) {
      waiting = true;
      await gate;
    }
    await route
      .fulfill({ status: response.status, contentType: "application/json", body: response.text })
      .catch(() => {});
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => waiting).toBe(true);
    expect((await client.request("/api/auth/logout", { method: "POST", body: {} })).status).toBe(200);
    await page.evaluate(() =>
      window.dispatchEvent(new StorageEvent("storage", { key: "dmmarket:auth-change", newValue: "logged-out" })),
    );
    await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible({ timeout: 3000 });
    release();
    await expect(page.locator(".dashboard-kpi-card")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("refresh normal no cancela ni repite los reportes al recibir pageshow y foco", async ({ page, environment }) => {
  await openSales(page, environment);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let reports = 0;
  const cacheStates = [];
  const failures = [];
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).pathname === "/api/dashboard/sales") failures.push(request.failure()?.errorText);
  });
  await page.route("**/api/dashboard/sales?**", async (route) => {
    const response = await readFromServer(page, environment, route);
    cacheStates.push(response.headers["x-report-cache"]);
    reports += 1;
    await gate;
    await route
      .fulfill({ status: response.status, contentType: "application/json", body: response.text })
      .catch(() => {});
  });
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(() => reports).toBe(1);
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
      window.dispatchEvent(new Event("focus"));
    });
    await page.waitForTimeout(200);
    expect(failures).toEqual([]);
    expect(reports).toBe(1);
    release();
    await expect(page.locator(".dashboard-kpi-card").filter({ hasText: "Venta Bruta" })).toContainText("$100,00");
    expect(failures).toEqual([]);
    expect(reports).toBe(1);
    expect(cacheStates).toEqual(["HIT"]);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});
