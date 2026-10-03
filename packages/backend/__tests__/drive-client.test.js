const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createDriveClient, SCOPE } = require("../drive-client");

const response = (body = {}, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  headers: { get: (name) => headers[name] },
});
let fetchImpl;
let api;
let directory;

beforeEach(async () => {
  fetchImpl = jest.fn();
  api = createDriveClient({ client: { clientId: "client", clientSecret: "secret" }, fetchImpl, now: () => 1000 });
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "dm-api-"));
});
afterEach(async () => fs.rm(directory, { recursive: true, force: true }));

it("exchanges and refreshes tokens with narrow scope and preserves the refresh token", async () => {
  fetchImpl.mockResolvedValue(response({ access_token: "access", expires_in: 3600, scope: SCOPE }));
  const result = await api.refresh({ refresh_token: "refresh" });
  expect(result).toMatchObject({ access_token: "access", refresh_token: "refresh", expiresAt: 3601000 });
  expect(fetchImpl.mock.calls[0][1].body.get("client_secret")).toBe("secret");
  expect(fetchImpl.mock.calls[0][1].body.get("refresh_token")).toBe("refresh");
  fetchImpl.mockResolvedValueOnce(response({ access_token: "access", expires_in: 3600, scope: "other" }));
  await expect(api.token({})).rejects.toThrow("permiso");
});

it("identifies the account and creates only the application's folder", async () => {
  fetchImpl.mockResolvedValueOnce(response({ user: { emailAddress: "business@example.com" } }));
  expect((await api.account("access")).email).toBe("business@example.com");
  fetchImpl.mockResolvedValueOnce(response({ files: [] })).mockResolvedValueOnce(response({ id: "folder" }));
  expect(await api.folder("access")).toBe("folder");
  const metadata = JSON.parse(fetchImpl.mock.calls[2][1].body);
  expect(metadata).toMatchObject({ name: "Respaldos DMMarket", mimeType: "application/vnd.google-apps.folder" });
});

it("uploads with a resumable session and checks encrypted size and checksum", async () => {
  const file = path.join(directory, "encrypted");
  await fs.writeFile(file, "encrypted-data");
  fetchImpl
    .mockResolvedValueOnce(response({ files: [] }))
    .mockResolvedValueOnce(
      response({}, 200, { location: "https://www.googleapis.com/upload/drive/v3/files?upload_id=session" }),
    );
  fetchImpl.mockImplementationOnce(async (_url, options) => {
    const chunks = [];
    for await (const chunk of options.body) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe("encrypted-data");
    return response({ id: "file-id", size: "14", md5Checksum: "checksum" });
  });
  expect(
    (
      await api.upload({
        file,
        folderId: "folder",
        backupId: "a".repeat(64),
        checksum: "checksum",
        accessToken: "access",
      })
    ).id,
  ).toBe("file-id");
  const metadata = JSON.parse(fetchImpl.mock.calls[1][1].body);
  expect(metadata.name).toMatch(/^dm-[a-f0-9]+\.dmbak$/);
  expect(metadata.name).not.toContain("sql");
  expect(fetchImpl.mock.calls[2][1].method).toBe("PUT");
});

it("recognizes a previously committed upload only if size and checksum match", async () => {
  const file = path.join(directory, "encrypted");
  await fs.writeFile(file, "bytes");
  const options = { file, folderId: "folder", backupId: "a".repeat(64), checksum: "expected", accessToken: "access" };
  fetchImpl.mockResolvedValueOnce(response({ files: [{ id: "old-id", size: "5", md5Checksum: "expected" }] }));
  expect((await api.upload(options)).recovered).toBe(true);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  fetchImpl.mockResolvedValueOnce(response({ files: [{ id: "old-id", size: "5", md5Checksum: "wrong" }] }));
  await expect(api.upload(options)).rejects.toThrow("copia existente");
});

it("never forwards credentials to an untrusted resumable upload URL", async () => {
  const file = path.join(directory, "encrypted");
  await fs.writeFile(file, "bytes");
  fetchImpl
    .mockResolvedValueOnce(response({ files: [] }))
    .mockResolvedValueOnce(response({}, 200, { location: "https://evil.example/upload" }));
  await expect(
    api.upload({
      file,
      folderId: "folder",
      backupId: "a".repeat(64),
      checksum: "expected",
      accessToken: "private-access",
    }),
  ).rejects.toThrow("no permitido");
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

it("reports quota and expired authorization errors without returning sensitive Google payloads", async () => {
  fetchImpl.mockResolvedValueOnce(
    response({ error: { message: "secret payload", errors: [{ reason: "storageQuotaExceeded" }] } }, 403),
  );
  await expect(api.account("token")).rejects.toThrow("espacio suficiente");
  fetchImpl.mockResolvedValueOnce(response({ error: "invalid_grant", secret: "private-token" }, 400));
  await expect(api.refresh({ refresh_token: "private-token" })).rejects.toThrow("venció");
});
