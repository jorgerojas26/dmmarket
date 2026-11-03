const { test, expect, login } = require("./fixtures.cjs");

const permissions = ["access.users", "access.roles", "access.links", "access.recover"].map((capability) => ({
  capability,
  scope: "global",
}));

async function enter(page, environment) {
  const user = await environment.seedUser({ permissions, enrolled: true });
  await login(page, environment, user);
  await page.getByLabel("Código MFA", { exact: true }).fill(await environment.token(user.secret));
  await page.getByRole("button", { name: "Verificar código", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Administración de usuarios", exact: true })).toBeVisible();
  return user;
}

test("la credencial temporal pendiente se marca y se regenera desde el detalle", async ({ page, environment }) => {
  await enter(page, environment);
  const target = await environment.seedUser({ temporary: true });
  await page.getByLabel("Buscar usuarios", { exact: true }).fill(target.username);
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: `Administrar ${target.username}`, exact: true }) });
  await expect(row).toContainText("Activación pendiente");
  await page.getByRole("link", { name: `Administrar ${target.username}`, exact: true }).click();
  const screen = page.getByRole("region", { name: `Administrar ${target.username}`, exact: true });
  await expect(screen).toContainText("Activación pendiente");
  await screen.getByRole("button", { name: "Regenerar credencial", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Regenerar credencial", exact: true });
  await dialog.getByRole("button", { name: "Confirmar operación", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Credencial temporal", exact: true })).toBeVisible();
  expect(await environment.db("dmmarket_auth_users").where("id", target.id).first()).toMatchObject({
    must_change_password: 1,
    temporary_consumed: 0,
  });
});

test("una credencial vencida bloquea el acceso con un mensaje específico y queda marcada", async ({
  page,
  environment,
}) => {
  const target = await environment.seedUser({ temporary: true });
  await environment
    .db("dmmarket_auth_users")
    .where("id", target.id)
    .update({ temporary_expires_ms: Date.now() - 60000 });
  await page.goto(environment.origin);
  await page.getByRole("textbox", { name: "Usuario", exact: true }).fill(target.username);
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill(target.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "La contraseña temporal venció o ya fue utilizada. Pide a un administrador que restablezca tu acceso.",
  );
  await enter(page, environment);
  await page.getByLabel("Buscar usuarios", { exact: true }).fill(target.username);
  await expect(
    page
      .getByRole("row")
      .filter({ has: page.getByRole("link", { name: `Administrar ${target.username}`, exact: true }) }),
  ).toContainText("Credencial vencida");
});

test("el primer ingreso exige cambiar la contraseña antes de usar la aplicación", async ({ page, environment }) => {
  const target = await environment.seedUser({ temporary: true });
  await login(page, environment, target);
  const heading = page.getByRole("heading", { name: "Cambiar contraseña temporal", exact: true });
  await expect(heading).toBeVisible();
  await expect(page.getByText(/Es obligatorio/)).toBeVisible();
  await page.goto(`${environment.origin}/ventas`);
  await expect(heading).toBeVisible();
  await expect(page.locator(".clients-sidebar")).toHaveCount(0);
});
