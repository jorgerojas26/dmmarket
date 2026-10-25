const { randomBytes } = require("node:crypto");
const { test, expect, login, openModule } = require("./fixtures.cjs");
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
  await openModule(page, "Mi cuenta");
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
    await openModule(reader, "Tasas");
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
  await expect(
    summary.getByRole("group", { name: "Total ventas", exact: true }).getByText("$100,00", { exact: true }),
  ).toBeVisible();
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
  await expect(
    summary.getByRole("group", { name: "Total ventas", exact: true }).getByText("$200,00", { exact: true }),
  ).toBeVisible();
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
  await openModule(page, "Vendedores");
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
  await openModule(page, "Clientes");
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
  await openModule(page, "Clientes");
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
  await openModule(page, "Vendedores", "Resumen");
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
  await openModule(page, "Vendedores", "Resumen");
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

test("clientes sin documentos no usan actividad ajena ni histórico fuera del corte", async ({ page, environment }) => {
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
  await openModule(page, "Clientes", "Sin documentos autorizados");
  const report = page.getByRole("region", { name: "Clientes sin documentos autorizados", exact: true });
  await report.getByLabel("Sin documentos desde", { exact: true }).fill("2026-02-01");
  await report.getByLabel("Sin documentos hasta", { exact: true }).fill("2026-02-28");
  await report.getByLabel("Ruta de clientes sin documentos", { exact: true }).selectOption("R");
  for (const [system, amount, date] of [
    ["false", "110.00", "2026-01-01"],
    ["true", "210.00", "2026-01-02"],
  ]) {
    await report.getByLabel("Sistema de clientes sin documentos", { exact: true }).selectOption(system);
    await report.getByRole("button", { name: "Consultar clientes sin documentos", exact: true }).click();
    const table = report.getByRole("table", { name: "Resultado de clientes sin documentos", exact: true });
    const shared = table
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "Cliente sintético", exact: true }) });
    await expect(shared.getByRole("cell", { name: amount, exact: true })).toBeVisible();
    await expect(shared.getByRole("cell", { name: date, exact: true })).toBeVisible();
    const other = table
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "Cliente exclusivo de B", exact: true }) });
    await expect(other.getByRole("cell", { name: "0.00", exact: true })).toBeVisible();
    await expect(
      other.getByRole("cell", { name: "Sin actividad autorizada hasta el corte", exact: true }),
    ).toBeVisible();
    await expect(report.getByText("Clientes sin documentos autorizados: 3", { exact: true })).toBeVisible();
  }
  await report.getByLabel("Sin documentos desde", { exact: true }).fill("2025-11-01");
  await report.getByLabel("Sin documentos hasta", { exact: true }).fill("2025-11-30");
  await report.getByLabel("Buscar cliente sin documentos", { exact: true }).fill("sintético");
  await report.getByRole("button", { name: "Consultar clientes sin documentos", exact: true }).click();
  await expect(report.getByRole("cell", { name: "0.00", exact: true })).toBeVisible();
  await expect(report.getByText("Clientes sin documentos autorizados: 1", { exact: true })).toBeVisible();
});

