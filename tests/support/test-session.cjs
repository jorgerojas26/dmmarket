const fs = require("node:fs");
const path = require("node:path");
const directory = path.resolve(__dirname, "../../.dev");
const lock = path.join(directory, "test-session.json");
async function withTestSession(work) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.existsSync(lock)) {
    const owner = JSON.parse(fs.readFileSync(lock, "utf8"));
    try {
      process.kill(owner.pid, 0);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
      fs.unlinkSync(lock);
    }
  }
  try {
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid }), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("Ya hay una sesión de tests o una copia en este worktree.");
    throw error;
  }
  try {
    return await work();
  } finally {
    fs.unlinkSync(lock);
  }
}
module.exports = { withTestSession };
