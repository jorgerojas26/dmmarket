const net = require("node:net");
const { EventEmitter } = require("node:events");
const childProcess = require("node:child_process");
const { proxyIdentity } = require("../web-config");
const { managedWeb } = require("../web-service");
const { accessReady, checkApplicationPort, firewallSettings } = require("../setup-network");

jest.mock("../web-service", () => ({ managedWeb: jest.fn() }));

const configuration = { HOST: "127.0.0.1", PORT: "8000", WEB_MODE: "caddy", WEB_HOSTNAME: "reportes.solser.internal" };

beforeEach(() => {
  managedWeb.mockReturnValue(true);
  jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    headers: new Headers({ "X-DMMarket-Web": proxyIdentity(configuration) }),
    json: async () => ({ service: true }),
  });
});

afterEach(() => jest.restoreAllMocks());

function occupiedPorts(ports) {
  jest.spyOn(net, "createServer").mockImplementation(() => {
    const server = new EventEmitter();
    server.listen = (port, _host, callback) => {
      queueMicrotask(() => {
        if (ports.includes(port)) server.emit("error", Object.assign(new Error("busy"), { code: "EADDRINUSE" }));
        else callback();
      });
    };
    server.close = (callback) => callback();
    return server;
  });
}

it("checks availability through Caddy using the chosen hostname, not network DNS", async () => {
  expect(await accessReady(configuration)).toBe(true);
  expect(fetch).toHaveBeenCalledWith(
    "http://127.0.0.1:80/api/update/status",
    expect.objectContaining({ headers: { Host: configuration.WEB_HOSTNAME } }),
  );
});

it.each([
  { ok: false, service: true, identity: true },
  { ok: true, service: false, identity: true },
  { ok: true, service: true, identity: false },
])("does not report a foreign or unhealthy HTTP server as ready (%j)", async ({ ok, service, identity }) => {
  fetch.mockResolvedValue({
    ok,
    headers: new Headers(identity ? { "X-DMMarket-Web": proxyIdentity(configuration) } : {}),
    json: async () => ({ service }),
  });
  expect(await accessReady(configuration)).toBe(false);
});

it("keeps direct readiness checks unchanged", async () => {
  expect(await accessReady({ ...configuration, WEB_MODE: "direct" })).toBe(true);
  expect(fetch.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/update/status");
});

it("allows an unoccupied internal port and web port", async () => {
  occupiedPorts([]);
  await expect(checkApplicationPort(configuration)).resolves.toBeUndefined();
  expect(net.createServer).toHaveBeenCalledTimes(2);
});

it("does not inspect or require the web port for the base service", async () => {
  occupiedPorts([80]);
  await expect(
    checkApplicationPort({ ...configuration, HOST: "0.0.0.0", WEB_MODE: "direct", WEB_HOSTNAME: "" }),
  ).resolves.toBeUndefined();
  expect(net.createServer).toHaveBeenCalledTimes(1);
});

it("rejects a web-port conflict before installation", async () => {
  occupiedPorts([80]);
  await expect(checkApplicationPort(configuration)).rejects.toThrow("puerto 80");
});

it("allows reinstalling our own healthy proxy, including changing its hostname", async () => {
  occupiedPorts([80, 8000]);
  await expect(
    checkApplicationPort({ ...configuration, WEB_HOSTNAME: "nuevo.solser.internal" }, configuration, true),
  ).resolves.toBeUndefined();
  expect(fetch.mock.calls[1][1].headers.Host).toBe(configuration.WEB_HOSTNAME);
});

it("allows repairing our proxy when its upstream is down, without falsely reporting readiness", async () => {
  occupiedPorts([80]);
  fetch.mockResolvedValue({
    ok: false,
    headers: new Headers({ "X-DMMarket-Web": proxyIdentity(configuration) }),
    json: async () => ({}),
  });
  await expect(checkApplicationPort(configuration, configuration, true)).resolves.toBeUndefined();
  expect(await accessReady(configuration)).toBe(false);
});

it("does not reuse an unmanaged reserved proxy even if HTTP appears healthy", async () => {
  occupiedPorts([80]);
  managedWeb.mockReturnValue(false);
  await expect(checkApplicationPort(configuration, configuration, true)).rejects.toThrow("puerto 80");
});

it("rejects an internal-port conflict before probing the web port", async () => {
  occupiedPorts([8000]);
  await expect(checkApplicationPort(configuration)).rejects.toThrow("puerto 8000");
  expect(net.createServer).toHaveBeenCalledTimes(1);
});

it("scopes proxy firewall settings to the web port, despite the loopback backend", () => {
  expect(firewallSettings({ allowFirewall: true, network: "192.168.1.0/24" }, configuration, "linux")).toEqual({
    enabled: true,
    network: "192.168.1.0/24",
  });
});

it.each(["linux", "win32"])("opens only TCP 80 on %s", (platform) => {
  jest.spyOn(childProcess, "spawnSync").mockReturnValue({ status: 0 });
  let configure;
  jest.isolateModules(() => {
    configure = require("../setup-network").configureFirewall;
  });
  configure({ enabled: true, network: "192.168.1.0/24" }, configuration, platform);
  const [, args] = childProcess.spawnSync.mock.calls[0];
  if (platform === "linux")
    expect(args).toEqual(["allow", "from", "192.168.1.0/24", "to", "any", "port", "80", "proto", "tcp"]);
  else {
    expect(args.join(" ")).toContain("-LocalPort 80");
    expect(args.join(" ")).toContain("-Profile Private,Domain");
    expect(args.join(" ")).toContain("-RemoteAddress '192.168.1.0/24'");
  }
  expect(args.join(" ")).not.toContain("8000");
});
