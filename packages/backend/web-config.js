const { createHash } = require("node:crypto");
const { serverOptions } = require("./server");

function webEnabled(configuration) {
  return configuration.WEB_MODE === "caddy";
}

function normalizeWeb(input) {
  const mode = input.WEB_MODE ?? "direct";
  if (!["direct", "caddy"].includes(mode)) throw new Error("Elige acceso directo o acceso HTTP con Caddy.");
  if (mode === "direct") return { WEB_MODE: mode, WEB_HOSTNAME: "" };
  const hostname = typeof input.WEB_HOSTNAME === "string" ? input.WEB_HOSTNAME.trim().toLowerCase() : "";
  if (
    hostname.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(hostname) ||
    hostname.endsWith(".local")
  ) {
    throw new Error(
      "Indica un nombre DNS válido, como reportes.solser.internal, sin http://, puerto ni ruta. No uses .local.",
    );
  }
  return { WEB_MODE: mode, WEB_HOSTNAME: hostname };
}

function accessOptions(configuration) {
  return webEnabled(configuration) ? { host: "0.0.0.0", port: 80 } : serverOptions(configuration);
}

function accessUrls(configuration, addresses) {
  if (webEnabled(configuration)) return [`http://${configuration.WEB_HOSTNAME}`];
  const { host, port } = accessOptions(configuration);
  return host === "127.0.0.1" || !addresses.length
    ? [`http://127.0.0.1:${port}`]
    : addresses.map(({ address }) => `http://${address}:${port}`);
}

function proxyIdentity(configuration) {
  return createHash("sha256").update(`${configuration.WEB_HOSTNAME}:${configuration.PORT}`).digest("hex");
}

function caddyFile(configuration, logFile) {
  const web = normalizeWeb(configuration);
  const { host, port } = serverOptions(configuration);
  if (!webEnabled(web) || host !== "127.0.0.1" || port < 1024) {
    throw new Error("Caddy requiere DMMarket en 127.0.0.1 y un puerto interno de 1024 o mayor.");
  }
  const logging = logFile
    ? `\n\tlog {\n\t\toutput file ${JSON.stringify(logFile.replace(/\\/g, "/"))} {\n\t\t\troll_size 10MiB\n\t\t\troll_keep 3\n\t\t}\n\t}`
    : "";
  return `{\n\tadmin off\n\tauto_https off\n\tpersist_config off${logging}\n}\n\nhttp://${web.WEB_HOSTNAME}:80 {\n\tbind 0.0.0.0\n\theader X-DMMarket-Web ${proxyIdentity(configuration)}\n\treverse_proxy 127.0.0.1:${port}\n}\n`;
}

module.exports = { webEnabled, normalizeWeb, accessOptions, accessUrls, proxyIdentity, caddyFile };
