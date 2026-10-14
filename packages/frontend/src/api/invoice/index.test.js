import { fetchInvoiceDetail } from './index';

const originalFetch = global.fetch;

beforeEach(() => {
    global.fetch = jest.fn();
});
afterEach(() => {
    global.fetch = originalFetch;
});

it('encodes the invoice identifier and preserves the backend detail shape', async () => {
    const detail = {
        idFactura: 'FAC/A &?#ñ',
        fecha: '2026-10-01T12:00:00.000Z',
        cliente: 'Cliente Uno',
        vendedor: 'Vendedor Uno',
        total: 25,
        utilidad: 5,
        productos: [{ descripcion: 'Arroz', cantidad: 2, precio: 12.5, subtotal: 25, utilidad: 5 }],
    };
    fetch.mockResolvedValue({ ok: true, json: async () => detail });

    await expect(fetchInvoiceDetail(detail.idFactura, false)).resolves.toEqual(detail);
    expect(fetch).toHaveBeenCalledWith('/api/invoices/FAC%2FA%20%26%3F%23%C3%B1/detail?showNoe=false');
});

it('preserves the Noe argument for existing callers', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ productos: [] }) });
    await fetchInvoiceDetail(42, true);
    expect(fetch).toHaveBeenCalledWith('/api/invoices/42/detail?showNoe=true');
});

it('rejects a 404 with the backend error instead of returning it as detail', async () => {
    fetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'Invoice not found' }) });
    await expect(fetchInvoiceDetail('missing', false)).rejects.toMatchObject({
        message: 'Invoice not found',
        status: 404,
    });
});

it.each([null, {}, { error: { message: 'Unexpected shape' } }])(
    'reports HTTP failures even without a usable error message: %p',
    async (body) => {
        fetch.mockResolvedValue({ ok: false, status: 500, json: async () => body });
        await expect(fetchInvoiceDetail(42, false)).rejects.toMatchObject({
            message: 'No se pudo cargar la factura (HTTP 500)',
            status: 500,
        });
    },
);

it('reports the HTTP status when the error response is not JSON', async () => {
    fetch.mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
            throw new Error('Invalid JSON');
        },
    });
    await expect(fetchInvoiceDetail(42, false)).rejects.toMatchObject({
        message: 'No se pudo cargar la factura (HTTP 502)',
        status: 502,
    });
});

it('propagates network and invalid success JSON failures', async () => {
    fetch.mockRejectedValueOnce(new Error('Sin conexión'));
    await expect(fetchInvoiceDetail(42, false)).rejects.toThrow('Sin conexión');
    fetch.mockResolvedValue({
        ok: true,
        json: async () => {
            throw new Error('Invalid JSON');
        },
    });
    await expect(fetchInvoiceDetail(42, false)).rejects.toThrow('Invalid JSON');
});
