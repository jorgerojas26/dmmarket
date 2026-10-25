#!/usr/bin/env bun
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");

const container = process.env.DMMARKET_TEST_CONTAINER;
if (
  !/^[a-f0-9]{12,64}$/.test(container || "") ||
  process.env.DATABASE_HOST !== "127.0.0.1" ||
  process.env.DATABASE_NAME !== "dmmarket_auth_test" ||
  process.env.DATABASE_PORT === "3306"
)
  throw new Error("El cliente de respaldo requiere el contenedor desechable autorizado.");
const metadata = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }))[0];
if (metadata.Config.Labels["dmmarket.auth-test"] !== "true" || metadata.Config.Image !== "dmmarket/mysql:5.0.24")
  throw new Error("Contenedor no autorizado.");
const args = process.argv.slice(2);
const defaults = args.find((value) => value.startsWith("--defaults-file="));
let input;
let clientArgs = args;
if (defaults) {
  const file = path.resolve(defaults.slice("--defaults-file=".length));
  const directory = path.resolve(process.env.BACKUP_DIRECTORY);
  if (!file.startsWith(`${directory}${path.sep}`) || path.basename(file) !== "client.cnf")
    throw new Error("Archivo de credenciales fuera del laboratorio.");
  input = fs.readFileSync(file);
  clientArgs = [
    "--defaults-file=/dev/stdin",
    "--host=127.0.0.1",
    "--port=3306",
    ...args.filter((value) => value !== defaults),
  ];
}
const child = spawn("docker", ["exec", ...(input ? ["-i"] : []), container, "mysqldump", ...clientArgs], {
  stdio: [input ? "pipe" : "ignore", "inherit", "inherit"],
});
if (input) child.stdin.end(input);
child.once("error", () => process.exit(1));
child.once("exit", (code) => process.exit(code || 0));
