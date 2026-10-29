const { test: base, expect, chromium } = require("@playwright/test");
const { startEnvironment } = require("../support/auth-environment.cjs");

const test = base.extend({
  environment: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium") throw new Error("Esta suite verifica Chrome real.");
      const environment = await startEnvironment({ web: true });
      try {
        await use(environment);
      } finally {
        await environment.close();
      }
    },
    { scope: "worker" },
  ],
  resetPreferences: [
    async ({ environment }, use) => {
      await environment
        .db("dmmarket_preferences")
        .where({ id: 1, document_type: "delivery-notes" })
        .update({
          document_type: "invoices",
          revision: environment.db.raw("revision + 1"),
        });
      await environment.db("dmmarket_settings").where("name", "reportCurrency").update({ value: "USD" });
      await use();
    },
    { auto: true },
  ],
  browser: [
    async ({ environment }, use) => {
      const browser = await chromium.launch({
        channel: "chrome",
        args: [
          `--ignore-certificate-errors-spki-list=${environment.spki}`,
          "--host-resolver-rules=MAP auth-probe.localhost 127.0.0.1",
        ],
      });
      try {
        await use(browser);
      } finally {
        await browser.close();
      }
    },
    { scope: "worker" },
  ],
});

async function login(page, environment, user) {
  await page.goto(environment.origin);
  await page.bringToFront();
  await page.getByRole("textbox", { name: "Usuario", exact: true }).fill(user.username);
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill(user.password);
  const response = page.waitForResponse(
    (result) => new URL(result.url()).pathname === "/api/auth/login" && result.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await (await response).finished();
}

async function logout(page) {
  const exit = page.getByRole("button", { name: "Salir", exact: true });
  if (!(await exit.isVisible())) {
    const menu = page.getByRole("button", { name: "Menú de cuenta", exact: true });
    const navigation = page.getByRole("button", { name: "Abrir navegación", exact: true });
    if (!(await menu.isVisible()) && (await navigation.isVisible())) await navigation.click();
    await menu.click();
  }
  await exit.click();
}

async function openModule(page, name, view) {
  if (name === "Cartera") {
    name = "Clientes";
    view = "Cuentas por cobrar";
  }
  const navigation = page.getByRole("navigation", { name: "Módulos disponibles", exact: true });
  await navigation.waitFor({ state: "visible" });
  await expect(
    navigation.getByRole("button", { name: "Menú de cuenta", exact: true, includeHidden: true }),
  ).toBeAttached();
  const link = navigation.getByRole("link", { name, exact: true });
  if (!(await link.isVisible())) {
    const toggle = navigation.getByRole("button", { name: "Abrir navegación", exact: true });
    if (await toggle.isVisible()) {
      if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    }
    if (["Configuración", "Mi cuenta", "Acceso", "Auditoría"].includes(name))
      await navigation.getByRole("button", { name: "Menú de cuenta", exact: true }).click();
  }
  await link.click();
  if (view && ["Compras", "Ventas", "Clientes", "Vendedores", "Configuración"].includes(name)) {
    await page
      .locator(".clients-sidebar")
      .getByRole("button", { name: new RegExp(view) })
      .click();
  } else if (view)
    await page
      .getByRole("navigation", { name: `Vistas de ${name}`, exact: true })
      .getByRole("link", { name: view, exact: true })
      .click();
}

async function setNoe(page, value, environment) {
  const activeTab = page.locator(".report-tab-button.active");
  const tab = (await activeTab.count()) ? await activeTab.elementHandle() : null;
  const tabName = tab ? await tab.textContent() : null;
  const documentType = value ? "delivery-notes" : "invoices";
  const user = await environment.seedUser({
    enrolled: true,
    permissions: ["preferences.read", "preferences.update"].map((capability) => ({ capability, scope: "global" })),
  });
  const administrator = environment.client();
  await administrator.login(user);
  expect(
    (
      await administrator.request("/api/auth/mfa", {
        method: "POST",
        body: { token: await environment.token(user.secret) },
      })
    ).status,
  ).toBe(200);
  const current = await administrator.request("/api/preferences");
  expect(current.status).toBe(200);
  if (current.body.documentType !== documentType) {
    expect(
      (
        await administrator.request("/api/preferences", {
          method: "PUT",
          body: { documentType, revision: current.body.revision },
        })
      ).status,
    ).toBe(200);
  }
  const refreshed = page.waitForResponse(
    async (response) =>
      new URL(response.url()).pathname === "/api/preferences/effective" &&
      response.status() === 200 &&
      (await response.json()).documentType === documentType,
    { timeout: 20000 },
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refreshed;
  if (tab && tabName && current.body.documentType !== documentType) {
    await expect.poll(() => tab.evaluate((element) => element.isConnected)).toBe(false);
    await page.locator(".report-tab-nav").getByRole("button", { name: tabName.trim(), exact: true }).click();
  }
}
async function setCalendarMonth(page, scope, year, month) {
  await scope.locator(".date-range-trigger").click();
  await scope.locator(".rdrYearPicker select").selectOption(String(year));
  await scope.locator(".rdrMonthPicker select").selectOption(String(month - 1));
  const days = scope.locator("button.rdrDay:not(.rdrDayPassive)");
  await days.filter({ has: page.getByText("1", { exact: true }) }).click();
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  await days.filter({ has: page.getByText(String(last), { exact: true }) }).click();
  await scope.locator(".date-range-footer").getByRole("button", { name: "Listo", exact: true }).click();
}
module.exports = { test, expect, login, logout, openModule, setNoe, setCalendarMonth };
