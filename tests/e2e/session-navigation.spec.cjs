const { test, expect, login, logout, openModule } = require("./fixtures.cjs");
const { seedSales } = require("../support/sales-fixtures.cjs");
const { seedPurchases } = require("../support/purchase-fixtures.cjs");

async function reportUser(environment, seller = "A") {
  await seedSales(environment.db);
  await seedPurchases(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "sales.read", scope: "assigned" },
      { capability: "purchases.read", scope: "global" },
      { capability: "rates.read", scope: "global" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: seller });
  const assignment = await environment.db("dmmarket_auth_user_roles").where("user_id", user.id).first();
  user.roleName = `Consulta ${user.username}`;
  await environment.db("dmmarket_auth_roles").where("id", assignment.role_id).update({ name: user.roleName });
  return user;
}

const grossSales = (page) => page.locator(".dashboard-kpi-card").filter({ hasText: "Venta Bruta" });
const readyPurchases = (page) =>
  expect(
    page.locator(".dashboard-kpi-card").filter({ hasText: "Transacciones" }).locator(".dashboard-kpi-value"),
  ).toHaveText(/^\d/);

async function enter(page, environment) {
  const user = await reportUser(environment);
  await login(page, environment, user);
  await expect(grossSales(page)).toContainText("$100,00");
  await expect(page.locator(".user-menu-role")).toHaveText(user.roleName);
  await expect(page.locator(".app-navbar-ref")).toContainText("42.125000");
  return user;
}

async function watchShell(page) {
  await page.evaluate(() => {
    window.navigationMenu = document.querySelector(".user-menu-trigger");
    window.navigationViolations = [];
    window.navigationObserver = new MutationObserver(() => {
      if (!document.contains(window.navigationMenu)) window.navigationViolations.push("menu-remounted");
      if (document.querySelector('[aria-label="Validando acceso"]'))
        window.navigationViolations.push("blocking-session");
      if (document.querySelector(".user-menu-role")?.textContent === "Cargando rol…")
        window.navigationViolations.push("profile-reset");
    });
    window.navigationObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
  });
}

async function shellViolations(page) {
  return page.evaluate(() => {
    window.navigationObserver.disconnect();
    return window.navigationViolations;
  });
}

test("navegar conserva perfil, REF y dashboards de la misma sesión sin repetir ni cancelar peticiones", async ({
  page,
  environment,
}) => {
  await enter(page, environment);
  const requests = [];
  const failures = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      [
        "/api/auth/session",
        "/api/auth/profile",
        "/api/currency_rates",
        "/api/dashboard/sales",
        "/api/purchases/dashboard",
      ].includes(path)
    )
      requests.push(path);
  });
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) failures.push(request.failure()?.errorText);
  });
  await watchShell(page);
  await openModule(page, "Compras");
  await readyPurchases(page);
  await openModule(page, "Ventas");
  await expect(grossSales(page)).toContainText("$100,00");
  await openModule(page, "Compras");
  await readyPurchases(page);
  await openModule(page, "Ventas");
  await expect(grossSales(page)).toContainText("$100,00");
  expect(await shellViolations(page)).toEqual([]);
  expect(requests).toEqual(["/api/purchases/dashboard"]);
  expect(failures).toEqual([]);
});

test("sesión y perfil revalidan detrás sin bloquear navegación ni ocultar datos ya cargados", async ({
  page,
  environment,
}) => {
  await page.clock.install();
  const user = await enter(page, environment);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const requests = [];
  for (const path of ["/api/auth/session", "/api/auth/profile"]) {
    await page.route(`**${path}`, async (route) => {
      const response = await route.fetch({ ignoreHTTPSErrors: true });
      requests.push(path);
      await gate;
      await route.fulfill({ response }).catch(() => {});
    });
  }
  try {
    await page.clock.fastForward(31000);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => requests.length).toBe(2);
    await watchShell(page);
    await openModule(page, "Compras");
    await readyPurchases(page);
    await openModule(page, "Ventas");
    await expect(grossSales(page)).toContainText("$100,00");
    await expect(page.locator(".user-menu-role")).toHaveText(user.roleName);
    expect(await shellViolations(page)).toEqual([]);
    expect(requests.sort()).toEqual(["/api/auth/profile", "/api/auth/session"]);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("cambiar de módulo no cancela ni duplica un dashboard todavía en curso", async ({ page, environment }) => {
  await enter(page, environment);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let requests = 0;
  const failures = [];
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).pathname === "/api/purchases/dashboard") failures.push(request.failure()?.errorText);
  });
  await page.route("**/api/purchases/dashboard?**", async (route) => {
    requests++;
    const response = await route.fetch({ ignoreHTTPSErrors: true });
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await openModule(page, "Compras");
    await expect.poll(() => requests).toBe(1);
    await openModule(page, "Ventas");
    await expect(grossSales(page)).toContainText("$100,00");
    await openModule(page, "Compras");
    expect(requests).toBe(1);
    release();
    await readyPurchases(page);
    expect(requests).toBe(1);
    expect(failures).toEqual([]);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("un error transitorio del perfil conserva el rol conocido sin tratarlo como autorización", async ({
  page,
  environment,
}) => {
  await page.clock.install();
  const user = await enter(page, environment);
  await page.route("**/api/auth/profile", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Perfil temporalmente no disponible." } }),
    }),
  );
  const response = page.waitForResponse((result) => new URL(result.url()).pathname === "/api/auth/profile");
  await page.clock.fastForward(31000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect((await response).status()).toBe(503);
  await page.getByRole("button", { name: "Menú de cuenta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reintentar perfil", exact: true })).toBeVisible();
  await expect(page.locator(".user-menu-role")).toHaveText(user.roleName);
  await expect(grossSales(page)).toContainText("$100,00");
});

test("al cambiar de cuenta no reaparecen el rol ni los dashboards de la cuenta anterior", async ({
  page,
  environment,
}) => {
  const first = await enter(page, environment);
  const second = await reportUser(environment, "B");
  await logout(page);
  await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/profile", async (route) => {
    const response = await route.fetch({ ignoreHTTPSErrors: true });
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await login(page, environment, second);
    await expect(grossSales(page)).toContainText("$200,00");
    await expect(grossSales(page)).not.toContainText("$100,00");
    await expect(page.locator(".user-menu-role")).not.toHaveText(first.roleName);
    release();
    await expect(page.locator(".user-menu-role")).toHaveText(second.roleName);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("la revalidación de una sesión revocada elimina también las vistas guardadas en caché", async ({
  page,
  environment,
}) => {
  const user = await enter(page, environment);
  await openModule(page, "Compras");
  await readyPurchases(page);
  await environment.db("dmmarket_auth_users").where("id", user.id).update({ enabled: false });
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.locator(".dashboard-kpi-card")).toHaveCount(0);
  await expect(page.locator(".user-menu-trigger")).toHaveCount(0);
});