test("panel de clientes usa sólo actividad propia en clasificación, retención y cobertura", async ({
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
  await openModule(page, "Clientes", "Resumen");
  const panel = page.getByRole("region", { name: "Panel de clientes", exact: true });
  await panel.getByLabel("Panel de clientes desde", { exact: true }).fill("2026-01-01");
  await panel.getByLabel("Panel de clientes hasta", { exact: true }).fill("2026-01-31");
  await panel.getByLabel("Ruta del panel de clientes", { exact: true }).selectOption("R");
  for (const [system, amount] of [
    ["false", "100"],
    ["true", "200"],
  ]) {
    await panel.getByLabel("Sistema del panel de clientes", { exact: true }).selectOption(system);
    await panel.getByRole("button", { name: "Consultar panel de clientes", exact: true }).click();
    const sales = panel.getByRole("table", { name: "Clasificación por ventas autorizadas", exact: true });
    await expect(sales.getByRole("cell", { name: amount, exact: true }).first()).toBeVisible();
    await expect(sales.getByRole("cell", { name: "Cliente exclusivo de B", exact: true })).toHaveCount(0);
    await expect(panel.getByRole("table", { name: "Clasificación por utilidad autorizada", exact: true })).toHaveCount(
      0,
    );
    await expect(
      panel
        .getByRole("region", { name: "Retención autorizada de clientes", exact: true })
        .getByText("Ventas autorizadas del período anterior: 10", { exact: true }),
    ).toBeVisible();
    const coverage = panel.getByRole("table", { name: "Cobertura autorizada de clientes", exact: true });
    await expect(coverage.getByRole("cell", { name: "33.33", exact: true })).toBeVisible();
  }
});

test("panel global no clasifica por utilidad propia hasta acotar el conjunto al vendedor autorizado", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/party-fixtures.cjs").seedParties(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "clients.read", scope: "global" },
      { capability: "sales.read", scope: "global" },
      { capability: "sales.costs", scope: "assigned" },
      { capability: "sales.profit", scope: "assigned" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await openModule(page, "Clientes", "Resumen");
  const panel = page.getByRole("region", { name: "Panel de clientes", exact: true });
  await panel.getByLabel("Panel de clientes desde", { exact: true }).fill("2026-01-01");
  await panel.getByLabel("Panel de clientes hasta", { exact: true }).fill("2026-01-31");
  await panel.getByRole("button", { name: "Consultar panel de clientes", exact: true }).click();
  await expect(
    panel
      .getByRole("table", { name: "Clasificación por ventas autorizadas", exact: true })
      .getByRole("cell", { name: "300", exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole("table", { name: "Clasificación por utilidad autorizada", exact: true })).toHaveCount(0);
  await panel.getByLabel("Vendedor del panel de clientes", { exact: true }).fill("A");
  await panel.getByRole("button", { name: "Consultar panel de clientes", exact: true }).click();
  const utility = panel.getByRole("table", { name: "Clasificación por utilidad autorizada", exact: true });
  await expect(utility.getByRole("cell", { name: "39", exact: true })).toBeVisible();
  await expect(utility.getByRole("cell", { name: "Cliente exclusivo de B", exact: true })).toHaveCount(0);
  const payload = await page.evaluate(
    async () => await (await fetch("/api/clients/dashboard?from=2026-01-01&to=2026-01-31")).json(),
  );
  expect(payload).not.toHaveProperty("abcUtility");
  expect(JSON.stringify(payload)).not.toContain("utilidad");
});

test("Pareto propio conserva población comprada, maduración y privacidad en ambos sistemas", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/pareto-fixtures.cjs").seedPareto(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "sales.read", scope: "assigned" },
      { capability: "purchases.read", scope: "global" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await openModule(page, "Ventas", "Pareto");
  const panel = page.getByRole("region", { name: "Pareto autorizado", exact: true });
  await panel.getByLabel("Pareto desde", { exact: true }).fill("2026-06-01");
  await panel.getByLabel("Pareto hasta", { exact: true }).fill("2026-07-01");
  for (const system of ["false", "true"]) {
    await panel.getByLabel("Sistema de ventas del Pareto", { exact: true }).selectOption(system);
    await panel.getByRole("button", { name: "Consultar Pareto", exact: true }).click();
    const mature = panel.getByRole("table", { name: "Productos maduros del Pareto", exact: true });
    const recent = panel.getByRole("table", { name: "Productos nuevos del Pareto", exact: true });
    await expect(mature.getByRole("cell", { name: "80", exact: true })).toBeVisible();
    await expect(mature.getByRole("cell", { name: "Producto reciente", exact: true })).toHaveCount(0);
    await expect(recent.getByRole("cell", { name: "Producto reciente", exact: true })).toBeVisible();
    await expect(recent.getByRole("cell", { name: "2026-06-02", exact: true })).toBeVisible();
    await expect(mature.getByRole("columnheader", { name: "Inventario actual a precio A", exact: true })).toHaveCount(
      0,
    );
    const payload = await page.evaluate(
      async (showNoe) =>
        await (
          await fetch(`/api/dashboard/pareto?from=2026-06-01&to=2026-07-01&metric=rawProfit&showNoe=${showNoe}`)
        ).json(),
      system,
    );
    expect(payload.products.map((row) => row.rawProfit)).toEqual([100, 80]);
    expect(JSON.stringify(payload)).not.toMatch(/netProfit|inventoryValue|cumulativeProfit|profitPercent/);
  }
  await panel.getByLabel("Buscar entre productos nuevos", { exact: true }).fill("no-match");
  await panel.getByRole("button", { name: "Consultar Pareto", exact: true }).click();
  await expect(panel.getByRole("cell", { name: "Producto reciente", exact: true })).toHaveCount(0);
  await expect(panel.getByText("Productos maduros: 2", { exact: true })).toBeVisible();
});

test("Pareto compras sin vender exige ventas globales y omite inventario no autorizado", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/pareto-fixtures.cjs").seedPareto(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "sales.read", scope: "global" },
      { capability: "purchases.read", scope: "global" },
      { capability: "purchases.costs", scope: "global" },
    ],
  });
  await login(page, environment, user);
  await openModule(page, "Ventas", "Pareto");
  const panel = page.getByRole("region", { name: "Pareto autorizado", exact: true });
  await panel.getByLabel("Pareto desde", { exact: true }).fill("2026-06-01");
  await panel.getByLabel("Pareto hasta", { exact: true }).fill("2026-07-01");
  await panel.getByLabel("Modo del Pareto", { exact: true }).selectOption("compras-sin-vender");
  await panel.getByRole("button", { name: "Consultar Pareto", exact: true }).click();
  const mature = panel.getByRole("table", { name: "Productos maduros del Pareto", exact: true });
  await expect(mature.getByRole("cell", { name: "Producto sin vender", exact: true })).toBeVisible();
  await expect(mature.getByRole("cell", { name: "200", exact: true })).toBeVisible();
  await expect(mature.getByRole("columnheader", { name: "Inventario actual a precio A", exact: true })).toHaveCount(0);
  await expect(mature.getByRole("cell", { name: "Producto maduro", exact: true })).toHaveCount(0);
});

