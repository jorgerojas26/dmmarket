const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { run, powershell, psQuote, xml } = require("./service-commands");
const { prepareWeb, stopWeb, installWeb, uninstallWeb } = require("./web-service");
const { webEnabled } = require("./web-config");

const LABEL = "com.dmmarket.server";
const TASK = "DMMarket";
const PLIST = `/Library/LaunchDaemons/${LABEL}.plist`;
const UNIT = "/etc/systemd/system/dmmarket.service";

function serviceDirectory(platform = process.platform) {
  if (platform === "linux") return "/var/lib/dmmarket";
  if (platform === "darwin") return "/Library/Application Support/DMMarket";
  if (platform === "win32") return path.win32.join(process.env.ProgramData || "C:\\ProgramData", "DMMarket");
  throw new Error("El servicio solo está disponible en Ubuntu, Windows y macOS.");
}

function systemdUnit(dir) {
  return `[Unit]
Description=DMMarket
Wants=network-online.target
After=network-online.target mysql.service mariadb.service
StartLimitIntervalSec=0

[Service]
Type=simple
User=dmmarket
Group=dmmarket
WorkingDirectory=${dir}
ExecStart=${dir}/dmmarket-app
Environment=DMMARKET_SERVICE=1
Restart=always
RestartSec=5
UMask=0077
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
`;
}

function launchdPlist(dir, user) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${LABEL}</string>
<key>ProgramArguments</key><array><string>${xml(dir)}/dmmarket-app</string></array>
<key>WorkingDirectory</key><string>${xml(dir)}</string>
<key>UserName</key><string>${xml(user)}</string>
<key>EnvironmentVariables</key><dict><key>DMMARKET_SERVICE</key><string>1</string></dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>5</integer>
<key>StandardOutPath</key><string>${xml(dir)}/dmmarket.log</string>
<key>StandardErrorPath</key><string>${xml(dir)}/dmmarket-error.log</string>
</dict></plist>
`;
}

function windowsRunner(dir) {
  const binary = path.win32.join(dir, "dmmarket-app.exe");
  return `$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath ${psQuote(dir)}
