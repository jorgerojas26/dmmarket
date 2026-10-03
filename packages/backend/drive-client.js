const fs = require("node:fs");
const fsp = require("node:fs/promises");

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const API = "https://www.googleapis.com/drive/v3";

function createDriveClient({ client, fetchImpl = (...args) => fetch(...args), now = Date.now } = {}) {
  async function request(url, options = {}, timeout = 30000) {
    try {
      const response = await fetchImpl(url, {
        ...options,
        redirect: "error",
        signal: AbortSignal.any([AbortSignal.timeout(timeout), ...(options.signal ? [options.signal] : [])]),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const reason = body.error?.errors?.[0]?.reason;
        const message =
          response.status === 401 || body.error === "invalid_grant"
            ? "Google revocó o venció la autorización. Desconecta y vuelve a conectar la cuenta."
            : reason === "storageQuotaExceeded"
              ? "Google Drive no tiene espacio suficiente. Libera espacio y vuelve a intentar."
              : response.status === 403
                ? "Google rechazó la operación. Revisa los permisos, la cuota y la configuración OAuth de DMMarket."
                : response.status === 429
                  ? "Google limitó temporalmente las solicitudes. Se volverá a intentar más tarde."
                  : "Google Drive no pudo completar la operación. Vuelve a intentar más tarde.";
        throw new Error(message);
      }
      return response;
    } catch (error) {
      if (error?.message?.startsWith("Google")) throw error;
      throw new Error("No se pudo comunicar con Google Drive. Revisa Internet y vuelve a intentar.");
    }
  }

  async function token(parameters) {
    const response = await request("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...parameters, client_id: client.clientId, client_secret: client.clientSecret }),
    });
    const data = await response.json();
    if (!data.access_token || !Number.isFinite(Number(data.expires_in)))
      throw new Error("Google no devolvió una autorización válida.");
    if (data.scope && !data.scope.split(" ").includes(SCOPE))
      throw new Error("No se autorizó el permiso para guardar respaldos en Drive.");
    return { ...data, expiresAt: now() + Number(data.expires_in) * 1000 };
  }

  async function refresh(tokens) {
    const data = await token({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
    return { ...tokens, ...data, refresh_token: data.refresh_token || tokens.refresh_token };
  }

  async function json(path, accessToken, options = {}) {
    const response = await request(`${API}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...options.headers },
    });
    return response.json();
  }

  async function account(accessToken) {
    const data = await json("/about?fields=user(emailAddress),storageQuota", accessToken);
    if (!data.user?.emailAddress) throw new Error("No se pudo identificar la cuenta de Google autorizada.");
    return { email: data.user.emailAddress, quota: data.storageQuota };
  }

  async function find(query, accessToken) {
    const parameters = new URLSearchParams({ q: query, fields: "files(id,size,md5Checksum)", pageSize: "100" });
    const data = await json(`/files?${parameters}`, accessToken);
    return data.files || [];
  }

  async function folder(accessToken) {
    const existing = await find(
      "trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='dmmarketFolder' and value='1' }",
      accessToken,
    );
    if (existing[0]) return existing[0].id;
    const result = await json("/files?fields=id", accessToken, {
      method: "POST",
      body: JSON.stringify({
        name: "Respaldos DMMarket",
        mimeType: "application/vnd.google-apps.folder",
        appProperties: { dmmarketFolder: "1" },
      }),
    });
    if (!result.id) throw new Error("Google no pudo crear la carpeta de respaldos.");
    return result.id;
  }

  async function upload({ file, folderId, backupId, checksum, accessToken, signal }) {
    if (!/^[\w-]+$/.test(folderId) || !/^[a-f0-9]{64}$/.test(backupId))
      throw new Error("El destino de Google Drive no es válido.");
    const size = (await fsp.stat(file)).size;
    const existing = await find(
      `trashed = false and '${folderId}' in parents and appProperties has { key='dmmarketBackup' and value='${backupId}' }`,
      accessToken,
    );
    if (existing[0]) {
      if (Number(existing[0].size) !== size || existing[0].md5Checksum !== checksum)
        throw new Error(
          "La copia existente en Google Drive no pasó la verificación de tamaño e integridad. Revísala antes de continuar.",
        );
      return { ...existing[0], recovered: true };
    }
    const response = await request(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,md5Checksum",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": "application/octet-stream",
          "X-Upload-Content-Length": String(size),
        },
        body: JSON.stringify({
          name: `dm-${backupId}.dmbak`,
          parents: [folderId],
          appProperties: { dmmarketBackup: backupId },
        }),
        signal,
      },
    );
    const location = response.headers.get("location");
    let session;
    try {
      session = new URL(location || "https://invalid.invalid");
    } catch {
      throw new Error("Google devolvió un destino de carga no permitido.");
    }
    if (
      session.protocol !== "https:" ||
      session.hostname !== "www.googleapis.com" ||
      session.pathname !== "/upload/drive/v3/files" ||
      session.username ||
      session.password ||
      session.port
    ) {
      throw new Error("Google devolvió un destino de carga no permitido.");
    }
    const body = fs.createReadStream(file);
    try {
      const uploaded = await request(
        session.toString(),
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/octet-stream",
            "Content-Length": String(size),
          },
          body,
          duplex: "half",
          signal,
        },
        60 * 60 * 1000,
      );
      const result = await uploaded.json();
      if (!result.id || Number(result.size) !== size || result.md5Checksum !== checksum)
        throw new Error("Google Drive recibió un archivo que no pasó la verificación de integridad.");
      return result;
    } finally {
      body.destroy();
    }
  }

  async function revoke(tokens) {
    await request("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: tokens.refresh_token || tokens.access_token }),
    });
  }

  return { token, refresh, account, folder, upload, revoke };
}

module.exports = { SCOPE, createDriveClient };
