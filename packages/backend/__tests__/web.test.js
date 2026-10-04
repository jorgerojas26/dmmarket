const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");
const { normalizeConfiguration } = require("../setup-config");
const { normalizeWeb, caddyFile, accessOptions, accessUrls, proxyIdentity } = require("../web-config");
const { webSystemdUnit, webLaunchdPlist, windowsWebCommand, verifiedCaddy } = require("../web-service");

const configuration = {
  DATABASE_HOST: "localhost",
  DATABASE_PORT: "3306",
  DATABASE_USER: "app",
  DATABASE_PASSWORD: "secret",
  DATABASE_NAME: "business",
  HOST: "127.0.0.1",
  PORT: "8000",
  WEB_MODE: "caddy",
  WEB_HOSTNAME: "reportes.solser.internal",
};

afterEach(() => jest.restoreAllMocks());

it("forces the backend to loopback and exposes only port 80", () => {
  const normalized = normalizeConfiguration({
    ...configuration,
    HOST: "0.0.0.0",
    WEB_HOSTNAME: " Reportes.Solser.Internal ",
  });
  expect(normalized.HOST).toBe("127.0.0.1");
  expect(normalized.WEB_HOSTNAME).toBe(configuration.WEB_HOSTNAME);
  expect(accessOptions(normalized)).toEqual({ host: "0.0.0.0", port: 80 });
  expect(accessUrls(normalized, [{ address: "192.168.1.50" }])).toEqual(["http://reportes.solser.internal"]);
  expect(() => normalizeConfiguration({ ...configuration, PORT: "00080" })).toThrow("reservado");
});

it.each([
  "http://reportes.solser.internal",
  "localhost",
  "192.168.1.50",
  "a.local",
  "reportes.internal:80",
  "a.internal/path",
  "a.internal\nadmin off",
  "*.internal",
  "a.{env.HOST}",
  "a..internal",
  "-a.internal",
  `${"a".repeat(64)}.internal`,
])("rejects invalid hostname %s", (hostname) => {
  expect(() => normalizeWeb({ ...configuration, WEB_HOSTNAME: hostname })).toThrow("nombre DNS");
});

it("disables stale proxy settings when selecting direct access", () => {
  expect(normalizeWeb({ WEB_MODE: "direct", WEB_HOSTNAME: "old.internal" })).toEqual({
    WEB_MODE: "direct",
    WEB_HOSTNAME: "",
  });
  expect(() => normalizeWeb({ WEB_MODE: "nginx" })).toThrow();
});

it("generates HTTP-only configuration with no admin listener or credentials", () => {
  const file = caddyFile(configuration, "C:\\ProgramData\\DMMarket-web\\logs\\caddy.log");
  for (const line of [
    "admin off",
    "auto_https off",
    "persist_config off",
    "http://reportes.solser.internal:80",
    "bind 0.0.0.0",
    "reverse_proxy 127.0.0.1:8000",
    "roll_size 10MiB",
    "roll_keep 3",
  ])
    expect(file).toContain(line);
  expect(file).toContain('output file "C:/ProgramData/DMMarket-web/logs/caddy.log"');
  expect(file).toContain(proxyIdentity(configuration));
  expect(file).not.toContain(configuration.DATABASE_PASSWORD);
  expect(() => caddyFile({ ...configuration, HOST: "0.0.0.0" })).toThrow();
});

it("uses only the binding capability on Linux", () => {
  const unit = webSystemdUnit("/var/lib/dmmarket-web");
  for (const line of [
    "User=dmmarket",
    "AmbientCapabilities=CAP_NET_BIND_SERVICE",
    "CapabilityBoundingSet=CAP_NET_BIND_SERVICE",
    "NoNewPrivileges=true",
    "ProtectSystem=strict",
    "Restart=always",
    "WantedBy=multi-user.target",
  ])
    expect(unit).toContain(line);
  expect(unit).not.toContain("User=root");
});

it("generates a boot daemon with escaped paths for macOS", () => {
  const plist = webLaunchdPlist("/Library/Application Support/DM&Market-web");
  expect(plist).toContain("DM&amp;Market-web/Caddyfile");
  expect(plist).toContain("<key>RunAtLoad</key><true/>");
  expect(plist).toContain("<key>KeepAlive</key><true/>");
});

it("quotes both Windows paths including spaces", () => {
  expect(windowsWebCommand("C:\\Program Data\\DMMarket-web")).toBe(
    '"C:\\Program Data\\DMMarket-web\\caddy.exe" run --config "C:\\Program Data\\DMMarket-web\\Caddyfile" --adapter caddyfile',
  );
});

