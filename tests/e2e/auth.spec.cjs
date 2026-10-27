const { randomBytes } = require("node:crypto");
const { test, expect, login, openModule, setNoe, setCalendarMonth, logout } = require("./fixtures.cjs");
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
  await expect(page.locator(".app-navbar-ref").getByText("42.125000", { exact: true })).toBeVisible();
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
  await logout(page);
  await login(page, environment, { ...user, password });
  await expect(page.locator(".app-navbar-ref").getByText("42.125000", { exact: true })).toBeVisible();
});

test("configuración manual MFA permite mostrar y copiar la clave sin escanear", async ({
  page,
  context,
  environment,
}) => {
  const user = await environment.seedUser({ permissions: ownerPermissions });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: environment.origin });
  await login(page, environment, user);
  await page.getByLabel("Contraseña para configurar MFA", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Generar configuración MFA", exact: true }).click();
  const copy = page.getByRole("button", { name: "Copiar clave MFA", exact: true });
  await expect(copy).toBeVisible();
  const field = page.getByLabel("Configuración manual MFA", { exact: true });
  const secret = await field.inputValue();
  expect(/^[A-Z2-7]{32}$/.test(secret)).toBe(true);
  await expect(field).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Mostrar clave MFA", exact: true }).click();
  await expect(field).toHaveAttribute("type", "text");
  await copy.click();
  await expect(page.getByRole("status").filter({ hasText: "Clave copiada" })).toBeVisible();
  expect(await page.evaluate(async (secret) => (await navigator.clipboard.readText()) === secret, secret)).toBe(true);
  await page.getByRole("button", { name: "Ocultar clave MFA", exact: true }).click();
  await expect(field).toHaveAttribute("type", "password");
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error("NotAllowedError");
    };
  });
  await copy.click();
  await expect(page.getByRole("status").filter({ hasText: "No se pudo copiar" })).toBeVisible();
  await page.getByRole("button", { name: "Mostrar clave MFA", exact: true }).click();
  await expect(field).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Generar otra configuración", exact: true }).click();
  await expect(field).toHaveCount(0);
  await page.getByLabel("Contraseña para configurar MFA", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Generar configuración MFA", exact: true }).click();
  await expect(field).toHaveAttribute("type", "password");
  await expect(page.getByRole("status").filter({ hasText: /Clave copiada|No se pudo copiar/ })).toHaveCount(0);
  const replacement = await field.inputValue();
  expect(replacement === secret).toBe(false);
  await page.getByLabel("Código de confirmación MFA", { exact: true }).fill(await environment.token(replacement));
  await page.getByRole("button", { name: "Confirmar MFA", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Administración de usuarios", exact: true })).toBeVisible();
  await expect(field).toHaveCount(0);
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
  const secret = await page.getByRole("textbox", { name: "Configuración manual MFA" }).inputValue();
  await expect(page.getByRole("img", { name: "Código QR de configuración MFA" })).toBeVisible();
  await page.getByRole("textbox", { name: "Código de confirmación MFA" }).fill("invalid");
  await page.getByRole("button", { name: "Confirmar MFA", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("textbox", { name: "Código de confirmación MFA" }).fill(await environment.token(secret));
  await page.getByRole("button", { name: "Confirmar MFA", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Administración de usuarios" })).toBeVisible();
  const username = `created-${randomBytes(4).toString("hex")}`;
  await page.getByRole("button", { name: "Crear usuario", exact: true }).click();
  await page.getByRole("textbox", { name: "Usuario nuevo" }).fill(username);
  await page.getByRole("textbox", { name: "Nombre visible" }).fill("Usuario sintético E2E");
  await page.getByRole("textbox", { name: "Motivo del alta" }).fill("Alta de integración real");
  await page
    .getByRole("dialog", { name: "Crear usuario", exact: true })
    .getByRole("button", { name: "Crear usuario", exact: true })
    .click();
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
    await page.getByRole("button", { name: `Administrar ${username}`, exact: true }).click();
    await page.getByRole("button", { name: "Recuperar acceso", exact: true }).click();
    await page.getByRole("textbox", { name: "Motivo de la operación" }).fill("Recuperación real de prueba");
    await page.getByRole("button", { name: "Confirmar operación", exact: true }).click();
    await expect(credential).toBeVisible();
    const replacement = await credential.inputValue();
    expect(replacement).not.toBe(temporaryPassword);
    await page.getByRole("button", { name: "Cerrar credencial temporal", exact: true }).click();
    await reader.reload();
    await expect(reader.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await login(reader, environment, { username, password: temporaryPassword });
    await expect(reader.getByRole("alert")).toBeVisible();
    await login(reader, environment, { username, password: replacement });
    await expect(reader.getByRole("heading", { name: "Cambiar contraseña temporal" })).toBeVisible();
    await changePassword(reader, replacement, randomBytes(24).toString("base64url"));
    await expect(reader.getByRole("status", { name: "Usuario conectado" })).toHaveText(username);
    await page.getByRole("button", { name: `Administrar ${username}`, exact: true }).click();
    await page.getByRole("button", { name: "Deshabilitar usuario", exact: true }).click();
    const disable = page.getByRole("dialog", { name: "Deshabilitar usuario", exact: true });
    await disable.getByRole("textbox", { name: "Motivo de la operación" }).fill("Bloqueo real de prueba");
    await disable.getByRole("button", { name: "Deshabilitar usuario", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: username })).toContainText("Deshabilitado");
    expect(await reader.evaluate(async () => (await fetch("/api/currency_rates")).status)).toBe(401);
    await expect(reader.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("logout y expiración eliminan datos en dos pestañas y al volver atrás", async ({ page, context, environment }) => {
  const user = await environment.seedUser();
  await login(page, environment, user);
  await expect(page.locator(".app-navbar-ref").getByText("42.125000", { exact: true })).toBeVisible();
  const second = await context.newPage();
  await second.goto(environment.origin);
  await expect(second.locator(".app-navbar-ref").getByText("42.125000", { exact: true })).toBeVisible();
  await logout(page);
  await expect(second.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await second.goto(`${environment.origin}/history-check`);
  await second.goBack();
  await expect(second.getByRole("table")).toHaveCount(0);
  await login(page, environment, user);
  await expect(page.locator(".app-navbar-ref").getByText("42.125000", { exact: true })).toBeVisible();
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
  await expect(page.locator(".app-navbar-ref").getByText("42.125000", { exact: true })).toBeVisible();
  await logout(page);
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  const connection = await environment.db.client.acquireConnection();
  let locked = false;
  try {
    await environment.db.raw("LOCK TABLES divisas WRITE").connection(connection);
    locked = true;
    await environment.db.raw("UPDATE divisas SET Cambio = ?", ["84.25"]).connection(connection);
    await login(page, environment, second);
    await expect(page.locator('.app-navbar-ref[aria-busy="true"]')).toBeVisible();
    await expect(page.locator(".app-navbar-ref").getByText("42.125000", { exact: true })).toHaveCount(0);
    await environment.db.raw("UNLOCK TABLES").connection(connection);
    locked = false;
    await expect(page.locator(".app-navbar-ref").getByText("84.250000", { exact: true })).toBeVisible();
  } finally {
    if (locked) await environment.db.raw("UNLOCK TABLES").connection(connection);
    await environment.db.client.releaseConnection(connection);
    await environment.db("divisas").update({ Cambio: "42.125" });
  }
});

test("revalidar con reportes bloqueados no expulsa una sesión válida ni agota su conexión", async ({
  page,
  environment,
}) => {
  await login(page, environment, await environment.seedUser());
  const reference = page.locator(".app-navbar-ref");
  await expect(reference).toContainText("42.125000");
  const connection = await environment.db.client.acquireConnection();
  let locked = false;
  try {
    await environment.db.raw("LOCK TABLES divisas WRITE").connection(connection);
    locked = true;
    await page.evaluate(() => {
      for (let index = 0; index < 12; index++)
        void fetch("/api/currency_rates")
          .then((response) => response.json())
          .catch(() => {});
    });
    await require("../support/auth-environment.cjs").until(async () => {
      const [rows] = await environment.db.raw("SHOW FULL PROCESSLIST");
      return (
        rows.filter(
          (row) => String(row.State) === "Locked" || /for update|lock in share mode/i.test(String(row.Info || "")),
        ).length >= 2
      );
    }, 5000);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(reference).toBeVisible({ timeout: 7000 });
    await expect(page.getByRole("alert").filter({ hasText: "No se puede validar la sesión" })).toHaveCount(0);
  } finally {
    if (locked) await environment.db.raw("UNLOCK TABLES").connection(connection);
    await environment.db.client.releaseConnection(connection);
  }
});

test("revalidar mientras carga el dashboard descarta la cancelación y conserva errores reales", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "sales.read", scope: "assigned" },
      { capability: "rates.read", scope: "global" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let requested = 0;
  const pattern = "**/api/dashboard/sales?**";
  await page.route(pattern, async (route) => {
    const cookie = (await page.context().cookies()).find((value) => value.name === "__Host-dmmarket.sid");
    const client = environment.client();
    client.jar.cookie = `${cookie.name}=${cookie.value}`;
    const url = new URL(route.request().url());
    const response = await client.request(`${url.pathname}${url.search}`);
    expect(response.status).toBe(200);
    requested += 1;
    await gate;
    await route
      .fulfill({ status: response.status, contentType: "application/json", body: response.text })
      .catch(() => {});
  });
  try {
    await login(page, environment, user);
    await expect.poll(() => requested).toBeGreaterThanOrEqual(1);
    const checked = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/auth/session" && response.status() === 200,
    );
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await checked;
    await expect.poll(() => requested).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole("heading", { name: "Dashboard de Ventas", exact: true })).toBeVisible();
    await expect(page.locator(".alert-danger")).toHaveCount(0);
    release();
    const gross = page.locator(".dashboard-kpi-card").filter({ hasText: "Venta Bruta" });
    await expect(gross).toContainText("$100,00");
    await setNoe(page, true);
    await expect(gross).toContainText("$200,00");
    await page.unroute(pattern);
    await page.route(pattern, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Servicio temporalmente no disponible." } }),
      }),
    );
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await expect(page.locator(".alert-danger")).toContainText("Dashboard API error: 503");
    await expect(page.getByRole("checkbox", { name: "Notas de entrega", exact: true })).toBeChecked();
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("MySQL realmente suspendido oculta datos sin fallback anónimo y recupera", async ({ page, environment }) => {
  await login(page, environment, await environment.seedUser());
  await expect(page.locator(".app-navbar-ref").getByText("42.125000", { exact: true })).toBeVisible();
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
  await expect(page.locator(".app-navbar-ref").getByText("42.125000", { exact: true })).toBeVisible();
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
  await environment
    .db("dmmarket_auth_session_state")
    .where("user_id", user.id)
    .whereNull("revoked_ms")
    .update({ password_ms: Date.now() - 300001 });
  await page.getByRole("button", { name: "Crear usuario", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Crear usuario", exact: true });
  await panel.getByLabel("Usuario nuevo", { exact: true }).fill(`verified-${randomBytes(4).toString("hex")}`);
  await panel.getByLabel("Nombre visible", { exact: true }).fill("Persona verificada");
  await panel.getByLabel("Motivo del alta", { exact: true }).fill("Alta con verificación real");
  await panel.getByRole("button", { name: "Crear usuario", exact: true }).click();
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
  await expect(page.getByRole("dialog", { name: "Credencial temporal", exact: true })).toBeVisible();
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
      table.string("Empresa", 128);
    });
    await environment.db("vendedores").insert({ idVend: "A", Empresa: "Vendedor A" });
  }
  const owner = await environment.seedUser({ permissions: ownerPermissions, enrolled: true });
  const user = await environment.seedUser();
  await login(page, environment, owner);
  await page.getByRole("textbox", { name: "Código MFA", exact: true }).fill(await environment.token(owner.secret));
  await page.getByRole("button", { name: "Verificar código", exact: true }).click();
  await page.locator(".clients-sidebar").getByRole("button", { name: "Roles", exact: true }).click();
  await page.getByRole("button", { name: "Crear rol", exact: true }).click();
  const name = `Rol E2E ${randomBytes(4).toString("hex")}`;
  await page.getByRole("textbox", { name: "Nombre del rol", exact: true }).fill(name);
  await page.getByLabel("Consultar ventas", { exact: true }).selectOption("assigned");
  await expect(page.getByLabel("Ver costos y utilidad de ventas", { exact: true })).toBeVisible();
  for (const retired of ["sales.costs", "sales.profit", "providers.personal"])
    await expect(page.getByLabel(retired, { exact: true })).toHaveCount(0);
  await page.getByLabel("Ver costos y utilidad de ventas", { exact: true }).selectOption("assigned");
  await page.getByLabel("Consultar tasas de cambio", { exact: true }).selectOption("global");
  const createdResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/auth/roles") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Guardar rol", exact: true }).click();
  const created = await createdResponse;
  expect(created.status()).toBe(201);
  const role = await created.json();
  await expect(page.getByText("Rol guardado.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: `Editar ${name}`, exact: true }).click();
  await expect(page.getByLabel("Consultar ventas", { exact: true })).toHaveValue("assigned");
  await expect(page.getByLabel("Ver costos y utilidad de ventas", { exact: true })).toHaveValue("assigned");
  await page.getByLabel("Consultar ventas", { exact: true }).selectOption("global");
  const updatedResponse = page.waitForResponse(
    (response) => response.url().endsWith(`/api/auth/roles/${role.id}`) && response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Guardar rol", exact: true }).click();
  expect((await updatedResponse).status()).toBe(200);
  await expect(page.getByText("Rol guardado.", { exact: false })).toBeVisible();
  await page.locator(".clients-sidebar").getByRole("button", { name: "Usuarios", exact: true }).click();
  await page.getByLabel("Buscar usuarios", { exact: true }).fill(user.username);
  await page.getByRole("button", { name: `Administrar ${user.username}`, exact: true }).click();
  await page.getByRole("checkbox", { name, exact: true }).check();
  await page.getByRole("button", { name: "Guardar roles del usuario", exact: true }).click();
  await expect(page.getByText("Roles asignados y sesiones del usuario revocadas.", { exact: true })).toBeVisible();
  const context = await browser.newContext();
  try {
    const reader = await context.newPage();
    await login(reader, environment, user);
    await openModule(reader, "Configuración", "Tasas BCV");
    await expect(reader.locator(".app-navbar-ref").getByText("42.125000", { exact: true })).toBeVisible();
    await page.getByRole("searchbox", { name: "Buscar vendedores", exact: true }).fill("A");
    await page.getByRole("checkbox", { name: "Vendedor A · A", exact: true }).check();
    await page.getByRole("textbox", { name: "Motivo del cambio de vínculos" }).fill("Vincular vendedor real desde UI");
    await page.getByRole("button", { name: "Guardar vendedores vinculados", exact: true }).click();
    await expect(page.getByText("Vínculos guardados y sesiones del usuario revocadas.", { exact: true })).toBeVisible();
    await reader.reload();
    await expect(reader.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    expect(await environment.db("dmmarket_auth_user_sellers").where("user_id", user.id).pluck("seller_id")).toEqual([
      "A",
    ]);
    await page.getByRole("checkbox", { name: "Vendedor A · A", exact: true }).uncheck();
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

test("ventas originales muestran únicamente documentos propios en ambos sistemas y ocultan datos financieros", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  const user = await environment.seedUser({ permissions: [{ capability: "sales.read", scope: "assigned" }] });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await openModule(page, "Ventas", "Desglose");
  await page.goto(`${environment.origin}/ventas?view=desglose&dFrom=2026-01-01&dTo=2026-01-31`);
  const report = page.getByRole("region", { name: "Ventas", exact: true });
  await report.getByRole("button", { name: "Facturas", exact: true }).click();
  await expect(report.getByRole("cell", { name: "Vendedor A", exact: true })).toBeVisible();
  await expect(report.getByRole("cell", { name: "Vendedor B", exact: true })).toHaveCount(0);
  await expect(report.getByRole("columnheader", { name: "Utilidad", exact: true })).toHaveCount(0);
  await expect(report.getByRole("cell", { name: "1", exact: true })).toBeVisible();
  await setNoe(page, true);
  await expect(report.getByRole("cell", { name: "2", exact: true })).toBeVisible();
  await expect(report.getByRole("cell", { name: "Vendedor B", exact: true })).toHaveCount(0);
  const result = await page.evaluate(
    async () => await (await fetch("/api/sales/facturas?from=2026-01-01&to=2026-01-31&employeeId=B")).json(),
  );
  expect(result.data).toEqual([]);
});

test("detalle y dashboard originales preservan comparación y no exponen costos, identificación ni ventas ajenas", async ({
  page,
  environment,
}) => {
  const user = await environment.seedUser({ permissions: [{ capability: "sales.read", scope: "assigned" }] });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await page.goto(`${environment.origin}/ventas?view=dashboard&from=2026-01-01&to=2026-01-31`);
  const report = page.getByRole("region", { name: "Ventas", exact: true });
  await expect(report.locator(".dashboard-kpi-card").filter({ hasText: "Venta Bruta" })).toContainText("$100,00");
  await expect(report.locator(".dashboard-kpi-card").filter({ hasText: "Venta Bruta" })).toContainText("900.0%");
  await expect(report.locator(".dashboard-kpi-card").filter({ hasText: "Ganancia Neta" })).toHaveCount(0);
  await page.goto(`${environment.origin}/ventas?view=desglose&dFrom=2026-01-01&dTo=2026-01-31`);
  await report.getByRole("button", { name: "Facturas", exact: true }).click();
  await report
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "1", exact: true }) })
    .click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByText("Factura #1", { exact: true })).toBeVisible();
  await expect(detail.getByRole("cell", { name: "Línea sintética", exact: true })).toBeVisible();
  await expect(detail.getByRole("columnheader", { name: "Utilidad", exact: true })).toHaveCount(0);
  await expect(detail.getByText(/PRIVATE/)).toHaveCount(0);
  expect(await page.evaluate(async () => (await fetch("/api/invoices/2/detail")).status)).toBe(404);
  await detail.getByRole("button", { name: "Cerrar", exact: true }).click();
  await setNoe(page, true);
  await report
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "2", exact: true }) })
    .click();
  await expect(detail.getByText("Factura #2", { exact: true })).toBeVisible();
  await expect(detail.locator(".document-detail-total")).toContainText("$200.00");
});

test("Vendedores original sólo muestra contactos propios y conserva resumen y comparación", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/party-fixtures.cjs").seedParties(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "sellers.read", scope: "global" },
      { capability: "sellers.personal", scope: "assigned" },
      { capability: "sales.read", scope: "assigned" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await page.goto(`${environment.origin}/vendedores?view=sellers&dFrom=2026-01-01&dTo=2026-01-31`);
  const report = page.getByRole("region", { name: "Vendedores", exact: true });
  await report
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "Vendedor A", exact: true }) })
    .click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByText(/PRIVATE-PHONE-A/)).toBeVisible();
  await expect(modal.getByText(/PRIVATE-PHONE-B/)).toHaveCount(0);
  await expect(modal.getByRole("columnheader", { name: "Utilidad", exact: true })).toHaveCount(0);
  await expect(modal.locator(".dashboard-kpi-card").filter({ hasText: /^Ventas/ })).toContainText("$100,00");
  const body = await page.evaluate(
    async () => await (await fetch("/api/sellers/B/summary?from=2026-01-01&to=2026-01-31")).json(),
  );
  expect(body.totals.sales).toBe(0);
  expect(body.seller).not.toHaveProperty("phone");
});

