const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { backupDirectory, backupService } = require("./backups");
const { createDriveStore } = require("./drive-store");
const { createDriveClient } = require("./drive-client");
const { startDriveOAuth } = require("./drive-oauth");
const { googleClient } = require("./google-client");
const { encryptBackup, hashFile } = require("./backup-crypto");

const RETRY_MS = 60 * 60 * 1000;

function createDriveBackupService({
  directory = backupDirectory(),
  getBackups = () => backupService.list(),
  client = googleClient(),
  api = createDriveClient({ client }),
  store = createDriveStore(path.join(directory, ".google-drive")),
  oauth = startDriveOAuth,
  now = Date.now,
  logger = console,
} = {}) {
  let loaded;
  let working = false;
  let connecting;
  let lastError = null;
  let currentBackup = null;
  let exported = false;
  let timer;
  let active;
  let controller;

  const configured = Boolean(
    client.clientId && /^[\w.-]+\.apps\.googleusercontent\.com$/.test(client.clientId) && client.clientSecret,
  );
  const load = () => {
    loaded ||= store.read().catch((error) => {
      loaded = null;
      throw error;
    });
    return loaded;
  };
  const requireIdle = () => {
    if (working) throw new Error("Hay una operación de Google Drive en curso. Espera a que termine.");
  };
  const save = (state) => store.write(state);

  async function status() {
    try {
      const state = await load();
      return {
        configured,
        connected: Boolean(state.tokens),
        connecting: Boolean(connecting),
        running: working,
        email: state.email,
        folderName: state.folderId ? "Respaldos DMMarket" : null,
        recoveryConfirmed: state.recoveryConfirmed,
        currentBackup,
        lastError: lastError || state.lastError || null,
        uploads: Object.entries(state.uploads).map(([name, entry]) => ({
          name,
          status: entry.status === "uploading" && !working ? "pending" : entry.status,
          uploadedAt: entry.uploadedAt,
          error: entry.error,
        })),
      };
    } catch (error) {
      return {
        configured,
        connected: false,
        connecting: false,
        running: false,
        recoveryConfirmed: false,
        uploads: [],
        lastError: error.message,
      };
    }
  }

  async function connect() {
    requireIdle();
    if (!configured)
      throw new Error(
        "Google Drive es opcional y no está habilitado en esta versión. El mantenedor debe registrar el cliente OAuth de DMMarket.",
      );
    if (connecting)
      throw new Error("Ya hay una autorización de Google pendiente. Complétala o cancélala antes de iniciar otra.");
    working = true;
    try {
      const state = await load();
      if (state.tokens) throw new Error("Desconecta la cuenta actual antes de conectar otra.");
      lastError = null;
      connecting = await oauth({
        client,
        complete: async ({ code, redirectUri, verifier }) => {
          working = true;
          try {
            const tokens = await api.token({
              grant_type: "authorization_code",
              code,
              redirect_uri: redirectUri,
              code_verifier: verifier,
            });
            if (!tokens.refresh_token)
              throw new Error(
                "Google no autorizó acceso automático. Vuelve a conectar y acepta el permiso solicitado.",
              );
            const account = await api.account(tokens.access_token);
            const folderId = await api.folder(tokens.access_token);
            const next = {
              ...state,
              tokens,
              email: account.email,
              folderId,
              recoveryConfirmed: false,
              lastError: null,
              retryAt: 0,
            };
            await save(next);
            loaded = Promise.resolve(next);
            lastError = null;
          } finally {
            connecting = null;
            working = false;
          }
        },
        failed(error) {
          connecting = null;
          lastError = error.message;
        },
      });
      return { authorizationUrl: connecting.authorizationUrl };
    } finally {
      working = false;
    }
  }

  async function recoveryKey() {
    requireIdle();
    if (!(await load()).tokens) throw new Error("Conecta una cuenta antes de descargar la clave de recuperación.");
    const value = await store.exportKey();
    exported = true;
    return value;
  }

  async function confirmRecovery() {
    requireIdle();
    working = true;
    try {
      const state = await load();
      if (!state.tokens || !exported)
        throw new Error("Descarga y guarda la clave de recuperación antes de habilitar las cargas.");
      state.recoveryConfirmed = true;
      await save(state);
    } finally {
      working = false;
    }
  }

  async function access(state) {
    if (!state.tokens?.refresh_token) throw new Error("La cuenta no está autorizada para cargas automáticas.");
    if (state.tokens.expiresAt <= now() + 60000) {
      state.tokens = await api.refresh(state.tokens);
      await save(state);
    }
    return state.tokens.access_token;
  }

  async function upload(state, backup) {
    currentBackup = backup.name;
    const source = path.join(directory, backup.name);
    if (!/^dmmarket-\d{4}-\d{2}-\d{2}\.sql\.gz$/.test(backup.name))
      throw new Error("El archivo no es un respaldo final de DMMarket.");
    const stat = await fs.lstat(source);
    if (!stat.isFile() || !stat.size) throw new Error("El respaldo local ya no está disponible.");
    const key = await store.key();
    const digest = await hashFile(source);
    const backupId = crypto.createHmac("sha256", key).update(`${backup.name}:${digest}`).digest("hex");
    const previous = state.uploads[backup.name];
    const iv =
      previous?.backupId === backupId && previous.iv ? Buffer.from(previous.iv, "base64") : crypto.randomBytes(12);
    const temporary = path.join(directory, ".google-drive", `${crypto.randomUUID()}.upload`);
    state.uploads[backup.name] = {
      status: "uploading",
      backupId,
      iv: iv.toString("base64"),
      sizeBytes: backup.sizeBytes,
      completedAt: backup.completedAt,
    };
    await save(state);
    try {
      const encryptedDigest = await encryptBackup(source, temporary, key, iv);
      if (encryptedDigest !== digest)
        throw new Error("El respaldo cambió mientras se cifraba. No se enviará esta copia.");
      const checksum = await hashFile(temporary, "md5");
      const accessToken = await access(state);
      const result = await api.upload({
        file: temporary,
        folderId: state.folderId,
        backupId,
        checksum,
        accessToken,
        signal: controller.signal,
      });
      const after = await fs.lstat(source);
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs)
        throw new Error("El respaldo local cambió durante la carga. Se volverá a intentar.");
      state.uploads[backup.name] = {
        ...state.uploads[backup.name],
        status: "uploaded",
        uploadedAt: new Date(now()).toISOString(),
        sizeBytes: backup.sizeBytes,
        completedAt: backup.completedAt,
        fileId: result.id,
      };
      state.lastError = null;
      state.retryAt = 0;
      await save(state);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }

  function check({ force = false, latestOnly = false } = {}) {
    if (working || connecting || active || !configured) return Promise.resolve();
    working = true;
    controller = new AbortController();
    active = (async () => {
      let state;
      try {
        state = await load();
        if (!state.tokens || !state.recoveryConfirmed || (!force && state.retryAt > now())) return;
        const backups = await getBackups();
        const names = new Set(backups.map((backup) => backup.name));
        for (const name of Object.keys(state.uploads)) if (!names.has(name)) delete state.uploads[name];
        const pending = latestOnly
          ? backups.slice(0, 1)
          : backups
              .slice()
              .reverse()
              .filter((backup) => {
                const entry = state.uploads[backup.name];
                return (
                  entry?.status !== "uploaded" ||
                  entry.sizeBytes !== backup.sizeBytes ||
                  entry.completedAt !== backup.completedAt
                );
              });
        if (!pending.length) {
          if (latestOnly) throw new Error("No hay respaldos locales para probar la subida.");
          return;
        }
        for (const backup of pending) {
          if (controller.signal.aborted) return;
          await upload(state, backup);
        }
        lastError = null;
      } catch (error) {
        lastError = error.message;
        logger.error("No se pudo subir el respaldo a Google Drive:", error.message);
        if (state) {
          state.lastError = error.message;
          state.retryAt = now() + RETRY_MS;
          if (currentBackup)
            state.uploads[currentBackup] = { ...state.uploads[currentBackup], status: "error", error: error.message };
          try {
            await save(state);
          } catch {
            lastError = "No se pudo guardar el estado privado de Google Drive. Revisa el disco y sus permisos.";
          }
        }
      } finally {
        working = false;
        currentBackup = null;
        controller = null;
        active = null;
      }
    })();
    return active;
  }

  async function testUpload() {
    requireIdle();
    const state = await load();
    if (!state.tokens || !state.recoveryConfirmed)
      throw new Error("Conecta Google Drive y confirma que guardaste la clave de recuperación.");
    if (!(await getBackups()).length) throw new Error("No hay respaldos locales para probar la subida.");
    void check({ force: true, latestOnly: true });
  }

  async function disconnect() {
    if (working && !active) throw new Error("Espera a que termine la autorización de Google.");
    connecting?.close();
    connecting = null;
    controller?.abort();
    if (active) await active;
    working = true;
    try {
      const state = await load();
      const previous = state.tokens;
      if (!previous) {
        lastError = null;
        return { warning: null };
      }
      const uploads = Object.fromEntries(
        Object.entries(state.uploads).map(([name, entry]) => [
          name,
          { status: "pending", backupId: entry.backupId, iv: entry.iv },
        ]),
      );
      const next = {
        tokens: null,
        email: null,
        folderId: null,
        recoveryConfirmed: false,
        uploads,
        retryAt: 0,
      };
      await save(next);
      loaded = Promise.resolve(next);
      lastError = null;
      exported = false;
      if (previous) {
        try {
          await api.revoke(previous);
        } catch {
          lastError =
            "La cuenta se desconectó de este servidor, pero no se pudo revocar el permiso en Google. Revísalo en la seguridad de tu cuenta.";
        }
      }
      return { warning: lastError };
    } finally {
      working = false;
    }
  }

  function start() {
    if (timer || !configured) return;
    void check();
    timer = setInterval(() => void check(), 60000);
    timer.unref();
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    connecting?.close();
    connecting = null;
    controller?.abort();
  }

  return { status, connect, recoveryKey, confirmRecovery, testUpload, disconnect, check, start, stop };
}

const driveBackupService = createDriveBackupService();
module.exports = { createDriveBackupService, driveBackupService };