it("rejects missing, unsupported or modified Caddy executables", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caddy-hash-test-"));
  const binary = path.join(dir, "caddy");
  try {
    expect(() => verifiedCaddy(binary, "linux-x64")).toThrow("Falta Caddy");
    fs.writeFileSync(binary, "modified binary");
    expect(() => verifiedCaddy(binary, "linux-x64")).toThrow("verificación");
    expect(() => verifiedCaddy(binary, "freebsd-x64")).toThrow("plataforma");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe.each(["linux", "darwin", "win32"])("proxy lifecycle (%s)", (platform) => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  let dir;
  let source;
  let web;
  let managed;
  let serviceExists;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "DMMarket web test "));
    source = path.join(dir, "source");
    fs.writeFileSync(source, "verified test binary");
    Object.defineProperty(process, "platform", { value: platform });
    managed = false;
    serviceExists = false;
    jest.spyOn(childProcess, "spawnSync").mockImplementation((command, args) => {
      if (command === "sc.exe" && args[0] === "query") return { status: serviceExists ? 0 : 1060, stdout: "" };
      return { status: 0, stdout: "", stderr: "" };
    });
    const readFile = fs.readFileSync;
    jest.spyOn(fs, "readFileSync").mockImplementation((filename, ...args) => {
      if (filename.endsWith("installation.json") && filename !== path.join(dir, "installation.json")) {
        if (managed) return JSON.stringify({ component: "DMMarket-Web" });
        throw new Error("not managed");
      }
      return readFile(filename, ...args);
    });
    const writeFile = fs.writeFileSync;
    jest.spyOn(fs, "writeFileSync").mockImplementation((filename, ...args) => {
      if (filename.startsWith("/etc/") || filename.startsWith("/Library/LaunchDaemons/")) return;
      return writeFile(filename, ...args);
    });
    const remove = fs.rmSync;
    jest.spyOn(fs, "rmSync").mockImplementation((filename, ...args) => {
      if (filename.startsWith("/etc/") || filename.startsWith("/Library/LaunchDaemons/")) return;
      return remove(filename, ...args);
    });
    jest.isolateModules(() => {
      web = require("../web-service");
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(process, "platform", originalPlatform);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("installs owned files and enables boot startup without third-party package managers", () => {
    web.installWeb(configuration, { source, directory: dir });
    expect(fs.readFileSync(path.join(dir, "Caddyfile"), "utf8")).toContain("reverse_proxy 127.0.0.1:8000");
    expect(JSON.parse(fs.readFileSync(path.join(dir, "installation.json"), "utf8")).component).toBe("DMMarket-Web");
    const calls = childProcess.spawnSync.mock.calls;
    if (platform === "linux") {
      expect(calls).toContainEqual(["systemctl", ["enable", "--now", "dmmarket-web.service"], { encoding: "utf8" }]);
      expect(calls).toContainEqual(["chown", ["-R", "root:root", dir], { encoding: "utf8" }]);
    } else if (platform === "darwin") {
      expect(calls).toContainEqual([
        "launchctl",
        ["bootstrap", "system", "/Library/LaunchDaemons/com.dmmarket.web.plist"],
        { encoding: "utf8" },
      ]);
      expect(calls).toContainEqual(["chown", ["-R", "root:wheel", dir], { encoding: "utf8" }]);
    } else {
      expect(calls.some(([cmd, args]) => cmd === "sc.exe" && args.includes("NT AUTHORITY\\LocalService"))).toBe(true);
      expect(calls.some(([cmd, args]) => cmd === "sc.exe" && args[0] === "start")).toBe(true);
      expect(calls.some(([cmd, args]) => cmd === "sc.exe" && args[0] === "failure")).toBe(true);
      expect(calls.some(([cmd, args]) => cmd === "icacls.exe" && args.includes("*S-1-5-19:(OI)(CI)RX"))).toBe(true);
    }
  });

  it("does not stop or remove an unmanaged proxy", () => {
    web.stopWeb();
    web.uninstallWeb();
    expect(childProcess.spawnSync).not.toHaveBeenCalled();
    expect(fs.rmSync).not.toHaveBeenCalled();
  });

  it("unregisters only owned startup definitions and preserves files", () => {
    managed = true;
    serviceExists = true;
    web.uninstallWeb();
    expect(fs.existsSync(source)).toBe(true);
    for (const [filename] of fs.rmSync.mock.calls)
      expect(filename).toMatch(/dmmarket-web.service|com.dmmarket.web.plist/);
    if (platform === "win32")
      expect(childProcess.spawnSync.mock.calls.some(([cmd, args]) => cmd === "sc.exe" && args[0] === "delete")).toBe(
        true,
      );
  });

  it("rejects a pre-existing unmanaged reserved service before executing a binary", () => {
    serviceExists = true;
    const exists = fs.existsSync;
    jest
      .spyOn(fs, "existsSync")
      .mockImplementation(
        (filename) => /dmmarket-web.service|com.dmmarket.web.plist/.test(filename) || exists(filename),
      );
    expect(() => web.prepareWeb(configuration)).toThrow("ajena");
    expect(childProcess.spawnSync.mock.calls.some(([, args]) => args.includes("validate"))).toBe(false);
  });
});
