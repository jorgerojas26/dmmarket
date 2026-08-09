const request = require("supertest");
const app = require("../index");

describe("GET /api/update/status", () => {
  it("responde 200 con currentVersion, platform y standalone", async () => {
    const res = await request(app).get("/api/update/status");
    expect(res.status).toBe(200);
    expect(res.body.currentVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(res.body.platform).toBe(process.platform);
    expect(res.body.standalone).toBe(false);
  });
});

describe("endpoints de update en dev (no compilado)", () => {
  it("POST /api/update/check responde 400 (solo binario)", async () => {
    const res = await request(app).post("/api/update/check");
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("binario");
  });

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
