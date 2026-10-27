const { test, expect, login, logout } = require("./fixtures.cjs");

async function pendingRequest(page, path) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(`**${path}`, async (route) => {
    await gate;
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"success":true}' }).catch(() => {});
  });
  const requested = page.waitForRequest((request) => new URL(request.url()).pathname === path);
  await page.evaluate((path) => {
    window.downloadResult = { state: "pending" };
    window.downloadPromise = fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    })
      .then((response) => response.json())
      .then(
        (body) => {
          window.downloadResult = { state: "complete", body };
        },
        (error) => {
          window.downloadResult = { state: "error", name: error.name, status: error.status };
        },
      );
  }, path);
  return { request: await requested, release };
}

test("la descarga conserva CSRF y puede terminar después de un minuto", async ({ page, environment }) => {
  await page.clock.install();
  await login(page, environment, await environment.seedUser());
  await expect(page.locator(".user-menu-trigger")).toBeVisible();
  const pending = await pendingRequest(page, "/api/update/download");
  try {
    expect(pending.request.headers()["x-csrf-token"]).toBeTruthy();
    await page.clock.fastForward(61000);
    expect(await page.evaluate(() => window.downloadResult)).toEqual({ state: "pending" });
    pending.release();
    await page.evaluate(() => window.downloadPromise);
    expect(await page.evaluate(() => window.downloadResult)).toEqual({ state: "complete", body: { success: true } });
  } finally {
    pending.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("salir cancela una descarga larga y descarta su respuesta", async ({ page, environment }) => {
  await login(page, environment, await environment.seedUser());
  await expect(page.locator(".user-menu-trigger")).toBeVisible();
  const pending = await pendingRequest(page, "/api/update/download");
  try {
    await logout(page);
    await page.evaluate(() => window.downloadPromise);
    expect(await page.evaluate(() => window.downloadResult)).toMatchObject({ state: "error", name: "AbortError" });
    await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
  } finally {
    pending.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("las demás operaciones conservan el timeout de un minuto", async ({ page, environment }) => {
  await page.clock.install();
  await login(page, environment, await environment.seedUser());
  await expect(page.locator(".user-menu-trigger")).toBeVisible();
  const pending = await pendingRequest(page, "/api/slow-probe");
  try {
    await page.clock.fastForward(61000);
    await page.evaluate(() => window.downloadPromise);
    expect(await page.evaluate(() => window.downloadResult)).toEqual({
      state: "error",
      name: "TimeoutError",
      status: 503,
    });
  } finally {
    pending.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});
