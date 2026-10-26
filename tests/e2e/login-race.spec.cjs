const { test, expect } = require("./fixtures.cjs");

test("credenciales y MFA válidos no se rechazan al recuperar el foco durante el acceso", async ({
  browser,
  environment,
}) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const user = await environment.seedUser({
      enrolled: true,
      permissions: [{ capability: "access.users", scope: "global" }],
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(environment.origin);
      await page.getByRole("textbox", { name: "Usuario", exact: true }).fill(user.username);
      await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill(user.password);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      const login = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/login");
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      const loginResponse = await login;
      expect({ status: loginResponse.status(), error: (await loginResponse.json()).error?.message }).toEqual({
        status: 200,
        error: undefined,
      });
      await page.getByLabel("Código MFA", { exact: true }).fill(await environment.token(user.secret));
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      const mfa = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/mfa");
      await page.getByRole("button", { name: "Verificar código", exact: true }).click();
      const mfaResponse = await mfa;
      expect({ status: mfaResponse.status(), error: (await mfaResponse.json()).error?.message }).toEqual({
        status: 200,
        error: undefined,
      });
      await expect(page.getByRole("heading", { name: "Administración de usuarios", exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  }
});
