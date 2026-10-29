import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = mkdtempSync(path.join(os.tmpdir(), "dmmarket-processes-"));
const moduleUrl = new URL("./dev-processes.mjs", import.meta.url).href;
const fixture = path.join(directory, "fixture.mjs");
const descendant = path.join(directory, "descendant.mjs");
const children = [];

async function waitFor(check) {
  const deadline = Date.now() + 8000;
  while (!check()) {
    assert.ok(Date.now() < deadline, "El ciclo de vida no terminó en ocho segundos.");
    await Bun.sleep(50);
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

function start(name) {
  const child = Bun.spawn(["bun", fixture, directory, name], { stdout: "ignore", stderr: "pipe" });
  children.push(child);
  return child;
}

try {
  writeFileSync(descendant, `import { writeFileSync } from "node:fs";
writeFileSync(process.argv[2], String(process.pid));
setInterval(() => {}, 1000);
`);
  writeFileSync(fixture, `import { acquireDevelopmentLock, run } from ${JSON.stringify(moduleUrl)};
const release = acquireDevelopmentLock(process.argv[2], process.argv[3]);
try {
  await run(["bun", ${JSON.stringify(descendant)}, process.argv[2] + "/" + process.argv[3] + ".pid"], { processGroup: true, stdin: "ignore", stdout: "ignore" });
} finally {
  release();
}
`);
  const first = start("backend");
  await waitFor(() => existsSync(path.join(directory, "backend.pid")));
  const descendantPid = Number(readFileSync(path.join(directory, "backend.pid"), "utf8"));
  const duplicate = start("backend");
  assert.notEqual(await duplicate.exited, 0);
  assert.match(await new Response(duplicate.stderr).text(), /backend.*activ/);
  assert.ok(alive(descendantPid));
  first.kill("SIGTERM");
  await first.exited;
  await waitFor(() => !alive(descendantPid));
  assert.ok(!existsSync(path.join(directory, "backend.json")));
  rmSync(path.join(directory, "backend.pid"));
  const restarted = start("backend");
  await waitFor(() => existsSync(path.join(directory, "backend.pid")));
  restarted.kill("SIGTERM");
  await restarted.exited;
  const wrapperFile = path.join(directory, "wrapper.mjs");
  writeFileSync(wrapperFile, `Bun.spawn(["bun", ${JSON.stringify(fixture)}, ${JSON.stringify(directory)}, "orphan"], { stdout: "ignore", stderr: "ignore" });
setInterval(() => {}, 1000);
`);
  const wrapper = Bun.spawn(["bun", wrapperFile], { stdout: "ignore", stderr: "inherit" });
  children.push(wrapper);
  await waitFor(() => existsSync(path.join(directory, "orphan.pid")));
  const orphanPid = Number(readFileSync(path.join(directory, "orphan.pid"), "utf8"));
  wrapper.kill("SIGKILL");
  await wrapper.exited;
  await waitFor(() => !alive(orphanPid));
  await waitFor(() => !existsSync(path.join(directory, "orphan.json")));
  console.log("Desarrollo: exclusión por servicio, reinicio y cierre de descendientes al perder el supervisor verificados.");
} finally {
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  await Promise.all(children.map((child) => child.exited));
  rmSync(directory, { recursive: true, force: true });
}
