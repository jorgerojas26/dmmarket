import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function caddyTargets(platform) {
  const targets = {
    linux: ["linux-x64"],
    windows: ["win32-x64"],
    macos: ["darwin-x64", "darwin-arm64"],
  };
  if (platform && !targets[platform]) throw new Error("Elige linux, windows o macos.");
  return platform ? targets[platform] : Object.values(targets).flat();
}

export function verifyCaddy(file, expected) {
  if (!existsSync(file) || createHash("sha256").update(readFileSync(file)).digest("hex") !== expected) {
    throw new Error(`La verificación de Caddy falló: ${file}`);
  }
}

export async function prepareCaddy(root, targets = caddyTargets()) {
  const manifest = JSON.parse(readFileSync(path.join(root, "packages/backend/caddy-manifest.json"), "utf8"));
  await Promise.all(
    targets.map(async (target) => {
      const definition = manifest.targets[target];
      if (!definition) throw new Error(`No hay una distribución de Caddy para ${target}.`);
      const directory = path.join(root, ".cache/caddy", target);
      const binary = path.join(directory, definition.binary);
      if (existsSync(binary) && existsSync(path.join(directory, "LICENSE"))) {
        verifyCaddy(binary, definition.sha256);
        return;
      }
      const temporary = mkdtempSync(path.join(os.tmpdir(), "dmmarket-caddy-"));
      try {
        const url = `https://github.com/caddyserver/caddy/releases/download/v${manifest.version}/${definition.archive}`;
        console.log(`Preparando Caddy ${manifest.version} (${target})…`);
        const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw new Error(`No se pudo descargar Caddy (${response.status}).`);
        const data = Buffer.from(await response.arrayBuffer());
        if (createHash("sha512").update(data).digest("hex") !== definition.sha512) {
          throw new Error(`La verificación del archivo oficial de Caddy falló (${target}).`);
        }
        const archive = path.join(temporary, definition.archive);
        writeFileSync(archive, data);
        const result = definition.archive.endsWith(".zip")
          ? spawnSync("unzip", ["-q", archive, definition.binary, "LICENSE", "-d", temporary], { encoding: "utf8" })
          : spawnSync("tar", ["-xzf", archive, "-C", temporary, definition.binary, "LICENSE"], { encoding: "utf8" });
        if (result.error || result.status !== 0)
          throw new Error(`No se pudo extraer Caddy: ${result.error?.message || result.stderr}`);
        const extracted = path.join(temporary, definition.binary);
        verifyCaddy(extracted, definition.sha256);
        mkdirSync(directory, { recursive: true });
        copyFileSync(extracted, binary);
        chmodSync(binary, 0o755);
        copyFileSync(path.join(temporary, "LICENSE"), path.join(directory, "LICENSE"));
      } finally {
        rmSync(temporary, { recursive: true, force: true });
      }
    }),
  );
}

if (import.meta.main) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  await prepareCaddy(root, caddyTargets(process.argv[2]));
}
