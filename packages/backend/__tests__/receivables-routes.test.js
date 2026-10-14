const express = require("express");
const request = require("supertest");
const { createReceivablesRouter } = require("../routes/receivables");
const { isReportPath } = require("../middlewares/report-cache");

function setup() {
  const service = {
    readiness: jest.fn().mockResolvedValue({ available: true, writesEnabled: false }),
    list: jest.fn().mockResolvedValue({ total: 0 }),
    detail: jest.fn().mockResolvedValue({ client: { id: "C1" } }),
    preview: jest.fn().mockResolvedValue({ snapshot: "test" }),
    execute: jest.fn().mockResolvedValue({ operationId: "test" }),
  };
  const app = express();
  app.use(express.json());
  app.use("/api/receivables", createReceivablesRouter(service));
  return { app, service };
}

it("never uses the one-hour report cache for receivables", async () => {
  expect(isReportPath("/receivables/C1")).toBe(false);
  const { app } = setup();
  const response = await request(app).get("/api/receivables?showNoe=true");
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.status).toBe(200);
});

it("rejects cross-site and non-JSON financial writes", async () => {
  const { app, service } = setup();
  expect((await request(app).post("/api/receivables/C1/operations").type("form").send({ amount: 10 })).status).toBe(
    415,
  );
  expect(
    (await request(app).post("/api/receivables/C1/operations").set("Sec-Fetch-Site", "cross-site").send({ amount: 10 }))
      .status,
  ).toBe(403);
  expect(service.execute).not.toHaveBeenCalled();
});

it("returns actionable errors without treating failures as zero debt", async () => {
  const { app, service } = setup();
  service.detail.mockRejectedValue(Object.assign(new Error("Cliente no encontrado."), { status: 404 }));
  const response = await request(app).get("/api/receivables/missing");
  expect(response.status).toBe(404);
  expect(response.body.error.message).toBe("Cliente no encontrado.");
});
