const request = require("supertest");
const dotenv = require("dotenv");
const { createSetupApp } = require("../setup");
const { normalizeConfiguration, serializeConfiguration, testDatabase } = require("../setup-config");
const { privateNetwork, firewallSettings, checkApplicationPort } = require("../setup-network");
const mysql = require("mysql2/promise");

jest.mock("mysql2/promise", () => ({ createConnection: jest.fn() }));

const token = "a".repeat(64);
const fields = {
  DATABASE_HOST: "localhost",
  DATABASE_PORT: "3306",
  DATABASE_USER: "dmmarket",
  DATABASE_PASSWORD: "private-password",
  DATABASE_NAME: "business",
  HOST: "0.0.0.0",
  PORT: "8000",
  WEB_MODE: "direct",
  WEB_HOSTNAME: "",
};
let app;
let install;
let testConnection;
let firewall;
let ready;
let finish;
let checkPort;

function api(method, route, body) {
  const req = request(app)
    [method](`/api/${route}`)
    .set("Host", "127.0.0.1:8765")
    .set("Authorization", `Bearer ${token}`);
  return body === undefined ? req : req.send(body);
}

beforeEach(() => {
  install = jest.fn();
  testConnection = jest.fn().mockResolvedValue({ ok: true, message: "Connection verified" });
  firewall = jest.fn().mockReturnValue([]);
  ready = jest.fn().mockResolvedValue(true);
  finish = jest.fn();
  checkPort = jest.fn();
  app = createSetupApp({
    token,
    existing: fields,
    installed: true,
    directory: "/test/app",
    addresses: [{ address: "192.168.1.50", network: "192.168.1.50/24" }],
    install,
    testConnection,
    firewall,
    ready,
    finish,
    checkPort,
  });
});

afterEach(() => jest.restoreAllMocks());

