const { spawnSync } = require("node:child_process");
const path = require("node:path");
const express = require("express");
const request = require("supertest");
const { createReportCache } = require("../middlewares/report-cache");

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

function setup(options = {}, handler) {
  const cache = createReportCache(options);
  const app = express();
  let calls = 0;
  app.use("/api", cache.middleware);
  app.get("/api/clients/dashboard", async (req, res) => {
    calls++;
    if (handler) return handler(req, res, calls);
    res.json({ calls, filters: req.query });
  });
  app.put("/api/employees/commissionInfo/1", (_req, res) => res.status(201).json({ success: true }));
  app.post("/api/update/check", (_req, res) => res.json({ success: true }));
  app.post("/api/failing-write", (_req, res) => res.status(400).json({ error: "invalid" }));
  return {
    app,
    cache,
    get calls() {
      return calls;
    },
  };
}

it.each([
  "/dashboard/sales",
  "/dashboard/pareto",
  "/clients/dashboard",
  "/clients/sin-facturar",
  "/purchases/dashboard",
  "/purchases/pareto",
  "/sellers/dashboard",
  "/clients/dashboard/",
  "/CLIENTS/DASHBOARD",
])("caches dashboard endpoint %s over HTTP", async (path) => {
  const app = express();
  const cache = createReportCache();
  let calls = 0;
  app.use("/api", cache.middleware);
  app.get(`/api${path}`, (_req, res) => res.json({ calls: ++calls }));
  const first = await request(app).get(`/api${path}`);
  const second = await request(app).get(`/api${path}`);
  expect(first.headers["x-report-cache"]).toBe("MISS");
  expect(second.headers["x-report-cache"]).toBe("HIT");
  expect(second.body).toEqual(first.body);
  expect(calls).toBe(1);
});

it.each([
  "/clients",
  "/clients/list",
  "/clients/routes",
  "/clients/1/summary",
  "/clients/1/sales",
  "/providers/list",
  "/providers/1/summary",
  "/providers/1/sales/2",
  "/purchases/invoices",
  "/purchases/products",
  "/sales/facturas",
  "/sales/productos",
  "/products",
  "/invoices",
  "/invoices?all=true&limit=20",
  "/invoices/1/detail",
  "/groups",
  "/employees/sales/1",
  "/sellers/list",
  "/sellers/1/summary",
  "/sellers/1/sales",
  "/currency_rates",
  "/update/progress",
  "/cache/clear",
  "/unknown",
  "/clients-other",
  "/dashboard/unknown",
  "/clients/dashboard/unknown",
])("does not cache non-dashboard endpoint %s over HTTP", async (path) => {
  const app = express();
  const cache = createReportCache();
  let calls = 0;
  app.use("/api", cache.middleware);
  app.get("/api/*", (_req, res) => res.json({ calls: ++calls }));
  const first = await request(app).get(`/api${path}`);
  const second = await request(app).get(`/api${path}`);
  expect(first.headers["x-report-cache"]).toBeUndefined();
  expect(second.headers["x-report-cache"]).toBeUndefined();
  expect(first.body.calls).toBe(1);
  expect(second.body.calls).toBe(2);
  expect(calls).toBe(2);
});

it("serves identical JSON from memory without executing the handler again", async () => {
  const env = setup();
  const first = await request(env.app).get("/api/clients/dashboard?from=2026-09-01&showNoe=false");
  const second = await request(env.app).get("/api/clients/dashboard?showNoe=false&from=2026-09-01");
  expect(first.headers["x-report-cache"]).toBe("MISS");
  expect(second.headers["x-report-cache"]).toBe("HIT");
  expect(second.body).toEqual(first.body);
  expect(second.headers["cache-control"]).toBe("no-store");
  expect(env.calls).toBe(1);
});

it("expires after one hour, not one hour after the last hit", async () => {
  let time = 0;
  const env = setup({ now: () => time });
  await request(env.app).get("/api/clients/dashboard");
  time = 3599999;
  expect((await request(env.app).get("/api/clients/dashboard")).headers["x-report-cache"]).toBe("HIT");
  time = 3600000;
  expect((await request(env.app).get("/api/clients/dashboard")).headers["x-report-cache"]).toBe("MISS");
  expect(env.calls).toBe(2);
});

it("keeps every filter, billing mode, page and sort independent", async () => {
  const env = setup();
  for (const suffix of [
    "?showNoe=false",
    "?showNoe=true",
    "?ruta=R1",
    "?ruta=R2",
    "?page=1",
    "?page=2",
    "?sortDir=asc",
    "?sortDir=desc",
    "?from=2026-07-01",
    "?from=2026-09-01",
    "?search=abc",
  ]) {
    expect((await request(env.app).get(`/api/clients/dashboard${suffix}`)).headers["x-report-cache"]).toBe("MISS");
  }
  expect(env.calls).toBe(11);
});

