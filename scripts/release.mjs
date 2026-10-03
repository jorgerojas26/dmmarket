import { execSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageInstaller } from "./package-installers.mjs";

const REPO = "jorgerojas26/dmmarket";
const EXE = "dmmarket-app.exe";
const SHA_FILE = "dmmarket-app.exe.sha256";
const MAC_BIN = "dmmarket-app-mac";
const MAC_SHA_FILE = "dmmarket-app-mac.sha256";
const LINUX_BIN = "dmmarket-app-linux";
const LINUX_SHA_FILE = "dmmarket-app-linux.sha256";

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
if (runQuiet(`git tag -l ${tag}`)) fail(`El tag ${tag} ya existe localmente.`);
if (runQuiet(`git ls-remote --exit-code origin refs/tags/${tag}`)) {
  fail(`El tag ${tag} ya existe en el remoto. Versioná de nuevo en packages/backend/package.json.`);
}

console.log(`Publicando release ${tag} para ${REPO}`);

// ── 2. Builds ───────────────────────────────────────────────────────────────
run("bun", ["--filter", "@dmmarket/backend", "build:windows"], { cwd: root });

const sha256Of = (filePath) => createHash("sha256").update(readFileSync(filePath)).digest("hex");

const macBinPath = path.join(backendDir, MAC_BIN);
const macTarget = process.platform === "darwin" ? `bun-darwin-${process.arch}` : "bun-darwin-arm64";
run(
  "bun",
  ["build", "--compile", `--target=${macTarget}`, "main.js", "--minify", "--external", "mysql", "--outfile", MAC_BIN],
  { cwd: backendDir },
);
if (!existsSync(macBinPath)) fail(`No se encontró ${MAC_BIN} después del build.`);

const linuxBinPath = path.join(backendDir, LINUX_BIN);
run(
  "bun",
  [
    "build",
    "--compile",
    "--target=bun-linux-x64-baseline",
    "main.js",
    "--minify",
    "--external",
    "mysql",
    "--outfile",
    LINUX_BIN,
  ],
  { cwd: backendDir },
);
if (!existsSync(linuxBinPath)) fail(`No se encontró ${LINUX_BIN} después del build.`);

// ── 3. sha256 de los binarios ───────────────────────────────────────────────
const exePath = path.join(backendDir, EXE);
if (!existsSync(exePath)) fail(`No se encontró ${EXE} después del build.`);
const exeHash = sha256Of(exePath);
writeFileSync(path.join(backendDir, SHA_FILE), exeHash); // 64 chars, nada más
console.log(`sha256 (${EXE}): ${exeHash}`);

const macHash = sha256Of(macBinPath);
writeFileSync(path.join(backendDir, MAC_SHA_FILE), macHash);
console.log(`sha256 (${MAC_BIN}): ${macHash}`);

const linuxHash = sha256Of(linuxBinPath);
writeFileSync(path.join(backendDir, LINUX_SHA_FILE), linuxHash);
console.log(`sha256 (${LINUX_BIN}): ${linuxHash}`);

const installerAssets = ["windows", "macos", "linux"].flatMap((platform) => packageInstaller(root, platform, version));

// ── 4. Notas de la release: resumen de CHANGELOG.md + commits ──────────────
// Se extrae el bloque "## [v<version>]" hasta la siguiente sección "## ".
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

const changelog = changelogNotes(version);
if (!changelog) fail(`Falta la sección "## [v${version}]" en CHANGELOG.md.`);

const previousTag = runQuiet("git describe --tags --abbrev=0");
const commitRange = previousTag ? `${previousTag}..HEAD` : "HEAD";
const commits = runQuiet(`git log --reverse --oneline ${commitRange}`);
const commitList = commits
  ? commits
      .split("\n")
      .map((commit) => `- ${commit}`)
      .join("\n")
  : "- No se encontraron commits para esta versión.";
const notes = `${changelog}\n\n## Commits incluidos\n\n${commitList}`;

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
  linuxBinPath,
  path.join(backendDir, LINUX_SHA_FILE),
  ...installerAssets,
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
console.log(`  Binario Linux:   https://github.com/${REPO}/releases/download/${tag}/${LINUX_BIN}`);
console.log(`  Hash Linux:      https://github.com/${REPO}/releases/download/${tag}/${LINUX_SHA_FILE}`);
console.log(`  sha256 (win):    ${exeHash}`);
console.log(`  sha256 (mac):    ${macHash}`);
console.log(`  sha256 (linux):  ${linuxHash}`);
for (const asset of installerAssets.filter((file) => file.endsWith(".zip"))) {
  console.log(`  Instalador:     https://github.com/${REPO}/releases/download/${tag}/${path.basename(asset)}`);
}