test("inventario original básico conserva búsqueda y tabla sin precio, proveedor ni impresión implícitos", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/inventory-fixtures.cjs").seedInventory(environment.db);
  const user = await environment.seedUser({ permissions: [{ capability: "inventory.read", scope: "global" }] });
  await login(page, environment, user);
  await openModule(page, "Inventario");
  const inventory = page.getByRole("region", { name: "Inventario", exact: true });
  await expect(inventory.locator(".clients-sidebar")).toBeVisible();
  await inventory.getByRole("searchbox", { name: "Buscar producto...", exact: true }).fill("Inventario sintético");
  const table = inventory.getByRole("table");
  await expect(table.getByRole("cell", { name: "I-C", exact: true })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Precio", exact: true })).toHaveCount(0);
  await expect(table.getByRole("columnheader", { name: "Proveedor", exact: true })).toHaveCount(0);
  await expect(inventory.getByRole("group", { name: "Proveedor", exact: true })).toHaveCount(0);
  await expect(inventory.getByRole("button", { name: "Imprimir", exact: true })).toHaveCount(0);
  await expect(table.locator("tfoot")).toContainText("No disponible");
  const response = await page.evaluate(
    async () => await (await fetch("/api/products?search=Inventario&stockOnly=true")).json(),
  );
  expect(response.total).toBe(1);
  expect(response.data[0].IdProducto).toBe("I-A");
  expect(response.data[0]).not.toHaveProperty("PrecioA");
  expect(response.data[0]).not.toHaveProperty("proveedorId");
  expect(response.totals).not.toHaveProperty("inventoryValue");
  await inventory.getByRole("searchbox", { name: "Buscar producto...", exact: true }).fill("Inventario sintético D");
  await expect(table.getByRole("cell", { name: "I-D", exact: true })).toBeVisible();
  await expect(table.getByRole("cell", { name: "I-A", exact: true })).toHaveCount(0);
  await expect(table.locator("tfoot")).toContainText("-1");
});

test("inventario original monetario conserva selectores y totales filtrados sin datos personales", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/inventory-fixtures.cjs").seedInventory(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "inventory.read", scope: "global" },
      { capability: "inventory.costs", scope: "global" },
      { capability: "providers.read", scope: "global" },
    ],
  });
  await login(page, environment, user);
  await openModule(page, "Inventario");
  const inventory = page.getByRole("region", { name: "Inventario", exact: true });
  await inventory.getByRole("searchbox", { name: "Buscar producto...", exact: true }).fill("Inventario sintético");
  await inventory.getByRole("group", { name: "Categoría", exact: true }).getByRole("combobox").click();
  await page.locator(".search-select__menu").getByText("Grupo sintético", { exact: true }).click();
  const table = inventory.getByRole("table");
  await expect(table.getByRole("cell", { name: "I-A", exact: true })).toBeVisible();
  await expect(table.getByRole("cell", { name: "I-D", exact: true })).toHaveCount(0);
  await expect(table.getByRole("cell", { name: "$123,45", exact: true })).toBeVisible();
  await expect(table.getByRole("cell", { name: "Proveedor inventario B", exact: true })).toBeVisible();
  await expect(table.locator("tfoot")).toContainText("2");
  await expect(inventory.getByText("PRIVATE-PROVIDER", { exact: false })).toHaveCount(0);
  await inventory
    .getByRole("group", { name: "Proveedor", exact: true })
    .getByRole("combobox")
    .fill("Proveedor inventario A");
  await page.locator(".search-select__menu").getByText("Proveedor inventario A", { exact: true }).click();
  await expect(table.getByRole("cell", { name: "I-B", exact: true })).toHaveCount(0);
  await expect(table.getByRole("cell", { name: "I-A", exact: true })).toBeVisible();
  await expect(inventory.getByRole("button", { name: "Imprimir", exact: true })).toHaveCount(0);
});

