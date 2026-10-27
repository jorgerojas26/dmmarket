const { createHash } = require("node:crypto");
const { CAPABILITIES } = require("./capabilities");
const { reportCache, isReportPath } = require("../middlewares/report-cache");

async function withReportCache(req, res, sessions, work) {
  let prepared;
  try {
    const value = await sessions.withSession(req.sessionID, { readOnly: true }, async (context) => {
      if (req.method !== "GET" || !isReportPath(req.path)) return work(context);
      const url = new URL(req.originalUrl, "http://localhost");
      url.searchParams.sort();
      const permissions = Object.keys(CAPABILITIES).map((capability) => {
        const scope = context.access.scopeFor(capability);
        return [capability, scope.global, [...scope.sellerIds].sort()];
      });
      const scope = createHash("sha256")
        .update(JSON.stringify([context.user.id, context.revision, permissions]))
        .digest("hex");
      prepared = await reportCache.prepare(`auth:${scope}:${url.pathname}${url.search}`, () => work(context));
      return prepared.value;
    });
    if (prepared) {
      if (res.destroyed || res.statusCode !== 200) prepared.cancel?.();
      else prepared.commit?.();
      res.set({ "X-Report-Cache": prepared.state, "Cache-Control": "no-store", Age: String(prepared.age || 0) });
    }
    return value;
  } catch (error) {
    prepared?.cancel?.();
    throw error;
  }
}

module.exports = { withReportCache };