test("clientes originales no convierten ventas propias en globales ni permiten identificar sin permiso", async ({
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
  await openModule(page, "Clientes", "Desglose");
  await page.goto(`${environment.origin}/clientes?view=clients&dFrom=2026-01-01&dTo=2026-01-31`);
  const report = page.getByRole("region", { name: "Clientes", exact: true });
  const customer = report
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "Cliente sintético", exact: true }) });
  await expect(customer.getByRole("cell", { name: "$100.00", exact: true })).toBeVisible();
  await expect(report.getByRole("columnheader", { name: "Utilidad", exact: true })).toHaveCount(0);
  await report
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "Cliente exclusivo de B", exact: true }) })
    .click();
  const modal = page.getByRole("dialog");
  await expect(modal.locator(".stat-card").filter({ hasText: "Total Ventas" })).toContainText("$0,00");
  await expect(modal.getByText(/PRIVATE/)).toHaveCount(0);
  await modal.getByRole("button", { name: "Close", exact: true }).click();
  await setNoe(page, true);
  await expect(customer.getByRole("cell", { name: "$200.00", exact: true })).toBeVisible();
});

test("modal original y consultas mensuales conservan alcance y año en ambos sistemas", async ({
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
  await openModule(page, "Clientes", "Desglose");
  await page.goto(`${environment.origin}/clientes?view=clients&dFrom=2025-12-01&dTo=2026-02-28`);
  for (const [noe, amount, total] of [
    [false, 100, 110],
    [true, 200, 210],
  ]) {
    await setNoe(page, noe);
    await page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "Cliente sintético", exact: true }) })
      .click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByRole("columnheader", { name: "Utilidad", exact: true })).toHaveCount(0);
    await expect(modal.getByText(/PRIVATE/)).toHaveCount(0);
    const observed = await page.evaluate(
      async ({ noe }) => ({
        monthly: await (
          await fetch(`/api/clients/average/month/C?from=2026-01-01&to=2026-01-31&showNoe=${noe}`)
        ).json(),
        ranking: await (await fetch(`/api/clients/best/product/P?from=2025-12-01&to=2026-02-28&showNoe=${noe}`)).json(),
        history: await (
          await fetch(`/api/clients/average/month/C?from=2025-12-01&to=2026-02-28&showNoe=${noe}`)
        ).json(),
      }),
      { noe },
    );
    expect(observed.monthly.data[0].y).toBe(amount);
    expect(Number(observed.ranking[0].total_USD)).toBe(total);
    expect(observed.history.data.map((row) => [row.x, row.y])).toEqual([
      ["2025-12", 10],
      ["2026-01", amount],
      ["2026-02", null],
    ]);
    expect(JSON.stringify(observed.ranking)).not.toContain("Cliente exclusivo de B");
    expect(JSON.stringify(observed)).not.toMatch(/PRIVATE|netProfit|utilidad/);
    await modal.getByRole("button", { name: "Close", exact: true }).click();
  }
});

