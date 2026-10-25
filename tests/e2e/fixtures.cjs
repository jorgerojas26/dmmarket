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

async function openModule(page, name, view) {
  if (name === "Cartera") {
    name = "Clientes";
    view = "Cuentas por cobrar";
  }
  const navigation = page.getByRole("navigation", { name: "Módulos disponibles", exact: true });
  await navigation.waitFor({ state: "visible" });
  const link = navigation.getByRole("link", { name, exact: true });
  if (!(await link.isVisible()))
    await navigation.getByRole("button", { name: "Abrir navegación", exact: true }).click();
  await link.click();
  if (view && ["Compras", "Ventas", "Clientes", "Vendedores"].includes(name)) {
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

async function setNoe(page, value) {
  const toggle = page.getByRole("checkbox", { name: "Notas de entrega", exact: true });
  if ((await toggle.isChecked()) !== value) await toggle.locator("..").click();
  await expect(toggle).toBeChecked({ checked: value });
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
module.exports = { test, expect, login, openModule, setNoe, setCalendarMonth };
