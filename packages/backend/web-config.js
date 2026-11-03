const { createHash, createHmac } = require("node:crypto");
const { serverOptions } = require("./server");

function webEnabled(configuration) {
  return configuration.WEB_MODE === "caddy";
}

function normalizeWeb(input) {
  const mode = input.WEB_MODE ?? "caddy";
  if (mode !== "caddy")
    throw new Error("DMMarket requiere HTTPS con Caddy; el acceso HTTP directo no está habilitado.");
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

function httpsOrigin(configuration) {
  const url = new URL(configuration.AUTH_PUBLIC_ORIGIN);
  if (
    url.protocol !== "https:" ||
    url.origin !== configuration.AUTH_PUBLIC_ORIGIN ||
    url.hostname !== configuration.WEB_HOSTNAME
  ) {
    throw new Error("Caddy requiere AUTH_PUBLIC_ORIGIN HTTPS para el nombre DNS configurado.");
  }
  return url;
}

function accessOptions(configuration) {
  if (!webEnabled(configuration)) return serverOptions(configuration);
  const url = httpsOrigin(configuration);
  return { host: configuration.WEB_BIND_ADDRESS || "0.0.0.0", port: Number(url.port || 443) };
}

function accessUrls(configuration, addresses) {
  if (webEnabled(configuration)) return [httpsOrigin(configuration).origin];
  const { host, port } = accessOptions(configuration);
  return host === "127.0.0.1" || !addresses.length
    ? [`http://127.0.0.1:${port}`]
    : addresses.map(({ address }) => `http://${address}:${port}`);
}

function proxyIdentity(configuration) {
  return createHash("sha256").update(`${configuration.WEB_HOSTNAME}:${configuration.PORT}`).digest("hex");
}

function proxyCredential(configuration) {
  const secret = configuration.AUTH_SESSION_SECRET;
  if (typeof secret !== "string") throw new Error("Falta el secreto del proxy autenticado.");
  const key = Buffer.from(secret, "base64");
  if (key.length < 32 || key.length > 64 || key.toString("base64") !== secret)
    throw new Error("El secreto del proxy no es válido.");
  return createHmac("sha256", key).update("dmmarket:proxy:v2:client-ip").digest("base64url");
}

function caddyFile(configuration, logFile, storageDirectory) {
  const web = normalizeWeb(configuration);
  const { host, port } = serverOptions(configuration);
  if (!webEnabled(web) || host !== "127.0.0.1" || port < 1024) {
    throw new Error("Caddy requiere DMMarket en 127.0.0.1 y un puerto interno de 1024 o mayor.");
  }
  const logging = logFile
    ? `\n\tlog {\n\t\toutput file ${JSON.stringify(logFile.replace(/\\/g, "/"))} {\n\t\t\troll_size 10MiB\n\t\t\troll_keep 3\n\t\t}\n\t}`
    : "";
  const storage = storageDirectory
    ? `\n\tstorage file_system {\n\t\troot ${JSON.stringify(storageDirectory.replace(/\\/g, "/"))}\n\t}`
    : "";
  const url = httpsOrigin(configuration);
  const bind = configuration.WEB_BIND_ADDRESS || "0.0.0.0";
  if (!["0.0.0.0", "127.0.0.1"].includes(bind)) throw new Error("La dirección pública de Caddy no es válida.");
  return `{\n\tadmin off\n\tauto_https disable_redirects\n\tskip_install_trust\n\tpersist_config off${logging}${storage}\n}\n\n${url.origin} {\n\tbind ${bind}\n\ttls internal\n\theader X-DMMarket-Web ${proxyIdentity(configuration)}\n\treverse_proxy 127.0.0.1:${port} {\n\t\theader_up X-DMMarket-Proxy ${proxyCredential(configuration)}\n\t\theader_up X-DMMarket-Client-IP {http.request.remote.host}\n\t}\n}\n`;
}

module.exports = { webEnabled, normalizeWeb, accessOptions, accessUrls, proxyIdentity, proxyCredential, caddyFile };