test("dashboard original de Vendedores intersecta lectura antes de ranking, margen y detalle en ambos sistemas", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/party-fixtures.cjs").seedParties(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "sellers.read", scope: "assigned" },
      { capability: "sales.read", scope: "global" },
      { capability: "sales.financial", scope: "assigned" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await page.goto(
    `${environment.origin}/vendedores?view=dashboard&from=2026-01-01&to=2026-01-31&dFrom=2026-01-01&dTo=2026-01-31`,
  );
  for (const [noe, sales, margin] of [
    [false, 100, 39],
    [true, 200, 53.5],
  ]) {
    await setNoe(page, noe);
    const report = page.getByRole("region", { name: "Vendedores", exact: true });
    await expect(report.getByRole("heading", { name: "Dashboard de Vendedores", exact: true })).toBeVisible();
    await expect(report.getByText("Vendedor A", { exact: true }).first()).toBeVisible();
    await expect(report.getByText("Vendedor B", { exact: true })).toHaveCount(0);
    const response = await page.evaluate(
      async (noe) => await (await fetch(`/api/sellers/dashboard?from=2026-01-01&to=2026-01-31&showNoe=${noe}`)).json(),
      noe,
    );
    expect(response.kpis.compareSales).toBe(10);
    expect(response.ranking.map((row) => row.sellerId)).toEqual(["A"]);
    expect(response.ranking[0].sales).toBe(sales);
    expect(response.ranking[0].marginPercent).toBe(margin);
  }
  await page
    .locator(".clients-sidebar")
    .getByRole("button", { name: /Desglose/ })
    .click();
  const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "Vendedor A", exact: true }) });
  await expect(row.getByRole("cell", { name: /53[,.]5/ }).first()).toBeVisible();
  await row.click();
  await expect(
    page
      .getByRole("dialog")
      .locator(".dashboard-kpi-card")
      .filter({ hasText: /^Utilidad/ }),
  ).toContainText("$107,00");
});

