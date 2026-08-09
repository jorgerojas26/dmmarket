// Comparación semver X.Y.Z (sin dependencias — las versiones del proyecto son simples).
// parseSemver acepta "1.2.3" y "v1.2.3". Devuelve null si no es una versión válida.

function parseSemver(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(value).trim());
  if (!match) return null;
  return match.slice(1).map(Number);
}

// Devuelve 1 si a > b, -1 si a < b, 0 si son iguales, NaN si alguna versión es inválida.
function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return NaN;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

module.exports = { compareSemver, parseSemver };
