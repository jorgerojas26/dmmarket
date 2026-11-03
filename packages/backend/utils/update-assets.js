const { compareSemver } = require("./semver");
const version = require("../version");
const { ASSETS_BY_PLATFORM } = require("../controllers/update");

function allowedReleaseAssets(assetUrl, shaUrl, platform = process.platform) {
  const names = ASSETS_BY_PLATFORM[platform];
  if (!names) return false;
  const parse = (value, filename) => {
    if (typeof value !== "string" || value.length > 2048) return null;
    try {
      const url = new URL(value);
      const prefix = "/jorgerojas26/dmmarket/releases/download/";
      if (
        url.origin !== "https://github.com" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !url.pathname.startsWith(prefix)
      )
        return null;
      const parts = url.pathname.slice(prefix.length).split("/");
      if (
        parts.length !== 2 ||
        parts[1] !== filename ||
        !/^v?\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(parts[0]) ||
        compareSemver(parts[0], version) !== 1
      )
        return null;
      return parts[0];
    } catch {
      return null;
    }
  };
  const tag = parse(assetUrl, names.binary);
  return Boolean(tag && parse(shaUrl, names.sha) === tag);
}

module.exports = { allowedReleaseAssets };
