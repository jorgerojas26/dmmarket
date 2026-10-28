const { startEnvironment, backend, until } = require("../../../tests/support/auth-environment.cjs");
const express = backend("express");
const request = backend("supertest");
const { authErrorHandler } = backend("./auth/http-security");
let environment;

beforeAll(async () => {
  environment = await startEnvironment({ web: true });
});
afterAll(async () => {
  await environment?.close();
});

test("un error MySQL real deja diagnóstico técnico sin exponer la consulta ni credenciales", async () => {
  const client = environment.client();
  await client.login(await environment.seedUser());
  let output = "";
  const collect = (chunk) => {
    output += chunk.toString();
  };
  environment.server.stderr.on("data", collect);
  await environment.db.schema.renameTable("divisas", "unavailable_rates");
  try {
    const response = await client.request("/api/currency_rates?token=PRIVATE_QUERY_7", {
      headers: { authorization: "Bearer PRIVATE_HEADER_7" },
      cookie: `${client.jar.cookie}; diagnostics=PRIVATE_COOKIE_7`,
    });
    expect(response.status).toBe(503);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.text).not.toMatch(/SELECT|divisas|dmmarket_test_/i);
    const record = await until(() => {
      for (const line of output.split("\n")) {
        try {
          const value = JSON.parse(line);
          if (value.event === "api.request_failed") return value;
        } catch {}
      }
      return false;
    }, 1000);
    expect(record).toMatchObject({
      event: "api.request_failed",
      method: "GET",
      route: "/currency_rates",
      status: 503,
      error: { type: "Error", code: "ER_NO_SUCH_TABLE", errno: 1146 },
    });
    expect(output).not.toMatch(/PRIVATE_QUERY_7|PRIVATE_HEADER_7|PRIVATE_COOKIE_7|SELECT|unavailable_rates/);
  } finally {
    await environment.db.schema.renameTable("unavailable_rates", "divisas");
    environment.server.stderr.removeListener("data", collect);
  }
});

test.each([
  ["TypeError", "ER_BAD_FIELD_ERROR", 1054, { type: "TypeError", code: "ER_BAD_FIELD_ERROR", errno: 1054 }],
  ["PRIVATE_NAME_7", "ER_PRIVATE\nPRIVATE_CODE_7", "PRIVATE_ERRNO_7", { type: "Error" }],
])("la cadena HTTP registra solo metadatos permitidos: %s", async (name, code, errno, expected) => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  const failure = Object.assign(new TypeError("SELECT password FROM PRIVATE_SQL_7"), {
    name,
    code,
    errno,
    sql: "PRIVATE_SQL_7",
    sqlMessage: "PRIVATE_SQL_MESSAGE_7",
  });
  const app = express();
  app.post("/diagnostics/:id", express.json(), (_req, _res, next) => next(failure));
  app.use(authErrorHandler);
  try {
    const response = await request(app)
      .post("/diagnostics/PRIVATE_PATH_7?token=PRIVATE_QUERY_7")
      .set("Authorization", "Bearer PRIVATE_HEADER_7")
      .set("Cookie", "token=PRIVATE_COOKIE_7")
      .send({ password: "PRIVATE_BODY_7" });
    expect(response.status).toBe(503);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(log).toHaveBeenCalledTimes(1);
    const serialized = log.mock.calls[0][0];
    expect(JSON.parse(serialized)).toEqual({
      event: "api.request_failed",
      method: "POST",
      route: "/diagnostics/:id",
      status: 503,
      error: expected,
    });
    expect(serialized).not.toContain("PRIVATE_");
    expect(response.text).not.toContain("PRIVATE_");
  } finally {
    log.mockRestore();
  }
});

test("las denegaciones y estados esperados no generan fallos técnicos ni pierden la reautenticación", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  const app = express();
  app.get("/expected/:status", (req, _res, next) =>
    next(
      Object.assign(new Error("PRIVATE_EXPECTED_7"), {
        status: Number(req.params.status),
        code: "RECENT_AUTH_REQUIRED",
      }),
    ),
  );
  app.use(authErrorHandler);
  try {
    for (const status of [400, 401, 403, 404, 409, 413, 415, 429, 503]) {
      const response = await request(app).get(`/expected/${status}`);
      expect(response.status).toBe(status);
      expect(response.text).not.toContain("PRIVATE_");
      if (status === 403) expect(response.body.error.code).toBe("RECENT_AUTH_REQUIRED");
    }
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});