describe("setup session security", () => {
  it("serves the wizard but never embeds credentials or the session token", async () => {
    const res = await request(app).get("/").set("Host", "127.0.0.1:8765");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Paso 1 de 6");
    expect(res.text).not.toContain(fields.DATABASE_PASSWORD);
    expect(res.text).not.toContain(token);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  it("serves syntactically valid browser code and fields for both access modes", async () => {
    const { Script } = require("node:vm");
    const javascript = await request(app).get("/setup.js").set("Host", "127.0.0.1:8765");
    expect(() => new Script(javascript.text)).not.toThrow();
    const page = await request(app).get("/").set("Host", "127.0.0.1:8765");
    for (const field of ["WEB_MODE", "WEB_HOSTNAME", "HOST", "PORT", "dns-note"])
      expect(page.text).toContain(`id="${field}"`);
  });

  it("does not disclose a saved password in the configuration response", async () => {
    const res = await api("get", "config");
    expect(res.status).toBe(200);
    expect(res.body.hasSavedPassword).toBe(true);
    expect(res.body.fields).not.toHaveProperty("DATABASE_PASSWORD");
    expect(JSON.stringify(res.body)).not.toContain(fields.DATABASE_PASSWORD);
  });

  it("rejects missing or invalid tokens", async () => {
    for (const authorization of ["", "Bearer invalid"]) {
      const res = await request(app)
        .get("/api/config")
        .set("Host", "127.0.0.1:8765")
        .set("Authorization", authorization);
      expect(res.status).toBe(401);
    }
  });

  it("rejects DNS rebinding and cross-origin requests even with a token", async () => {
    expect((await api("get", "config").set("Host", "evil.example:8765")).status).toBe(403);
    expect((await api("post", "install", fields).set("Origin", "http://evil.example")).status).toBe(403);
    expect(install).not.toHaveBeenCalled();
  });

  it("rejects invalid and oversized JSON without reflecting submitted secrets", async () => {
    const res = await api("post", "test").set("Content-Type", "application/json").send('{"secret":"private-password"');
    expect(res.status).toBe(400);
    expect(res.text).not.toContain("private-password");
    const large = await api("post", "test", { password: "x".repeat(9000) });
    expect(large.status).toBe(413);
  });
});

describe("installation journey", () => {
  const confirmation = { confirm: true, backupConfirmed: true };

  it("requires an explicit confirmation and a successfully tested connection", async () => {
    expect((await api("post", "install", fields)).status).toBe(400);
    expect((await api("post", "install", { ...fields, ...confirmation })).status).toBe(409);
    expect(install).not.toHaveBeenCalled();
  });

  it("can test the saved password without sending it to the browser", async () => {
    const res = await api("post", "test", { ...fields, DATABASE_PASSWORD: "", useSavedPassword: true });
    expect(res.status).toBe(200);
    expect(testConnection).toHaveBeenCalledWith(fields);
    expect(res.text).not.toContain(fields.DATABASE_PASSWORD);
  });

  it("does not allow installing credentials that changed after the connection test", async () => {
    await api("post", "test", fields);
    const res = await api("post", "install", { ...fields, DATABASE_NAME: "another", ...confirmation });
    expect(res.status).toBe(409);
    expect(install).not.toHaveBeenCalled();
  });

  it("does not install after a failed database test", async () => {
    testConnection.mockResolvedValue({ ok: false, message: "Unable to connect" });
    expect((await api("post", "test", fields)).status).toBe(422);
    expect((await api("post", "install", { ...fields, ...confirmation })).status).toBe(409);
  });

  it("installs once and reports actual service availability separately", async () => {
    await api("post", "test", fields);
    const res = await api("post", "install", { ...fields, ...confirmation, PORT: "8123" });
    expect(res.status).toBe(200);
    expect(install).toHaveBeenCalledWith({ ...fields, PORT: "8123" });
    expect(firewall).not.toHaveBeenCalled();
    const status = await api("get", "status");
    expect(status.body.ready).toBe(true);
    expect(status.body.urls).toEqual(["http://192.168.1.50:8123"]);
    expect((await api("post", "install", { ...fields, ...confirmation })).status).toBe(409);
    expect(install).toHaveBeenCalledTimes(1);
    const refresh = await api("get", "config");
    expect(refresh.body.completed).toBe(true);
    expect(refresh.body.fields.PORT).toBe("8123");
    expect(refresh.text).not.toContain(fields.DATABASE_PASSWORD);
  });

  it("installs the base service without a domain or firewall authorization", async () => {
    const base = { ...fields };
    delete base.WEB_MODE;
    delete base.WEB_HOSTNAME;
    await api("post", "test", base);
    expect((await api("post", "install", { ...base, ...confirmation })).status).toBe(200);
    expect(install).toHaveBeenCalledWith(fields);
    expect(firewall).not.toHaveBeenCalled();
    const status = await api("get", "status");
    expect(status.body.ready).toBe(true);
    expect(status.body.urls).toEqual(["http://192.168.1.50:8000"]);
    expect(status.body.dnsRecords).toEqual([]);
    expect(status.body.warnings).toEqual([]);
  });

  it("installs named HTTP access while keeping DNS configuration explicitly external", async () => {
    await api("post", "test", fields);
    const res = await api("post", "install", {
      ...fields,
      ...confirmation,
      WEB_MODE: "caddy",
      WEB_HOSTNAME: "reportes.solser.internal",
      allowFirewall: process.platform !== "darwin",
      network: "192.168.1.0/24",
    });
    expect(res.status).toBe(200);
    expect(install).toHaveBeenCalledWith({
      ...fields,
      HOST: "127.0.0.1",
      WEB_MODE: "caddy",
      WEB_HOSTNAME: "reportes.solser.internal",
    });
    const status = await api("get", "status");
    expect(status.body.urls).toEqual(["http://reportes.solser.internal"]);
    expect(status.body.localOnly).toBe(false);
    expect(status.body.dnsRecords).toEqual([{ name: "reportes.solser.internal", type: "A", address: "192.168.1.50" }]);
    expect(status.body.warnings.join(" ")).toContain("no configura ni comprueba el DNS");
    expect(ready).toHaveBeenCalledWith(expect.objectContaining({ WEB_MODE: "caddy" }));
    expect((await api("get", "config")).body.fields.WEB_MODE).toBe("caddy");
  });

  it("reports a registered service as not ready if the application cannot start", async () => {
    await api("post", "test", fields);
    await api("post", "install", { ...fields, ...confirmation });
    ready.mockResolvedValue(false);
    const res = await api("get", "status");
    expect(res.body.ready).toBe(false);
    expect(res.body.diagnostic).toBeTruthy();
  });

  it("blocks a conflicting port before changing files or registering the service", async () => {
    await api("post", "test", fields);
    checkPort.mockRejectedValue(new Error("Port busy"));
    expect((await api("post", "install", { ...fields, ...confirmation })).status).toBe(400);
    expect(install).not.toHaveBeenCalled();
  });

  it("does not confuse the wizard port with the application port", async () => {
    await api("post", "test", fields);
    expect((await api("post", "install", { ...fields, PORT: "8765", ...confirmation })).status).toBe(400);
    expect(install).not.toHaveBeenCalled();
  });

  it.each(["linux", "win32"])(
    "keeps an installed service if explicitly requested firewall configuration fails (%s)",
    async (platform) => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
      Object.defineProperty(process, "platform", { value: platform });
      try {
        await api("post", "test", fields);
        firewall.mockImplementation(() => {
          throw new Error("Firewall unavailable");
        });
        expect(
          (await api("post", "install", { ...fields, ...confirmation, allowFirewall: true, network: "192.168.1.0/24" }))
            .status,
        ).toBe(200);
        expect((await api("get", "status")).body.warnings).toHaveLength(1);
      } finally {
        Object.defineProperty(process, "platform", originalPlatform);
      }
    },
  );

  it("closes the setup session without installing when cancelled", async () => {
    expect((await api("post", "finish", {})).status).toBe(200);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(install).not.toHaveBeenCalled();
    expect((await api("post", "install", { ...fields, ...confirmation })).status).toBe(410);
  });

  it("prevents two simultaneous installs or cancellation during an install", async () => {
    await api("post", "test", fields);
    let release;
    let started;
    const installationStarted = new Promise((resolve) => {
      started = resolve;
    });
    install.mockImplementation(() => {
      started();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const pending = api("post", "install", { ...fields, ...confirmation }).then((res) => res);
    await installationStarted;
    expect((await api("post", "install", { ...fields, ...confirmation })).status).toBe(409);
    expect((await api("post", "finish", {})).status).toBe(409);
    release();
    expect((await pending).status).toBe(200);
    expect(install).toHaveBeenCalledTimes(1);
  });
});

describe("configuration persistence", () => {
  it("round-trips passwords with quotes, spaces, hash marks and literal backslashes", () => {
    const values = { ...fields, DATABASE_PASSWORD: "  'quoted' \"double\" # $ \\n  " };
    expect(dotenv.parse(serializeConfiguration(values))).toEqual(values);
  });

  it.each(["DATABASE_PASSWORD", "DATABASE_HOST", "DATABASE_NAME"])("rejects newline injection in %s", (field) => {
    expect(() => normalizeConfiguration({ ...fields, [field]: "value\nPORT=1" })).toThrow();
  });

  it.each(["0", "-1", "65536", "33.5", "xyz"])("rejects invalid MySQL port %s", (port) => {
    expect(() => normalizeConfiguration({ ...fields, DATABASE_PORT: port })).toThrow();
  });
});

describe("LAN firewall scope", () => {
  it.each(["192.168.1.0/24", "192.168.1.50/24", "10.0.0.0/8", "172.16.0.0/12"])(
    "allows private network %s",
    (network) => {
      expect(privateNetwork(network)).toBe(true);
    },
  );
  it.each(["0.0.0.0/0", "8.8.8.0/24", "172.0.0.0/8", "192.168.0.0/8", "192.168.1.0/24'; evil", "192.168.1.0/33"])(
    "rejects public or invalid scope %s",
    (network) => {
      expect(privateNetwork(network)).toBe(false);
      expect(() => firewallSettings({ allowFirewall: true, network }, fields, "linux")).toThrow();
    },
  );
  it("does not open ports for local-only access", () => {
    expect(() =>
      firewallSettings({ allowFirewall: true, network: "192.168.1.0/24" }, { ...fields, HOST: "127.0.0.1" }, "linux"),
    ).toThrow();
  });

  it("detects a real occupied port", async () => {
    const server = require("node:net").createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      await expect(
        checkApplicationPort({ ...fields, HOST: "127.0.0.1", PORT: String(server.address().port) }),
      ).rejects.toThrow("ocupado");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("MySQL read-only checks", () => {
  it("checks the business tables without applying migrations or writing data", async () => {
    const execute = jest.fn().mockResolvedValue([
      ["clientes", "productos", "proveedores", "masterfact", "slavefact", "mastercomp", "slavecomp"].map((name) => ({
        name,
      })),
    ]);
    const end = jest.fn().mockResolvedValue();
    mysql.createConnection.mockResolvedValue({ execute, end });
    expect((await testDatabase(fields)).ok).toBe(true);
    expect(execute.mock.calls[0][0].sql).toMatch(/^SELECT /);
    expect(end).toHaveBeenCalled();
  });

  it("rejects an empty or incompatible schema", async () => {
    mysql.createConnection.mockResolvedValue({ execute: jest.fn().mockResolvedValue([[]]), end: jest.fn() });
    expect((await testDatabase(fields)).ok).toBe(false);
  });

  it("does not reflect passwords in database errors", async () => {
    mysql.createConnection.mockRejectedValue(
      Object.assign(new Error("private-password"), { code: "ER_ACCESS_DENIED_ERROR" }),
    );
    const result = await testDatabase(fields);
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain(fields.DATABASE_PASSWORD);
  });
});
