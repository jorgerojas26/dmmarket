const { randomUUID } = require("node:crypto");
const { test, expect, login } = require("./fixtures.cjs");

const permissions = ["access.users", "access.roles", "access.links", "access.recover"].map((capability) => ({
  capability,
  scope: "global",
}));

async function enter(page, environment, grants = permissions) {
  const user = await environment.seedUser({ permissions: grants, enrolled: true });
  await login(page, environment, user);
  await page.getByLabel("Código MFA", { exact: true }).fill(await environment.token(user.secret));
  await page.getByRole("button", { name: "Verificar código", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Administración de usuarios", exact: true })).toBeVisible();
  return user;
}

async function openUser(page, username) {
  await page.getByLabel("Buscar usuarios", { exact: true }).fill(username);
  await page.getByRole("button", { name: `Administrar ${username}`, exact: true }).click();
  return page.getByRole("dialog", { name: `Administrar ${username}`, exact: true });
}

test("directorio filtra en servidor, pagina y muestra roles sin formularios permanentes", async ({
  page,
  environment,
}) => {
  const owner = await enter(page, environment);
  const roleId = randomUUID();
  await environment.db("dmmarket_auth_roles").insert({ id: roleId, name: "Ventas de prueba" });
  const rows = Array.from({ length: 105 }, (_, index) => ({
    id: randomUUID(),
    username: `directorio-${String(index).padStart(3, "0")}`,
    display_name: `Persona ${index}`,
    password_hash: owner.passwordHash,
    must_change_password: false,
    enabled: index !== 104,
  }));
  await environment.db("dmmarket_auth_users").insert(rows);
  await environment.db("dmmarket_auth_user_roles").insert({ user_id: rows[104].id, role_id: roleId });
  await page.reload();
  await expect(page.locator(".clients-sidebar")).toBeVisible();
  await expect(page.getByLabel("Contraseña de reautenticación", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Usuario nuevo", { exact: true })).toHaveCount(0);
  await page.getByLabel("Buscar usuarios", { exact: true }).fill("directorio-");
  await expect(page.getByText("1–100 de 105", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
  await expect(page.getByText("101–105 de 105", { exact: true })).toBeVisible();
  await page.getByLabel("Estado de los usuarios", { exact: true }).selectOption("disabled");
  await expect(page.getByText("1–1 de 1", { exact: true })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: rows[104].username });
  await expect(row).toContainText("Ventas de prueba");
  await expect(row).toContainText("Bloqueado");
  await page.getByLabel("Buscar usuarios", { exact: true }).fill("sin-coincidencias");
  await expect(page.getByText("No se encontraron usuarios.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Página siguiente", exact: true })).toBeDisabled();
  await environment
    .db("dmmarket_auth_user_roles")
    .whereIn(
      "user_id",
      rows.map((row) => row.id),
    )
    .delete();
  await environment
    .db("dmmarket_auth_users")
    .whereIn(
      "id",
      rows.map((row) => row.id),
    )
    .delete();
  await environment.db("dmmarket_auth_roles").where("id", roleId).delete();
});

test("alta contextual protege borradores y muestra la credencial una sola vez", async ({ page, environment }) => {
  await enter(page, environment);
  await page.getByRole("button", { name: "Crear usuario", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Crear usuario", exact: true });
  await panel.getByLabel("Usuario nuevo", { exact: true }).fill("nuevo-contextual");
  await panel.getByRole("button", { name: "Cerrar", exact: true }).click();
  const discard = page.getByRole("dialog", { name: "¿Descartar los cambios?", exact: true });
  await discard.getByRole("button", { name: "Seguir editando", exact: true }).click();
  await expect(panel.getByLabel("Usuario nuevo", { exact: true })).toHaveValue("nuevo-contextual");
  await panel.getByLabel("Nombre visible", { exact: true }).fill("Nueva persona");
  await panel.getByLabel("Motivo del alta", { exact: true }).fill("Alta asistida desde el directorio");
  await panel.getByRole("button", { name: "Crear usuario", exact: true }).click();
  const credential = page.getByRole("dialog", { name: "Credencial temporal", exact: true });
  await expect(credential).toContainText("nuevo-contextual");
  await expect(credential.getByLabel("Contraseña temporal emitida", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await credential.getByRole("button", { name: "Mostrar contraseña temporal", exact: true }).click();
  await expect(credential.getByLabel("Contraseña temporal emitida", { exact: true })).toHaveAttribute("type", "text");
  await credential.getByRole("button", { name: "Cerrar credencial temporal", exact: true }).click();
  await openUser(page, "nuevo-contextual");
  await expect(page.getByLabel("Contraseña temporal emitida", { exact: true })).toHaveCount(0);
});

test("roles usan lenguaje humano, conservan cambios y persisten alcances", async ({ page, environment }) => {
  await enter(page, environment);
  await page.locator(".clients-sidebar").getByRole("button", { name: "Roles", exact: true }).click();
  await expect(page).toHaveURL(/#roles$/);
  await page.getByRole("button", { name: "Crear rol", exact: true }).click();
  await page.getByLabel("Nombre del rol", { exact: true }).fill("Ventas limitadas");
  await page.getByLabel("Consultar ventas", { exact: true }).selectOption("assigned");
  await page.getByLabel("Ver costos y utilidad de ventas", { exact: true }).selectOption("assigned");
  await expect(page.getByText("sales.financial", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page
    .getByRole("dialog", { name: "¿Descartar los cambios?", exact: true })
    .getByRole("button", { name: "Seguir editando", exact: true })
    .click();
  await expect(page.getByLabel("Consultar ventas", { exact: true })).toHaveValue("assigned");
  await page.getByLabel("Motivo del cambio de rol", { exact: true }).fill("Crear un perfil de ventas limitado");
  await page.getByRole("button", { name: "Guardar rol", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rol guardado" })).toBeVisible();
  await page.getByRole("button", { name: "Editar Ventas limitadas", exact: true }).click();
  await expect(page.getByLabel("Consultar ventas", { exact: true })).toHaveValue("assigned");
  const role = await environment.db("dmmarket_auth_roles").where("name", "Ventas limitadas").first();
  expect(
    await environment
      .db("dmmarket_auth_role_permissions")
      .where("role_id", role.id)
      .orderBy("capability")
      .select("capability", "scope"),
  ).toEqual([
    { capability: "sales.financial", scope: "assigned" },
    { capability: "sales.read", scope: "assigned" },
  ]);
});

test("verificación contextual conserva el alta, permite cancelar y reintenta solo tras MFA válido", async ({
  page,
  environment,
}) => {
  const owner = await enter(page, environment);
  const expire = () =>
    environment
      .db("dmmarket_auth_session_state")
      .where("user_id", owner.id)
      .whereNull("revoked_ms")
      .update({ password_ms: Date.now() - 300001, mfa_ms: Date.now() - 300001 });
  await expire();
  await page.getByRole("button", { name: "Crear usuario", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Crear usuario", exact: true });
  await panel.getByLabel("Usuario nuevo", { exact: true }).fill("alta-verificada");
  await panel.getByLabel("Nombre visible", { exact: true }).fill("Persona verificada");
  await panel.getByLabel("Motivo del alta", { exact: true }).fill("Verificación contextual de identidad");
  await panel.getByRole("button", { name: "Crear usuario", exact: true }).click();
  const verification = page.getByRole("dialog", { name: "Confirmar identidad", exact: true });
  await expect(verification).toBeVisible();
  await verification.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(panel.getByLabel("Usuario nuevo", { exact: true })).toHaveValue("alta-verificada");
  expect(await environment.db("dmmarket_auth_users").where("username", "alta-verificada")).toHaveLength(0);
  await panel.getByRole("button", { name: "Crear usuario", exact: true }).click();
  await verification.getByLabel("Contraseña de reautenticación", { exact: true }).fill("incorrecta");
  await verification.getByLabel("Código MFA de reautenticación", { exact: true }).fill("000000");
  await verification.getByRole("button", { name: "Confirmar identidad", exact: true }).click();
  await expect(verification.getByRole("alert")).toBeVisible();
  let token;
  await expect
    .poll(
      async () => {
        token = await environment.token(owner.secret);
        const row = await environment.db("dmmarket_auth_users").where("id", owner.id).first("mfa_last_step");
        return Number(row.mfa_last_step) < Math.floor(Date.now() / 30000);
      },
      { timeout: 35000 },
    )
    .toBe(true);
  await verification.getByLabel("Contraseña de reautenticación", { exact: true }).fill(owner.password);
  await verification.getByLabel("Código MFA de reautenticación", { exact: true }).fill(token);
  await verification.getByRole("button", { name: "Confirmar identidad", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Credencial temporal", exact: true })).toBeVisible();
  expect(await environment.db("dmmarket_auth_users").where("username", "alta-verificada")).toHaveLength(1);
});

test("vincula vendedores por nombre sin conceder lectura de negocio", async ({ page, environment }) => {
  if (!(await environment.db.schema.hasTable("vendedores"))) {
    await environment.db.schema.createTable("vendedores", (table) => {
      table.engine("InnoDB");
      table.charset("utf8");
      table.collate("utf8_bin");
      table.string("idVend", 32).primary();
      table.string("Empresa", 128);
      table.string("Telefono", 64);
    });
  }
  await environment
    .db("vendedores")
    .insert({ idVend: "SELECTOR", Empresa: "Vendedora del selector", Telefono: "PRIVATE-SELECTOR" });
  const target = await environment.seedUser({ permissions: [] });
  await enter(page, environment, [{ capability: "access.links", scope: "global" }]);
  await expect(page.getByRole("button", { name: "Crear usuario", exact: true })).toHaveCount(0);
  await expect(page.locator(".clients-sidebar").getByRole("button", { name: "Roles", exact: true })).toHaveCount(0);
  const panel = await openUser(page, target.username);
  await expect(panel.getByRole("button", { name: "Bloquear cuenta", exact: true })).toHaveCount(0);
  await panel.getByLabel("Buscar vendedores", { exact: true }).fill("Vendedora del selector");
  await panel.getByRole("checkbox", { name: "Vendedora del selector · SELECTOR", exact: true }).check();
  await panel.getByLabel("Motivo del cambio de vínculos", { exact: true }).fill("Vincular por nombre desde el panel");
  await panel.getByRole("button", { name: "Guardar vendedores vinculados", exact: true }).click();
  await expect(panel.getByRole("status").filter({ hasText: "Vínculos guardados" })).toBeVisible();
  expect(await environment.db("dmmarket_auth_user_sellers").where("user_id", target.id).pluck("seller_id")).toEqual([
    "SELECTOR",
  ]);
  const result = await page.evaluate(async () => {
    const directory = await (await fetch("/api/auth/directory")).json();
    const sellers = await (await fetch("/api/auth/seller-options?search=SELECTOR")).json();
    return {
      directory,
      sellers,
      users: (await fetch("/api/auth/users")).status,
      business: (await fetch("/api/employees")).status,
    };
  });
  expect(result.users).toBe(403);
  expect(result.business).toBe(403);
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE-SELECTOR|password_hash|mfa_secret|passwordHash/);
  expect(Object.keys(result.sellers.data[0]).sort()).toEqual(["id", "name"]);
});

test("APIs del directorio deniegan lectores y validan filtros", async ({ page, environment }) => {
  await enter(page, environment);
  for (const query of ["page=0", "state=invalid", `search=${"x".repeat(129)}`]) {
    expect(await page.evaluate(async (query) => (await fetch(`/api/auth/directory?${query}`)).status, query)).toBe(400);
  }
  expect(
    await page.evaluate(
      async () => (await fetch(`/api/auth/seller-options?ids=${Array(101).fill("A").join(",")}`)).status,
    ),
  ).toBe(400);
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await login(page, environment, await environment.seedUser());
  for (const endpoint of ["directory", "seller-options"]) {
    expect(await page.evaluate(async (endpoint) => (await fetch(`/api/auth/${endpoint}`)).status, endpoint)).toBe(403);
  }
});

test("Acceso móvil mantiene navegación, paneles y permisos sin desbordar", async ({ page, environment }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, environment);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Crear usuario", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Crear usuario", exact: true });
  await expect(panel.getByLabel("Usuario nuevo", { exact: true })).toBeVisible();
  await expect.poll(() => panel.evaluate((element) => element.scrollWidth <= innerWidth)).toBe(true);
  await panel.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.locator(".clients-sidebar").getByRole("button", { name: "Roles", exact: true }).click();
  await page.getByRole("button", { name: "Crear rol", exact: true }).click();
  await expect(page.getByLabel("Consultar ventas", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
