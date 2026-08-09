const { compareSemver, parseSemver } = require("../utils/semver");

describe("compareSemver", () => {
  it("compara mayor, menor y parche", () => {
    expect(compareSemver("2.0.0", "1.9.9")).toBe(1);
    expect(compareSemver("1.10.0", "1.9.0")).toBe(1);
    expect(compareSemver("1.2.3", "1.2.4")).toBe(-1);
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
    expect(compareSemver("0.9.0", "1.0.0")).toBe(-1);
  });

  it("acepta el prefijo v de los tags de GitHub", () => {
    expect(compareSemver("v1.2.3", "1.2.3")).toBe(0);
    expect(compareSemver("v2.0.0", "1.9.0")).toBe(1);
  });

  it("devuelve NaN con versiones inválidas", () => {
    expect(Number.isNaN(compareSemver("basura", "1.0.0"))).toBe(true);
    expect(Number.isNaN(compareSemver("1.0.0", "no-version"))).toBe(true);
    expect(Number.isNaN(compareSemver("1.2", "1.0.0"))).toBe(true); // incompleta: no es X.Y.Z
  });
});

describe("parseSemver", () => {
  it("parsea X.Y.Z y rechaza basura", () => {
    expect(parseSemver("1.2.3")).toEqual([1, 2, 3]);
    expect(parseSemver("v4.5.6")).toEqual([4, 5, 6]);
    expect(parseSemver("abc")).toBeNull();
    expect(parseSemver("")).toBeNull();
  });
});
