const { test, expect, login, setNoe } = require("./fixtures.cjs");

async function openSales(page, environment) {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  const user = await environment.seedUser({ permissions: [{ capability: "sales.read", scope: "assigned" }] });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await page.goto(`${environment.origin}/ventas?view=dashboard&from=2026-01-01&to=2026-01-31`);
  await expect(page.locator(".dashboard-kpi-card").filter({ hasText: "Venta Bruta" })).toContainText("$100,00");
}

async function sessionReply(page, environment) {
  const cookie = (await page.context().cookies()).find((value) => value.name === "__Host-dmmarket.sid");
  const client = environment.client();
  client.jar.cookie = `${cookie.name}=${cookie.value}`;
  const response = await client.request("/api/auth/session");
  return { status: response.status, contentType: "application/json", body: response.text };
}

test("SWR revalida foco, visibilidad y conexión sin desmontar ni repetir la sesión en curso", async ({
  page,
  environment,
}) => {
  await openSales(page, environment);
  await setNoe(page, true);
  await expect(page.locator(".dashboard-kpi-card").filter({ hasText: "Venta Bruta" })).toContainText("$200,00");
  await page.evaluate(() => {
    window.sessionLayoutHeading = document.querySelector(".clientes-content h4");
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/api/auth/session", async (route) => {
    const response = await sessionReply(page, environment);
    requests += 1;
    await gate;
    await route.fulfill(response).catch(() => {});
  });
  try {
    await page.waitForTimeout(1100);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("focus"));
    });
    await expect.poll(() => requests).toBe(1);
    expect(await page.evaluate(() => document.contains(window.sessionLayoutHeading))).toBe(true);
    await expect(page.getByRole("checkbox", { name: "Notas de entrega", exact: true })).toBeChecked();
    await expect(page.locator(".dashboard-kpi-card").filter({ hasText: "Venta Bruta" })).toContainText("$200,00");
    release();
    await page.waitForTimeout(200);
    expect(requests).toBe(1);
    expect(await page.evaluate(() => document.contains(window.sessionLayoutHeading))).toBe(true);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

for (const [width, collapsed, fontSize = 16] of [
  [390, true],
  [1280, true],
  [1512, false],
  [1512, true],
  [1512, false, 20],
  [390, true, 20],
]) {
  test(`refresh reserva barra y sidebar desde HTML hasta sesión validada (${width}, collapsed=${collapsed}, font=${fontSize})`, async ({
    page,
    environment,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((size) => {
      const apply = () => {
        document.documentElement.style.fontSize = `${size}px`;
      };
      if (document.documentElement) apply();
      else {
        const observer = new MutationObserver(() => {
          if (document.documentElement) {
            apply();
            observer.disconnect();
          }
        });
        observer.observe(document, { childList: true });
      }
    }, fontSize);
    await openSales(page, environment);
    await page.evaluate((value) => localStorage.setItem("sidebarCollapsed", String(value)), collapsed);
    let startScripts;
    let startSession;
    const scripts = new Promise((resolve) => {
      startScripts = resolve;
    });
    const session = new Promise((resolve) => {
      startSession = resolve;
    });
    let waiting = false;
    await page.route("**/static/js/*.js", async (route) => {
      await scripts;
      await route.continue().catch(() => {});
    });
    await page.route("**/api/auth/session", async (route) => {
      const response = await sessionReply(page, environment);
      waiting = true;
      await session;
      await route.fulfill(response).catch(() => {});
    });
    try {
      await page.reload({ waitUntil: "commit" });
      await expect(page.locator(".app-initial-sidebar")).toHaveCount(1, { timeout: 2000 });
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(`${fontSize}px`);
      const initialBar = await page.locator(".app-initial-navbar").boundingBox();
      const initialSidebar = await page.locator(".app-initial-sidebar").boundingBox();
      expect(initialSidebar.width).toBe(width < 768 ? width : collapsed ? 64 : 260);
      startScripts();
      await expect.poll(() => waiting).toBe(true);
      const pendingBar = await page.locator(".app-navbar").boundingBox();
      const pendingSidebar = await page.locator(".clients-sidebar").boundingBox();
      expect(pendingBar).toEqual(initialBar);
      for (const dimension of ["x", "y", "width", "height"])
        expect(pendingSidebar[dimension]).toBeCloseTo(initialSidebar[dimension], 0);
      await expect(page.locator(".dashboard-kpi-card")).toHaveCount(0);
      await expect(page.getByRole("table")).toHaveCount(0);
      startSession();
      await expect(page.locator(".dashboard-kpi-card").filter({ hasText: "Venta Bruta" })).toContainText("$100,00");
      expect(await page.locator(".app-navbar").boundingBox()).toEqual(pendingBar);
      const readySidebar = await page.locator(".clients-sidebar").boundingBox();
      for (const dimension of ["x", "y", "width", "height"])
        expect(readySidebar[dimension]).toBeCloseTo(pendingSidebar[dimension], 0);
    } finally {
      startScripts();
      startSession();
      await page.unrouteAll({ behavior: "wait" });
    }
  });
}

test("un error de sesión no conserva datos privados como fallback de SWR", async ({ page, environment }) => {
  await openSales(page, environment);
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Servicio no disponible." } }),
    }),
  );
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("alert")).toContainText("No se puede validar la sesión.");
  await expect(page.locator(".dashboard-kpi-card")).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
  await page.getByRole("button", { name: "Reintentar validación", exact: true }).click();
  await expect(page.locator(".dashboard-kpi-card").filter({ hasText: "Venta Bruta" })).toContainText("$100,00");
});

