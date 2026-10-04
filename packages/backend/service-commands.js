const { spawnSync } = require("node:child_process");

function run(command, args, optional = false) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (!optional && (result.error || result.status !== 0)) {
    throw new Error(`${command}: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return result.stdout?.trim();
}

function powershell(script) {
  return run("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `$ErrorActionPreference = 'Stop'; ${script}`,
  ]);
}

function psQuote(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function xml(value) {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char],
  );
}

module.exports = { run, powershell, psQuote, xml };
