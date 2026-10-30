const { test, expect, login } = require("./fixtures.cjs");

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`acceso restringido se presenta centrado y accesible a ${viewport.width}px`, async ({ page, environment }) => {
    await page.setViewportSize(viewport);
    await login(page, environment, await environment.seedUser({ permissions: [] }));
    const requests = [];
    page.on("request", (request) => {
      if (/^\/api\/(sales|dashboard\/sales|invoices|exports\/sales)(\/|$)/.test(new URL(request.url()).pathname))
        requests.push(request.url());
    });
    await page.goto(`${environment.origin}/ventas`);
    const main = page.getByRole("main", { name: "Acceso restringido", exact: true });
    const title = main.getByRole("heading", { name: "Acceso restringido", exact: true });
    await expect(title).toBeVisible();
    await expect(title).toBeFocused();
    await expect(title).toHaveCSS("color", "rgb(237, 241, 247)");
    await expect(
      main.getByText("Tu cuenta no tiene permisos para acceder a esta sección.", { exact: true }),
    ).toBeVisible();
    await expect(main.getByText("403", { exact: true })).toBeVisible();
    await expect(main.locator("svg[aria-hidden='true']").first()).toBeVisible();
    const icon = await main.locator(".access-denied__icon").boundingBox();
    expect(icon.width).toBeGreaterThanOrEqual(112);
    const frame = await main.boundingBox();
    const content = await main.locator(".access-denied__content").boundingBox();
    expect(Math.abs(content.x + content.width / 2 - frame.x - frame.width / 2)).toBeLessThan(2);
    expect(Math.abs(content.y + content.height / 2 - frame.y - frame.height / 2)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("link", { name: "Ventas", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Ventas", exact: true })).toHaveCount(0);
    expect(requests).toEqual([]);
    const back = main.getByRole("link", { name: "Volver al inicio", exact: true });
    await expect(back).toHaveAttribute("href", "/");
    await page.keyboard.press("Tab");
    await expect(back).toBeFocused();
    await page.screenshot({ path: `/tmp/dmmarket-access-denied-${viewport.width}.png` });
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${environment.origin}/cuenta`);
    await expect(page.getByRole("region", { name: "Mi cuenta", exact: true })).toBeVisible();
  });
}

test("acceso restringido vuelve al primer módulo autorizado sin ampliar permisos", async ({ page, environment }) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  const user = await environment.seedUser({ permissions: [{ capability: "sales.read", scope: "global" }] });
  await login(page, environment, user);
  await page.goto(`${environment.origin}/acceso`);
  await expect(page.getByRole("heading", { name: "Acceso restringido", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Volver al inicio", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard de Ventas", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Acceso", exact: true })).toHaveCount(0);
});
