const { test, expect, login } = require("./fixtures.cjs");

test("las sesiones UUID permiten entrar y restaurar el acceso al recargar", async ({ page, environment }) => {
  const user = await environment.seedUser();
  await login(page, environment, user);
  await expect(page.locator(".user-menu-trigger")).toBeVisible();
  const session = await page.evaluate(async () => (await fetch("/api/auth/session")).json());
  expect(session.user.id).toBe(user.id);
  expect(typeof session.user.id).toBe("string");
  await page.reload();
  await expect(page.locator(".user-menu-trigger")).toBeVisible();
  await expect(page.locator(".auth-recovery-page")).toHaveCount(0);
});

for (const id of [1, "1", "not-a-uuid", null]) {
  test(`una identidad inválida ${JSON.stringify(id)} no abre la aplicación`, async ({ page, environment }) => {
    const user = await environment.seedUser();
    const response = await environment.client().login(user);
    expect(response.status).toBe(200);
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...response.body, user: { ...response.body.user, id } }),
      }),
    );
    await page.goto(environment.origin);
    await expect(page.getByRole("heading", { name: "No pudimos validar tu acceso", exact: true })).toBeVisible();
    await expect(page.locator(".user-menu-trigger")).toHaveCount(0);
  });
}
