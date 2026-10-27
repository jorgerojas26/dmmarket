const { test, expect, login } = require("./fixtures.cjs");
const { seedSales } = require("../support/sales-fixtures.cjs");

const grossSales = (page) => page.locator(".dashboard-kpi-card").filter({ hasText: "Venta Bruta" });

async function enter(page, environment, seller = "A") {
  await seedSales(environment.db);
  const user = await environment.seedUser({ permissions: [{ capability: "sales.read", scope: "assigned" }] });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: seller });
  await login(page, environment, user);
  await expect(grossSales(page)).toContainText(seller === "A" ? "$100,00" : "$200,00");
  return user;
}

async function interrupt(page, status = 503, body = JSON.stringify({ error: { message: "No disponible." } })) {
  await page.route("**/api/auth/session", (route) => route.fulfill({ status, contentType: "application/json", body }));
  await page.clock.runFor(1100);
  const response = page.waitForResponse((result) => new URL(result.url()).pathname === "/api/auth/session");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await response;
}

for (const status of [503, 502]) {
  test(`un corte ${status} conserva la vista sin remontarla y bloquea las operaciones`, async ({
    page,
    environment,
  }) => {
    await page.clock.install();
    await enter(page, environment);
    await page.evaluate(() => {
      window.previousDashboard = document.querySelector(".dashboard-kpi-card");
    });
    let writes = 0;
    await page.route("**/api/recovery-probe", (route) => {
      writes++;
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await interrupt(page, status, status === 502 ? "Bad Gateway" : undefined);
    await expect(page.getByRole("region", { name: "Estado de conexión", exact: true })).toContainText("Solo lectura");
    await expect(grossSales(page)).toContainText("$100,00");
    expect(await page.evaluate(() => document.contains(window.previousDashboard))).toBe(true);
    expect(await page.locator(".auth-session-content").evaluate((node) => node.inert)).toBe(true);
    expect(
      await page.evaluate(() => fetch("/api/recovery-probe", { method: "POST" }).catch((error) => error.status)),
    ).toBe(503);
    expect(writes).toBe(0);
    await page.unroute("**/api/auth/session");
    await page.getByRole("button", { name: "Reintentar", exact: true }).click();
    await expect(page.getByRole("region", { name: "Estado de conexión", exact: true })).toHaveCount(0);
    expect(await page.locator(".auth-session-content").evaluate((node) => node.inert)).toBe(false);
    expect(await page.evaluate(() => document.contains(window.previousDashboard))).toBe(true);
  });
}

test("los fallos sucesivos no extienden la tolerancia y se recupera sin recargar", async ({ page, environment }) => {
  await page.clock.install();
  await enter(page, environment);
  await interrupt(page);
  await page.clock.runFor(30000);
  await expect(page.getByRole("region", { name: "Estado de conexión", exact: true })).toBeVisible();
  await page.clock.runFor(31000);
  await expect(page.getByRole("heading", { name: "Conexión interrumpida", exact: true })).toBeVisible();
  await expect(grossSales(page)).toHaveCount(0);
  await expect(page.locator(".user-menu-trigger")).toHaveCount(0);
  await page.unroute("**/api/auth/session");
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(grossSales(page)).toContainText("$100,00");
});

test("una respuesta inválida no admite tolerancia aunque hubiera una sesión válida", async ({ page, environment }) => {
  await page.clock.install();
  await enter(page, environment);
  await interrupt(page, 200, JSON.stringify({ user: { id: 1 }, stage: "ready", csrfToken: "invalid" }));
  await expect(page.getByRole("heading", { name: "No pudimos validar tu acceso", exact: true })).toBeVisible();
  await expect(grossSales(page)).toHaveCount(0);
});

test("una denegación de acceso seguida de un corte no reutiliza la sesión anterior", async ({ page, environment }) => {
  await enter(page, environment);
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("dmmarket:access-lost", { detail: 403 })));
  await expect(page.getByRole("heading", { name: "Conexión interrumpida", exact: true })).toBeVisible();
  await expect(grossSales(page)).toHaveCount(0);
});

test("una sesión revocada va al formulario de acceso sin mostrar recuperación de conexión", async ({
  page,
  environment,
}) => {
  const user = await enter(page, environment);
  await environment.db("dmmarket_auth_users").where("id", user.id).update({ enabled: false });
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
  await expect(page.locator(".auth-recovery-page")).toHaveCount(0);
  await expect(grossSales(page)).toHaveCount(0);
});

for (const width of [390, 1280]) {
  test(`el acceso sigue disponible sin servidor y después de recargar (${width}px)`, async ({ page, environment }) => {
    await page.setViewportSize({ width, height: 820 });
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
    );
    await page.goto(environment.origin);
    const title = page.getByRole("heading", { name: "Conexión interrumpida", exact: true });
    await expect(title).toBeVisible();
    await expect(title).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Volver a iniciar sesión", exact: true }).click();
    await expect(page).toHaveURL(`${environment.origin}/login`);
    await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });
    await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Usuario", exact: true }).fill("sin-conexion");
    await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill("No-es-una-credencial-real");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
  });
}

test("salir durante un reintento descarta la respuesta tardía de la sesión anterior", async ({ page, environment }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.goto(environment.origin);
  await expect(page.getByRole("heading", { name: "Conexión interrumpida", exact: true })).toBeVisible();
  await page.unroute("**/api/auth/session");
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route("**/api/auth/session", async (route) => {
    const response = await route.fetch({ ignoreHTTPSErrors: true });
    requested = true;
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await page.getByRole("button", { name: "Reintentar", exact: true }).click();
    await expect.poll(() => requested).toBe(true);
    await expect(page.getByRole("button", { name: "Reconectando…", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Volver a iniciar sesión", exact: true }).click();
    release();
    await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
    await expect(page.locator(".user-menu-trigger")).toHaveCount(0);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("volver al acceso revoca la sesión anterior antes de entrar con otra cuenta", async ({ page, environment }) => {
  await page.clock.install();
  await enter(page, environment);
  const cookie = (await page.context().cookies()).find((value) => value.name === "__Host-dmmarket.sid");
  const second = await environment.seedUser({ permissions: [{ capability: "sales.read", scope: "assigned" }] });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: second.id, seller_id: "B" });
  await interrupt(page);
  await page.getByRole("button", { name: "Volver a iniciar sesión", exact: true }).click();
  await page.unroute("**/api/auth/session");
  const paths = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (["/api/auth/session", "/api/auth/logout", "/api/auth/login"].includes(path)) paths.push(path);
  });
  await page.getByRole("textbox", { name: "Usuario", exact: true }).fill(second.username);
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill(second.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(grossSales(page)).toContainText("$200,00");
  await expect(grossSales(page)).not.toContainText("$100,00");
  expect(paths.slice(0, 4)).toEqual(["/api/auth/session", "/api/auth/logout", "/api/auth/session", "/api/auth/login"]);
  const client = environment.client();
  client.jar.cookie = `${cookie.name}=${cookie.value}`;
  expect((await client.request("/api/auth/session")).body.stage).toBe("anonymous");
});
