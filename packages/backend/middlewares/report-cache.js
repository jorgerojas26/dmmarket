const TTL_MS = 60 * 60 * 1000;
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 500;
const PENDING_TTL_MS = 30_000;

const isBusinessPath = (path) =>
  /^\/(dashboard|clients|providers|purchases|sales|groups|products|invoices|employees|sellers)(\/|$)/i.test(path);

const isDashboardPath = (path) =>
  /^\/(dashboard\/(sales|pareto)|clients\/(dashboard|sin-facturar)|purchases\/(dashboard|pareto)|sellers\/dashboard)\/?$/i.test(
    path,
  );

function createReportCache({
  ttlMs = TTL_MS,
  maxBytes = MAX_BYTES,
  maxEntries = MAX_ENTRIES,
  pendingTtlMs = PENDING_TTL_MS,
  now = Date.now,
} = {}) {
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
    for (const flight of pending.values()) flight.cancel();
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

  const invalidate = (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && isBusinessPath(req.path)) {
      res.once("finish", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) clear();
      });
    }
    return next();
  };

  const prepare = async (key, work) => {
    const bypass = async () => ({ value: await work(), state: "BYPASS" });
    if (key.length > 4096) return bypass();
    const cached = entries.get(key);
    if (cached && cached.expires <= now()) remove(key);
    else if (cached) {
      entries.delete(key);
      entries.set(key, cached);
      return {
        value: JSON.parse(cached.body),
        state: "HIT",
        age: Math.max(0, Math.floor((now() - cached.created) / 1000)),
      };
    }
    const running = pending.get(key);
    if (running) {
      const entry = await running.promise;
      if (entry && running.generation === generation)
        return {
          value: JSON.parse(entry.body),
          state: "SHARED",
          age: Math.max(0, Math.floor((now() - entry.created) / 1000)),
        };
      return bypass();
    }
    if (pending.size >= maxEntries) return bypass();
    let resolve;
    let body;
    let completed = false;
    const flight = {
      generation,
      promise: new Promise((done) => {
        resolve = done;
      }),
    };
    const finish = (success) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      if (pending.get(key) === flight) pending.delete(key);
      let entry;
      if (success && body !== undefined && flight.generation === generation) {
        const created = now();
        entry = { body, created, expires: created + ttlMs, bytes: Buffer.byteLength(body) + Buffer.byteLength(key) };
        store(key, entry);
      }
      resolve(entry);
    };
    flight.cancel = () => finish(false);
    const timer = setTimeout(flight.cancel, pendingTtlMs);
    timer.unref?.();
    pending.set(key, flight);
    try {
      const value = await work();
      body = JSON.stringify(value);
      return { value, state: "MISS", commit: () => finish(true), cancel: flight.cancel };
    } catch (error) {
      finish(false);
      throw error;
    }
  };

  const middleware = async (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) return invalidate(req, res, next);
    if (req.method === "GET" && isBusinessPath(req.path)) res.set("Cache-Control", "no-store");
    if (req.method !== "GET" || !isDashboardPath(req.path) || req.headers.authorization || req.headers.cookie)
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
    if (running && refresh) running.cancel();
    else if (running) {
      const entry = await running.promise;
      if (res.destroyed) return;
      if (entry && running.generation === generation) return send(res, entry, "SHARED");
      res.set("X-Report-Cache", "BYPASS");
      return next();
    }
    if (pending.size >= maxEntries) return next();

    let resolve;
    const flight = {
      generation,
      promise: new Promise((done) => {
        resolve = done;
      }),
    };
    res.set("X-Report-Cache", "MISS");
    let body;
    let finished = false;
    let timer;
    const originalJson = res.json;
    res.json = function (data) {
      if (!finished && this.statusCode === 200) body = JSON.stringify(data);
      return originalJson.call(this, data);
    };
    const complete = (success) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (pending.get(key) === flight) pending.delete(key);
      let entry;
      if (
        success &&
        body !== undefined &&
        res.statusCode === 200 &&
        !res.hasHeader("Set-Cookie") &&
        flight.generation === generation
      ) {
        const created = now();
        entry = { body, created, expires: created + ttlMs, bytes: Buffer.byteLength(body) + Buffer.byteLength(key) };
        store(key, entry);
      }
      resolve(entry);
    };
    flight.cancel = () => complete(false);
    pending.set(key, flight);
    timer = setTimeout(flight.cancel, pendingTtlMs);
    timer.unref?.();
    res.once("finish", () => complete(true));
    res.once("close", () => complete(res.writableFinished));
    return next();
  };

  return { middleware, clear, prepare, invalidate };
}

const reportCache = createReportCache();
module.exports = { createReportCache, isReportPath: isDashboardPath, reportCache };
