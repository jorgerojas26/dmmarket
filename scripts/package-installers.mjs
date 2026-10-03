import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const platforms = {
  linux: { binary: "dmmarket-app-linux", folder: "linux", files: ["Instalar.sh"] },
  windows: { binary: "dmmarket-app.exe", folder: "windows", files: ["Instalar.cmd", "Instalar.ps1"] },
  macos: { binary: "dmmarket-app-mac", folder: "macos", files: ["Instalar.command"] },
};

export function packageInstaller(root, platform, version) {
  const definition = platforms[platform];
  if (!definition) throw new Error("Elige linux, windows o macos.");
  const temporary = mkdtempSync(path.join(os.tmpdir(), "dmmarket-installer-"));
  const folder = `DMMarket-${platform}`;
  const directory = path.join(temporary, folder);
  const output = path.join(root, "dist", `DMMarket-${version}-${platform}.zip`);
  try {
    mkdirSync(directory);
    mkdirSync(path.dirname(output), { recursive: true });
    const binary = path.join(directory, definition.binary);
    copyFileSync(path.join(root, "packages", "backend", definition.binary), binary);
    chmodSync(binary, 0o755);
    writeFileSync(`${binary}.sha256`, createHash("sha256").update(readFileSync(binary)).digest("hex"));
    for (const name of definition.files) {
      const target = path.join(directory, name);
      copyFileSync(path.join(root, "installers", definition.folder, name), target);
      if (name.endsWith(".sh") || name.endsWith(".command")) chmodSync(target, 0o755);
    }
    copyFileSync(path.join(root, "installers", "LEEME.txt"), path.join(directory, "LEEME.txt"));
    rmSync(output, { force: true });
    const result = spawnSync("zip", ["-q", "-r", "-X", output, folder], { cwd: temporary, encoding: "utf8" });
    if (result.error || result.status !== 0) {
      throw new Error(
        `No se pudo generar el paquete de ${platform}. Instala zip y vuelve a intentar. ${result.error?.message || result.stderr || ""}`,
      );
    }
    writeFileSync(`${output}.sha256`, createHash("sha256").update(readFileSync(output)).digest("hex"));
    return [output, `${output}.sha256`];
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { version } = JSON.parse(readFileSync(path.join(root, "packages", "backend", "package.json"), "utf8"));
  const requested = process.argv[2] ? [process.argv[2]] : Object.keys(platforms);
  for (const platform of requested) {
    console.log(packageInstaller(root, platform, version).join("\n"));
  }
}
