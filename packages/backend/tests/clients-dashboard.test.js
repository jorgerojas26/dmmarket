jest.mock("../database", () => jest.fn());

const { computeAbc } = require("../controllers/clients/dashboard");

describe("computeAbc", () => {
  const clients = [
    { name: "Cliente con más ventas", total_usd: 800, utilidad: 20 },
    { name: "Cliente con más utilidad", total_usd: 200, utilidad: 80 },
  ];

  it("computes ABC shares using sales by default", () => {
    const result = computeAbc(clients, 1000);

    expect(result.clients.map((client) => client.name)).toEqual(["Cliente con más ventas", "Cliente con más utilidad"]);
    expect(result.clients[0].cumulativePercent).toBe(80);
    expect(result.summary.classA.revenuePercent).toBe(80);
  });

  it("computes ABC shares and summary using utility when selected", () => {
    const utilityClients = [...clients].sort((a, b) => b.utilidad - a.utilidad);
    const result = computeAbc(utilityClients, 100, "utilidad", "utilityPercent");

    expect(result.clients.map((client) => client.name)).toEqual(["Cliente con más utilidad", "Cliente con más ventas"]);
    expect(result.clients[0]).toEqual(
      expect.objectContaining({ total_usd: 200, utilidad: 80, cumulativePercent: 80, abcClass: "A" }),
    );
    expect(result.summary.classA.utilityPercent).toBe(80);
    expect(result.summary.classA.revenuePercent).toBeUndefined();
  });
});
