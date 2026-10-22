import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
let directory;

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `${command} terminó con error.`);
  return result.stdout;
}

function core(args) {
  return run(process.execPath, [path.join(root, "scripts/close-receivables.mjs"), ...args]);
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === "--help") {
    console.log("Uso: bun scripts/close-local-receivables.mjs");
    console.log("Solo bdsolser_md_nieto local, puerto 3307 y contenedor dm_mysql.");
    console.log("Haz el respaldo manual antes de ejecutarlo. Muestra el plan y pide escribir CERRAR para aplicarlo.");
    return;
  }
  if (process.argv.length !== 2) throw new Error("Este comando no admite opciones de conexión.");
  if (!process.stdin.isTTY) throw new Error("Ejecuta el comando en una terminal interactiva, sin tuberías.");
  const [container] = JSON.parse(run("docker", ["inspect", "dm_mysql"]));
  if (!container.State.Running) throw new Error("Inicia primero el contenedor dm_mysql.");
  const bindings = container.NetworkSettings.Ports["3306/tcp"] || [];
  if (!bindings.some((binding) => binding.HostPort === "3307")) {
    throw new Error("dm_mysql no está publicado en el puerto local 3307.");
  }
  const cache = path.join(root, ".cache");
  fs.mkdirSync(cache, { recursive: true });
  directory = fs.mkdtempSync(path.join(cache, "cierre-local-"));
  fs.chmodSync(directory, 0o700);
  const env = path.join(directory, "local.env");
  const planFile = path.join(directory, "plan.json");
  fs.writeFileSync(
    env,
    "DATABASE_HOST=127.0.0.1\nDATABASE_PORT=3307\nDATABASE_USER=root\nDATABASE_PASSWORD=root\nDATABASE_NAME=bdsolser_md_nieto\n",
    { flag: "wx", mode: 0o600 },
  );
  console.log("Revisando la base local bdsolser_md_nieto (127.0.0.1:3307)...");
  core(["plan", "--env", env, "--out", planFile]);
  const bytes = fs.readFileSync(planFile);
  const plan = JSON.parse(bytes);
  if (plan.target.serverHost !== container.Config.Hostname) {
    throw new Error("La base del puerto 3307 no coincide con dm_mysql. No se aplica el cierre.");
  }
  if (plan.summary.clients === 0) {
    console.log("No hay deudas vigentes para cerrar. No se modificó la base de datos.");
    return;
  }
  console.log(`\nSe cerrarán ${plan.summary.clients} clientes y ${plan.summary.documents} documentos.`);
  console.log(`Importe: USD ${plan.summary.amountUSD}. No se registrarán pagos.`);
  console.log("El respaldo debes haberlo realizado y verificado manualmente. Este script no genera respaldos.");
  console.log("Detén DMMarket y cualquier proceso que escriba ventas o cobranza. No detengas MySQL.");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let answer;
  try {
    answer = await prompt.question(
      "¿Respaldo manual listo, escrituras detenidas y cierre autorizado? Escribe CERRAR: ",
    );
  } finally {
    prompt.close();
  }
  if (answer.trim() !== "CERRAR") {
    console.log("Cancelado. No se modificó la base de datos.");
    return;
  }
  console.log("Aplicando el cierre con las validaciones del plan...");
  core([
    "apply",
    "--env",
    env,
    "--plan",
    planFile,
    "--confirm",
    createHash("sha256").update(bytes).digest("hex"),
    "--maintenance",
    "--backup-confirmed",
    "--report",
    path.join(directory, "recibo.json"),
  ]);
  console.log("Listo: cierre confirmado y deuda visible verificada en cero. Puedes iniciar DMMarket.");
}

main()
  .catch((error) => {
    console.error("ERROR:", error.message);
    console.error("Si existe un recibo prepared, revisa el resultado antes de repetir; conserva el mismo plan.");
    process.exitCode = 1;
  })
  .finally(() => {
    if (directory) console.log("Archivos:", directory);
  });
