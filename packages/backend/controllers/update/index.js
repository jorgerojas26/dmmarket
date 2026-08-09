const version = require("../../version.js");
const { compareSemver } = require("../../utils/semver");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// Detección de binario compilado (misma regla que index.js): los assets embebidos
// solo existen en el binario compilado.
const IS_STANDALONE = typeof Bun !== "undefined" && Bun.embeddedFiles.length > 0;

const GITHUB_API = "https://api.github.com/repos/jorgerojas26/dmmarket/releases/latest";

// Carpeta de descarga al lado del binario (cwd del proceso; el .env también se lee de ahí).
const UPDATE_DIR = path.join(process.cwd(), ".dmmarket-update");
const NEW_EXE = path.join(UPDATE_DIR, "new.exe");

// Estado de descarga en memoria para el polling de progreso (una descarga a la vez).
const downloadState = { active: false, bytes: 0, total: 0 };

const GET_STATUS = (_req, res) => {
  res.status(200).json({
    currentVersion: version,
    platform: process.platform,
    standalone: IS_STANDALONE,
  });
};

// Timeout del fetch a GitHub. Manual (no AbortSignal.timeout) para poder hacer unref():
// un timer con ref() mantiene vivo el event loop 15s después de cada check (tests colgados,
// proceso que no sale). El unref lo deja como best-effort: si el proceso se va a cerrar,
// el timeout no lo retiene.
function fetchWithTimeout(url, options = {}, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  timer.unref();
  return fetch(url, { ...options, signal: controller.signal });
}

// Los endpoints de update que tocan disco/procesos solo tienen sentido en el binario compilado:
// en dev (nodemon) la descarga/apply se rechazan con 400. El check sí corre en dev (solo lee GitHub).
const requireStandalone = (res) => {
  if (IS_STANDALONE) return true;
  res.status(400).json({ error: { message: "El auto-update solo está disponible en el binario compilado" } });
  return false;
};

// Consulta GitHub Releases y compara semver contra la versión actual.
// El fetch lo hace el server (no el browser) — mismo origin, sin CORS.
const POST_CHECK = async (_req, res) => {
  try {
    const response = await fetchWithTimeout(GITHUB_API, {
      headers: {
        "User-Agent": "dmmarket-updater",
        Accept: "application/vnd.github+json",
      },
    });

    if (response.status === 404) {
      return res.status(404).json({ error: { message: "No hay nuevas actualizaciones" } });
    }
    if (response.status === 403 || response.status === 429) {
      return res.status(429).json({
        error: { message: "Hubo un error. Intente de nuevo más tarde" },
      });
    }
    if (!response.ok) {
      return res.status(502).json({ error: { message: `HTTP error: ${response.status}` } });
    }

    const release = await response.json();
    const exe = release.assets?.find((asset) => asset.name === "dmmarket-app.exe");
    const sha256 = release.assets?.find((asset) => asset.name === "dmmarket-app.exe.sha256");
    if (!exe || !sha256) {
      return res.status(502).json({
        error: {
          message: "Release inválida. Por favor contacte a su administrador",
        },
      });
    }

    const latestVersion = String(release.tag_name || "").replace(/^v/, "");
    const comparison = compareSemver(latestVersion, version);
    if (Number.isNaN(comparison)) {
      return res.status(502).json({ error: { message: `Versión de la release inválida: ${release.tag_name}` } });
    }

    res.status(200).json({
      updateAvailable: comparison > 0,
      latestVersion,
      notes: release.body || "",
      publishedAt: release.published_at || null,
      assetUrl: exe.browser_download_url,
      sha256AssetUrl: sha256.browser_download_url,
    });
  } catch (_error) {
    res.status(502).json({ error: { message: "No se pudo contactar al servidor. Revisá tu conexión a internet." } });
  }
};

