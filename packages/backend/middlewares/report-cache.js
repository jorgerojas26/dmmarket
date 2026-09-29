const TTL_MS = 60 * 60 * 1000;
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 500;

// The app is a single-business, read-mostly report server. Exchange rates and
// auto-update progress must stay live; dashboards, modals and drill-downs share
// the same one-hour policy. Never cache unknown routes or authenticated traffic.
const isReportPath = (path) =>
  /^\/(dashboard|clients|providers|purchases|sales|groups|products|invoices|employees)(\/|$)/.test(path);

function createReportCache({ ttlMs = TTL_MS, maxBytes = MAX_BYTES, maxEntries = MAX_ENTRIES, now = Date.now } = {}) {
  const entries = new Map();
  const pending = new Map();
  let bytes = 0;
  let generation = 0;

  const remove = (key) => {
    const entry = entries.get(key);
    if (entry) bytes -= entry.bytes;
    entries.delete(key);
  };

  const clear = () => {
    generation++;
    entries.clear();
    pending.clear();
    bytes = 0;
  };

  const store = (key, entry) => {
    if (entry.bytes > maxBytes || maxEntries < 1) return;
    // No timer or background work: expire lazily and bound total retained data.
    for (const [oldKey, value] of entries) if (value.expires <= now()) remove(oldKey);
    remove(key);
    while (entries.size >= maxEntries || bytes + entry.bytes > maxBytes) remove(entries.keys().next().value);
    entries.set(key, entry);
    bytes += entry.bytes;
  };

  const send = (res, entry, state) => {
    res.set("X-Report-Cache", state);
    res.set("Cache-Control", "no-store"); // server cache only; browser caches cannot be invalidated by a write
    res.set("Age", String(Math.max(0, Math.floor((now() - entry.created) / 1000))));
    res.type("json").status(200).send(entry.body);
  };

  const middleware = async (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (isReportPath(req.path)) {
        res.once("finish", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) clear();
        });
      }
      return next();
    }
    if (req.method !== "GET" || !isReportPath(req.path) || req.headers.authorization || req.headers.cookie)
      return next();

    const url = new URL(req.originalUrl, "http://localhost");
    url.searchParams.sort(); // same query in different parameter order = same cache entry
    const key = url.pathname + url.search;
    if (key.length > 4096) return next();
    res.set("Cache-Control", "no-store");
    const refresh =
      /(?:^|,)\s*(?:no-cache|no-store|max-age=0)\s*(?:,|$)/i.test(req.headers["cache-control"] || "") ||
      req.headers.pragma === "no-cache";
    const cached = entries.get(key);
    if (cached && cached.expires <= now()) remove(key);
    else if (cached && !refresh) {
      entries.delete(key);
      entries.set(key, cached); // touch LRU, but never extend its absolute TTL
      return send(res, cached, "HIT");
    }

    const running = pending.get(key);
    if (running) {
      const entry = await running.promise;
      if (res.destroyed) return;
      if (entry && running.generation === generation) return send(res, entry, "SHARED");
      // Failed/aborted/invalidated leader: retry through the cache, not stale data.
      return middleware(req, res, next);
    }
    if (pending.size >= maxEntries) return next();

    let resolve;
    const flight = {
      generation,
      promise: new Promise((done) => {
        resolve = done;
      }),
    };
    pending.set(key, flight);
    res.set("X-Report-Cache", "MISS");
    let body;
    let finished = false;
    const originalJson = res.json;
    res.json = function (data) {
      if (this.statusCode === 200) body = JSON.stringify(data);
      return originalJson.call(this, data);
    };
    const complete = (success) => {
      if (finished) return;
      finished = true;
      if (pending.get(key) === flight) pending.delete(key);
      let entry;
      if (
        success &&
        body !== undefined &&
        res.statusCode === 200 &&
        !res.getHeader("Set-Cookie") &&
        flight.generation === generation
      ) {
        const created = now();
        entry = { body, created, expires: created + ttlMs, bytes: Buffer.byteLength(body) + Buffer.byteLength(key) };
        store(key, entry);
      }
      resolve(entry);
    };
    res.once("finish", () => complete(true));
    res.once("close", () => complete(false));
    return next();
  };

  return { middleware, clear };
}

const reportCache = createReportCache();
module.exports = { createReportCache, isReportPath, reportCache };
