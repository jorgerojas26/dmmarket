const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

let server;
let origin;

test.use({ channel: "chrome" });
test.beforeAll(async () => {
  const root = path.resolve(__dirname, "../../packages/frontend/build");
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = path.join(root, pathname.startsWith("/static/") ? pathname : "index.html");
    response.setHeader(
      "Content-Type",
      file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "text/html",
    );
    fs.createReadStream(file)
      .on("error", () => response.end())
      .pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

for (const width of [390, 1440]) {
  test(`login y MFA: presentación y controles a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let stage = "anonymous";
    const session = () => ({
      stage,
      csrfToken: "presentation-token",
      ...(stage === "mfa"
        ? {
            user: { id: "11111111-1111-4111-8111-111111111111", username: "maria", displayName: "María" },
            revision: 1,
            mfaEnabled: true,
            permissions: [],
          }
        : { user: null }),
    });
    await page.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/auth/login") stage = "mfa";
      if (pathname === "/api/auth/mfa") {
        await route.fulfill({ status: 400, json: { error: { message: "Código incorrecto. Inténtalo de nuevo." } } });
        return;
      }
      await route.fulfill({ json: session() });
    });
    await page.goto(`${origin}/login`);
    await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
    await expect(page.locator(".auth-entry-intro")).toHaveCount(0);
    await expect(page.locator(".auth-entry-footer")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Pasos de acceso" })).toHaveCount(0);
    const card = await page.locator(".auth-entry-card").boundingBox();
    expect(Math.abs(card.x + card.width / 2 - width / 2)).toBeLessThan(2);
    expect(card.width).toBeLessThanOrEqual(440);
    await page.getByLabel("Usuario", { exact: true }).fill("maria");
    const password = page.getByLabel("Contraseña", { exact: true });
    await password.fill("una-contraseña-segura");
    await page.getByRole("button", { name: "Mostrar contraseña", exact: true }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Ocultar contraseña", exact: true }).click();
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Verificar segundo factor", exact: true })).toBeVisible();
    await expect(page.getByText("¿El código no funciona?", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText(
        "Un paso más para proteger tu cuenta. Abre tu aplicación de autenticación e introduce el código actual.",
        { exact: true },
      ),
    ).toHaveCount(0);
    const code = page.getByLabel("Código MFA", { exact: true });
    await expect(code).toBeFocused();
    await code.fill("123");
    await page.getByRole("button", { name: "Verificar código", exact: true }).click();
    expect(await code.evaluate((input) => input.validity.valid)).toBe(false);
    await code.fill("012345");
    await page.getByRole("button", { name: "Verificar código", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Código incorrecto");
    await expect(code).toHaveValue("");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeVisible();
  });
}
