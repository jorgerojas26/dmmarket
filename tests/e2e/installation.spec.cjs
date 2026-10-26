const fs = require("node:fs");
const path = require("node:path");
const { test: base, expect } = require("./fixtures.cjs");
const { startEnvironment } = require("../support/auth-environment.cjs");
const { seedSales } = require("../support/sales-fixtures.cjs");
const { seedPurchases } = require("../support/purchase-fixtures.cjs");
const { startSetupSandbox, startCompiledSetupSandbox } = require("../support/setup-sandbox.cjs");
const test = base.extend({
  environment: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium") throw new Error("Esta suite requiere Chrome.");
      const environment = await startEnvironment({ web: true, service: true });
      try {
        await seedSales(environment.db);
        await seedPurchases(environment.db);
        await use(environment);
      } finally {
        await environment.close();
      }
    },
    { scope: "worker" },
  ],
});

test("asistente sandbox conserva claves, verifica HTTPS real y no declara listo sin administrador", async ({
  page,
  environment,
}) => {
  const setup = await startSetupSandbox(environment);
  try {
    await page.goto(`${setup.url}/#${setup.token}`);
    await page.getByRole("button", { name: "Comenzar", exact: true }).click();
    await page.getByRole("button", { name: "Siguiente", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Conexión comprobada" })).toBeVisible();
    await page.getByRole("button", { name: "Siguiente", exact: true }).click();
    await expect(page.locator("#WEB_MODE")).toHaveValue("caddy");
    await expect(page.locator("#HOST")).toHaveValue("127.0.0.1");
    await expect(page.getByText("Se crea una autoridad local para HTTPS.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Siguiente", exact: true }).click();
    await page.getByLabel("Tengo un respaldo reciente de la base de datos.", { exact: true }).check();
    await page.getByLabel("Confirmo la configuración y la instalación del servicio.", { exact: true }).check();
    await page.getByRole("button", { name: "Instalar DMMarket", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "HTTPS activo; completa la preparación de acceso", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Desde una terminal administrativa", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: environment.origin, exact: true })).toBeVisible();
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar CA pública", exact: true }).click();
    const certificate = await downloaded;
    expect(certificate.suggestedFilename()).toBe("DMMarket-CA.crt");
    const chunks = [];
    for await (const chunk of await certificate.createReadStream()) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString();
    expect(text).toContain("BEGIN CERTIFICATE");
    expect(text).not.toContain("PRIVATE KEY");
    const env = fs.readFileSync(path.join(setup.directory, ".env"), "utf8");
    expect(env).toContain(environment.configuration.AUTH_MFA_KEY);
    expect(await page.locator("body").innerText()).not.toContain(environment.configuration.AUTH_MFA_KEY);
    expect(Number((await environment.db("dmmarket_auth_users").count("* as n").first()).n)).toBe(0);
    expect((await environment.db("dmmarket_auth_roles").select("name")).map((role) => role.name).sort()).toEqual(
      ["Dirección", "Administración técnica", "Consulta operativa", "Cobranza"].sort(),
    );
    expect(Number((await environment.db("dmmarket_auth_user_roles").count("* as n").first()).n)).toBe(0);
  } finally {
    await setup.close();
  }
});

test("reinstalador compilado carga roles ausentes y conserva personalizaciones sin asignar usuarios", async ({
  page,
  environment,
}) => {
  const direction = await environment.db("dmmarket_auth_roles").where("name", "Dirección").first();
  await environment.db("dmmarket_auth_roles").where("id", direction.id).update({ name: "Dirección personalizada" });
  await environment
    .db("dmmarket_auth_role_permissions")
    .where({ role_id: direction.id, capability: "access.links" })
    .delete();
  const collection = await environment.db("dmmarket_auth_roles").where("name", "Cobranza").first();
  await environment.db("dmmarket_auth_role_permissions").where("role_id", collection.id).delete();
  await environment.db("dmmarket_auth_roles").where("id", collection.id).delete();
  const before = await environment
    .db("dmmarket_auth_role_permissions")
    .where("role_id", direction.id)
    .orderBy("capability");
  const setup = await startCompiledSetupSandbox(environment);
  try {
    await page.goto(`${setup.url}/#${setup.token}`);
    await page.getByRole("button", { name: "Comenzar", exact: true }).click();
    await page.getByRole("button", { name: "Siguiente", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Conexión comprobada" })).toBeVisible();
    await page.getByRole("button", { name: "Siguiente", exact: true }).click();
    await page.getByRole("button", { name: "Siguiente", exact: true }).click();
    await page.getByLabel("Tengo un respaldo reciente de la base de datos.", { exact: true }).check();
    await page.getByLabel("Confirmo la configuración y la instalación del servicio.", { exact: true }).check();
    await page.getByRole("button", { name: "Instalar DMMarket", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "HTTPS activo; completa la preparación de acceso", exact: true }),
    ).toBeVisible();
    expect((await environment.db("dmmarket_auth_roles").where("id", direction.id).first()).name).toBe(
      "Dirección personalizada",
    );
    expect(
      await environment.db("dmmarket_auth_role_permissions").where("role_id", direction.id).orderBy("capability"),
    ).toEqual(before);
    expect((await environment.db("dmmarket_auth_roles").where("name", "Cobranza").first()).id).toBe(collection.id);
    expect(Number((await environment.db("dmmarket_auth_roles").count("* as n").first()).n)).toBe(4);
    expect(Number((await environment.db("dmmarket_auth_users").count("* as n").first()).n)).toBe(0);
    expect(Number((await environment.db("dmmarket_auth_user_roles").count("* as n").first()).n)).toBe(0);
  } finally {
    await setup.close();
  }
});
