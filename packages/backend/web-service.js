const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const manifest = require("./caddy-manifest.json");
const { run, powershell, xml } = require("./service-commands");
const { caddyFile, webEnabled } = require("./web-config");

const UNIT = "/etc/systemd/system/dmmarket-web.service";
const LABEL = "com.dmmarket.web";
const PLIST = `/Library/LaunchDaemons/${LABEL}.plist`;
const SERVICE = "DMMarket-Web";

function webDirectory(platform = process.platform) {
  if (platform === "linux") return "/var/lib/dmmarket-web";
  if (platform === "darwin") return "/Library/Application Support/DMMarket-web";
  if (platform === "win32") return path.win32.join(process.env.ProgramData || "C:\\ProgramData", "DMMarket-web");
  throw new Error("El proxy solo está disponible en Ubuntu, Windows y macOS.");
}

function managedWeb(directory = webDirectory()) {
  try {
    return JSON.parse(fs.readFileSync(path.join(directory, "installation.json"), "utf8")).component === SERVICE;
  } catch {
    return false;
  }
}

function webServiceExists() {
  if (process.platform === "linux") return fs.existsSync(UNIT);
  if (process.platform === "darwin") return fs.existsSync(PLIST);
  const result = spawnSync("sc.exe", ["query", SERVICE], { encoding: "utf8" });
  if (result.error || ![0, 1060].includes(result.status)) {
    throw new Error("No se pudo consultar el servicio web de Windows.");
  }
  return result.status === 0;
}

function verifiedCaddy(filename, target = `${process.platform}-${process.arch}`) {
  const definition = manifest.targets[target];
  if (!definition) throw new Error("No hay una distribución de Caddy para esta plataforma y arquitectura.");
  if (!fs.existsSync(filename)) throw new Error("Falta Caddy. Extrae el ZIP completo del instalador oficial.");
  const hash = createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
  if (hash !== definition.sha256) throw new Error("La verificación de Caddy falló. Descarga el instalador nuevamente.");
  return filename;
}