test("dashboard original global oculta utilidad propia y contactos ajenos sin sustituir gráficas", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/party-fixtures.cjs").seedParties(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "sellers.read", scope: "global" },
      { capability: "sales.read", scope: "global" },
      { capability: "sellers.personal", scope: "assigned" },
      { capability: "sales.financial", scope: "assigned" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await page.goto(
    `${environment.origin}/vendedores?view=dashboard&from=2026-01-01&to=2026-01-31&dFrom=2026-01-01&dTo=2026-01-31`,
  );
  const report = page.getByRole("region", { name: "Vendedores", exact: true });
  await expect(report.getByText("Vendedor B", { exact: true }).first()).toBeVisible();
  await expect(report.getByText("Utilidad", { exact: true })).toHaveCount(0);
  await page
    .locator(".clients-sidebar")
    .getByRole("button", { name: /Desglose/ })
    .click();
  await expect(report.getByRole("columnheader", { name: "Margen", exact: true })).toHaveCount(0);
  await page
    .locator(".clients-sidebar")
    .getByRole("button", { name: /Dashboard/ })
    .click();
  await page.goto(`${environment.origin}/vendedores?view=dashboard&from=2026-02-01&to=2026-02-28`);
  await expect(report.getByRole("cell", { name: "PRIVATE-PHONE-A", exact: true })).toBeVisible();
  await expect(report.getByText("PRIVATE-PHONE-B", { exact: true })).toHaveCount(0);
});

