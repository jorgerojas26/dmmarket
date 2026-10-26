import path from "node:path";
import { fileURLToPath } from "node:url";
import { withTestSession } from "../tests/support/test-session.cjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] || "all";
const args = process.argv.slice(3);
async function run(command) {
  const child = Bun.spawn(command, {
    cwd: root,
    env: { ...process.env, CI: "true" },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const interrupt = () => child.kill("SIGINT");
  const terminate = () => child.kill("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    if ((await child.exited) !== 0) throw new Error(`Falló ${command.join(" ")}`);
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}
try {
  if (!["all", "backend", "frontend", "real"].includes(command)) throw new Error(`Suite desconocida: ${command}`);
  await withTestSession(async () => {
    if (command === "real") {
      await run(["bun", "tests/support/run-real.cjs"]);
      return;
    }
    await run(["bun", "tests/support/prepare.cjs"]);
    if (["all", "backend"].includes(command)) {
      await run(["bun", "--elide-lines=0", "--filter", "@dmmarket/backend", "test:integration", ...args]);
      await run(["bun", "tests/support/run-real.cjs"]);
      await run(["bun", "--elide-lines=0", "--filter", "@dmmarket/backend", "test:cache"]);
    }
    if (["all", "frontend"].includes(command)) {
      await run(["bun", "--elide-lines=0", "--filter", "@dmmarket/frontend", "test:e2e", ...args]);
      await run(["bun", "--elide-lines=0", "--filter", "@dmmarket/frontend", "test:integration"]);
    }
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
