const { startEnvironment, backend } = require("../../../tests/support/auth-environment.cjs");
let environment;
let editor;
let editorUser;
const grants = (...names) => names.map((capability) => ({ capability, scope: "global" }));

async function clientWith(permissions, enrolled = false) {
  const user = await environment.seedUser({ permissions, enrolled });
  const client = environment.client();
  const login = await client.login(user);
  if (login.body.stage === "mfa") {
    expect(
      (
        await client.request("/api/auth/mfa", {
          method: "POST",
          body: { token: await environment.token(user.secret) },
        })
      ).status,
    ).toBe(200);
  }
  return { client, user };
}

beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  ({ client: editor, user: editorUser } = await clientWith(grants("preferences.read", "preferences.update"), true));
});
afterAll(async () => environment?.close());

async function current() {
  const response = await editor.request("/api/preferences");
  expect(response.status).toBe(200);
  return response.body;
}

const save = (client, body, options = {}) => client.request("/api/preferences", { method: "PUT", body, ...options });

test("las preferencias requieren sesión lista y autorización independiente", async () => {
  const anonymous = environment.client();
  expect((await anonymous.request("/api/preferences/effective")).status).toBe(401);
  expect((await anonymous.request("/api/preferences")).status).toBe(401);
  const { client } = await clientWith(grants("rates.read"));
  expect((await client.request("/api/preferences/effective")).body).toEqual({ documentType: "invoices", revision: 1 });
  expect((await client.request("/api/preferences")).status).toBe(403);
  expect((await save(client, { documentType: "delivery-notes", revision: 1 })).status).toBe(403);
  const pending = environment.client();
  await pending.login(await environment.seedUser({ permissions: grants("preferences.update"), enrolled: true }));
  expect((await pending.request("/api/preferences/effective")).status).toBe(403);
  expect((await save(pending, { documentType: "delivery-notes", revision: 1 })).status).toBe(403);
});

test("lectura no concede modificación, y modificar exige también lectura", async () => {
  const { client: reader } = await clientWith(grants("preferences.read"));
  expect((await reader.request("/api/preferences")).status).toBe(200);
  expect((await save(reader, { documentType: "delivery-notes", revision: 1 })).status).toBe(403);
  const { client: writer } = await clientWith(grants("preferences.update"), true);
  expect((await writer.request("/api/preferences")).status).toBe(403);
  expect((await save(writer, { documentType: "delivery-notes", revision: 1 })).status).toBe(403);
  expect((await reader.request("/api/backups")).status).toBe(403);
});

test("guardar valida JSON, CSRF, campos, revisión y tipos sin modificar el estado", async () => {
  const previous = await current();
  expect(
    (await save(editor, { documentType: "delivery-notes", revision: previous.revision }, { csrf: "invalid" })).status,
  ).toBe(403);
  expect((await save(editor, previous, { headers: { "content-type": "text/plain" } })).status).toBe(415);
  for (const body of [
    null,
    {},
    [],
    { documentType: true, revision: 1 },
    { documentType: "other", revision: 1 },
    { documentType: "invoices", revision: "1" },
    { documentType: "invoices", revision: -1 },
    { ...previous, extra: true },
  ]) {
    expect((await save(editor, body)).status).toBe(400);
  }
  expect((await editor.request("/api/preferences?extra=1")).status).toBe(400);
  expect(await current()).toEqual(previous);
});

test("el cambio es persistente, global y auditable sin ampliar permisos de reportes", async () => {
  const previous = await current();
  const response = await save(editor, { documentType: "delivery-notes", revision: previous.revision });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ documentType: "delivery-notes", revision: previous.revision + 1 });
  const { client } = await clientWith(grants("rates.read"));
  expect((await client.request("/api/preferences/effective")).body).toEqual(response.body);
  expect((await client.request("/api/sales/facturas?from=2026-01-01&to=2026-01-31")).status).toBe(403);
  const row = await environment.db("dmmarket_preferences").where("id", 1).first();
  expect(row.document_type).toBe("delivery-notes");
  const events = await environment
    .db("dmmarket_auth_events")
    .where({ action: "preferences.updated", actor_id: editorUser.id });
  expect(events).toHaveLength(1);
  expect(JSON.parse(events[0].reason)).toEqual({ previous: "invoices", next: "delivery-notes" });
  expect((await save(editor, previous)).status).toBe(409);
  expect(await current()).toEqual(response.body);
  const unchanged = await save(editor, response.body);
  expect(unchanged.body).toEqual(response.body);
  expect(await environment.db("dmmarket_auth_events").where("action", "preferences.updated")).toHaveLength(1);
});

test("dos administradores no pueden sobrescribir una revisión concurrente", async () => {
  const { client } = await clientWith(grants("preferences.read", "preferences.update"), true);
  const previous = await current();
  const responses = await Promise.all([
    save(editor, { documentType: "invoices", revision: previous.revision }),
    save(client, { documentType: "invoices", revision: previous.revision }),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  expect((await current()).documentType).toBe("invoices");
});

test("la migración es idempotente, propia y no concede permisos a roles existentes", async () => {
  const migration = backend("./migrations/20261101_add_system_preferences");
  const previous = await current();
  const grantsBefore = await environment
    .db("dmmarket_auth_role_permissions")
    .select()
    .orderBy("role_id")
    .orderBy("capability");
  expect(migration.config.scope).toBe("dmmarket");
  await migration.up(environment.db);
  await migration.up(environment.db);
  expect(await current()).toEqual(previous);
  expect(
    await environment.db("dmmarket_auth_role_permissions").select().orderBy("role_id").orderBy("capability"),
  ).toEqual(grantsBefore);
});

test("modificar exige confirmación reciente de identidad", async () => {
  const states = await environment.db("dmmarket_auth_session_state").where("user_id", editorUser.id).select("sid_hash");
  expect(states.length).toBeGreaterThan(0);
  await environment
    .db("dmmarket_auth_session_state")
    .where("user_id", editorUser.id)
    .update({ password_ms: Date.now() - 301000 });
  const response = await save(editor, { documentType: "delivery-notes", revision: (await current()).revision });
  expect(response.status).toBe(403);
  expect(response.body.error.code).toBe("RECENT_AUTH_REQUIRED");
});