$env:DMMARKET_SERVICE = '1'
while ($true) {
  & ${psQuote(binary)} >> ${psQuote(path.win32.join(dir, "dmmarket.log"))} 2>&1
  Start-Sleep -Seconds 5
}
`;
}

function checkAdmin() {
  if (process.platform === "win32") {
    powershell(
      "if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Ejecuta PowerShell como administrador.' }",
    );
  } else if (process.getuid() !== 0) {
    throw new Error("Ejecuta este comando con sudo para registrar el servicio.");
  }
}

function stopWindows(dir) {
  const runner = psQuote(path.win32.join(dir, "run-service.ps1"));
  powershell(
    `Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains(${runner}) } | ForEach-Object { & taskkill.exe /PID $_.ProcessId /T /F | Out-Null }; $task = Get-ScheduledTask -TaskName '${TASK}' -ErrorAction SilentlyContinue; if ($task) { Stop-ScheduledTask -TaskName '${TASK}'; Unregister-ScheduledTask -TaskName '${TASK}' -Confirm:$false }`,
  );
}

function stopService(dir) {
  if (process.platform === "linux") {
    if (fs.existsSync(UNIT)) run("systemctl", ["stop", "dmmarket.service"]);
  } else if (process.platform === "darwin") {
    run("launchctl", ["bootout", `system/${LABEL}`], true);
  } else {
    stopWindows(dir);
  }
}

function installService({ configuration } = {}) {
  checkAdmin();
  const dir = serviceDirectory();
  const envSource = path.resolve(".env");
  const envTarget = path.join(dir, ".env");
  if (!configuration && !fs.existsSync(envTarget) && !fs.existsSync(envSource)) {
    throw new Error("Crea el archivo .env con la conexión a MySQL antes de instalar.");
  }
  if (!configuration) {
    const { readConfiguration } = require("./setup-config");
    const saved = readConfiguration(fs.existsSync(envTarget) ? dir : process.cwd());
    if (webEnabled(saved)) configuration = saved;
  }
  const webPlan = prepareWeb(configuration || {});
  let envContent;
  if (configuration) {
    const { readConfiguration, serializeConfiguration } = require("./setup-config");
    const previous = readConfiguration(fs.existsSync(envTarget) ? dir : process.cwd());
    envContent = serializeConfiguration({ ...previous, ...configuration });
  }
  const macUser = process.env.SUDO_USER;
  if (process.platform === "darwin" && (!macUser || macUser === "root")) {
    throw new Error("Instala desde tu cuenta habitual usando sudo, no desde una sesión root.");
  }
  if (process.platform === "linux") {
    const exists = spawnSync("id", ["-u", "dmmarket"]);
    if (exists.status !== 0)
      run("useradd", ["--system", "--user-group", "--home-dir", dir, "--shell", "/usr/sbin/nologin", "dmmarket"]);
  }
  stopWeb();
  stopService(dir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform === "win32") {
    run("icacls.exe", [
      dir,
      "/inheritance:r",
      "/grant:r",
      "*S-1-5-18:(OI)(CI)F",
      "*S-1-5-32-544:(OI)(CI)F",
      "*S-1-5-19:(OI)(CI)M",
    ]);
  }
  const binary = path.join(dir, process.platform === "win32" ? "dmmarket-app.exe" : "dmmarket-app");
  if (path.resolve(process.execPath) !== binary) fs.copyFileSync(process.execPath, binary);
  if (configuration) {
    const temporary = path.join(dir, `.env.setup-${process.pid}`);
    try {
      fs.writeFileSync(temporary, envContent, { mode: 0o600 });
      fs.renameSync(temporary, envTarget);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  } else if (!fs.existsSync(envTarget)) fs.copyFileSync(envSource, envTarget);
  if (process.platform !== "win32") {
    fs.chmodSync(binary, 0o755);
    fs.chmodSync(envTarget, 0o600);
    fs.chmodSync(dir, 0o700);
  }
  installWeb(configuration || {}, webPlan);
  if (process.platform === "linux") {
    run("chown", ["-R", "dmmarket:dmmarket", dir]);
    fs.writeFileSync(UNIT, systemdUnit(dir), { mode: 0o644 });
    run("systemctl", ["daemon-reload"]);
    run("systemctl", ["enable", "--now", "dmmarket.service"]);
  } else if (process.platform === "darwin") {
    run("chown", ["-R", macUser, dir]);
    fs.writeFileSync(PLIST, launchdPlist(dir, macUser), { mode: 0o644 });
    run("chown", ["root:wheel", PLIST]);
    run("launchctl", ["enable", `system/${LABEL}`]);
    run("launchctl", ["bootstrap", "system", PLIST]);
  } else {
    const runner = path.join(dir, "run-service.ps1");
    fs.writeFileSync(runner, windowsRunner(dir));
    powershell(
      `$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ${psQuote(`-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${runner}"`)} -WorkingDirectory ${psQuote(dir)}; $trigger = New-ScheduledTaskTrigger -AtStartup; $principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount; $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew; Register-ScheduledTask -TaskName '${TASK}' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null; Start-ScheduledTask -TaskName '${TASK}'`,
    );
  }
  console.log(`Arranque automático registrado. Aplicación y configuración: ${dir}`);
  console.log(
    webEnabled(configuration || {})
      ? `Acceso: http://${configuration.WEB_HOSTNAME}. Configura el DNS local y comprueba el firewall.`
      : `Acceso: http://IP-DEL-SERVIDOR:${configuration?.PORT || 8000}. Comprueba el estado del servicio y el firewall.`,
  );
}

function uninstallService() {
  checkAdmin();
  uninstallWeb();
  const dir = serviceDirectory();
  stopService(dir);
  if (process.platform === "linux") {
    run("systemctl", ["disable", "dmmarket.service"], true);
    fs.rmSync(UNIT, { force: true });
    run("systemctl", ["daemon-reload"]);
  } else if (process.platform === "darwin") {
    fs.rmSync(PLIST, { force: true });
  }
  console.log(`Arranque automático eliminado. Los archivos y .env se conservan en ${dir}`);
}

module.exports = {
  installService,
  uninstallService,
  systemdUnit,
  launchdPlist,
  windowsRunner,
  serviceDirectory,
  checkAdmin,
};
