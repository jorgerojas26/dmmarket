import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as invoiceApi from 'api/invoice';
import SaleDetailModal from 'components/ProviderDashboardModal/SaleDetailModal';
import { ShowNoeContext } from 'context/show_noe';
import InvoiceDetailModal from './InvoiceDetailModal';

const originalFetch = global.fetch;
const detail = {
    idFactura: 'FAC-42',
    fecha: '2026-10-01T12:00:00.000Z',
    cliente: 'Cliente Uno',
    vendedor: 'Vendedor Uno',
    total: 25,
    utilidad: 5,
    productos: [{ descripcion: 'Arroz', cantidad: 2, precio: 12.5, subtotal: 25, utilidad: 5 }],
};
const success = (body = detail) => ({ ok: true, json: async () => body });
const deferred = () => {
    let resolve;
    const promise = new Promise((done) => {
        resolve = done;
    });
    return { promise, resolve };
};

beforeEach(() => {
    global.fetch = jest.fn();
    jest.spyOn(invoiceApi, 'fetchInvoiceDetail');
});
afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
});

it('names the loading dialog with the invoice ID and allows closing', () => {
    fetch.mockReturnValue(new Promise(() => {}));
    const onClose = jest.fn();
    render(<InvoiceDetailModal invoiceId="FAC-42" onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Factura #FAC-42' })).toHaveAttribute('aria-labelledby');
    expect(screen.getByRole('status', { name: 'Cargando detalle' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
});

it('renders backend products and totals using the existing UI, always requesting FAC', async () => {
    fetch.mockResolvedValue(success());
    const { rerender } = render(
        <ShowNoeContext.Provider value={{ showNoe: true }}>
            <InvoiceDetailModal invoiceId="FAC-42" onClose={jest.fn()} />
        </ShowNoeContext.Provider>,
    );
    const row = await screen.findByRole('row', { name: /Arroz/ });
    expect(within(row).getByText('2')).toBeInTheDocument();
    expect(within(row).getByText('$12.50')).toBeInTheDocument();
    expect(screen.getAllByText('$25.00')).toHaveLength(2);
    expect(screen.getAllByText('$5.00')).toHaveLength(2);
    expect(screen.getByText(/Vendedor Uno/)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(invoiceApi.fetchInvoiceDetail).toHaveBeenCalledWith('FAC-42', false);
    expect(fetch).toHaveBeenCalledWith('/api/invoices/FAC-42/detail?showNoe=false');

    rerender(
        <ShowNoeContext.Provider value={{ showNoe: false }}>
            <InvoiceDetailModal invoiceId="FAC-42" onClose={jest.fn()} />
        </ShowNoeContext.Provider>,
    );
    expect(invoiceApi.fetchInvoiceDetail).toHaveBeenCalledTimes(1);
});

it('shows an HTTP error without data and retries through loading to success with false again', async () => {
    const retry = deferred();
    fetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: 'Invoice not found' }) });
    fetch.mockReturnValueOnce(retry.promise);
    render(
        <ShowNoeContext.Provider value={{ showNoe: true }}>
            <InvoiceDetailModal invoiceId="FAC-42" onClose={jest.fn()} />
        </ShowNoeContext.Provider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Invoice not found');
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Factura #FAC-42');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(/Sin productos/)).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    await act(async () => {
        retry.resolve(success());
    });
    expect(await screen.findByText('Arroz')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(invoiceApi.fetchInvoiceDetail.mock.calls).toEqual([
        ['FAC-42', false],
        ['FAC-42', false],
    ]);
});

it('shows network failures visibly', async () => {
    fetch.mockRejectedValue(new Error('Sin conexión'));
    render(<InvoiceDetailModal invoiceId="FAC-42" onClose={jest.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
});

it.each([null, {}, { productos: {} }, { productos: 'not an array' }, { error: 'Failure', productos: [] }])(
    'rejects malformed detail instead of treating it as an empty invoice: %p',
    async (body) => {
        fetch.mockResolvedValue(success(body));
        render(<InvoiceDetailModal invoiceId="FAC-42" onClose={jest.fn()} />);
        expect(await screen.findByRole('alert')).toHaveTextContent('La respuesta del detalle de factura no es válida.');
        expect(screen.queryByText(/Sin productos/)).not.toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    },
);

it('accepts an empty products array as a valid empty detail', async () => {
    fetch.mockResolvedValue(success({ ...detail, productos: [] }));
    render(<InvoiceDetailModal invoiceId="FAC-42" onClose={jest.fn()} />);
    expect(await screen.findByText('Sin productos en esta factura')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('ignores late responses after changing invoice ID', async () => {
    const first = deferred();
    fetch.mockReturnValueOnce(first.promise).mockResolvedValueOnce(success({ ...detail, idFactura: 'FAC-43' }));
    const { rerender } = render(<InvoiceDetailModal invoiceId="FAC-42" onClose={jest.fn()} />);
    rerender(<InvoiceDetailModal invoiceId="FAC-43" onClose={jest.fn()} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Factura #FAC-43');
    await screen.findByText('Arroz');
    await act(async () => {
        first.resolve(success());
    });
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Factura #FAC-43');
    expect(invoiceApi.fetchInvoiceDetail.mock.calls).toEqual([
        ['FAC-42', false],
        ['FAC-43', false],
    ]);
});

it('clears previous data when another invoice fails to load', async () => {
    fetch.mockResolvedValueOnce(success()).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const { rerender } = render(<InvoiceDetailModal invoiceId="FAC-42" onClose={jest.fn()} />);
    await screen.findByText('Arroz');
    rerender(<InvoiceDetailModal invoiceId="FAC-43" onClose={jest.fn()} />);
    expect(screen.queryByText('Arroz')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('HTTP 500'));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Factura #FAC-43');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

it('keeps Venta as the default label for existing SaleDetailModal callers', () => {
    render(<SaleDetailModal show sale={detail} onClose={jest.fn()} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Venta #FAC-42');
    expect(screen.getByText('Arroz')).toBeInTheDocument();
});

it('keeps the original loading title when no invoice ID is supplied', () => {
    render(<SaleDetailModal show onClose={jest.fn()} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Cargando...');
    expect(screen.getByRole('status')).toBeInTheDocument();
});