it("shares concurrent misses instead of running the expensive handler twice", async () => {
  const started = deferred();
  const release = deferred();
  const env = setup({}, async (_req, res) => {
    started.resolve();
    await release.promise;
    res.json({ total: 123 });
  });
  const first = request(env.app)
    .get("/api/clients/dashboard")
    .then((res) => res);
  await started.promise;
  const second = request(env.app)
    .get("/api/clients/dashboard")
    .then((res) => res);
  // Allow the follower request to reach the middleware before finishing the leader.
  await new Promise((resolve) => setTimeout(resolve, 30));
  release.resolve();
  const responses = await Promise.all([first, second]);
  expect(responses[0].body).toEqual(responses[1].body);
  expect(env.calls).toBe(1);
  expect(["HIT", "SHARED"]).toContain(responses[1].headers["x-report-cache"]);
});

it.each([400, 500])("does not cache HTTP %s or poison later retries", async (code) => {
  const env = setup({}, (_req, res, calls) => res.status(calls === 1 ? code : 200).json({ calls }));
  expect((await request(env.app).get("/api/clients/dashboard")).status).toBe(code);
  expect((await request(env.app).get("/api/clients/dashboard")).body.calls).toBe(2);
  expect((await request(env.app).get("/api/clients/dashboard")).body.calls).toBe(2);
});

it("evicts least-recently-used entries at the entry limit", async () => {
  const env = setup({ maxEntries: 2 });
  const get = (page) => request(env.app).get(`/api/clients/dashboard?page=${page}`);
  await get(1);
  await get(2);
  await get(1);
  await get(3);
  expect((await get(1)).headers["x-report-cache"]).toBe("HIT");
  expect((await get(2)).headers["x-report-cache"]).toBe("MISS");
});

it("does not retain payloads larger than the memory budget", async () => {
  const env = setup({ maxBytes: 10 });
  await request(env.app).get("/api/clients/dashboard");
  await request(env.app).get("/api/clients/dashboard");
  expect(env.calls).toBe(2);
});

it("invalidates reports after successful business writes, not updates or rejected writes", async () => {
  const env = setup();
  await request(env.app).get("/api/clients/dashboard");
  await request(env.app).post("/api/update/check");
  await request(env.app).post("/api/failing-write");
  expect((await request(env.app).get("/api/clients/dashboard")).headers["x-report-cache"]).toBe("HIT");
  await request(env.app).put("/api/employees/commissionInfo/1");
  expect((await request(env.app).get("/api/clients/dashboard")).headers["x-report-cache"]).toBe("MISS");
});

it("manual clear prevents an older in-flight response from repopulating the cache", async () => {
  const started = deferred();
  const release = deferred();
  const env = setup({}, async (_req, res, calls) => {
    if (calls === 1) {
      started.resolve();
      await release.promise;
    }
    res.json({ calls });
  });
  const first = request(env.app)
    .get("/api/clients/dashboard")
    .then((res) => res);
  await started.promise;
  env.cache.clear();
  const fresh = await request(env.app).get("/api/clients/dashboard");
  release.resolve();
  await first;
  expect(fresh.body.calls).toBe(2);
  expect((await request(env.app).get("/api/clients/dashboard")).body.calls).toBe(2);
});

it("refreshes explicitly on Cache-Control: no-cache", async () => {
  const env = setup();
  await request(env.app).get("/api/clients/dashboard");
  const fresh = await request(env.app).get("/api/clients/dashboard").set("Cache-Control", "no-cache");
  expect(fresh.body.calls).toBe(2);
  expect((await request(env.app).get("/api/clients/dashboard")).body.calls).toBe(2);
});

it("never shares credentialed or cookie-setting responses", async () => {
  const env = setup({}, (_req, res, calls) => res.cookie("session", "test").json({ calls }));
  await request(env.app).get("/api/clients/dashboard");
  await request(env.app).get("/api/clients/dashboard");
  expect(env.calls).toBe(2);
  const plain = setup();
  await request(plain.app).get("/api/clients/dashboard").set("Authorization", "Bearer test");
  await request(plain.app).get("/api/clients/dashboard").set("Cookie", "session=test");
  expect((await request(plain.app).get("/api/clients/dashboard")).headers["x-report-cache"]).toBe("MISS");
});

it("releases an aborted leader so later requests can retry", async () => {
  const env = setup({}, (_req, res, calls) => {
    if (calls === 1) res.destroy();
    else res.json({ calls });
  });
  await expect(request(env.app).get("/api/clients/dashboard")).rejects.toThrow();
  const retried = await request(env.app).get("/api/clients/dashboard");
  expect(retried.status).toBe(200);
  expect(retried.body.calls).toBe(2);
  expect(retried.headers["x-report-cache"]).toBe("MISS");
});