test("compras básicas conservan documentos y productos sin importes ni proveedores implícitos", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/purchase-fixtures.cjs").seedPurchases(environment.db);
  const user = await environment.seedUser({ permissions: [{ capability: "purchases.read", scope: "global" }] });
  await login(page, environment, user);
  await openModule(page, "Compras");
  const report = page.getByRole("region", { name: "Consulta autorizada de compras", exact: true });
  await report.getByLabel("Compras desde", { exact: true }).fill("2026-08-01");
  await report.getByLabel("Compras hasta", { exact: true }).fill("2026-08-31");
  await report.getByRole("button", { name: "Consultar compras", exact: true }).click();
  await expect(report.getByText("Registros de compras autorizados: 3", { exact: true })).toBeVisible();
  const table = report.getByRole("table", { name: "Compras autorizadas", exact: true });
  await expect(table.getByRole("cell", { name: "purchase-august-empty", exact: true })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Total Compras autorizado", exact: true })).toHaveCount(0);
  await expect(table.getByRole("columnheader", { name: "Proveedor autorizado", exact: true })).toHaveCount(0);
  await report.getByLabel("Vista de compras", { exact: true }).selectOption("products");
  await report.getByRole("button", { name: "Consultar compras", exact: true }).click();
  await expect(report.getByText("Registros de compras autorizados: 2", { exact: true })).toBeVisible();
  await expect(table.getByRole("cell", { name: "Producto histórico comprado", exact: true })).toBeVisible();
  await expect(
    table.getByRole("columnheader", { name: "Costo unitario promedio autorizado", exact: true }),
  ).toHaveCount(0);
  const result = await page.evaluate(
    async () => await (await fetch("/api/purchases/products?from=2026-08-01&to=2026-08-31")).json(),
  );
  expect(result.totals).toEqual({ quantity: "6.000" });
  expect(result.data.every((row) => !Object.hasOwn(row, "monto"))).toBe(true);
});

test("compras financieras muestran sólo importes autorizados y filtros coherentes", async ({ page, environment }) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/purchase-fixtures.cjs").seedPurchases(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "purchases.read", scope: "global" },
      { capability: "purchases.costs", scope: "global" },
      { capability: "providers.read", scope: "global" },
    ],
  });
  await login(page, environment, user);
  await openModule(page, "Compras");
  const report = page.getByRole("region", { name: "Consulta autorizada de compras", exact: true });
  await report.getByLabel("Compras desde", { exact: true }).fill("2026-08-01");
  await report.getByLabel("Compras hasta", { exact: true }).fill("2026-08-31");
  await report.getByRole("button", { name: "Consultar compras", exact: true }).click();
  await expect(report.getByText("Total Compras autorizado del filtro: 130.00", { exact: true })).toBeVisible();
  const table = report.getByRole("table", { name: "Compras autorizadas", exact: true });
  await expect(table.getByRole("cell", { name: "Proveedor compras B", exact: true })).toBeVisible();
  await expect(report.getByText("PRIVATE-PUR", { exact: false })).toHaveCount(0);
  await report.getByLabel("Proveedor de compras", { exact: true }).fill("PUR-A");
  await report.getByLabel("Grupo de compras", { exact: true }).selectOption("G");
  await report.getByLabel("Vista de compras", { exact: true }).selectOption("products");
  await report.getByRole("button", { name: "Consultar compras", exact: true }).click();
  await expect(report.getByText("Registros de compras autorizados: 1", { exact: true })).toBeVisible();
  await expect(report.getByText("Total Compras autorizado del filtro: 80.00", { exact: true })).toBeVisible();
  await expect(table.getByRole("cell", { name: "16.00", exact: true })).toBeVisible();
});

