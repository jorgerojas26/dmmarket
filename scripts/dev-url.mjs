import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const stateFile = process.argv[2] || fileURLToPath(new URL("../.dev/https.json", import.meta.url));
let previous;

function publicOrigin() {
  try {
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    if (!Number.isSafeInteger(state.pid) || state.pid <= 0) return null;
    const url = new URL(state.origin);
    if (url.protocol !== "https:" || url.origin !== state.origin) return null;
    process.kill(state.pid, 0);
    return url.origin;
  } catch (error) {
    if (["ENOENT", "ESRCH"].includes(error.code) || error instanceof SyntaxError || error instanceof TypeError)
      return null;
    throw error;
  }
}

function render() {
  const origin = publicOrigin();
  if (origin === previous) return;
  previous = origin;
  const status = origin
    ? `Aplicación HTTPS:\n\n  ${origin}`
    : "HTTPS detenido. Selecciona backend y pulsa s para iniciarlo.";
  process.stdout.write(
    `\u001b[2J\u001b[HDMMarket — acceso al navegador\n\n${status}\n\nInicia backend y frontend con s en sus paneles.\nLos enlaces HTTP son internos; no los uses para iniciar sesión.\nLa URL HTTPS se actualiza al reiniciar el backend.\n`,
  );
}

render();
const timer = setInterval(render, 1000);
const stop = () => clearInterval(timer);
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
