// Publica una release nueva para el auto-update.
// Uso: bun run release  (desde la raíz; requiere gh CLI autenticado y git en main al día)
//
// Flujo:
//   1. Pre-checks: gh instalado, tag v<version> no existe (local ni remoto)
//   2. Build Windows (frontend + binario) — si falla, no se toca GitHub
//   3. sha256 del exe → packages/backend/dmmarket-app.exe.sha256 (64 chars hex, sin salto de línea)
//   4. gh release create v<version> con los 2 assets (crea el tag remoto)
//   5. Tag local + push
import { execSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "jorgerojas26/dmmarket";
const EXE = "dmmarket-app.exe";
const SHA_FILE = "dmmarket-app.exe.sha256";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = path.join(root, "packages", "backend");

const { version } = JSON.parse(readFileSync(path.join(backendDir, "package.json"), "utf8"));
const tag = `v${version}`;

const fail = (message) => {
  console.error(`\n✗ ${message}`);
  process.exit(1);
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    fail(`Fallo ejecutando: ${command} ${args.join(" ")} (exit ${result.status})`);
  }
};

const runQuiet = (command) => {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" }).trim();
  } catch {
    return null;
  }
};

// ── 1. Pre-checks ──────────────────────────────────────────────────────────
if (!runQuiet("command -v gh")) fail("gh CLI no está instalado o no está en el PATH");
if (runQuiet("git tag -l " + tag)) fail(`El tag ${tag} ya existe localmente.`);
if (runQuiet(`git ls-remote --exit-code origin refs/tags/${tag}`)) {
  fail(`El tag ${tag} ya existe en el remoto. Versioná de nuevo en packages/backend/package.json.`);
}

console.log(`Publicando release ${tag} para ${REPO}`);

// ── 2. Build Windows ───────────────────────────────────────────────────────
run("bun", ["--filter", "@dmmarket/backend", "build:windows"], { cwd: root });

// ── 3. sha256 del binario ──────────────────────────────────────────────────
const exePath = path.join(backendDir, EXE);
if (!existsSync(exePath)) fail(`No se encontró ${EXE} después del build.`);
const hash = createHash("sha256").update(readFileSync(exePath)).digest("hex");
writeFileSync(path.join(backendDir, SHA_FILE), hash); // 64 chars, nada más
console.log(`sha256 (${EXE}): ${hash}`);

// ── 4. Notas de la release: commits desde el último tag ────────────────────
const previousTag = runQuiet("git describe --tags --abbrev=0");
const notes = previousTag ? runQuiet(`git log --oneline ${previousTag}..HEAD`) || "" : "";

// ── 5. Release en GitHub (crea tag remoto + release + sube assets) ─────────
run("gh", [
  "release",
  "create",
  tag,
  "--repo",
  REPO,
  "--title",
  `DMMarket ${version}`,
  "--notes",
  notes || `Release ${version}`,
  exePath,
  path.join(backendDir, SHA_FILE),
]);

// ── 6. Tag local + push ────────────────────────────────────────────────────
run("git", ["tag", tag]);
run("git", ["push", "origin", tag]);

// ── 7. Resumen ─────────────────────────────────────────────────────────────
console.log(`\n✓ Release ${tag} publicada: https://github.com/${REPO}/releases/tag/${tag}`);
console.log(`  Binario: https://github.com/${REPO}/releases/download/${tag}/${EXE}`);
console.log(`  Hash:    https://github.com/${REPO}/releases/download/${tag}/${SHA_FILE}`);
console.log(`  sha256:  ${hash}`);