test("resumen de compras básico sólo muestra cantidades y comparación no financiera", async ({ page, environment }) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/purchase-fixtures.cjs").seedPurchases(environment.db);
  const user = await environment.seedUser({ permissions: [{ capability: "purchases.read", scope: "global" }] });
  await login(page, environment, user);
  await openModule(page, "Compras", "Resumen");
  const report = page.getByRole("region", { name: "Resumen de compras", exact: true });
  await report.getByLabel("Resumen de compras desde", { exact: true }).fill("2026-08-01");
  await report.getByLabel("Resumen de compras hasta", { exact: true }).fill("2026-08-31");
  await report.getByLabel("Comparar compras desde", { exact: true }).fill("2026-07-01");
  await report.getByLabel("Comparar compras hasta", { exact: true }).fill("2026-07-31");
  await report.getByRole("button", { name: "Consultar resumen de compras", exact: true }).click();
  await expect(
    report.getByRole("group", { name: "Documentos de compras", exact: true }).getByText("3", { exact: true }),
  ).toBeVisible();
  await expect(report.getByText("Unidades del período comparado: 2", { exact: true })).toBeVisible();
  await expect(report.getByRole("table", { name: "Proveedores del resumen de compras", exact: true })).toHaveCount(0);
  await expect(report.getByRole("columnheader", { name: "Total Compras autorizado", exact: true })).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Vistas de Compras", exact: true })
      .getByRole("link", { name: "Pareto", exact: true }),
  ).toHaveCount(0);
});

test("resumen y Pareto de compras financieros respetan filtro y no requieren lectura de ventas", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/purchase-fixtures.cjs").seedPurchases(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "purchases.read", scope: "global" },
      { capability: "purchases.costs", scope: "global" },
      { capability: "providers.read", scope: "global" },
    ],
  });
  await login(page, environment, user);
  await openModule(page, "Compras", "Resumen");
  const report = page.getByRole("region", { name: "Resumen de compras", exact: true });
  await report.getByLabel("Resumen de compras desde", { exact: true }).fill("2026-08-01");
  await report.getByLabel("Resumen de compras hasta", { exact: true }).fill("2026-08-31");
  await report.getByLabel("Comparar compras desde", { exact: true }).fill("2026-07-01");
  await report.getByLabel("Comparar compras hasta", { exact: true }).fill("2026-07-31");
  await report.getByRole("button", { name: "Consultar resumen de compras", exact: true }).click();
  await expect(
    report.getByRole("group", { name: "Total Compras autorizado", exact: true }).getByText("$130,00", { exact: true }),
  ).toBeVisible();
  await expect(report.getByText("Total Compras autorizado del período comparado: 16", { exact: true })).toBeVisible();
  await expect(
    report
      .getByRole("table", { name: "Proveedores del resumen de compras", exact: true })
      .getByRole("cell", { name: "Proveedor compras A", exact: true }),
  ).toBeVisible();
  await expect(report.getByText("PRIVATE-PUR", { exact: false })).toHaveCount(0);
  await openModule(page, "Compras", "Pareto");
  const pareto = page.getByRole("region", { name: "Pareto de compras", exact: true });
  await pareto.getByLabel("Resumen de compras desde", { exact: true }).fill("2026-08-01");
  await pareto.getByLabel("Resumen de compras hasta", { exact: true }).fill("2026-08-31");
  await pareto.getByRole("button", { name: "Consultar Pareto de compras", exact: true }).click();
  await expect(pareto.getByText("Productos analizados en compras: 2", { exact: true })).toBeVisible();
  await expect(pareto.getByRole("cell", { name: "61.54", exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Módulos disponibles", exact: true })
      .getByRole("link", { name: "Ventas", exact: true }),
  ).toHaveCount(0);
});

test("proveedores no infiere transacciones ni datos personales desde el directorio", async ({ page, environment }) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/purchase-fixtures.cjs").seedPurchases(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "providers.read", scope: "global" },
      { capability: "providers.personal", scope: "global" },
    ],
  });
  await login(page, environment, user);
  await openModule(page, "Proveedores");
  const directory = page.getByRole("region", { name: "Directorio autorizado de proveedores", exact: true });
  await directory.getByRole("button", { name: "Abrir proveedor PUR-A", exact: true }).click();
  await expect(
    directory.getByText("No tienes permisos para consultar transacciones del proveedor.", { exact: true }),
  ).toBeVisible();
  await expect(directory.getByText("PRIVATE-PUR", { exact: false })).toHaveCount(0);
  await expect(directory.getByRole("button", { name: "Consultar actividad del proveedor", exact: true })).toHaveCount(
    0,
  );
});