function prepareWeb(configuration) {
  if (!webEnabled(configuration)) return null;
  const directory = webDirectory();
  if ((fs.existsSync(directory) || webServiceExists()) && !managedWeb(directory)) {
    throw new Error("Ya existe una instalación web ajena a DMMarket en la ubicación reservada. No se modificó.");
  }
  const target = `${process.platform}-${process.arch}`;
  const definition = manifest.targets[target];
  if (!definition) throw new Error("No hay una distribución de Caddy para esta plataforma y arquitectura.");
  const bundled = path.join(path.dirname(process.execPath), "web", target, definition.binary);
  const source = verifiedCaddy(fs.existsSync(bundled) ? bundled : path.join(directory, definition.binary), target);
  if (process.platform !== "win32") fs.chmodSync(source, 0o755);
  const result = spawnSync(source, ["validate", "--config", "-", "--adapter", "caddyfile"], {
    encoding: "utf8",
    input: caddyFile(configuration),
    timeout: 15000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`No se pudo validar Caddy: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return { source, directory };
}

function webSystemdUnit(directory) {
  return `[Unit]
Description=DMMarket HTTP proxy
Wants=network-online.target
After=network-online.target dmmarket.service
StartLimitIntervalSec=0

[Service]
Type=simple
User=dmmarket
Group=dmmarket
WorkingDirectory=${directory}
ExecStart=${directory}/caddy run --config ${directory}/Caddyfile --adapter caddyfile
Restart=always
RestartSec=5
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${directory}/logs
UMask=0027

[Install]
WantedBy=multi-user.target
`;
}

function webLaunchdPlist(directory) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${LABEL}</string>
<key>ProgramArguments</key><array><string>${xml(directory)}/caddy</string><string>run</string><string>--config</string><string>${xml(directory)}/Caddyfile</string><string>--adapter</string><string>caddyfile</string></array>
<key>WorkingDirectory</key><string>${xml(directory)}</string>
<key>UserName</key><string>root</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>5</integer>
<key>StandardOutPath</key><string>${xml(directory)}/logs/launchd.log</string>
<key>StandardErrorPath</key><string>${xml(directory)}/logs/launchd-error.log</string>
</dict></plist>
`;
}

function windowsWebCommand(directory) {
  return `"${path.win32.join(directory, "caddy.exe")}" run --config "${path.win32.join(directory, "Caddyfile")}" --adapter caddyfile`;
}

function stopWeb() {
  if (!managedWeb()) return;
  if (process.platform === "linux") {
    if (fs.existsSync(UNIT)) run("systemctl", ["stop", "dmmarket-web.service"]);
  } else if (process.platform === "darwin") {
    run("launchctl", ["bootout", `system/${LABEL}`], true);
  } else {
    powershell(
      `$service = Get-Service -Name '${SERVICE}' -ErrorAction SilentlyContinue; if ($service -and $service.Status -ne 'Stopped') { Stop-Service -Name '${SERVICE}' -Force; $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30)) }`,
    );
  }
}

function installWeb(configuration, plan) {
  if (!plan) {
    uninstallWeb();
    return;
  }
  const { directory, source } = plan;
  const binary = path.join(directory, process.platform === "win32" ? "caddy.exe" : "caddy");
  const logs = path.join(directory, "logs");
  fs.mkdirSync(directory, { recursive: true, mode: 0o755 });
  fs.mkdirSync(logs, { recursive: true, mode: 0o750 });
  if (source !== binary) fs.copyFileSync(source, binary);
  fs.writeFileSync(path.join(directory, "Caddyfile"), caddyFile(configuration, path.join(logs, "caddy.log")), {
    mode: 0o644,
  });
  fs.writeFileSync(
    path.join(directory, "installation.json"),
    JSON.stringify({ component: SERVICE, version: manifest.version }),
    {
      mode: 0o644,
    },
  );
  if (process.platform === "win32") {
    run("icacls.exe", [
      directory,
      "/inheritance:r",
      "/grant:r",
      "*S-1-5-18:(OI)(CI)F",
      "*S-1-5-32-544:(OI)(CI)F",
      "*S-1-5-19:(OI)(CI)RX",
    ]);
    run("icacls.exe", [logs, "/grant:r", "*S-1-5-19:(OI)(CI)M"]);
    const action = webServiceExists() ? "config" : "create";
    run("sc.exe", [
      action,
      SERVICE,
      "start=",
      "auto",
      "obj=",
      "NT AUTHORITY\\LocalService",
      "binPath=",
      windowsWebCommand(directory),
    ]);
    run("sc.exe", ["failure", SERVICE, "reset=", "0", "actions=", "restart/5000/restart/5000/restart/5000"]);
    run("sc.exe", ["failureflag", SERVICE, "1"]);
    run("sc.exe", ["start", SERVICE]);
  } else {
    run("chown", ["-R", process.platform === "linux" ? "root:root" : "root:wheel", directory]);
    fs.chmodSync(directory, 0o755);
    fs.chmodSync(binary, 0o755);
    fs.chmodSync(path.join(directory, "Caddyfile"), 0o644);
    if (process.platform === "linux") {
      run("chown", ["-R", "dmmarket:dmmarket", logs]);
      fs.writeFileSync(UNIT, webSystemdUnit(directory), { mode: 0o644 });
      run("systemctl", ["daemon-reload"]);
      run("systemctl", ["enable", "--now", "dmmarket-web.service"]);
    } else {
      fs.writeFileSync(PLIST, webLaunchdPlist(directory), { mode: 0o644 });
      run("chown", ["root:wheel", PLIST]);
      run("launchctl", ["enable", `system/${LABEL}`]);
      run("launchctl", ["bootstrap", "system", PLIST]);
    }
  }
}

function uninstallWeb() {
  if (!managedWeb()) return;
  stopWeb();
  if (process.platform === "linux") {
    run("systemctl", ["disable", "dmmarket-web.service"], true);
    fs.rmSync(UNIT, { force: true });
    run("systemctl", ["daemon-reload"]);
  } else if (process.platform === "darwin") {
    fs.rmSync(PLIST, { force: true });
  } else if (webServiceExists()) {
    run("sc.exe", ["delete", SERVICE]);
  }
}

module.exports = {
  webDirectory,
  managedWeb,
  verifiedCaddy,
  prepareWeb,
  stopWeb,
  installWeb,
  uninstallWeb,
  webSystemdUnit,
  webLaunchdPlist,
  windowsWebCommand,
};
