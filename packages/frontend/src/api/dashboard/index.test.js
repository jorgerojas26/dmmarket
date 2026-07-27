import { fetchDashboardSales } from "./index";

describe("fetchDashboardSales", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("construye URL sin compareFrom/compareTo", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await fetchDashboardSales({ from: "2026-07-01", to: "2026-07-27", showNoe: false });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/dashboard/sales?from=2026-07-01&to=2026-07-27&showNoe=false"
    );
  });

  it("incluye compareFrom y compareTo en la URL", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await fetchDashboardSales({ from: "2026-07-01", to: "2026-07-27", showNoe: false, compareFrom: "2026-06-04", compareTo: "2026-06-30" });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/dashboard/sales?from=2026-07-01&to=2026-07-27&showNoe=false&compareFrom=2026-06-04&compareTo=2026-06-30"
    );
  });

  it("lanza error si la respuesta no es ok", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(
      fetchDashboardSales({ from: "2026-07-01", to: "2026-07-27", showNoe: false })
    ).rejects.toThrow("Dashboard API error: 500");
  });
});