test("actividad de proveedor conserva ventas propias y detalle acotado en ambos sistemas", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/purchase-fixtures.cjs").seedPurchases(environment.db);
  await require("../support/provider-fixtures.cjs").seedProviders(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "providers.read", scope: "global" },
      { capability: "sales.read", scope: "assigned" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await openModule(page, "Proveedores");
  await page.getByRole("button", { name: "Abrir proveedor PUR-A", exact: true }).click();
  const report = page.getByRole("region", { name: "Detalle autorizado del proveedor", exact: true });
  await report.getByLabel("Proveedor desde", { exact: true }).fill("2026-11-01");
  await report.getByLabel("Proveedor hasta", { exact: true }).fill("2026-11-30");
  for (const system of ["false", "true"]) {
    await report.getByLabel("Actividad del proveedor", { exact: true }).selectOption("sales");
    await report.getByLabel("Sistema de ventas del proveedor", { exact: true }).selectOption(system);
    await report.getByRole("button", { name: "Consultar actividad del proveedor", exact: true }).click();
    await expect(report.getByText("Registros autorizados del proveedor: 1", { exact: true })).toBeVisible();
    await report.getByRole("button", { name: "Abrir documento provider-sale-A", exact: true }).click();
    const detail = page.getByRole("region", { name: "Documento del proveedor", exact: true });
    await expect(detail.getByText("Total autorizado del documento: 100", { exact: true })).toBeVisible();
    await expect(detail.getByRole("cell", { name: "Venta proveedor B", exact: true })).toHaveCount(0);
    await expect(detail.getByRole("columnheader", { name: "Costo autorizado", exact: true })).toHaveCount(0);
    await expect(detail.getByText("PRIVATE", { exact: false })).toHaveCount(0);
    await detail.getByRole("button", { name: "Cerrar documento del proveedor", exact: true }).click();
  }
});

test("compras del proveedor requieren su permiso e impiden abrir documentos de otro proveedor", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/purchase-fixtures.cjs").seedPurchases(environment.db);
  await require("../support/provider-fixtures.cjs").seedProviders(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "providers.read", scope: "global" },
      { capability: "purchases.read", scope: "global" },
      { capability: "purchases.costs", scope: "global" },
    ],
  });
  await login(page, environment, user);
  await openModule(page, "Proveedores");
  await page.getByRole("button", { name: "Abrir proveedor PUR-A", exact: true }).click();
  const report = page.getByRole("region", { name: "Detalle autorizado del proveedor", exact: true });
  await report.getByLabel("Proveedor desde", { exact: true }).fill("2026-11-01");
  await report.getByLabel("Proveedor hasta", { exact: true }).fill("2026-11-30");
  await report.getByLabel("Actividad del proveedor", { exact: true }).selectOption("purchases");
  await report.getByRole("button", { name: "Consultar actividad del proveedor", exact: true }).click();
  await report.getByRole("button", { name: "Abrir documento provider-purchase-A", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Documento del proveedor", exact: true })
      .getByText("Total autorizado del documento: 14.00", { exact: true }),
  ).toBeVisible();
  const status = await page.evaluate(
    async () => (await fetch("/api/providers/PUR-A/purchases/provider-purchase-B")).status,
  );
  expect(status).toBe(404);
});

test("auditoría permite consultar login real sin dar administración de cuentas", async ({ page, environment }) => {
  const user = await environment.seedUser({ permissions: [{ capability: "audit.read", scope: "global" }] });
  await login(page, environment, user);
  await openModule(page, "Auditoría");
  const report = page.getByRole("region", { name: "Consulta autorizada de auditoría", exact: true });
  await report.getByLabel("ID de cuenta objetivo de auditoría", { exact: true }).fill(user.id);
  await report.getByLabel("Acción exacta de auditoría", { exact: true }).fill("auth.login_succeeded");
  await report.getByRole("button", { name: "Consultar auditoría", exact: true }).click();
  await expect(report.getByText("Eventos autorizados: 1", { exact: true })).toBeVisible();
  const table = report.getByRole("table", { name: "Historial autorizado", exact: true });
  await expect(table.getByRole("cell", { name: "auth.login_succeeded", exact: true })).toBeVisible();
  await expect(table.getByRole("cell", { name: user.id, exact: true })).toHaveCount(2);
  await expect(
    page
      .getByRole("navigation", { name: "Módulos disponibles", exact: true })
      .getByRole("link", { name: "Acceso", exact: true }),
  ).toHaveCount(0);
  const today = new Date().toISOString().slice(0, 10);
  const data = await page.evaluate(
    async ({ today, userId }) =>
      await (
        await fetch(`/api/auth/audit?from=${today}&to=${today}&targetId=${userId}&action=auth.login_succeeded`)
      ).json(),
    { today, userId: user.id },
  );
  expect(JSON.stringify(data)).not.toContain(user.password);
  expect(JSON.stringify(data)).not.toContain(user.passwordHash);
});

