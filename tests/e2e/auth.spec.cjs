const { randomBytes } = require("node:crypto");
const { test, expect, login } = require("./fixtures.cjs");
const { docker } = require("../support/auth-environment.cjs");
const ownerPermissions = ["access.users", "access.roles", "access.links", "access.recover"].map((capability) => ({
  capability,
  scope: "global",
}));

async function changePassword(page, current, password) {
  await page.getByRole("textbox", { name: "Contraseña actual", exact: true }).fill(current);
  await page.getByRole("textbox", { name: "Contraseña nueva", exact: true }).fill(password);
  await page.getByRole("textbox", { name: "Confirmar contraseña nueva", exact: true }).fill(password);
  await page.getByRole("button", { name: "Guardar contraseña", exact: true }).click();
}

test("login incorrecto/correcto, permisos, cookies y cambio propio sin MFA", async ({ page, context, environment }) => {
  const user = await environment.seedUser();
  await login(page, environment, { ...user, password: "incorrect" });
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("cell", { name: "42.125000" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Administración de usuarios" })).toHaveCount(0);
  expect(await page.evaluate(async () => (await fetch("/api/auth/users")).status)).toBe(403);
  const cookie = (await context.cookies()).find((value) => value.name === "__Host-dmmarket.sid");
  expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: "Lax", path: "/" });
  expect(await page.evaluate(() => document.cookie)).not.toContain("dmmarket.sid");
  await page.getByRole("button", { name: "Cambiar mi contraseña", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Código MFA para cambiar contraseña" })).toHaveCount(0);
  const password = randomBytes(24).toString("base64url");
  await changePassword(page, user.password, password);
  await expect(page.getByRole("heading", { name: "Cambiar mi contraseña", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await login(page, environment, { ...user, password });
  await expect(page.getByRole("cell", { name: "42.125000" })).toBeVisible();
});

test("alta, recuperación y bloqueo de usuario desde administrador con MFA real", async ({
  page,
  browser,
  environment,
}) => {
  const owner = await environment.seedUser({ permissions: ownerPermissions, temporary: true });
  await login(page, environment, owner);
  await expect(page.getByRole("heading", { name: "Cambiar contraseña temporal" })).toBeVisible();
  expect(await page.evaluate(async () => (await fetch("/api/currency_rates")).status)).toBe(403);
  const password = randomBytes(24).toString("base64url");
  await changePassword(page, owner.password, password);
  await page.getByRole("textbox", { name: "Contraseña para configurar MFA" }).fill(password);
  await page.getByRole("button", { name: "Generar configuración MFA" }).click();
  const uri = await page.getByRole("textbox", { name: "Configuración manual MFA" }).inputValue();
  await expect(page.getByRole("img", { name: "Código QR de configuración MFA" })).toBeVisible();
  await page.getByRole("textbox", { name: "Código de confirmación MFA" }).fill("invalid");
  await page.getByRole("button", { name: "Confirmar MFA", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Código de confirmación MFA" })
    .fill(await environment.token(new URL(uri).searchParams.get("secret")));
  await page.getByRole("button", { name: "Confirmar MFA", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Administración de usuarios" })).toBeVisible();
  const username = `created-${randomBytes(4).toString("hex")}`;
  await page.getByRole("textbox", { name: "Usuario nuevo" }).fill(username);
  await page.getByRole("textbox", { name: "Nombre visible" }).fill("Usuario sintético E2E");
  await page.getByRole("textbox", { name: "Motivo del alta" }).fill("Alta de integración real");
  await page.getByRole("button", { name: "Crear usuario", exact: true }).click();
  const credential = page.getByRole("textbox", { name: "Contraseña temporal emitida" });
  await expect(credential).toBeVisible();
  const temporaryPassword = await credential.inputValue();
  await page.getByRole("button", { name: "Cerrar credencial temporal" }).click();
  const context = await browser.newContext();
  try {
    const reader = await context.newPage();
    await login(reader, environment, { username, password: temporaryPassword });
    await expect(reader.getByRole("heading", { name: "Cambiar contraseña temporal" })).toBeVisible();
    await changePassword(reader, temporaryPassword, randomBytes(24).toString("base64url"));
    await expect(reader.getByRole("status", { name: "Usuario conectado" })).toHaveText(username);
    await page.getByRole("button", { name: `Recuperar ${username}`, exact: true }).click();
    await page.getByRole("textbox", { name: "Motivo de la operación" }).fill("Recuperación real de prueba");
    await page.getByRole("button", { name: "Confirmar operación", exact: true }).click();
    await expect(credential).toBeVisible();
    const replacement = await credential.inputValue();
    expect(replacement).not.toBe(temporaryPassword);
    await reader.reload();
    await expect(reader.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await login(reader, environment, { username, password: temporaryPassword });
    await expect(reader.getByRole("alert")).toBeVisible();
    await login(reader, environment, { username, password: replacement });
    await expect(reader.getByRole("heading", { name: "Cambiar contraseña temporal" })).toBeVisible();
    await changePassword(reader, replacement, randomBytes(24).toString("base64url"));
    await expect(reader.getByRole("status", { name: "Usuario conectado" })).toHaveText(username);
    await page.getByRole("button", { name: `Cambiar estado de ${username}`, exact: true }).click();
    await page.getByRole("textbox", { name: "Motivo de la operación" }).fill("Bloqueo real de prueba");
    await page.getByRole("button", { name: "Confirmar operación", exact: true }).click();
    await expect(
      page.getByRole("row").filter({ has: page.getByRole("cell", { name: username, exact: true }) }),
    ).toContainText("Bloqueado");
    expect(await reader.evaluate(async () => (await fetch("/api/currency_rates")).status)).toBe(401);
    await expect(reader.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("logout y expiración eliminan datos en dos pestañas y al volver atrás", async ({ page, context, environment }) => {
  const user = await environment.seedUser();
  await login(page, environment, user);
  await expect(page.getByRole("cell", { name: "42.125000" })).toBeVisible();
  const second = await context.newPage();
  await second.goto(environment.origin);
  await expect(second.getByRole("cell", { name: "42.125000" })).toBeVisible();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(second.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await second.goto(`${environment.origin}/history-check`);
  await second.goBack();
  await expect(second.getByRole("table")).toHaveCount(0);
  await login(page, environment, user);
  await expect(page.getByRole("cell", { name: "42.125000" })).toBeVisible();
  await environment
    .db("dmmarket_auth_session_state")
    .where("user_id", user.id)
    .whereNull("revoked_ms")
    .update({ activity_ms: Date.now() - 1800001 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await expect(second.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("cambiar cuenta no reutiliza caché SWR mientras SQL está bloqueado", async ({ page, environment }) => {
  const first = await environment.seedUser();
  const second = await environment.seedUser();
  await login(page, environment, first);
  await expect(page.getByRole("cell", { name: "42.125000" })).toBeVisible();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  const connection = await environment.db.client.acquireConnection();
  let locked = false;
  try {
    await environment.db.raw("LOCK TABLES divisas WRITE").connection(connection);
    locked = true;
    await environment.db.raw("UPDATE divisas SET Cambio = ?", ["84.25"]).connection(connection);
    await login(page, environment, second);
    await expect(page.getByText("Cargando tasas…", { exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "42.125000" })).toHaveCount(0);
    await environment.db.raw("UNLOCK TABLES").connection(connection);
    locked = false;
    await expect(page.getByRole("cell", { name: "84.250000" })).toBeVisible();
  } finally {
    if (locked) await environment.db.raw("UNLOCK TABLES").connection(connection);
    await environment.db.client.releaseConnection(connection);
    await environment.db("divisas").update({ Cambio: "42.125" });
  }
});

test("MySQL realmente suspendido oculta datos sin fallback anónimo y recupera", async ({ page, environment }) => {
  await login(page, environment, await environment.seedUser());
  await expect(page.getByRole("cell", { name: "42.125000" })).toBeVisible();
  docker("pause", environment.container);
  try {
    await page.reload();
    await expect(page.getByRole("alert").filter({ hasText: "No se puede validar la sesión" })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toHaveCount(0);
  } finally {
    docker("unpause", environment.container);
  }
  await page.getByRole("button", { name: "Reintentar validación" }).click();
  await expect(page.getByRole("cell", { name: "42.125000" })).toBeVisible();
});

test("login móvil no desborda el viewport", async ({ page, environment }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(environment.origin);
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("MFA de login y reautenticación se verifican antes de administrar", async ({ page, environment }) => {
  const user = await environment.seedUser({ permissions: ownerPermissions, enrolled: true });
  await login(page, environment, user);
  await expect(page.getByRole("heading", { name: "Verificar segundo factor" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Administración de usuarios" })).toHaveCount(0);
  const token = await environment.token(user.secret);
  await page.getByRole("textbox", { name: "Código MFA", exact: true }).fill(token);
  await page.getByRole("button", { name: "Verificar código", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Administración de usuarios" })).toBeVisible();
  await page.getByRole("textbox", { name: "Contraseña de reautenticación" }).fill(user.password);
  await page.getByRole("textbox", { name: "Código MFA de reautenticación" }).fill(token);
  await page.getByRole("button", { name: "Confirmar identidad", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  let fresh;
  await expect
    .poll(
      async () => {
        fresh = await environment.token(user.secret);
        return fresh !== token;
      },
      { timeout: 35000 },
    )
    .toBe(true);
  await page.getByRole("textbox", { name: "Contraseña de reautenticación" }).fill(user.password);
  await page.getByRole("textbox", { name: "Código MFA de reautenticación" }).fill(fresh);
  await page.getByRole("button", { name: "Confirmar identidad", exact: true }).click();
  await expect(page.getByText("Identidad confirmada.", { exact: true })).toBeVisible();
});

test("editor crea rol, cambia alcance y administra vínculos revocando sesiones reales", async ({
  page,
  browser,
  environment,
}) => {
  if (!(await environment.db.schema.hasTable("vendedores"))) {
    await environment.db.schema.createTable("vendedores", (table) => {
      table.engine("InnoDB");
      table.charset("utf8");
      table.collate("utf8_bin");
      table.string("idVend", 32).primary();
    });
    await environment.db("vendedores").insert({ idVend: "A" });
  }
  const owner = await environment.seedUser({ permissions: ownerPermissions, enrolled: true });
  const user = await environment.seedUser();
  await login(page, environment, owner);
  await page.getByRole("textbox", { name: "Código MFA", exact: true }).fill(await environment.token(owner.secret));
  await page.getByRole("button", { name: "Verificar código", exact: true }).click();
  await page.getByRole("button", { name: "Administrar roles y vínculos", exact: true }).click();
  const name = `Rol E2E ${randomBytes(4).toString("hex")}`;
  await page.getByRole("textbox", { name: "Nombre del rol", exact: true }).fill(name);
  await page.getByLabel("sales.read", { exact: true }).selectOption("assigned");
  await page.getByLabel("rates.read", { exact: true }).selectOption("global");
  await page.getByRole("textbox", { name: "Motivo del cambio de rol" }).fill("Crear rol real desde interfaz");
  const createdResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/auth/roles") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Guardar rol", exact: true }).click();
  const created = await createdResponse;
  expect(created.status()).toBe(201);
  const role = await created.json();
  await expect(page.getByText("Rol guardado.", { exact: false })).toBeVisible();
  await page.getByLabel("Rol para editar", { exact: true }).selectOption(role.id);
  await expect(page.getByLabel("sales.read", { exact: true })).toHaveValue("assigned");
  await page.getByLabel("sales.read", { exact: true }).selectOption("global");
  await page.getByRole("textbox", { name: "Motivo del cambio de rol" }).fill("Cambiar alcance real del rol");
  const updatedResponse = page.waitForResponse(
    (response) => response.url().endsWith(`/api/auth/roles/${role.id}`) && response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Guardar rol", exact: true }).click();
  expect((await updatedResponse).status()).toBe(200);
  await page.getByLabel("ID del usuario para asignaciones", { exact: true }).fill(user.id);
  await page.getByLabel("Roles asignados", { exact: true }).selectOption([role.id]);
  await page.getByRole("textbox", { name: "Motivo de asignación de roles" }).fill("Asignar rol real desde interfaz");
  await page.getByRole("button", { name: "Guardar roles del usuario", exact: true }).click();
  await expect(page.getByText("Roles asignados y sesiones del usuario revocadas.", { exact: true })).toBeVisible();
  const context = await browser.newContext();
  try {
    const reader = await context.newPage();
    await login(reader, environment, user);
    await expect(reader.getByRole("cell", { name: "42.125000" })).toBeVisible();
    await page.getByRole("textbox", { name: "IDs de vendedores vinculados", exact: true }).fill("A");
    await page.getByRole("textbox", { name: "Motivo del cambio de vínculos" }).fill("Vincular vendedor real desde UI");
    await page.getByRole("button", { name: "Guardar vendedores vinculados", exact: true }).click();
    await expect(page.getByText("Vínculos guardados y sesiones del usuario revocadas.", { exact: true })).toBeVisible();
    await reader.reload();
    await expect(reader.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    expect(await environment.db("dmmarket_auth_user_sellers").where("user_id", user.id).pluck("seller_id")).toEqual([
      "A",
    ]);
    await page.getByRole("textbox", { name: "IDs de vendedores vinculados", exact: true }).fill("");
    await page
      .getByRole("textbox", { name: "Motivo del cambio de vínculos" })
      .fill("Quitar todos los vínculos desde UI");
    const cleared = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/auth/users/${user.id}/sellers`) && response.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Guardar vendedores vinculados", exact: true }).click();
    expect((await cleared).status()).toBe(200);
    expect(await environment.db("dmmarket_auth_user_sellers").where("user_id", user.id)).toHaveLength(0);
  } finally {
    await context.close();
  }
});

test("vendedor consulta solo sus ventas en ambos sistemas sin campos financieros ocultos", async ({
  page,
  environment,
}) => {
  const { seedSales } = require("../support/sales-fixtures.cjs");
  await seedSales(environment.db);
  const user = await environment.seedUser({ permissions: [{ capability: "sales.read", scope: "assigned" }] });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  const sales = page.getByRole("region", { name: "Consulta de ventas" });
  await sales.getByLabel("Ventas desde", { exact: true }).fill("2026-01-01");
  await sales.getByLabel("Ventas hasta", { exact: true }).fill("2026-01-31");
  await sales.getByRole("button", { name: "Consultar ventas", exact: true }).click();
  await expect(sales.getByRole("cell", { name: "Vendedor A", exact: true })).toBeVisible();
  await expect(sales.getByRole("cell", { name: "Vendedor B", exact: true })).toHaveCount(0);
  await expect(sales.getByRole("columnheader", { name: "Utilidad", exact: true })).toHaveCount(0);
  await expect(sales.getByText("Documentos o productos autorizados: 1", { exact: true })).toBeVisible();
  await expect(sales.getByRole("cell", { name: "1", exact: true })).toBeVisible();
  await sales.getByLabel("Sistema de ventas", { exact: true }).selectOption("true");
  await sales.getByRole("button", { name: "Consultar ventas", exact: true }).click();
  await expect(sales.getByRole("cell", { name: "2", exact: true })).toBeVisible();
  await expect(sales.getByRole("cell", { name: "Vendedor B", exact: true })).toHaveCount(0);
  await sales.getByLabel("Filtrar vendedor", { exact: true }).fill("B");
  await sales.getByRole("button", { name: "Consultar ventas", exact: true }).click();
  await expect(sales.getByText("Documentos o productos autorizados: 0", { exact: true })).toBeVisible();
});

test("documento y resumen comparativo no exponen costos, identificación ni ventas ajenas", async ({
  page,
  environment,
}) => {
  const user = await environment.seedUser({ permissions: [{ capability: "sales.read", scope: "assigned" }] });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  const sales = page.getByRole("region", { name: "Consulta de ventas" });
  await sales.getByLabel("Ventas desde", { exact: true }).fill("2026-01-01");
  await sales.getByLabel("Ventas hasta", { exact: true }).fill("2026-01-31");
  await sales.getByLabel("Comparar ventas desde", { exact: true }).fill("2025-12-01");
  await sales.getByLabel("Comparar ventas hasta", { exact: true }).fill("2025-12-31");
  await sales.getByRole("button", { name: "Consultar ventas", exact: true }).click();
  const summary = page.getByRole("region", { name: "Resumen de ventas" });
  await expect(summary.getByText("Total ventas: 100", { exact: true })).toBeVisible();
  await expect(summary.getByText("Ventas del período comparado: 10", { exact: true })).toBeVisible();
  await expect(summary.getByRole("columnheader", { name: "Utilidad", exact: true })).toHaveCount(0);
  await sales.getByRole("button", { name: "Ver documento 1", exact: true }).click();
  const detail = page.getByRole("region", { name: "Detalle de documento" });
  await expect(detail.getByText("Vendedor: Vendedor A", { exact: true })).toBeVisible();
  await expect(detail.getByRole("cell", { name: "Línea sintética", exact: true })).toBeVisible();
  await expect(detail.getByRole("columnheader", { name: "Costo", exact: true })).toHaveCount(0);
  await expect(detail.getByText("PRIVATE-SNAPSHOT-RIF", { exact: false })).toHaveCount(0);
  expect(await page.evaluate(async () => (await fetch("/api/invoices/2/detail")).status)).toBe(404);
  await detail.getByRole("button", { name: "Cerrar documento", exact: true }).click();
  await expect(detail).toHaveCount(0);
  await sales.getByLabel("Sistema de ventas", { exact: true }).selectOption("true");
  await sales.getByRole("button", { name: "Consultar ventas", exact: true }).click();
  await expect(summary.getByText("Total ventas: 200", { exact: true })).toBeVisible();
  await sales.getByRole("button", { name: "Ver documento 2", exact: true }).click();
  await expect(detail.getByText("Total del documento: 200", { exact: true })).toBeVisible();
});

test("directorio de vendedores no expone contactos ajenos y sus ventas respetan ambos permisos", async ({
  page,
  environment,
}) => {
  const { seedParties } = require("../support/party-fixtures.cjs");
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await seedParties(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "sellers.read", scope: "global" },
      { capability: "sellers.personal", scope: "assigned" },
      { capability: "sales.read", scope: "assigned" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  const directory = page.getByRole("region", { name: "Directorio de clientes y vendedores" });
  await directory.getByRole("button", { name: "Consultar directorio", exact: true }).click();
  await expect(directory.getByRole("cell", { name: "PRIVATE-PHONE-A", exact: true })).toBeVisible();
  await expect(directory.getByText("PRIVATE-PHONE-B", { exact: true })).toHaveCount(0);
  await directory.getByLabel("Incluir ventas autorizadas", { exact: true }).check();
  await directory.getByLabel("Directorio ventas desde", { exact: true }).fill("2026-01-01");
  await directory.getByLabel("Directorio ventas hasta", { exact: true }).fill("2026-01-31");
  await directory.getByRole("button", { name: "Consultar directorio", exact: true }).click();
  await directory.getByRole("button", { name: "Ver resumen de A", exact: true }).click();
  const summary = page.getByRole("region", { name: "Resumen de cliente o vendedor" });
  await expect(summary.getByText("Ventas autorizadas: 100", { exact: true })).toBeVisible();
  await expect(summary.getByText("Ventas autorizadas del período anterior: 10", { exact: true })).toBeVisible();
  await expect(directory.getByRole("columnheader", { name: "Utilidad", exact: true })).toHaveCount(0);
  const body = await page.evaluate(
    async () => await (await fetch("/api/sellers/B/summary?from=2026-01-01&to=2026-01-31")).json(),
  );
  expect(body.totals.sales).toBe(0);
  expect(body.seller).not.toHaveProperty("phone");
});

test("clientes globales no convierten ventas propias en ventas globales ni permiten identificar sin permiso", async ({
  page,
  environment,
}) => {
  const user = await environment.seedUser({
    permissions: [
      { capability: "clients.read", scope: "global" },
      { capability: "sales.read", scope: "assigned" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  const directory = page.getByRole("region", { name: "Directorio de clientes y vendedores" });
  await directory.getByLabel("Incluir ventas autorizadas", { exact: true }).check();
  await directory.getByLabel("Directorio ventas desde", { exact: true }).fill("2026-01-01");
  await directory.getByLabel("Directorio ventas hasta", { exact: true }).fill("2026-01-31");
  await directory.getByRole("button", { name: "Consultar directorio", exact: true }).click();
  const customer = directory
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "Cliente sintético", exact: true }) });
  await expect(customer.getByRole("cell", { name: "100.00", exact: true })).toBeVisible();
  await expect(directory.getByRole("columnheader", { name: "Identificación", exact: true })).toHaveCount(0);
  await directory.getByRole("button", { name: "Ver resumen de CB", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Resumen de cliente o vendedor" })
      .getByText("Ventas autorizadas: 0", { exact: true }),
  ).toBeVisible();
  await directory.getByLabel("Sistema del directorio", { exact: true }).selectOption("true");
  await directory.getByRole("button", { name: "Consultar directorio", exact: true }).click();
  await expect(customer.getByRole("cell", { name: "200.00", exact: true })).toBeVisible();
});

test("histórico mensual y ranking por producto conservan alcance y año en ambos sistemas", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/party-fixtures.cjs").seedParties(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "clients.read", scope: "global" },
      { capability: "sales.read", scope: "assigned" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  const directory = page.getByRole("region", { name: "Directorio de clientes y vendedores" });
  await directory.getByLabel("Incluir ventas autorizadas", { exact: true }).check();
  await directory.getByLabel("Ruta del directorio", { exact: true }).selectOption("R");
  await directory.getByLabel("Directorio ventas desde", { exact: true }).fill("2025-12-01");
  await directory.getByLabel("Directorio ventas hasta", { exact: true }).fill("2026-02-28");
  for (const [system, amount, rankingAmount] of [
    ["false", "100", "110.00"],
    ["true", "200", "210.00"],
  ]) {
    await directory.getByLabel("Sistema del directorio", { exact: true }).selectOption(system);
    await directory.getByRole("button", { name: "Consultar directorio", exact: true }).click();
    await directory.getByRole("button", { name: "Ver resumen de C", exact: true }).click();
    const history = page.getByRole("region", { name: "Histórico mensual autorizado" });
    const december = history.getByRole("row").filter({ has: page.getByRole("cell", { name: "2025-12", exact: true }) });
    await expect(december.getByRole("cell", { name: "10", exact: true })).toBeVisible();
    const january = history.getByRole("row").filter({ has: page.getByRole("cell", { name: "2026-01", exact: true }) });
    await expect(january.getByRole("cell", { name: amount, exact: true })).toBeVisible();
    await expect(history.getByRole("cell", { name: "Sin documentos autorizados", exact: true })).toBeVisible();
    const ranking = page.getByRole("region", { name: "Clientes por producto autorizado" });
    await ranking.getByLabel("Producto del ranking", { exact: true }).fill("P");
    await ranking.getByRole("button", { name: "Consultar ranking del producto", exact: true }).click();
    await expect(ranking.getByRole("cell", { name: rankingAmount, exact: true })).toBeVisible();
    await expect(ranking.getByRole("cell", { name: "Cliente exclusivo de B", exact: true })).toHaveCount(0);
    await expect(ranking.getByRole("columnheader", { name: "Utilidad autorizada", exact: true })).toHaveCount(0);
    const observed = await page.evaluate(async () => ({
      monthly: await (await fetch("/api/clients/average/month/C?from=2026-01-01&to=2026-01-31")).json(),
      ranking: await (await fetch("/api/clients/best/product/P?from=2026-01-01&to=2026-01-31")).json(),
    }));
    expect(observed.monthly.data[0].y).toBe(100);
    expect(observed.ranking).toHaveLength(1);
    expect(observed.ranking[0]).not.toHaveProperty("utilidad");
  }
});

test("panel de vendedores intersecta lecturas antes de calcular ranking y margen", async ({ page, environment }) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/party-fixtures.cjs").seedParties(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "sellers.read", scope: "assigned" },
      { capability: "sales.read", scope: "global" },
      { capability: "sales.costs", scope: "assigned" },
      { capability: "sales.profit", scope: "assigned" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  const panel = page.getByRole("region", { name: "Panel de vendedores", exact: true });
  await panel.getByLabel("Panel de vendedores desde", { exact: true }).fill("2026-01-01");
  await panel.getByLabel("Panel de vendedores hasta", { exact: true }).fill("2026-01-31");
  for (const [system, sales, margin] of [
    ["false", "100", "39"],
    ["true", "200", "53.5"],
  ]) {
    await panel.getByLabel("Sistema del panel de vendedores", { exact: true }).selectOption(system);
    await panel.getByRole("button", { name: "Consultar panel de vendedores", exact: true }).click();
    const ranking = panel.getByRole("table", { name: "Ranking autorizado de vendedores", exact: true });
    await expect(ranking.getByRole("cell", { name: "Vendedor A", exact: true })).toBeVisible();
    await expect(ranking.getByRole("cell", { name: "Vendedor B", exact: true })).toHaveCount(0);
    await expect(
      ranking
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name: "Vendedor A", exact: true }) })
        .getByRole("cell")
        .nth(7),
    ).toHaveText(margin);
    const trend = panel.getByRole("table", { name: "Tendencia autorizada de vendedores", exact: true });
    await expect(trend.getByRole("cell", { name: sales, exact: true })).toBeVisible();
    const response = await page.evaluate(
      async (showNoe) =>
        await (await fetch(`/api/sellers/dashboard?from=2026-01-01&to=2026-01-31&showNoe=${showNoe}`)).json(),
      system,
    );
    expect(response.kpis.compareSales).toBe(10);
    expect(response.ranking.map((row) => row.sellerId)).toEqual(["A"]);
  }
});

test("panel global omite derivados financieros propios y contactos ajenos", async ({ page, environment }) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/party-fixtures.cjs").seedParties(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "sellers.read", scope: "global" },
      { capability: "sales.read", scope: "global" },
      { capability: "sellers.personal", scope: "assigned" },
      { capability: "sales.costs", scope: "assigned" },
      { capability: "sales.profit", scope: "assigned" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  const panel = page.getByRole("region", { name: "Panel de vendedores", exact: true });
  await panel.getByLabel("Panel de vendedores desde", { exact: true }).fill("2026-01-01");
  await panel.getByLabel("Panel de vendedores hasta", { exact: true }).fill("2026-01-31");
  await panel.getByRole("button", { name: "Consultar panel de vendedores", exact: true }).click();
  const ranking = panel.getByRole("table", { name: "Ranking autorizado de vendedores", exact: true });
  await expect(ranking.getByRole("cell", { name: "Vendedor B", exact: true })).toBeVisible();
  await expect(ranking.getByRole("columnheader", { name: "Margen autorizado (%)", exact: true })).toHaveCount(0);
  await expect(panel.getByText("Vendedores por debajo del margen autorizado del equipo", { exact: true })).toHaveCount(
    0,
  );
  await panel.getByLabel("Panel de vendedores desde", { exact: true }).fill("2026-02-01");
  await panel.getByLabel("Panel de vendedores hasta", { exact: true }).fill("2026-02-28");
  await panel.getByRole("button", { name: "Consultar panel de vendedores", exact: true }).click();
  const inactive = panel.getByRole("table", { name: "Vendedores sin documentos autorizados", exact: true });
  await expect(inactive.getByRole("cell", { name: "PRIVATE-PHONE-A", exact: true })).toBeVisible();
  await expect(inactive.getByRole("cell", { name: "PRIVATE-PHONE-B", exact: true })).toHaveCount(0);
});
