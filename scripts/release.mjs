// Publica una release nueva para el auto-update.
// Uso: bun run release  (desde la raíz; requiere gh CLI autenticado y git en main al día)
//
// Flujo:
//   1. Pre-checks: gh instalado, tag v<version> no existe (local ni remoto)
//   2. Build Windows (frontend + binario) — si falla, no se toca GitHub
//   3. sha256 del exe → packages/backend/dmmarket-app.exe.sha256 (64 chars hex, sin salto de línea)
//   4. Notas de la release: se leen de CHANGELOG.md (sección "## [v<version>]"), la fuente
//      curada y legible para no técnicos. Fallback al log de commits si no existe la entrada.
//   5. gh release create v<version> con los 4 assets (crea el tag remoto)
//   6. Tag local + push
import { execSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "jorgerojas26/dmmarket";
const EXE = "dmmarket-app.exe";
const SHA_FILE = "dmmarket-app.exe.sha256";
const MAC_BIN = "dmmarket-app-mac";
const MAC_SHA_FILE = "dmmarket-app-mac.sha256";

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

// ── 2. Builds ───────────────────────────────────────────────────────────────
// build:windows ya corre build:prepare (frontend + assets.js + version.js),
// así que el binario macOS se compila DESPUÉS reutilizando ese output (sin
// repetir el build del frontend).
run("bun", ["--filter", "@dmmarket/backend", "build:windows"], { cwd: root });

const sha256Of = (filePath) => createHash("sha256").update(readFileSync(filePath)).digest("hex");

// Binario macOS: se compila para el host (bun compila a la plataforma actual)
// y se renombra como asset de la release.
const macBinPath = path.join(backendDir, MAC_BIN);
run("bun", ["build", "--compile", "index.js", "--minify", "--external", "mysql", "--outfile", MAC_BIN], {
  cwd: backendDir,
});
if (!existsSync(macBinPath)) fail(`No se encontró ${MAC_BIN} después del build.`);

// ── 3. sha256 de los binarios ───────────────────────────────────────────────
const exePath = path.join(backendDir, EXE);
if (!existsSync(exePath)) fail(`No se encontró ${EXE} después del build.`);
const exeHash = sha256Of(exePath);
writeFileSync(path.join(backendDir, SHA_FILE), exeHash); // 64 chars, nada más
console.log(`sha256 (${EXE}): ${exeHash}`);

const macHash = sha256Of(macBinPath);
writeFileSync(path.join(backendDir, MAC_SHA_FILE), macHash);
console.log(`sha256 (${MAC_BIN}): ${macHash}`);

// ── 4. Notas de la release: desde CHANGELOG.md (fuente curada y legible) ────
// Se extrae el bloque "## [v<version>]" hasta la siguiente sección "## ".
// Si el changelog no tiene la entrada, se cae al log de commits (fallback).
function changelogNotes(version) {
  const filePath = path.join(root, "CHANGELOG.md");
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, "utf8");
  const match = content.match(new RegExp(`## \\[v?${version}\\]`));
  if (!match) return null;
  const block = content.slice(match.index);
  const nextSection = block.search(/\n## /);
  return (nextSection === -1 ? block : block.slice(0, nextSection)).trim();
}

const previousTag = runQuiet("git describe --tags --abbrev=0");
const notes = changelogNotes(version) || (previousTag ? runQuiet(`git log --oneline ${previousTag}..HEAD`) || "" : "");

if (notes && !notes.includes("## [")) {
  console.log(`\n⚠ Notas tomadas del log de commits (no hay entrada "## [v${version}]" en CHANGELOG.md).`);
}

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
  macBinPath,
  path.join(backendDir, MAC_SHA_FILE),
]);

// ── 6. Tag local + push ────────────────────────────────────────────────────
run("git", ["tag", tag]);
run("git", ["push", "origin", tag]);

// ── 7. Resumen ─────────────────────────────────────────────────────────────
console.log(`\n✓ Release ${tag} publicada: https://github.com/${REPO}/releases/tag/${tag}`);
console.log(`  Binario Windows: https://github.com/${REPO}/releases/download/${tag}/${EXE}`);
console.log(`  Hash Windows:    https://github.com/${REPO}/releases/download/${tag}/${SHA_FILE}`);
console.log(`  Binario macOS:   https://github.com/${REPO}/releases/download/${tag}/${MAC_BIN}`);
console.log(`  Hash macOS:      https://github.com/${REPO}/releases/download/${tag}/${MAC_SHA_FILE}`);
console.log(`  sha256 (win):    ${exeHash}`);
console.log(`  sha256 (mac):    ${macHash}`);
