const express = require("express");
const { serverOptions, startServer } = require("../server");

describe("serverOptions", () => {
  it("uses a fixed port accessible on the LAN by default", () => {
    expect(serverOptions({})).toEqual({ port: 8000, host: "0.0.0.0", service: false });
  });

  it("supports service mode and explicit network configuration", () => {
    expect(serverOptions({ PORT: "8123", HOST: "127.0.0.1", DMMARKET_SERVICE: "1" })).toEqual({
      port: 8123,
      host: "127.0.0.1",
      service: true,
    });
  });

  it.each(["abc", "-1", "0", "65536", "8000.5"])("rejects invalid PORT %s", (PORT) => {
    expect(() => serverOptions({ PORT })).toThrow("PORT");
  });
});

describe("startServer", () => {
  let server;
  afterEach(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    server = undefined;
    jest.restoreAllMocks();
  });

  it("serves HTTP and calls the listening callback", async () => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    const app = express();
    app.get("/", (_req, res) => res.send("DMMarket"));
    const listening = jest.fn();
    server = await startServer(app, { port: 0, host: "127.0.0.1" }, listening);
    const response = await fetch(`http://127.0.0.1:${server.address().port}`);
    expect(await response.text()).toBe("DMMarket");
    expect(listening).toHaveBeenCalledTimes(1);
  });

  it("rejects an occupied port instead of moving to a different URL", async () => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    server = await startServer(express(), { port: 0, host: "127.0.0.1" });
    await expect(startServer(express(), { port: server.address().port, host: "127.0.0.1" })).rejects.toMatchObject({
      code: "EADDRINUSE",
    });
  });
});