test("clientes sin documentos conservan tabla original y sólo histórico autorizado hasta el corte", async ({
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
  await page.goto(`${environment.origin}/clientes?view=dashboard&from=2026-02-01&to=2026-02-28`);
  for (const [noe, amount] of [
    [false, "$110.00"],
    [true, "$210.00"],
  ]) {
    await setNoe(page, noe);
    const row = page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "Cliente sintético", exact: true }) });
    await expect(row.getByRole("cell", { name: amount, exact: true })).toBeVisible();
    const other = page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "Cliente exclusivo de B", exact: true }) });
    await expect(other.getByRole("cell", { name: "$0.00", exact: true })).toBeVisible();
  }
  const observed = await page.evaluate(
    async () =>
      await (
        await fetch("/api/clients/sin-facturar?from=2025-11-01&to=2025-11-30&search=sintético&showNoe=true")
      ).json(),
  );
  expect(observed.total).toBe(1);
  expect(Number(observed.data[0].revenue_historico)).toBe(0);
});

test("dashboard original de clientes conserva clasificación, retención y cobertura en el alcance propio", async ({
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
  await page.goto(`${environment.origin}/clientes?view=dashboard&from=2026-01-01&to=2026-01-31`);
  for (const [noe, amount] of [
    [false, "$100,00"],
    [true, "$200,00"],
  ]) {
    await setNoe(page, noe);
    const report = page.getByRole("region", { name: "Clientes", exact: true });
    await expect(report.getByRole("button", { name: "Imprimir", exact: true })).toHaveCount(0);
    await expect(report.getByRole("heading", { name: "Dashboard de Clientes", exact: true })).toBeVisible();
    const table = report
      .getByRole("table")
      .filter({ has: page.getByRole("columnheader", { name: "Venta total", exact: true }) });
    await expect(table.getByRole("cell", { name: amount, exact: true })).toBeVisible();
    await expect(table.getByRole("cell", { name: "Cliente exclusivo de B", exact: true })).toHaveCount(0);
    await expect(report.getByRole("button", { name: "Utilidad", exact: true })).toHaveCount(0);
    const payload = await page.evaluate(
      async (noe) =>
        await (await fetch(`/api/clients/dashboard?from=2026-01-01&to=2026-01-31&ruta=R&showNoe=${noe}`)).json(),
      noe,
    );
    expect(payload.kpis.retention.prevPeriodRevenue).toBe(10);
    expect(payload.coverage.routes[0].coberturaPct).toBe(33.33);
  }
});

test("dashboard original global no muestra utilidad propia ni controles financieros no autorizados", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/party-fixtures.cjs").seedParties(environment.db);
  const user = await environment.seedUser({
    permissions: [
      { capability: "clients.read", scope: "global" },
      { capability: "sales.read", scope: "global" },
      { capability: "sales.financial", scope: "assigned" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await page.goto(`${environment.origin}/clientes?view=dashboard&from=2026-01-01&to=2026-01-31`);
  await expect(page.getByRole("region", { name: "Clientes", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Utilidad", exact: true })).toHaveCount(0);
  const payload = await page.evaluate(
    async () => await (await fetch("/api/clients/dashboard?from=2026-01-01&to=2026-01-31")).json(),
  );
  expect(payload).not.toHaveProperty("abcUtility");
  expect(JSON.stringify(payload)).not.toContain("utilidad");
  const scoped = await page.evaluate(
    async () => await (await fetch("/api/clients/dashboard?from=2026-01-01&to=2026-01-31&employeeId=A")).json(),
  );
  expect(scoped.abcUtility.clients.some((row) => Number(row.utilidad) === 39)).toBe(true);
});

test("Pareto original mantiene población, maduración y privacidad y no ofrece ganancia sin permiso", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/pareto-fixtures.cjs").seedPareto(environment.db);
  const basic = await environment.seedUser({
    permissions: [
      { capability: "sales.read", scope: "assigned" },
      { capability: "purchases.read", scope: "global" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: basic.id, seller_id: "A" });
  await login(page, environment, basic);
  await page.goto(`${environment.origin}/ventas?view=dashboard&from=2026-06-01&to=2026-07-01`);
  await expect(page.getByRole("heading", { name: "Dashboard de Ventas", exact: true })).toBeVisible();
  await expect(page.getByText("Modos del Pareto", { exact: true })).toHaveCount(0);
  for (const showNoe of ["false", "true"]) {
    const payload = await page.evaluate(
      async (showNoe) =>
        await (
          await fetch(`/api/dashboard/pareto?from=2026-06-01&to=2026-07-01&metric=rawProfit&showNoe=${showNoe}`)
        ).json(),
      showNoe,
    );
    expect(payload.products.map((row) => row.rawProfit)).toEqual([100, 80]);
    expect(JSON.stringify(payload)).not.toMatch(/netProfit|inventoryValue|cumulativeProfit|profitPercent/);
  }
  await logout(page);
  const user = await environment.seedUser({
    permissions: ["sales.read", "sales.financial"]
      .map((capability) => ({ capability, scope: "assigned" }))
      .concat([{ capability: "purchases.read", scope: "global" }]),
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await page.goto(`${environment.origin}/ventas?view=dashboard&from=2026-06-01&to=2026-07-01`);
  const panel = page
    .locator(".dashboard-panel")
    .filter({ has: page.locator(".dashboard-inline-title").filter({ hasText: /^Análisis Pareto/ }) });
  for (const noe of [false, true]) {
    await setNoe(page, noe);
    await expect(panel.getByRole("cell", { name: "Producto reciente", exact: true })).toBeVisible();
    await expect(panel.getByRole("cell", { name: "2026-06-02", exact: true })).toBeVisible();
    await expect(panel.getByRole("columnheader", { name: "Valor inventario", exact: true })).toHaveCount(0);
    await expect(
      panel.getByRole("table").first().getByRole("cell", { name: "Producto reciente", exact: true }),
    ).toHaveCount(0);
  }
  await panel.getByRole("searchbox").fill("no-match");
  await expect(panel.getByRole("cell", { name: "Producto reciente", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("table").first().getByRole("row")).toHaveCount(3);
});

test("Pareto original de compras sin vender exige lectura global y oculta inventario no autorizado", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/pareto-fixtures.cjs").seedPareto(environment.db);
  const user = await environment.seedUser({
    permissions: ["sales.read", "purchases.read", "purchases.costs"].map((capability) => ({
      capability,
      scope: "global",
    })),
  });
  await login(page, environment, user);
  await page.goto(`${environment.origin}/ventas?view=dashboard&from=2026-06-01&to=2026-07-01`);
  await expect(page.getByRole("cell", { name: "Producto sin vender", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "$200,00", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Valor inventario", exact: true })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Producto maduro", exact: true })).toHaveCount(0);
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

test("compras originales básicas conservan documentos y productos sin importes ni proveedores implícitos", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/purchase-fixtures.cjs").seedPurchases(environment.db);
  const user = await environment.seedUser({ permissions: [{ capability: "purchases.read", scope: "global" }] });
  await login(page, environment, user);
  await openModule(page, "Compras", "Desglose");
  await page.goto(`${environment.origin}/compras?view=desglose&dFrom=2026-08-01&dTo=2026-08-31`);
  const report = page.getByRole("region", { name: "Compras", exact: true });
  await expect(report.getByRole("cell", { name: "Producto histórico comprado", exact: true })).toBeVisible();
  await expect(report.getByRole("columnheader", { name: "Costo Prom.", exact: true })).toHaveCount(0);
  await expect(report.getByRole("columnheader", { name: "Monto", exact: true })).toHaveCount(0);
  await expect(report.getByRole("button", { name: "Imprimir", exact: true })).toHaveCount(0);
  await expect(report.getByText("Buscar proveedor...", { exact: true })).toHaveCount(0);
  await report.getByRole("button", { name: "Facturas", exact: true }).click();
  await expect(report.getByRole("cell", { name: "purchase-august-empty", exact: true })).toBeVisible();
  await expect(report.getByRole("columnheader", { name: "Proveedor", exact: true })).toHaveCount(0);
  const result = await page.evaluate(
    async () => await (await fetch("/api/purchases/products?from=2026-08-01&to=2026-08-31")).json(),
  );
  expect(result.totals).toEqual({ quantity: "6.000" });
  expect(result.data.every((row) => !Object.hasOwn(row, "monto"))).toBe(true);
});

test("compras originales financieras conservan selectores y filtros coherentes", async ({ page, environment }) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/purchase-fixtures.cjs").seedPurchases(environment.db);
  const user = await environment.seedUser({
    permissions: ["purchases.read", "purchases.costs", "providers.read"].map((capability) => ({
      capability,
      scope: "global",
    })),
  });
  await login(page, environment, user);
  await openModule(page, "Compras", "Desglose");
  await page.goto(`${environment.origin}/compras?view=desglose&dFrom=2026-08-01&dTo=2026-08-31`);
  const report = page.getByRole("region", { name: "Compras", exact: true });
  await expect(report.getByRole("columnheader", { name: "Monto", exact: true })).toBeVisible();
  await report.getByRole("button", { name: "Facturas", exact: true }).click();
  await expect(report.getByRole("cell", { name: "Proveedor compras B", exact: true })).toBeVisible();
  await expect(report.getByText("PRIVATE-PUR", { exact: false })).toHaveCount(0);
  await page.goto(
    `${environment.origin}/compras?view=desglose&dFrom=2026-08-01&dTo=2026-08-31&proveedorId=PUR-A&proveedorName=Proveedor+compras+A&groupId=G`,
  );
  await expect(report.getByRole("cell", { name: "Producto sintético", exact: true })).toBeVisible();
  await expect(report.getByRole("cell", { name: "$16,00", exact: true })).toBeVisible();
  await expect(report.getByText("Proveedor compras B", { exact: true })).toHaveCount(0);
});

test("dashboard original de compras básico conserva cantidades y comparación sin análisis monetarios", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/purchase-fixtures.cjs").seedPurchases(environment.db);
  const user = await environment.seedUser({ permissions: [{ capability: "purchases.read", scope: "global" }] });
  await login(page, environment, user);
  await openModule(page, "Compras");
  await page.goto(`${environment.origin}/compras?view=dashboard&from=2026-08-01&to=2026-08-31`);
  const report = page.getByRole("region", { name: "Compras", exact: true });
  await expect(report.locator(".dashboard-kpi-card").filter({ hasText: "Transacciones" })).toContainText("3");
  await expect(report.locator(".dashboard-kpi-card").filter({ hasText: "Unidades" })).toContainText("6");
  await expect(report.locator(".dashboard-kpi-card").filter({ hasText: "Unidades" })).toContainText("200.0%");
  await expect(report.getByText("Total Comprado", { exact: true })).toHaveCount(0);
  await expect(report.getByText("Categorías", { exact: true })).toHaveCount(0);
  await expect(report.getByText("Top Productos", { exact: true })).toHaveCount(0);
  await expect(report.getByText("Mejor Proveedor", { exact: true })).toHaveCount(0);
});

test("dashboard y Pareto originales de compras conservan montos y no requieren lectura de ventas", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/purchase-fixtures.cjs").seedPurchases(environment.db);
  const user = await environment.seedUser({
    permissions: ["purchases.read", "purchases.costs", "providers.read"].map((capability) => ({
      capability,
      scope: "global",
    })),
  });
  await login(page, environment, user);
  await openModule(page, "Compras");
  await page.goto(`${environment.origin}/compras?view=dashboard&from=2026-08-01&to=2026-08-31`);
  const report = page.getByRole("region", { name: "Compras", exact: true });
  await expect(report.locator(".dashboard-kpi-card").filter({ hasText: "Total Comprado" })).toContainText("$130,00");
  await expect(report.locator(".dashboard-kpi-card").filter({ hasText: "Total Comprado" })).toContainText("712.5%");
  await expect(report.locator(".purchases-dashboard-best-provider")).toContainText("Proveedor compras A");
  await expect(report.getByRole("cell", { name: "61.54%", exact: true })).toBeVisible();
  await expect(report.getByRole("button", { name: "Imprimir", exact: true })).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Módulos disponibles", exact: true })
      .getByRole("link", { name: "Ventas", exact: true }),
  ).toHaveCount(0);
});

test("directorio original de Proveedores no infiere transacciones ni contactos desde sus nombres", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/purchase-fixtures.cjs").seedPurchases(environment.db);
  const user = await environment.seedUser({
    permissions: [{ capability: "providers.read", scope: "global" }],
  });
  await login(page, environment, user);
  await openModule(page, "Proveedores");
  const report = page.getByRole("region", { name: "Proveedores", exact: true });
  await expect(report.getByRole("columnheader", { name: "Total Ventas", exact: true })).toHaveCount(0);
  await expect(report.getByRole("button", { name: "Imprimir", exact: true })).toHaveCount(0);
  await report.getByRole("cell", { name: "Proveedor compras A", exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByText(/PRIVATE/)).toHaveCount(0);
  await expect(modal.getByRole("button", { name: "Ventas", exact: true })).toHaveCount(0);
  await expect(modal.getByRole("button", { name: "Compras", exact: true })).toHaveCount(0);
});

test("proveedor original conserva ventas propias y el detalle de su porción en ambos sistemas", async ({
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
  for (const noe of [false, true]) {
    await setNoe(page, noe);
    await openModule(page, "Proveedores");
    await page.getByRole("cell", { name: "Proveedor compras A", exact: true }).click();
    const profile = page.getByRole("dialog");
    await setCalendarMonth(page, profile, 2026, 11);
    await expect(profile.getByRole("columnheader", { name: "Utilidad", exact: true })).toHaveCount(0);
    await expect(profile.getByRole("button", { name: "Compras", exact: true })).toHaveCount(0);
    await profile.getByRole("cell", { name: "Cliente sintético", exact: true }).click();
    const detail = page.getByRole("dialog").filter({ has: page.getByText("Venta #provider-sale-A", { exact: true }) });
    await expect(detail.locator(".document-detail-total")).toContainText("$100.00");
    await expect(detail.getByRole("cell", { name: "Venta proveedor B", exact: true })).toHaveCount(0);
    await expect(detail.getByRole("columnheader", { name: "Costo", exact: true })).toHaveCount(0);
    await detail.getByRole("button", { name: "Cerrar", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  }
});

test("compras originales del proveedor requieren su permiso y no abren facturas de otra cuenta", async ({
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
  await page.getByRole("cell", { name: "Proveedor compras A", exact: true }).click();
  const profile = page.getByRole("dialog");
  await setCalendarMonth(page, profile, 2026, 11);
  await profile.getByRole("cell", { name: "provider-purchase-A", exact: true }).click();
  const detail = page
    .getByRole("dialog")
    .filter({ has: page.getByText("Factura #provider-purchase-A", { exact: true }) });
  await expect(detail.locator(".document-detail-total")).toContainText("$14.00");
  expect(
    await page.evaluate(async () => (await fetch("/api/providers/PUR-A/purchases/provider-purchase-B")).status),
  ).toBe(404);
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
  await openModule(page, "Mi cuenta");
  await expect(page.getByRole("link", { name: "Comisiones", exact: true })).toHaveCount(0);
  const rates = await page.evaluate(async () => await (await fetch("/api/employees/commissionInfo/A")).json());
  expect(rates).toContainEqual({ groupId: "G", group: "Grupo sintético", commission: 10 });
  expect(rates.some((row) => row.group === "Grupo comisión secundario")).toBe(true);
  expect(await page.evaluate(async () => (await fetch("/api/employees/commissionInfo/B")).status)).toBe(403);
  expect(
    await page.evaluate(async () => (await fetch("/api/employees/sales/A?from=2026-12-01&to=2026-12-31")).status),
  ).toBe(403);
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
  await expect(page.getByRole("link", { name: "Ventas", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Comisiones", exact: true })).toHaveCount(0);
  const history = await page.evaluate(
    async () => await (await fetch("/api/employees/sales/A?from=2026-12-01&to=2026-12-31")).json(),
  );
  expect(history.pagination.total).toBe(5);
  expect(history.data.find((row) => row.invoiceId === "COM-A").commissionTotal).toBe(10);
  expect(history.data.find((row) => row.invoiceId === "COM-DUP")).toMatchObject({
    invoiceTotal: "100.00",
    commissionTotal: null,
  });
  expect(history.data.every((row) => !Object.hasOwn(row, "utilidad") && row.invoiceId !== "COM-B")).toBe(true);
  expect(JSON.stringify(history)).not.toContain("PRIVATE-COMMISSION");
  expect(
    await page.evaluate(
      async () => (await fetch("/api/employees/sales/A?from=2026-12-01&to=2026-12-31&showNoe=true")).status,
    ),
  ).toBe(403);
});

test("cartera original ve deuda completa del cliente compartido sin heredar alcance de ventas propias", async ({
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
  await expect(page.getByRole("heading", { name: "Cuentas por cobrar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cliente sintético", exact: true }).click();
  const account = page.getByRole("dialog");
  await expect(account.getByRole("button", { name: "Registrar abono", exact: true })).toBeDisabled();
  await expect(account.getByRole("button", { name: "Ver factura 1", exact: true })).toBeEnabled();
  await expect(account.getByRole("button", { name: "Ver factura 2", exact: true })).toBeDisabled();
  await expect(account.getByText(/PRIVATE/)).toHaveCount(0);
  const payload = await page.evaluate(async () => await (await fetch("/api/receivables/C")).json());
  expect(Number(payload.summary.balance)).toBe(300);
  expect(payload.documents.data.map((row) => row.sale)).toEqual(["1", "2"]);
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

test("Vendedores del proveedor original intersectan sus permisos antes de mostrar utilidad", async ({
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
      { capability: "sales.financial", scope: "assigned" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await openModule(page, "Proveedores");
  await page.getByRole("cell", { name: "Proveedor compras A", exact: true }).click();
  const profile = page.getByRole("dialog");
  await setCalendarMonth(page, profile, 2026, 11);
  await profile.getByRole("button", { name: "Vendedores", exact: true }).click();
  await expect(profile.getByRole("cell", { name: "Vendedor A", exact: true })).toBeVisible();
  await expect(
    profile
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "Vendedor A", exact: true }) })
      .getByRole("cell", { name: "$40,00", exact: true }),
  ).toBeVisible();
  await expect(profile.getByRole("cell", { name: "Vendedor B", exact: true })).toHaveCount(0);
});

test("Clientes del proveedor original y comparación del servidor conservan población propia sin vista sustituta", async ({
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
  await page.getByRole("cell", { name: "Proveedor compras A", exact: true }).click();
  const profile = page.getByRole("dialog");
  await setCalendarMonth(page, profile, 2026, 11);
  await profile.getByRole("button", { name: "Clientes", exact: true }).click();
  await expect(
    profile
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "Cliente sintético", exact: true }) })
      .getByRole("cell", { name: "$100,00", exact: true }),
  ).toBeVisible();
  await expect(profile.getByRole("cell", { name: "$300,00", exact: true })).toHaveCount(0);
  const rows = await page.evaluate(
    async () => await (await fetch("/api/providers/best?from=2026-11-01&to=2026-11-30")).json(),
  );
  expect(rows.map((row) => Number(row.monto))).toEqual([100, 90]);
  await expect(page.getByRole("link", { name: "Comparativo", exact: true })).toHaveCount(0);
});
