import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

function processIdentity(pid) {
  const result = Bun.spawnSync(["ps", "-p", String(pid), "-o", "pid=,pgid=,lstart="], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode === 1 && !result.stdout.toString().trim()) return null;
  if (result.exitCode !== 0) throw new Error(`No se pudo verificar el proceso ${pid}.`);
  return result.stdout.toString().trim().replace(/\s+/g, " ");
}

function groupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

async function recoverGroup(group) {
  if (!group || process.platform === "win32" || !groupAlive(group.pid)) return;
  if (processIdentity(group.pid) !== group.identity)
    throw new Error(`No se puede verificar el grupo abandonado ${group.pid}; no se detuvo ningún proceso.`);
  process.kill(-group.pid, "SIGTERM");
  const deadline = Date.now() + 3000;
  while (groupAlive(group.pid) && Date.now() < deadline) await Bun.sleep(50);
  if (groupAlive(group.pid)) {
    process.kill(-group.pid, "SIGKILL");
    const forcedDeadline = Date.now() + 3000;
    while (groupAlive(group.pid) && Date.now() < forcedDeadline) await Bun.sleep(50);
  }
  if (groupAlive(group.pid)) throw new Error(`El grupo abandonado ${group.pid} no se detuvo.`);
}

export async function acquireDevelopmentLock(directory, name) {
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${name}.json`);
  if (existsSync(file)) {
    const previous = JSON.parse(readFileSync(file, "utf8"));
    try {
      process.kill(previous.pid, 0);
      if (!previous.identity || processIdentity(previous.pid) === previous.identity)
        throw new Error(`Ya hay un proceso ${name} activo en este worktree (PID ${previous.pid}).`);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    await recoverGroup(previous.group);
    if (readFileSync(file, "utf8") !== JSON.stringify(previous))
      throw new Error(`El marcador ${name} cambió durante la recuperación.`);
    rmSync(file);
  }
  const state = { pid: process.pid, identity: process.platform === "win32" ? null : processIdentity(process.pid) };
  writeFileSync(file, JSON.stringify(state), { flag: "wx", mode: 0o600 });
  const release = () => {
    if (existsSync(file) && readFileSync(file, "utf8") === JSON.stringify(state)) rmSync(file);
  };
  release.trackChild = (child) => {
    if (process.platform === "win32") return;
    const identity = processIdentity(child.pid);
    if (!identity) return;
    state.group = { pid: child.pid, identity };
    writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
  };
  return release;
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
