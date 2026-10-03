// Limpieza de arranque del binario compilado (solo standalone):
//  - dmmarket-app.old.exe sobrante (race del `del` del update.bat)
//  - .dmmarket-update/ con basura de una descarga interrumpida (sin new.exe verificado se elimina;
//    con new.exe se conserva: es una actualización lista para aplicar)
const fs = require("node:fs");
const path = require("node:path");

const IS_STANDALONE = typeof Bun !== "undefined" && Bun.embeddedFiles.length > 0;

function cleanupStartup() {
  if (!IS_STANDALONE) return;

  const cwd = process.cwd();
  const exeName = path.basename(process.execPath);
  const oldExe = path.join(
    cwd,
    process.platform === "win32" ? exeName.replace(/\.exe$/i, "") + ".old.exe" : exeName + ".old",
  );
  fs.rmSync(oldExe, { force: true });

  const updateDir = path.join(cwd, ".dmmarket-update");
  const newBinary = process.platform === "win32" ? "new.exe" : "new-app";
  if (fs.existsSync(updateDir) && !fs.existsSync(path.join(updateDir, newBinary))) {
    fs.rmSync(updateDir, { recursive: true, force: true });
  }
}

module.exports = { cleanupStartup };