test("porcentajes de comisiones son sólo lectura y no conceden ventas ni otros vendedores", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/commission-fixtures.cjs").seedCommissions(environment.db);
  const user = await environment.seedUser({ permissions: [{ capability: "commissions.read", scope: "assigned" }] });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await openModule(page, "Comisiones");
  const report = page.getByRole("region", { name: "Consulta autorizada de comisiones", exact: true });
  await report.getByLabel("ID del vendedor para comisiones", { exact: true }).fill("A");
  await report.getByRole("button", { name: "Consultar comisiones", exact: true }).click();
  await expect(report.getByRole("cell", { name: "10", exact: true })).toBeVisible();
  await expect(report.getByRole("cell", { name: "Grupo comisión secundario", exact: true })).toBeVisible();
  await expect(report.getByRole("option", { name: "Ventas e histórico capturado", exact: true })).toHaveCount(0);
  expect(await page.evaluate(async () => (await fetch("/api/employees/commissionInfo/B")).status)).toBe(403);
});

test("histórico de comisiones no duplica ventas y no muestra como cero capturas faltantes", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/commission-fixtures.cjs").seedCommissions(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "commissions.read", scope: "assigned" },
      { capability: "sales.read", scope: "global" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await openModule(page, "Comisiones");
  const report = page.getByRole("region", { name: "Consulta autorizada de comisiones", exact: true });
  await report.getByLabel("ID del vendedor para comisiones", { exact: true }).fill("A");
  await report.getByLabel("Vista de comisiones", { exact: true }).selectOption("sales");
  await report.getByLabel("Comisiones desde", { exact: true }).fill("2026-12-01");
  await report.getByLabel("Comisiones hasta", { exact: true }).fill("2026-12-31");
  await report.getByRole("button", { name: "Consultar comisiones", exact: true }).click();
  await expect(report.getByText("Ventas autorizadas con comisiones: 5", { exact: true })).toBeVisible();
  const table = report.getByRole("table", { name: "Histórico autorizado de comisiones", exact: true });
  const valid = table.getByRole("row").filter({ has: page.getByRole("cell", { name: "COM-A", exact: true }) });
  await expect(valid.getByRole("cell", { name: "10", exact: true })).toBeVisible();
  const duplicate = table.getByRole("row").filter({ has: page.getByRole("cell", { name: "COM-DUP", exact: true }) });
  await expect(duplicate.getByRole("cell", { name: "100.00", exact: true })).toBeVisible();
  await expect(duplicate.getByRole("cell", { name: "No disponible", exact: true })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Utilidad autorizada", exact: true })).toHaveCount(0);
  await expect(table.getByRole("cell", { name: "COM-B", exact: true })).toHaveCount(0);
  await expect(report.getByText("PRIVATE-COMMISSION", { exact: false })).toHaveCount(0);
  expect(
    await page.evaluate(
      async () => (await fetch("/api/employees/sales/A?from=2026-12-01&to=2026-12-31&showNoe=true")).status,
    ),
  ).toBe(403);
});

test("cobranza autorizada ve deuda completa del cliente compartido sin heredar filtro de ventas propias", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/receivables-fixtures.cjs").seedReceivables(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "receivables.read", scope: "global" },
      { capability: "sales.read", scope: "assigned" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await openModule(page, "Cartera");
  const report = page.getByRole("region", { name: "Cartera de cobranza autorizada", exact: true });
  await expect(report.getByText("Cuentas autorizadas encontradas: 3", { exact: true })).toBeVisible();
  await report.getByRole("button", { name: "Abrir cuenta C", exact: true }).click();
  const account = page.getByRole("region", { name: "Cuenta de cobranza autorizada", exact: true });
  await expect(account.getByText("Saldo completo del cliente (USD): 300.0000", { exact: true })).toBeVisible();
  const table = account.getByRole("table", { name: "Documentos autorizados de cobranza", exact: true });
  await expect(table.getByRole("cell", { name: "1", exact: true })).toBeVisible();
  await expect(table.getByRole("cell", { name: "2", exact: true })).toBeVisible();
  await expect(account.getByText("PRIVATE-IDENTIFICATION", { exact: false })).toHaveCount(0);
  await expect(account.getByRole("button", { name: "Registrar abono", exact: true })).toHaveCount(0);
});

test("vendedor sin permiso de cobranza no tiene cartera ni acceso directo a saldos", async ({ page, environment }) => {
  const user = await environment.seedUser({ permissions: [{ capability: "sales.read", scope: "assigned" }] });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await expect(
    page
      .getByRole("navigation", { name: "Módulos disponibles", exact: true })
      .getByRole("link", { name: "Cartera", exact: true }),
  ).toHaveCount(0);
  await page.goto(`${environment.origin}/cartera`);
  await expect(page.getByRole("heading", { name: "Página no disponible", exact: true })).toBeVisible();
  expect(await page.evaluate(async () => (await fetch("/api/receivables/C")).status)).toBe(403);
});

test("vendedores por proveedor intersectan su lectura con ventas globales antes de mostrar utilidad", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/purchase-fixtures.cjs").seedPurchases(environment.db);
  await require("../support/provider-fixtures.cjs").seedProviders(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "providers.read", scope: "global" },
      { capability: "sellers.read", scope: "assigned" },
      { capability: "sales.read", scope: "global" },
      { capability: "sales.costs", scope: "assigned" },
      { capability: "sales.profit", scope: "assigned" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await openModule(page, "Proveedores");
  await page.getByRole("button", { name: "Abrir proveedor PUR-A", exact: true }).click();
  const report = page.getByRole("region", { name: "Detalle autorizado del proveedor", exact: true });
  await report.getByLabel("Proveedor desde", { exact: true }).fill("2026-11-01");
  await report.getByLabel("Proveedor hasta", { exact: true }).fill("2026-11-30");
  await report.getByLabel("Actividad del proveedor", { exact: true }).selectOption("sellers");
  await report.getByRole("button", { name: "Consultar actividad del proveedor", exact: true }).click();
  const table = report.getByRole("table", { name: "Actividad autorizada del proveedor", exact: true });
  await expect(table.getByRole("cell", { name: "Vendedor A", exact: true })).toBeVisible();
  await expect(table.getByRole("cell", { name: "40.00", exact: true })).toBeVisible();
  await expect(table.getByRole("cell", { name: "Vendedor B", exact: true })).toHaveCount(0);
  await expect(report.getByRole("button", { name: /Abrir documento/ })).toHaveCount(0);
});

test("clientes y comparativo de proveedores conservan la población de ventas propias", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/purchase-fixtures.cjs").seedPurchases(environment.db);
  await require("../support/provider-fixtures.cjs").seedProviders(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "providers.read", scope: "global" },
      { capability: "clients.read", scope: "global" },
      { capability: "sales.read", scope: "assigned" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await openModule(page, "Proveedores");
  await page.getByRole("button", { name: "Abrir proveedor PUR-A", exact: true }).click();
  const report = page.getByRole("region", { name: "Detalle autorizado del proveedor", exact: true });
  await report.getByLabel("Proveedor desde", { exact: true }).fill("2026-11-01");
  await report.getByLabel("Proveedor hasta", { exact: true }).fill("2026-11-30");
  await report.getByLabel("Actividad del proveedor", { exact: true }).selectOption("clients");
  await report.getByRole("button", { name: "Consultar actividad del proveedor", exact: true }).click();
  await expect(report.getByRole("cell", { name: "100.00", exact: true })).toBeVisible();
  await expect(report.getByRole("cell", { name: "300.00", exact: true })).toHaveCount(0);
  await openModule(page, "Proveedores", "Comparativo");
  const ranking = page.getByRole("region", { name: "Comparativo autorizado de proveedores", exact: true });
  await ranking.getByLabel("Comparativo de proveedores desde", { exact: true }).fill("2026-11-01");
  await ranking.getByLabel("Comparativo de proveedores hasta", { exact: true }).fill("2026-11-30");
  await ranking.getByRole("button", { name: "Consultar comparativo de proveedores", exact: true }).click();
  await expect(ranking.getByRole("cell", { name: "100.00", exact: true })).toBeVisible();
  await expect(ranking.getByRole("cell", { name: "90.00", exact: true })).toBeVisible();
  await expect(ranking.getByRole("cell", { name: "300.00", exact: true })).toHaveCount(0);
});
