const os = require("node:os");
const net = require("node:net");
const https = require("node:https");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { serverOptions } = require("./server");
const { accessOptions, webEnabled, proxyIdentity } = require("./web-config");
const { managedWeb, rootCertificateFile } = require("./web-service");

function ipv4Number(address) {
  return address.split(".").reduce((value, octet) => (value * 256 + Number(octet)) >>> 0, 0);
}

function privateNetwork(cidr) {
  if (typeof cidr !== "string" || !/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(cidr)) return false;
  const [address, prefix] = cidr.split("/");
  if (net.isIP(address) !== 4 || Number(prefix) < 8 || Number(prefix) > 32) return false;
  const size = 2 ** (32 - Number(prefix));
  const start = Math.floor(ipv4Number(address) / size) * size;
  const end = start + size - 1;
  return [
    ["10.0.0.0", "10.255.255.255"],
    ["172.16.0.0", "172.31.255.255"],
    ["192.168.0.0", "192.168.255.255"],
  ].some(([first, last]) => start >= ipv4Number(first) && end <= ipv4Number(last));
}

function localAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal && privateNetwork(`${entry.address}/32`))
    .map((entry) => ({ address: entry.address, network: entry.cidr || `${entry.address}/32` }));
}

function firewallSettings(input, configuration, platform = process.platform) {
  const enabled = input.allowFirewall === true;
  if (!enabled) return { enabled: false };
  if (platform === "darwin") throw new Error("En macOS, el permiso del firewall se revisa en Ajustes del Sistema.");
  if (accessOptions(configuration).host !== "0.0.0.0")
    throw new Error("No necesitas abrir el firewall para acceso solo en este servidor.");
  if (!privateNetwork(input.network))
    throw new Error(
      "Indica una red privada válida, por ejemplo 192.168.1.0/24. No se permiten reglas para todo Internet.",
    );
  return { enabled: true, network: input.network };
}

function configureFirewall(settings, configuration, platform = process.platform) {
  if (!settings.enabled) return [];
  const port = String(accessOptions(configuration).port);
  let result;
  if (platform === "linux") {
    result = spawnSync("ufw", ["allow", "from", settings.network, "to", "any", "port", port, "proto", "tcp"], {
      encoding: "utf8",
    });
  } else {
    const script = `$ErrorActionPreference = 'Stop'; Get-NetFirewallRule -Name 'DMMarket-LAN' -ErrorAction SilentlyContinue | Remove-NetFirewallRule; New-NetFirewallRule -Name 'DMMarket-LAN' -DisplayName 'DMMarket (red local)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${port} -RemoteAddress '${settings.network}' -Profile Private,Domain | Out-Null`;
    result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" });
  }
  if (result.error || result.status !== 0) {
    return [
      "El servicio se instaló, pero no se pudo agregar la regla de firewall. Consulta la guía de instalación para permitir el puerto solo desde tu red local.",
    ];
  }
  return platform === "linux"
    ? ["Se agregó la regla de UFW sin activar el firewall ni modificar las reglas de SSH."]
    : [];
}

async function applicationReady(configuration) {
  try {
    const response = await fetch(`http://127.0.0.1:${configuration.PORT}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    const status = await response.json();
    return response.ok && status.ok === true && status.service === true;
  } catch {
    return false;
  }
}

async function proxyResponse(configuration, ca = fs.readFileSync(rootCertificateFile())) {
  const url = new URL(configuration.AUTH_PUBLIC_ORIGIN);
  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        host: "127.0.0.1",
        port: Number(url.port || 443),
        servername: configuration.WEB_HOSTNAME,
        ca,
        path: "/api/health",
        headers: { Host: url.host },
        timeout: 1500,
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
          if (body.length > 4096) response.destroy(new Error("Respuesta inesperada."));
        });
        response.on("error", reject);
        response.on("end", () => {
          try {
            resolve({
              ok: response.statusCode === 200,
              owned: response.headers["x-dmmarket-web"] === proxyIdentity(configuration),
              data: JSON.parse(body),
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.once("timeout", () => request.destroy(new Error("HTTPS no responde.")));
    request.once("error", reject);
  });
}

async function proxyResponding(configuration, ca) {
  try {
    return (await proxyResponse(configuration, ca)).owned;
  } catch {
    return false;
  }
}

async function proxyReady(configuration, ca) {
  try {
    const response = await proxyResponse(configuration, ca);
    return response.ok && response.owned && response.data.ok === true && response.data.service === true;
  } catch {
    return false;
  }
}

function accessReady(configuration) {
  return webEnabled(configuration) ? proxyReady(configuration) : applicationReady(configuration);
}

async function portAvailable(options) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (error) => (error.code === "EADDRINUSE" ? resolve(false) : reject(error)));
    probe.listen(options.port, options.host, () => probe.close(() => resolve(true)));
  });
}

async function checkApplicationPort(configuration, existing = {}, installed = false, { ca, directory } = {}) {
  if (
    !(await portAvailable(serverOptions(configuration))) &&
    !(installed && (existing.PORT || "8000") === configuration.PORT && (await applicationReady(configuration)))
  ) {
    throw new Error(`El puerto ${configuration.PORT} está ocupado. Elige otro puerto antes de instalar.`);
  }
  if (
    webEnabled(configuration) &&
    !(await portAvailable(accessOptions(configuration))) &&
    !(installed && webEnabled(existing) && managedWeb(directory) && (await proxyResponding(existing, ca)))
  ) {
    throw new Error(
      `El puerto HTTPS ${accessOptions(configuration).port} está ocupado por otro servicio. No se modificó ese servicio.`,
    );
  }
}

module.exports = {
  privateNetwork,
  localAddresses,
  firewallSettings,
  configureFirewall,
  applicationReady,
  proxyReady,
  accessReady,
  checkApplicationPort,
};
