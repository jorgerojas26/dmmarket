const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { systemdUnit, launchdPlist, windowsRunner, serviceDirectory } = require("../service");
const { replaceServiceBinary } = require("../controllers/update");

describe("service definitions", () => {
  it("starts systemd at boot as an unprivileged user and retries even clean exits", () => {
    const unit = systemdUnit("/var/lib/dmmarket");
    for (const line of [
      "User=dmmarket",
      "Group=dmmarket",
      "WorkingDirectory=/var/lib/dmmarket",
      "ExecStart=/var/lib/dmmarket/dmmarket-app",
      "Environment=DMMARKET_SERVICE=1",
      "Restart=always",
      "RestartSec=5",
      "StartLimitIntervalSec=0",
      "WantedBy=multi-user.target",
    ])
      expect(unit).toContain(line);
  });

  it("uses a launch daemon with no login requirement and escaped paths", () => {
    const plist = launchdPlist("/Library/Application Support/DM&Market", "user<name");
    expect(plist).toContain("<key>RunAtLoad</key><true/>");
    expect(plist).toContain("<key>KeepAlive</key><true/>");
    expect(plist).toContain("<key>DMMARKET_SERVICE</key><string>1</string>");
    expect(plist).toContain("DM&amp;Market/dmmarket-app");
    expect(plist).toContain("user&lt;name");
  });

  it("supervises Windows exits including updates with safely quoted paths", () => {
    const runner = windowsRunner("C:\\ProgramData\\DM'Market");
    expect(runner).toContain("Set-Location -LiteralPath 'C:\\ProgramData\\DM''Market'");
    expect(runner).toContain("$env:DMMARKET_SERVICE = '1'");
    expect(runner).toContain("while ($true)");
    expect(runner).toContain("Start-Sleep -Seconds 5");
    expect(runner).toContain("dmmarket-app.exe");
  });

  it("provides permanent directories for every supported platform", () => {
    expect(serviceDirectory("linux")).toBe("/var/lib/dmmarket");
    expect(serviceDirectory("darwin")).toBe("/Library/Application Support/DMMarket");
    expect(serviceDirectory("win32")).toMatch(/DMMarket$/);
    expect(() => serviceDirectory("freebsd")).toThrow();
  });
});

describe.each(["linux", "darwin", "win32"])("service binary replacement (%s)", (platform) => {
  let dir;
  let binary;
  let staged;
  let old;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dmmarket-service-test-"));
    binary = path.join(dir, platform === "win32" ? "app.exe" : "app");
    staged = path.join(dir, "new");
    old = platform === "win32" ? path.join(dir, "app.old.exe") : `${binary}.old`;
    fs.writeFileSync(binary, "old version");
    fs.writeFileSync(staged, "new version");
  });
  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("replaces before process exit without launching another process", () => {
    replaceServiceBinary(binary, staged, platform);
    expect(fs.readFileSync(binary, "utf8")).toBe("new version");
    expect(fs.readFileSync(old, "utf8")).toBe("old version");
    expect(fs.existsSync(staged)).toBe(false);
    if (platform !== "win32") expect(fs.statSync(binary).mode & 0o777).toBe(0o755);
  });

  it("restores the original binary when placing the replacement fails", () => {
    const rename = fs.renameSync;
    jest.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (source === staged) throw new Error("replacement failed");
      return rename(source, destination);
    });
    expect(() => replaceServiceBinary(binary, staged, platform)).toThrow("replacement failed");
    expect(fs.readFileSync(binary, "utf8")).toBe("old version");
    expect(fs.existsSync(staged)).toBe(true);
  });

  it("does not move the running binary if the staged file is missing", () => {
    fs.rmSync(staged);
    expect(() => replaceServiceBinary(binary, staged, platform)).toThrow();
    expect(fs.readFileSync(binary, "utf8")).toBe("old version");
  });
});