it("evicts stored entries when their combined bytes exceed the budget", async () => {
  // Each key + body is ~90 bytes: one fits, two do not.
  const env = setup({ maxBytes: 140 }, (_req, res) => res.json({ value: "x".repeat(40) }));
  await request(env.app).get("/api/clients/dashboard?page=1");
  await request(env.app).get("/api/clients/dashboard?page=2");
  expect((await request(env.app).get("/api/clients/dashboard?page=2")).headers["x-report-cache"]).toBe("HIT");
  expect((await request(env.app).get("/api/clients/dashboard?page=1")).headers["x-report-cache"]).toBe("MISS");
});

it("releases followers when a leader never completes and ignores its late response", async () => {
  const started = deferred();
  const release = deferred();
  const env = setup({ pendingTtlMs: 50 }, async (_req, res, calls) => {
    if (calls === 1) {
      started.resolve();
      await release.promise;
    }
    res.json({ calls });
  });
  const first = request(env.app)
    .get("/api/clients/dashboard")
    .then((res) => res);
  await started.promise;
  try {
    const recovered = await request(env.app).get("/api/clients/dashboard").timeout({ deadline: 500 });
    expect(recovered.body.calls).toBe(2);
    expect(recovered.headers["x-report-cache"]).toBe("BYPASS");
    const fresh = await request(env.app).get("/api/clients/dashboard");
    expect(fresh.body.calls).toBe(3);
    release.resolve();
    await first;
    const cached = await request(env.app).get("/api/clients/dashboard");
    expect(cached.headers["x-report-cache"]).toBe("HIT");
    expect(cached.body.calls).toBe(3);
  } finally {
    release.resolve();
    await first;
    env.cache.clear();
  }
});

it("manual clear releases existing followers without waiting for the leader", async () => {
  const started = deferred();
  const release = deferred();
  const env = setup({}, async (_req, res, calls) => {
    if (calls === 1) {
      started.resolve();
      await release.promise;
    }
    res.json({ calls });
  });
  const first = request(env.app)
    .get("/api/clients/dashboard")
    .then((res) => res);
  await started.promise;
  const follower = request(env.app)
    .get("/api/clients/dashboard")
    .timeout({ deadline: 500 })
    .then((res) => res);
  await new Promise((resolve) => setTimeout(resolve, 30));
  env.cache.clear();
  try {
    expect((await follower).body.calls).toBe(2);
  } finally {
    release.resolve();
    await first;
    env.cache.clear();
  }
});

it("explicit refresh replaces a pending leader and cannot be overwritten by it", async () => {
  const started = deferred();
  const release = deferred();
  const env = setup({}, async (_req, res, calls) => {
    if (calls === 1) {
      started.resolve();
      await release.promise;
    }
    res.json({ calls });
  });
  const first = request(env.app)
    .get("/api/clients/dashboard")
    .then((res) => res);
  await started.promise;
  try {
    const fresh = await request(env.app)
      .get("/api/clients/dashboard")
      .set("Cache-Control", "no-cache")
      .timeout({ deadline: 500 });
    expect(fresh.body.calls).toBe(2);
    release.resolve();
    await first;
    expect((await request(env.app).get("/api/clients/dashboard")).body.calls).toBe(2);
  } finally {
    release.resolve();
    await first;
    env.cache.clear();
  }
});

it("caches responses when the runtime returns an empty array for a missing Set-Cookie header", async () => {
  const env = setup({}, (_req, res, calls) => {
    const getHeader = res.getHeader.bind(res);
    res.getHeader = (name) => (name.toLowerCase() === "set-cookie" && !res.hasHeader(name) ? [] : getHeader(name));
    res.json({ calls });
  });
  const first = await request(env.app).get("/api/clients/dashboard");
  const second = await request(env.app).get("/api/clients/dashboard");
  expect(second.headers["x-report-cache"]).toBe("HIT");
  expect(second.body).toEqual(first.body);
  expect(env.calls).toBe(1);
});

it("retains a completed response when only the close listener observes completion", async () => {
  const env = setup({}, (_req, res, calls) => {
    res.removeListener("finish", res.listeners("finish").at(-1));
    res.json({ calls });
  });
  const first = await request(env.app).get("/api/clients/dashboard");
  const second = await request(env.app).get("/api/clients/dashboard");
  expect(second.headers["x-report-cache"]).toBe("HIT");
  expect(second.body).toEqual(first.body);
  expect(env.calls).toBe(1);
});

it.each([process.execPath, "bun"])("shares, caches and recovers stalled reports under %s", (runtime) => {
  const result = spawnSync(runtime, [path.join(__dirname, "fixtures/report-cache-runtime.cjs")], {
    encoding: "utf8",
    timeout: 10000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.stdout).toContain("report-cache runtime passed");
});
