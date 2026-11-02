import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = mkdtempSync(path.join(os.tmpdir(), "dmmarket-processes-"));
const moduleUrl = new URL("./dev-processes.mjs", import.meta.url).href;
const fixture = path.join(directory, "fixture.mjs");
const descendant = path.join(directory, "descendant.mjs");
const children = [];
const abandonedPids = [];

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
  writeFileSync(
    descendant,
    `import { writeFileSync } from "node:fs";
writeFileSync(process.argv[2], String(process.pid));
setInterval(() => {}, 1000);
`,
  );
  writeFileSync(
    fixture,
    `import { acquireDevelopmentLock, run } from ${JSON.stringify(moduleUrl)};
const release = await acquireDevelopmentLock(process.argv[2], process.argv[3]);
try {
  await run(["bun", ${JSON.stringify(descendant)}, process.argv[2] + "/" + process.argv[3] + ".pid"], { processGroup: true, stdin: "ignore", stdout: "ignore", onSpawn: release.trackChild });
} finally {
  release();
}
`,
  );
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
  writeFileSync(
    wrapperFile,
    `Bun.spawn(["bun", ${JSON.stringify(fixture)}, ${JSON.stringify(directory)}, "orphan"], { stdout: "ignore", stderr: "ignore" });
setInterval(() => {}, 1000);
`,
  );
  const wrapper = Bun.spawn(["bun", wrapperFile], { stdout: "ignore", stderr: "inherit" });
  children.push(wrapper);
  await waitFor(() => existsSync(path.join(directory, "orphan.pid")));
  const orphanPid = Number(readFileSync(path.join(directory, "orphan.pid"), "utf8"));
  wrapper.kill("SIGKILL");
  await wrapper.exited;
  await waitFor(() => !alive(orphanPid));
  await waitFor(() => !existsSync(path.join(directory, "orphan.json")));
  const abandoned = start("abandoned");
  await waitFor(() => existsSync(path.join(directory, "abandoned.pid")));
  await waitFor(() => JSON.parse(readFileSync(path.join(directory, "abandoned.json"), "utf8")).group);
  const abandonedPid = Number(readFileSync(path.join(directory, "abandoned.pid"), "utf8"));
  abandonedPids.push(abandonedPid);
  abandoned.kill("SIGKILL");
  await abandoned.exited;
  assert.ok(alive(abandonedPid));
  const abandonedLock = path.join(directory, "abandoned.json");
  const abandonedState = readFileSync(abandonedLock, "utf8");
  const mismatchedState = JSON.parse(abandonedState);
  mismatchedState.group.identity = "another process";
  writeFileSync(abandonedLock, JSON.stringify(mismatchedState));
  const refused = start("abandoned");
  assert.notEqual(await refused.exited, 0);
  assert.match(await new Response(refused.stderr).text(), /No se puede verificar/);
  assert.ok(alive(abandonedPid), "No debe detener un grupo cuya identidad no coincide.");
  writeFileSync(abandonedLock, abandonedState);
  rmSync(path.join(directory, "abandoned.pid"));
  const recovered = start("abandoned");
  await waitFor(() => existsSync(path.join(directory, "abandoned.pid")));
  assert.ok(!alive(abandonedPid), "El reinicio debe detener el grupo del wrapper muerto.");
  recovered.kill("SIGTERM");
  await recovered.exited;
  console.log("Desarrollo: exclusión, reinicio, pérdida del supervisor y recuperación tras SIGKILL verificados.");
} finally {
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  await Promise.all(children.map((child) => child.exited));
  for (const pid of abandonedPids) if (alive(pid)) process.kill(pid, "SIGKILL");
  for (const name of ["backend", "orphan", "abandoned"]) {
    const file = path.join(directory, `${name}.pid`);
    if (existsSync(file)) {
      const pid = Number(readFileSync(file, "utf8"));
      if (alive(pid)) process.kill(pid, "SIGKILL");
    }
  }
  rmSync(directory, { recursive: true, force: true });
}