describe.each(["linux", "darwin", "win32"])("service installation (%s)", (platform) => {
  const childProcess = require("node:child_process");
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  let install;
  let uninstall;
  let originalUser;

  beforeEach(() => {
    originalUser = process.env.SUDO_USER;
    process.env.SUDO_USER = "operator";
    Object.defineProperty(process, "platform", { value: platform });
    jest.spyOn(process, "getuid").mockReturnValue(0);
    jest.spyOn(childProcess, "spawnSync").mockReturnValue({ status: 0, stdout: "", stderr: "" });
    for (const method of ["mkdirSync", "copyFileSync", "writeFileSync", "chmodSync", "rmSync"]) {
      jest.spyOn(fs, method).mockImplementation(() => {});
    }
    const exists = fs.existsSync;
    jest.spyOn(fs, "existsSync").mockImplementation((filename) => {
      const name = path.basename(String(filename));
      if ([".env", "dmmarket.service", "com.dmmarket.server.plist"].includes(name)) return true;
      return exists(filename);
    });
    const readFile = fs.readFileSync;
    jest.spyOn(fs, "readFileSync").mockImplementation((filename, ...args) => {
      if (path.basename(String(filename)) === ".env") return Buffer.from("DATABASE_PASSWORD=old-password\n");
      return readFile(filename, ...args);
    });
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.isolateModules(() => {
      const service = require("../service");
      install = service.installService;
      uninstall = service.uninstallService;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(process, "platform", originalPlatform);
    if (originalUser === undefined) delete process.env.SUDO_USER;
    else process.env.SUDO_USER = originalUser;
  });

  it("copies the executable, preserves existing credentials, and enables startup", () => {
    install();
    expect(fs.copyFileSync).toHaveBeenCalledTimes(1);
    expect(fs.copyFileSync.mock.calls[0][0]).toBe(process.execPath);
    const calls = childProcess.spawnSync.mock.calls;
    expect(
      calls.some(([, args]) => args.some((arg) => /dmmarket-web|com\.dmmarket\.web|DMMarket-Web|caddy/.test(arg))),
    ).toBe(false);
    if (platform === "linux") {
      expect(calls).toContainEqual(["systemctl", ["enable", "--now", "dmmarket.service"], { encoding: "utf8" }]);
      expect(calls).toContainEqual(["chown", ["-R", "dmmarket:dmmarket", "/var/lib/dmmarket"], { encoding: "utf8" }]);
    } else if (platform === "darwin") {
      expect(calls).toContainEqual([
        "launchctl",
        ["bootstrap", "system", "/Library/LaunchDaemons/com.dmmarket.server.plist"],
        { encoding: "utf8" },
      ]);
    } else {
      const registration = calls
        .find((call) => call[1].some((arg) => arg.includes("Register-ScheduledTask")))[1]
        .join(" ");
      expect(registration).toContain("New-ScheduledTaskTrigger -AtStartup");
      expect(registration).toContain("-UserId 'S-1-5-19' -LogonType ServiceAccount");
      expect(registration).toContain("-ExecutionTimeLimit ([TimeSpan]::Zero)");
      expect(registration).toContain("-MultipleInstances IgnoreNew");
      expect(calls.some((call) => call[0] === "icacls.exe")).toBe(true);
    }
  });

  it("writes confirmed wizard configuration atomically and preserves unrelated values", () => {
    const readFile = fs.readFileSync;
    jest.spyOn(fs, "readFileSync").mockImplementation((filename, ...args) => {
      if (path.basename(String(filename)) === ".env") {
        return Buffer.from("DATABASE_PASSWORD=old-password\nEXTRA_SETTING=keep-me\n");
      }
      return readFile(filename, ...args);
    });
    jest.spyOn(fs, "renameSync").mockImplementation(() => {});
    const configuration = {
      DATABASE_HOST: "mysql.local",
      DATABASE_PORT: "3306",
      DATABASE_USER: "app",
      DATABASE_PASSWORD: "new-password",
      DATABASE_NAME: "business",
      HOST: "0.0.0.0",
      PORT: "8123",
    };
    install({ configuration });
    const write = fs.writeFileSync.mock.calls.find(([filename]) => filename.includes(".env.setup-"));
    expect(write[2]).toEqual({ mode: 0o600 });
    expect(require("dotenv").parse(write[1])).toEqual({ ...configuration, EXTRA_SETTING: "keep-me" });
    expect(fs.renameSync).toHaveBeenCalledWith(write[0], expect.stringMatching(/\.env$/));
    expect(fs.copyFileSync).toHaveBeenCalledTimes(1);
  });

  it("does not stop the current application when proxy preflight fails", () => {
    expect(() =>
      install({
        configuration: { HOST: "127.0.0.1", PORT: "8000", WEB_MODE: "caddy", WEB_HOSTNAME: "reportes.solser.internal" },
      }),
    ).toThrow();
    expect(fs.copyFileSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(
      childProcess.spawnSync.mock.calls.some(([command, args]) => command === "systemctl" && args[0] === "stop"),
    ).toBe(false);
    expect(
      childProcess.spawnSync.mock.calls.some(([, args]) => args.some((arg) => arg.includes("Stop-ScheduledTask"))),
    ).toBe(false);
  });

  it("rejects missing configuration before copying or starting the application", () => {
    fs.existsSync.mockReturnValue(false);
    expect(install).toThrow(".env");
    expect(fs.copyFileSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("unregisters startup without deleting the application directory or .env", () => {
    uninstall();
    for (const [filename] of fs.rmSync.mock.calls) {
      expect(filename).not.toContain(".env");
      expect(filename).toMatch(/(dmmarket.service|com.dmmarket.server.plist)$/);
    }
  });
});
