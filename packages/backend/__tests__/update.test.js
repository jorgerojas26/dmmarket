const request = require("supertest");
const app = require("../index");
const { ASSETS_BY_PLATFORM, buildUpdateSh } = require("../controllers/update");

const GITHUB_RELEASE = (tagName) => ({
  tag_name: tagName,
  name: `DMMarket ${tagName}`,
  body: "Notas de la release",
  published_at: "2026-08-09T00:00:00Z",
  assets: [
    { name: "dmmarket-app.exe", browser_download_url: "https://github.com/x/dmmarket-app.exe" },
    { name: "dmmarket-app.exe.sha256", browser_download_url: "https://github.com/x/dmmarket-app.exe.sha256" },
    { name: "dmmarket-app-mac", browser_download_url: "https://github.com/x/dmmarket-app-mac" },
    { name: "dmmarket-app-mac.sha256", browser_download_url: "https://github.com/x/dmmarket-app-mac.sha256" },
    { name: "dmmarket-app-linux", browser_download_url: "https://github.com/x/dmmarket-app-linux" },
    { name: "dmmarket-app-linux.sha256", browser_download_url: "https://github.com/x/dmmarket-app-linux.sha256" },
  ],
});

describe("GET /api/update/status", () => {
  it("responde 200 con currentVersion, platform y standalone", async () => {
    const res = await request(app).get("/api/update/status");
    expect(res.status).toBe(200);
    expect(res.body.currentVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(res.body.platform).toBe(process.platform);
    expect(res.body.standalone).toBe(false);
  });
});

describe.each(["win32", "darwin", "linux"])("POST /api/update/check (%s)", (platform) => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  const platformAssets = ASSETS_BY_PLATFORM[platform];

  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: platform });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", originalPlatform);
    jest.restoreAllMocks();
  });

  it("responde updateAvailable true con release más nueva (comparación semver)", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue({ ok: true, status: 200, json: async () => GITHUB_RELEASE("v99.0.0") });
    const res = await request(app).post("/api/update/check");
    expect(res.status).toBe(200);
    expect(res.body.updateAvailable).toBe(true);
    expect(res.body.latestVersion).toBe("99.0.0");
    expect(res.body.notes).toBe("Notas de la release");
    expect(res.body.assetUrl).toBe(`https://github.com/x/${platformAssets.binary}`);
    expect(res.body.sha256AssetUrl).toBe(`https://github.com/x/${platformAssets.sha}`);
  });

  it("responde updateAvailable false con release igual o menor a la actual", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue({ ok: true, status: 200, json: async () => GITHUB_RELEASE("v1.0.0") });
    const res = await request(app).post("/api/update/check");
    expect(res.status).toBe(200);
    expect(res.body.updateAvailable).toBe(false);
    expect(res.body.latestVersion).toBe("1.0.0");
  });

  it("sin release en GitHub responde 404", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 404, text: async () => "" });
    const res = await request(app).post("/api/update/check");
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("No hay nuevas actualizaciones");
  });

  it("error de red responde 502 (no 500 genérico)", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));
    const res = await request(app).post("/api/update/check");
    expect(res.status).toBe(502);
    expect(res.body.error.message).toBe("No se pudo contactar al servidor. Revisá tu conexión a internet.");
  });

  it("release sin los assets del contrato responde error", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: "v2.0.0", body: "", assets: [{ name: "otro.bin", browser_download_url: "x" }] }),
    });
    const res = await request(app).post("/api/update/check");
    expect(res.status).toBe(502);
    expect(res.body.error.message).toBe("Release inválida. Por favor contacte a su administrador");
  });
});

describe("endpoints de update que tocan disco/procesos en dev (no compilado)", () => {
  it("POST /api/update/download responde 400 (solo binario)", async () => {
    const res = await request(app).post("/api/update/download").send({ assetUrl: "x", sha256AssetUrl: "y" });
    expect(res.status).toBe(400);
  });

  it("POST /api/update/apply responde 400 sin escribir update.bat ni salir del proceso", async () => {
    const res = await request(app).post("/api/update/apply");
    expect(res.status).toBe(400);
    expect(require("node:fs").existsSync(require("node:path").join(process.cwd(), "update.bat"))).toBe(false);
  });

  it("GET /api/update/progress responde 200 con estado en ceros", async () => {
    const res = await request(app).get("/api/update/progress");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ active: false, bytes: 0, total: 0 });
  });
});