// Descarga el binario a .dmmarket-update/new.exe y verifica sha256 contra el asset de la release.
// Con hash que no coincide se borra todo y se responde error: nunca se aplica un binario corrupto.
const POST_DOWNLOAD = async (req, res) => {
  if (!requireStandalone(res)) return;

  const { assetUrl, sha256AssetUrl } = req.body || {};
  if (!assetUrl || !sha256AssetUrl) {
    return res
      .status(400)
      .json({ error: { message: "Faltan las URLs de descarga. Vuelve a buscar actualizaciones." } });
  }
  if (downloadState.active) {
    return res.status(409).json({ error: { message: "Ya hay una descarga en curso" } });
  }

  downloadState.active = true;
  downloadState.bytes = 0;
  downloadState.total = 0;
  fs.mkdirSync(UPDATE_DIR, { recursive: true });
  const tmpPath = path.join(UPDATE_DIR, "new.exe.tmp");
  fs.rmSync(tmpPath, { force: true });

  try {
    // 1. Binario (streaming, con progreso).
    const exeResponse = await fetch(assetUrl, { signal: AbortSignal.timeout(600_000) });
    if (!exeResponse.ok) {
      throw new Error(`La descarga del binario falló (HTTP ${exeResponse.status})`);
    }
    downloadState.total = Number(exeResponse.headers.get("content-length")) || 0;
    const writer = fs.createWriteStream(tmpPath);
    for await (const chunk of exeResponse.body) {
      writer.write(chunk);
      downloadState.bytes += chunk.length;
    }
    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
      writer.end();
    });

    // 2. Hash esperado (asset .sha256).
    const shaResponse = await fetch(sha256AssetUrl, { signal: AbortSignal.timeout(30_000) });
    if (!shaResponse.ok) {
      throw new Error(`No se pudo descargar el hash de verificación (HTTP ${shaResponse.status})`);
    }
    const expected = (await shaResponse.text()).trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(expected)) {
      throw new Error("El hash esperado de la release es inválido");
    }

    // 3. Verificación.
    const actual = await sha256File(tmpPath);
    if (actual !== expected) {
      throw new Error("La verificación sha256 falló: el binario descargado no coincide con la release");
    }

    fs.renameSync(tmpPath, NEW_EXE);
    res.status(200).json({ success: true, message: "Actualización descargada y verificada" });
  } catch (error) {
    fs.rmSync(tmpPath, { force: true });
    if (!res.headersSent) {
      res.status(500).json({ error: { message: error.message || "Error al descargar la actualización" } });
    }
  } finally {
    downloadState.active = false;
  }
};

const GET_PROGRESS = (_req, res) => {
  res.status(200).json({
    active: downloadState.active,
    bytes: downloadState.bytes,
    total: downloadState.total,
  });
};

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

// Genera el update.bat (función pura para poder testearla): la secuencia exacta del truco del rename.
function buildUpdateBat(exeName) {
  const oldName = exeName.replace(/\.exe$/i, "") + ".old.exe";
  return [
    "@echo off",
    "timeout /t 3 /nobreak >nul",
    `rename "${exeName}" "${oldName}"`,
    `move /y ".dmmarket-update\\new.exe" "${exeName}"`,
    `start "" "${exeName}"`,
    `del /q "${oldName}"`,
  ].join("\r\n");
}

// Aplica el update: escribe update.bat junto al binario, lo lanza detached y el proceso sale.
// Truco del rename de Windows: un exe en ejecución no se puede sobrescribir ni borrar, pero sí renombrar.
// El bat espera 3s (muerte del proceso viejo), renombra el actual a .old.exe, mueve el nuevo,
// lo arranca y borra el viejo (best-effort; la limpieza de arranque cubre el race del del).
const POST_APPLY = (_req, res) => {
  if (!requireStandalone(res)) return;

  if (process.platform !== "win32") {
    return res.status(400).json({ error: { message: "El auto-update solo está disponible en Windows" } });
  }
  if (!fs.existsSync(NEW_EXE)) {
    return res.status(400).json({ error: { message: "No hay una actualización descargada. Descárgala primero." } });
  }

  const exeName = path.basename(process.execPath);
  const batPath = path.join(process.cwd(), "update.bat");
  fs.writeFileSync(batPath, buildUpdateBat(exeName));

  const child = require("node:child_process").spawn("cmd", ["/c", batPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  res.status(200).json({ success: true, message: "Actualización aplicada. La app se reiniciará." });
  // Delay para dejar flush de la respuesta antes de salir.
  setTimeout(() => process.exit(0), 500);
};

module.exports = {
  GET_STATUS,
  POST_CHECK,
  POST_DOWNLOAD,
  GET_PROGRESS,
  POST_APPLY,
  buildUpdateBat,
};
