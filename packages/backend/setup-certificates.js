const fs = require("node:fs");
const { X509Certificate } = require("node:crypto");
const { checkAdmin } = require("./service");
const { run } = require("./service-commands");
const { rootCertificateFile } = require("./web-service");

function certificateInfo(directory) {
  const file = rootCertificateFile(directory);
  const certificate = fs.readFileSync(file);
  const parsed = new X509Certificate(certificate);
  if (
    !parsed.ca ||
    !parsed.verify(parsed.publicKey) ||
    Date.parse(parsed.validFrom) > Date.now() ||
    Date.parse(parsed.validTo) <= Date.now()
  )
    throw new Error("La autoridad de certificados no es válida.");
  return { certificate, file, fingerprint: parsed.fingerprint256 };
}

function trustCertificate(directory, platform = process.platform) {
  checkAdmin();
  const info = certificateInfo(directory);
  if (platform === "win32") run("certutil.exe", ["-addstore", "-f", "Root", info.file]);
  else if (platform === "darwin")
    run("security", [
      "add-trusted-cert",
      "-d",
      "-r",
      "trustRoot",
      "-k",
      "/Library/Keychains/System.keychain",
      info.file,
    ]);
  else if (platform === "linux") {
    fs.mkdirSync("/usr/local/share/ca-certificates", { recursive: true });
    fs.writeFileSync("/usr/local/share/ca-certificates/dmmarket-local-ca.crt", info.certificate, { mode: 0o644 });
    run("update-ca-certificates", []);
  } else throw new Error("La plataforma no permite registrar la CA de DMMarket.");
  return { trusted: true, fingerprint: info.fingerprint };
}

module.exports = { certificateInfo, trustCertificate };