test("SWR sigue comprobando la sesión tras descartar una respuesta anterior a una operación de acceso", async ({
  page,
  environment,
}) => {
  await page.clock.install();
  const user = await environment.seedUser({ permissions: [{ capability: "access.users", scope: "global" }] });
  await login(page, environment, user);
  await expect(page.getByLabel("Contraseña para configurar MFA", { exact: true })).toBeVisible();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/api/auth/session", async (route) => {
    const response = await sessionReply(page, environment);
    requests += 1;
    if (requests === 1) await gate;
    await route.fulfill(response).catch(() => {});
  });
  try {
    await page.clock.runFor(1100);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => requests).toBe(1);
    await page.getByLabel("Contraseña para configurar MFA", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Generar configuración MFA", exact: true }).click();
    await expect(page.getByLabel("Código de confirmación MFA", { exact: true })).toBeVisible();
    release();
    await page.waitForTimeout(200);
    await page.clock.runFor(31000);
    await expect.poll(() => requests, { timeout: 3000 }).toBeGreaterThanOrEqual(2);
    await expect(page.getByLabel("Código de confirmación MFA", { exact: true })).toBeVisible();
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("el marco y la sesión funcionan sin acceso a almacenamiento persistente del navegador", async ({
  page,
  environment,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.name));
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("Almacenamiento bloqueado.", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("Almacenamiento bloqueado.", "SecurityError");
    };
  });
  await page.goto(environment.origin);
  await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible({ timeout: 2000 });
  await openSales(page, environment);
  await page.locator(".sidebar-collapse-btn").click();
  await expect.poll(async () => Math.round((await page.locator(".clients-sidebar").boundingBox()).width)).toBe(260);
  expect(errors).toEqual([]);
});

test("cambiar de módulo valida acceso antes de reutilizar datos privados de la caché", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/inventory-fixtures.cjs").seedInventory(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "inventory.read", scope: "global" },
      { capability: "rates.read", scope: "global" },
    ],
  });
  await login(page, environment, user);
  await expect(page.locator(".app-navbar-ref").getByText("42.125000", { exact: true })).toBeVisible();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let waiting = false;
  await page.route("**/api/auth/session", async (route) => {
    const response = await sessionReply(page, environment);
    waiting = true;
    await gate;
    await route.fulfill(response).catch(() => {});
  });
  try {
    await page.getByRole("link", { name: "Configuración", exact: true }).click();
    await expect.poll(() => waiting).toBe(true);
    await expect(page.getByRole("main", { name: "Validando acceso", exact: true })).toBeVisible({ timeout: 1500 });
    await expect(page.getByRole("table")).toHaveCount(0);
    release();
    await expect(page.locator(".app-navbar-ref").getByText("42.125000", { exact: true })).toBeVisible();
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("una respuesta de sesión ilegible no deja datos privados visibles por el fallback de SWR", async ({
  page,
  environment,
}) => {
  await openSales(page, environment);
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "null" }),
  );
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("alert")).toContainText("No se puede validar la sesión.", { timeout: 2000 });
  await expect(page.locator(".dashboard-kpi-card")).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);
});