describe("buildUpdateSh (macOS/Linux)", () => {
  it("genera la secuencia de reemplazo y relanzamiento del binario", () => {
    const sh = buildUpdateSh("/app/dmmarket-app", "/app/.dmmarket-update/new-app");
    expect(sh.startsWith("#!/bin/sh")).toBe(true);
    expect(sh).toContain('mv -f "/app/dmmarket-app" "/app/dmmarket-app.old"');
    expect(sh).toContain('mv -f "/app/.dmmarket-update/new-app" "/app/dmmarket-app"');
    expect(sh).toContain('chmod +x "/app/dmmarket-app"');
    expect(sh).toContain('nohup "/app/dmmarket-app" >/dev/null 2>&1 &');
    expect(sh).toContain('rm -f "/app/dmmarket-app.old"');
    expect(sh.endsWith("exit 0")).toBe(true);
  });

  it("incluye un sleep para dejar morir el proceso viejo", () => {
    const sh = buildUpdateSh("/app/dm", "/tmp/new");
    expect(sh).toContain("sleep 3");
  });
});

describe.each(["darwin", "linux"])("POST_APPLY standalone (%s)", (platform) => {
  const fs = require("node:fs");
  const path = require("node:path");
  const childProcess = require("node:child_process");
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  let apply;
  let unref;

  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: platform });
    const originalBun = global.Bun;
    global.Bun = { embeddedFiles: [{}] };
    try {
      jest.isolateModules(() => {
        apply = require("../controllers/update").POST_APPLY;
      });
    } finally {
      if (originalBun === undefined) delete global.Bun;
      else global.Bun = originalBun;
    }
    jest.useFakeTimers();
    jest.spyOn(fs, "existsSync").mockReturnValue(true);
    jest.spyOn(fs, "writeFileSync").mockImplementation(() => {});
    jest.spyOn(fs, "chmodSync").mockImplementation(() => {});
    unref = jest.fn();
    jest.spyOn(childProcess, "spawn").mockReturnValue({ unref });
    jest.spyOn(process, "exit").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    Object.defineProperty(process, "platform", originalPlatform);
  });

  it("aplica el binario verificado usando /bin/sh y reinicia después de responder", () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const shPath = path.join(process.cwd(), "update.sh");
    const newBinary = path.join(process.cwd(), ".dmmarket-update", "new-app");

    apply({}, res);

    expect(fs.existsSync).toHaveBeenCalledWith(newBinary);
    expect(fs.writeFileSync).toHaveBeenCalledWith(shPath, buildUpdateSh(process.execPath, newBinary));
    expect(fs.chmodSync).toHaveBeenCalledWith(shPath, 0o755);
    expect(childProcess.spawn).toHaveBeenCalledWith("/bin/sh", [shPath], { detached: true, stdio: "ignore" });
    expect(unref).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(process.exit).not.toHaveBeenCalled();
    jest.advanceTimersByTime(500);
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("rechaza aplicar cuando no hay un binario descargado", () => {
    fs.existsSync.mockReturnValue(false);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    apply({}, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(childProcess.spawn).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });
});

describe.each(["linux", "darwin", "win32"])("POST_APPLY supervised service (%s)", (platform) => {
  const fs = require("node:fs");
  const childProcess = require("node:child_process");
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  let originalService;
  let apply;

  beforeEach(() => {
    originalService = process.env.DMMARKET_SERVICE;
    process.env.DMMARKET_SERVICE = "1";
    Object.defineProperty(process, "platform", { value: platform });
    const originalBun = global.Bun;
    global.Bun = { embeddedFiles: [{}] };
    try {
      jest.isolateModules(() => {
        apply = require("../controllers/update").POST_APPLY;
      });
    } finally {
      if (originalBun === undefined) delete global.Bun;
      else global.Bun = originalBun;
    }
    jest.useFakeTimers();
    jest.spyOn(fs, "existsSync").mockReturnValue(true);
    for (const method of ["renameSync", "chmodSync", "rmSync"]) {
      jest.spyOn(fs, method).mockImplementation(() => {});
    }
    jest.spyOn(childProcess, "spawn").mockImplementation(() => {
      throw new Error("Unexpected relaunch");
    });
    jest.spyOn(process, "exit").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    Object.defineProperty(process, "platform", originalPlatform);
    if (originalService === undefined) delete process.env.DMMARKET_SERVICE;
    else process.env.DMMARKET_SERVICE = originalService;
  });

  it("places the replacement before exiting and lets the supervisor restart", () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    apply({}, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(fs.renameSync).toHaveBeenCalledTimes(2);
    expect(fs.renameSync.mock.calls[1][1]).toBe(process.execPath);
    expect(childProcess.spawn).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    jest.advanceTimersByTime(500);
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("keeps the process alive when the replacement fails", () => {
    fs.renameSync.mockImplementation(() => {
      throw new Error("Access denied");
    });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    apply({}, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(childProcess.spawn).not.toHaveBeenCalled();
    jest.runAllTimers();
    expect(process.exit).not.toHaveBeenCalled();
  });
});
