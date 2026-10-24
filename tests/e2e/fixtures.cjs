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
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

module.exports = { test, expect, login };
