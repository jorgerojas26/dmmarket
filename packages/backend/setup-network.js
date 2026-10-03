const os = require("node:os");
const net = require("node:net");
const { spawnSync } = require("node:child_process");
const { serverOptions } = require("./server");

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
  if (configuration.HOST !== "0.0.0.0")
    throw new Error("No necesitas abrir el firewall para acceso solo en este servidor.");
  if (!privateNetwork(input.network))
    throw new Error(
      "Indica una red privada válida, por ejemplo 192.168.1.0/24. No se permiten reglas para todo Internet.",
    );
  return { enabled: true, network: input.network };
}

function configureFirewall(settings, configuration, platform = process.platform) {
  if (!settings.enabled) return [];
  const port = configuration.PORT;
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
    const response = await fetch(`http://127.0.0.1:${configuration.PORT}/api/update/status`, {
      signal: AbortSignal.timeout(1500),
    });
    const status = await response.json();
    return response.ok && status.service === true;
  } catch {
    return false;
  }
}

async function checkApplicationPort(configuration, existing = {}, installed = false) {
  const options = serverOptions(configuration);
  const available = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (error) => (error.code === "EADDRINUSE" ? resolve(false) : reject(error)));
    probe.listen(options.port, options.host, () => probe.close(() => resolve(true)));
  });
  if (available) return;
  if (installed && (existing.PORT || "8000") === configuration.PORT && (await applicationReady(configuration))) return;
  throw new Error(`El puerto ${configuration.PORT} está ocupado. Elige otro puerto antes de instalar.`);
}

module.exports = {
  privateNetwork,
  localAddresses,
  firewallSettings,
  configureFirewall,
  applicationReady,
  checkApplicationPort,
};
