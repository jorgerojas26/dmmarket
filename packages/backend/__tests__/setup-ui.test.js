const { Script } = require("node:vm");
const page = require("../setup-ui");

async function initialize(platform, fields = {}) {
  const nodes = Object.fromEntries(
    [...page.html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [
      id,
      {
        value: "",
        checked: false,
        open: false,
        style: {},
        listeners: {},
        addEventListener(event, listener) {
          this.listeners[event] = listener;
        },
      },
    ]),
  );
  const metadata = {
    platform,
    fields: { HOST: "0.0.0.0", PORT: "8000", WEB_MODE: "direct", WEB_HOSTNAME: "", ...fields },
    addresses: [{ address: "192.168.1.50", network: "192.168.1.0/24" }],
  };
  await new Script(page.script).runInNewContext({
    document: { getElementById: (id) => nodes[id] },
    location: { hash: "#token", pathname: "/" },
    history: { replaceState() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    fetch: async () => ({ ok: true, json: async () => metadata }),
  });
  expect(nodes.error.textContent).toBeUndefined();
  return nodes;
}

it.each(["linux", "win32", "darwin"])(
  "does not select optional features on a new %s installation",
  async (platform) => {
    const nodes = await initialize(platform);
    expect(nodes.WEB_MODE.value).toBe("direct");
    expect(nodes["optional-settings"].open).toBe(false);
    expect(nodes["allow-firewall"].checked).toBe(false);
    expect(nodes["network-label"].hidden).toBe(true);
    expect(nodes.network.required).toBe(false);
    expect(nodes.WEB_HOSTNAME.required).toBe(false);
    expect(nodes.WEB_HOSTNAME.disabled).toBe(true);
  },
);

it("uses a professional domain label instead of implementation details", () => {
  expect(page.html).toContain('<option value="caddy">Configuración de dominio local</option>');
  expect(page.html).not.toContain("Nombre sin puerto");
});

it("allows enabling domain configuration independently of firewall authorization", async () => {
  const nodes = await initialize("linux");
  nodes.WEB_MODE.value = "caddy";
  nodes.WEB_MODE.listeners.change();
  expect(nodes.WEB_HOSTNAME.required).toBe(true);
  expect(nodes.WEB_HOSTNAME.disabled).toBe(false);
  expect(nodes["allow-firewall"].checked).toBe(false);
  expect(nodes.network.required).toBe(false);
});

it("preserves a previously enabled domain and makes its options visible for review", async () => {
  const nodes = await initialize("linux", {
    HOST: "127.0.0.1",
    WEB_MODE: "caddy",
    WEB_HOSTNAME: "reportes.solser.internal",
  });
  expect(nodes.WEB_MODE.value).toBe("caddy");
  expect(nodes["optional-settings"].open).toBe(true);
  expect(nodes.WEB_HOSTNAME.value).toBe("reportes.solser.internal");
  expect(nodes["allow-firewall"].checked).toBe(false);
});
