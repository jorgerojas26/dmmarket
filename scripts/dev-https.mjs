import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import { prepareCaddy } from "./prepare-caddy.mjs";

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function localKeys(directory) {
  const file = path.join(directory, "auth.json");
  if (!existsSync(file)) {
    const keys = {
      AUTH_SESSION_SECRET: randomBytes(32).toString("base64"),
      AUTH_MFA_KEY: randomBytes(32).toString("base64"),
    };
    try {
      writeFileSync(file, JSON.stringify(keys), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  chmodSync(file, 0o600);
  const { AUTH_SESSION_SECRET, AUTH_MFA_KEY } = JSON.parse(readFileSync(file, "utf8"));
  return { AUTH_SESSION_SECRET, AUTH_MFA_KEY };
}

function checkCertificate(origin, certificate) {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: "127.0.0.1",
      port: Number(url.port),
      servername: url.hostname,
      ca: readFileSync(certificate),
    });
    socket.setTimeout(1000, () => socket.destroy(new Error("Tiempo de espera HTTPS agotado.")));
    socket.once("error", reject);
    socket.once("secureConnect", () => {
      socket.destroy();
      resolve();
    });
  });
}

export async function startDevelopmentHttps({ root, directory = path.join(root, ".dev"), env, frontendUrl }) {
  const frontend = new URL(frontendUrl);
  if (!["http:", "https:"].includes(frontend.protocol)) throw new Error("El frontend requiere una URL HTTP(S).");
  const load = createRequire(path.join(root, "packages/backend/package.json"));
  const { normalizeWeb, proxyCredential, proxyIdentity } = load("./web-config");
  const { validateAuthConfig } = load("./auth/runtime");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const stateFile = path.join(directory, "https.json");
  if (existsSync(stateFile)) {
    const previous = JSON.parse(readFileSync(stateFile, "utf8"));
    try {
      process.kill(previous.pid, 0);
      throw new Error("Ya hay un proxy HTTPS activo en este worktree.");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    rmSync(stateFile);
  }
  const port = await availablePort();
  const configuration = {
    ...env,
    ...localKeys(directory),
    WEB_MODE: "caddy",
    WEB_HOSTNAME: frontend.hostname,
    WEB_BIND_ADDRESS: "127.0.0.1",
    HOST: "127.0.0.1",
    AUTH_PUBLIC_ORIGIN: `https://${frontend.hostname}:${port}`,
  };
  normalizeWeb(configuration);
  validateAuthConfig(configuration);
  const internalPort = Number(configuration.PORT);
  if (!Number.isInteger(internalPort) || internalPort < 1024 || internalPort > 65535)
    throw new Error("El backend requiere el puerto interno asignado por Portless.");
  const target = `${process.platform}-${process.arch}`;
  await prepareCaddy(root, [target]);
  const manifest = load("./caddy-manifest.json");
  const binary = path.join(root, ".cache/caddy", target, manifest.targets[target].binary);
  const storage = path.join(directory, "caddy-data");
  const certificate = path.join(storage, "pki/authorities/local/root.crt");
  const transport =
    frontend.protocol === "https:"
      ? `\n\t\t\ttransport http {\n\t\t\t\ttls\n\t\t\t\ttls_server_name ${frontend.hostname}\n\t\t\t}`
      : "";
  const config = `{
\tadmin off
\tauto_https disable_redirects
\tskip_install_trust
\tpersist_config off
\tstorage file_system {
\t\troot ${JSON.stringify(storage)}
\t}
}

${configuration.AUTH_PUBLIC_ORIGIN} {
\tbind 127.0.0.1
\ttls internal
\theader X-DMMarket-Web ${proxyIdentity(configuration)}
\t@api path /api /api/*
\thandle @api {
\t\treverse_proxy 127.0.0.1:${internalPort} {
\t\t\theader_up X-DMMarket-Proxy ${proxyCredential(configuration)}
\t\t\theader_up X-DMMarket-Client-IP {http.request.remote.host}
\t\t}
\t}
\thandle {
\t\treverse_proxy 127.0.0.1:${frontend.port || (frontend.protocol === "https:" ? 443 : 80)} {
\t\t\theader_up Host ${frontend.host}${transport}
\t\t}
\t}
}
`;
  const file = path.join(directory, "Caddyfile");
  writeFileSync(
    stateFile,
    JSON.stringify({ pid: process.pid, origin: configuration.AUTH_PUBLIC_ORIGIN, internalPort }),
    {
      flag: "wx",
      mode: 0o600,
    },
  );
  let child;
  let closing;
  const close = () => {
    closing ||= (async () => {
      try {
        if (child && child.exitCode === null) {
          child.kill("SIGTERM");
          const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
          try {
            await child.exited;
          } finally {
            clearTimeout(timer);
          }
        }
      } finally {
        rmSync(stateFile, { force: true });
      }
    })();
    return closing;
  };
  try {
    writeFileSync(file, config, { mode: 0o600 });
    chmodSync(file, 0o600);
    child = Bun.spawn([binary, "run", "--config", file, "--adapter", "caddyfile"], {
      cwd: root,
      env: { ...process.env, XDG_CONFIG_HOME: path.join(directory, "caddy-config") },
      stdout: "ignore",
      stderr: Bun.file(path.join(directory, "caddy.log")),
    });
    const deadline = Date.now() + 15000;
    while (true) {
      if (child.exitCode !== null) throw new Error(`Caddy no inició. Revisa ${path.join(directory, "caddy.log")}.`);
      try {
        await checkCertificate(configuration.AUTH_PUBLIC_ORIGIN, certificate);
        break;
      } catch {
        if (Date.now() >= deadline) throw new Error("Caddy no pudo preparar HTTPS en 15 segundos.");
        await Bun.sleep(100);
      }
    }
    return { env: configuration, certificate, close, exited: child.exited };
  } catch (error) {
    await close();
    throw error;
  }
}
