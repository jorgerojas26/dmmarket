const assert = require("node:assert/strict");
const express = require("express");
const { createReportCache } = require("../../middlewares/report-cache");

const cache = createReportCache({ pendingTtlMs: 100 });
const app = express();
let calls = 0;
let stalledCalls = 0;
let started;
const stalledStarted = new Promise((resolve) => {
  started = resolve;
});
const controller = new AbortController();

app.use("/api", cache.middleware);
app.get("/api/dashboard/sales", async (req, res) => {
  if (req.query.stalled) {
    stalledCalls++;
    if (stalledCalls === 1) {
      started();
      return;
    }
    return res.json({ calls: stalledCalls });
  }
  calls++;
  await new Promise((resolve) => setTimeout(resolve, 20));
  res.json({ total: 123 });
});

const server = app.listen(0, "127.0.0.1", async () => {
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/dashboard/sales`;
    const responses = await Promise.all([
      fetch(url, { signal: AbortSignal.timeout(2000) }),
      fetch(url, { signal: AbortSignal.timeout(2000) }),
    ]);
    for (const response of responses) assert.equal(response.status, 200);
    const states = responses.map((response) => response.headers.get("x-report-cache"));
    assert.ok(states.includes("MISS"));
    assert.ok(states.includes("SHARED") || states.includes("HIT"));
    const bodies = await Promise.all(responses.map((response) => response.json()));
    assert.deepEqual(bodies[0], bodies[1]);
    assert.equal(calls, 1);

    const cached = await fetch(url, { signal: AbortSignal.timeout(2000) });
    assert.equal(cached.headers.get("x-report-cache"), "HIT");
    assert.deepEqual(await cached.json(), bodies[0]);

    const stalledUrl = `${url}?stalled=true`;
    const leader = fetch(stalledUrl, { signal: controller.signal }).catch(() => undefined);
    await stalledStarted;
    const recovered = await fetch(stalledUrl, { signal: AbortSignal.timeout(2000) });
    assert.equal(recovered.status, 200);
    assert.equal(recovered.headers.get("x-report-cache"), "BYPASS");
    assert.equal((await recovered.json()).calls, 2);
    controller.abort();
    await leader;
    console.log("report-cache runtime passed");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    controller.abort();
    cache.clear();
    server.close();
    server.closeAllConnections();
  }
});
