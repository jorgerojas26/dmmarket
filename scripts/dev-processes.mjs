import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export function acquireDevelopmentLock(directory, name) {
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${name}.json`);
  if (existsSync(file)) {
    const previous = JSON.parse(readFileSync(file, "utf8"));
    try {
      process.kill(previous.pid, 0);
      throw new Error(`Ya hay un proceso ${name} activo en este worktree (PID ${previous.pid}).`);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    rmSync(file);
  }
  writeFileSync(file, JSON.stringify({ pid: process.pid }), { flag: "wx", mode: 0o600 });
  return () => rmSync(file, { force: true });
}

export async function run(args, options = {}) {
  const { onSpawn, processGroup = false, ...spawnOptions } = options;
  const grouped = processGroup && process.platform !== "win32";
  const parent = process.ppid;
  const child = Bun.spawn(args, {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    ...spawnOptions,
    detached: grouped,
  });
  onSpawn?.(child);
  let stopping = false;
  let deadline;
  const signalChild = (signal) => {
    try {
      if (grouped) process.kill(-child.pid, signal);
      else if (child.exitCode === null) child.kill(signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    signalChild(signal);
    deadline = setTimeout(() => signalChild("SIGKILL"), 3000);
  };
  const interrupt = () => stop("SIGINT");
  const terminate = () => stop("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  const watchdog = setInterval(() => {
    if (process.ppid !== parent) terminate();
  }, 250);
  try {
    const code = await child.exited;
    if (code !== 0 && !stopping) throw new Error(`${args.slice(0, 3).join(" ")} terminó con código ${code}.`);
  } finally {
    clearInterval(watchdog);
    clearTimeout(deadline);
    if (grouped) signalChild("SIGKILL");
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}
