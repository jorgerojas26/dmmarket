import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fetchInvoiceDetail } from 'api/invoice';
import {
    executeReceivableOperation,
    fetchReceivableClient,
    fetchReceivables,
    previewReceivableOperation,
} from 'api/receivables';
import pdfMake from 'pdfmake/build/pdfmake';
import { useReceivableClient, useReceivables } from 'hooks/useReceivables';
import ClientModal from './ClientModal';
import { money } from './format';
import Receivables from './index';
import OperationForm from './OperationForm';

jest.mock('hooks/useReceivables', () => ({ useReceivables: jest.fn(), useReceivableClient: jest.fn() }));
jest.mock('api/invoice', () => ({ fetchInvoiceDetail: jest.fn() }));
jest.mock('api/receivables', () => ({
    executeReceivableOperation: jest.fn(),
    fetchReceivableClient: jest.fn(),
    fetchReceivables: jest.fn(),
    previewReceivableOperation: jest.fn(),
}));
jest.mock('pdfmake/build/pdfmake', () => ({ createPdf: jest.fn(() => ({ open: jest.fn() })) }));
jest.mock('pdfmake/build/vfs_fonts', () => ({ pdfMake: { vfs: {} } }));

Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto, configurable: true });

const client = { id: 'C1', name: 'Cliente Uno', rif: 'J-123', ruta: 'R1' };
const preview = {
    amount: '120.0000',
    currency: 'USD',
    rate: '1.000000',
    base: '120.0000',
    applied: '100.0000',
    excess: '20.0000',
    balanceAfter: '0.0000',
    snapshot: 'snapshot',
    applications: [{ id: 1, sale: 'A', amount: '100.0000' }],
};
const portfolio = {
    writesEnabled: true,
    data: [{ ...client, balance: '100.0000', overdue: '50.0000', pendingCount: 1, lastPayment: null }],
    total: 1,
    routes: [{ id: 'R1' }],
    summary: { balance: '100.0000', overdue: '50.0000', debtors: 1, received: '30.0000' },
};
const detail = {
    writesEnabled: true,
    client,
    rate: '100.000000',
    summary: { balance: '100.0000', overdue: '50.0000', pendingCount: 1 },
    documents: {
        data: [
            {
                id: 1,
                sale: 'A',
                original: '100.0000',
                balance: '100.0000',
                applied: '0.0000',
                closed: '0.0000',
                eligible: true,
                status: 'Pendiente',
                issued: '2026-09-01',
                due: '2026-10-01',
            },
        ],
        total: 1,
    },
    timeline: { data: [], total: 0 },
};
const refresh = jest.fn().mockResolvedValue(undefined);

beforeEach(() => {
    jest.clearAllMocks();
    pdfMake.createPdf.mockReturnValue({ open: jest.fn() });
    useReceivables.mockReturnValue({ data: portfolio, mutate: refresh, isValidating: false });
    useReceivableClient.mockReturnValue({ data: detail, mutate: refresh, isValidating: false });
    previewReceivableOperation.mockResolvedValue(preview);
    executeReceivableOperation.mockResolvedValue({ operationId: 'saved' });
    fetchReceivables.mockResolvedValue(portfolio);
    fetchReceivableClient.mockResolvedValue(detail);
    fetchInvoiceDetail.mockResolvedValue({
        idFactura: 'A',
        fecha: '2026-10-01',
        productos: [{ descripcion: 'Arroz', cantidad: 1, precio: 10, subtotal: 10 }],
        total: 10,
    });
});

const renderForm = (overrides = {}) => {
    const callbacks = { onCancel: jest.fn(), onSuccess: jest.fn(), onBusyChange: jest.fn(), onDirtyChange: jest.fn() };
    render(
        <OperationForm action={{ type: 'payment' }} client={client} rate="100.000000" {...callbacks} {...overrides} />,
    );
    return callbacks;
};

it('formats ledger decimals without losing precision or hiding a small difference', () => {
    expect(money('12345678901234.1234')).toBe('$12.345.678.901.234,1234');
    expect(money('0.0001')).toBe('$0,0001');
    expect(money('99.7000', 'BsS')).toBe('Bs 99,70');
});

it('opens the account from a keyboard-accessible client button', async () => {
    render(<Receivables />);
    expect(screen.getByText('Dinero recibido este mes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cliente Uno' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Cliente Uno');
    expect(screen.getByText('Historial de cobranza')).toBeInTheDocument();
    expect(useReceivableClient).toHaveBeenCalledWith('C1', expect.objectContaining({ documents: 'pending' }));
});

it('prints the filtered receivables portfolio as a PDF', async () => {
    render(<Receivables />);
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir', exact: true }));
    const printButtons = screen.getAllByRole('button', { name: 'Imprimir', exact: true });
    fireEvent.click(printButtons[printButtons.length - 1]);
    await waitFor(() => expect(pdfMake.createPdf).toHaveBeenCalled());
    expect(fetchReceivables).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 100, state: 'debt', due: 'all' }),
    );
    const table = pdfMake.createPdf.mock.calls[0][0].content.find((item) => item.table);
    expect(table.table.body).toHaveLength(2);
    expect(table.table.body[1]).toContain('Cliente Uno');
});

it('prints all invoices in the client account from the modal', async () => {
    const firstDocuments = Array.from({ length: 20 }, (_, index) => ({
        ...detail.documents.data[0],
        id: index + 1,
        sale: `FAC-${index + 1}`,
    }));
    fetchReceivableClient.mockImplementation((_id, filters) =>
        Promise.resolve({
            ...detail,
            documents: {
                data: filters.page === 1 ? firstDocuments : [{ ...detail.documents.data[0], id: 21, sale: 'FAC-21' }],
                total: 21,
            },
        }),
    );
    render(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones' }));
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir PDF' }));
    await waitFor(() => expect(pdfMake.createPdf).toHaveBeenCalled());
    expect(fetchReceivableClient).toHaveBeenCalledTimes(2);
    const table = pdfMake.createPdf.mock.calls[0][0].content.find((item) => item.table);
    expect(table.table.body).toHaveLength(22);
    expect(table.table.body[21][0]).toBe('FAC-21');
});

it('includes every payment movement in the client account PDF', async () => {
    const events = Array.from({ length: 21 }, (_, index) => ({
        type: 'payment',
        eventId: `m-${index + 1}`,
        date: '2026-10-01',
        registeredAt: '2026-10-01',
        amount: '25.0000',
        currency: 'USD',
        base: '25.0000',
        method: 'TRANSFERENCIA',
        reference: `REF-${index + 1}`,
        applications: [{ sale: `FAC-${index + 1}`, amount: '25.0000' }],
        notes: null,
        voidReason: null,
        reason: null,
    }));
    fetchReceivableClient.mockImplementation((_id, filters) =>
        Promise.resolve({
            ...detail,
            documents: { data: [], total: 0 },
            timeline: { data: filters.timelinePage === 1 ? events.slice(0, 20) : events.slice(20), total: 21 },
        }),
    );
    render(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones' }));
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir PDF' }));
    await waitFor(() => expect(pdfMake.createPdf).toHaveBeenCalled());
    expect(fetchReceivableClient).toHaveBeenCalledTimes(2);
    const content = pdfMake.createPdf.mock.calls[0][0].content;
    expect(content.some((item) => item.text === 'Historial de abonos y movimientos (21)')).toBe(true);
    const historyIndex = content.findIndex((item) => item.text?.startsWith('Historial de abonos'));
    const historyTable = content.slice(historyIndex + 1).find((item) => item.table);
    expect(historyTable.table.body).toHaveLength(23);
    expect(historyTable.table.body[0]).not.toContain('Aplicado a');
    expect(historyTable.table.body[0]).not.toContain('Notas / motivo');
    expect(historyTable.table.body[21][4]).toContain('REF-21');
    expect(historyTable.table.body[22][1].text).toBe('Total de abonos');
    expect(historyTable.table.body[22][2].text).toBe('$525,00');
    expect(historyTable.table.body[22][3].text).toBe('$525,00');
});

it('keeps financial errors distinct from an empty debt portfolio', () => {
    useReceivables.mockReturnValue({ error: new Error('No se pudo conectar'), mutate: refresh });
    render(<Receivables />);
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo conectar');
    expect(screen.queryByText('No hay clientes con deuda en esta cartera')).not.toBeInTheDocument();
});

it('exposes settled accounts for history and reopening without changing KPI scope', () => {
    render(<Receivables />);
    userEvent.click(screen.getByLabelText('Cartera'));
    userEvent.click(screen.getByText('Sin deuda'));
    expect(useReceivables).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'settled', page: 1 }));
    userEvent.click(screen.getByLabelText('Ruta'));
    userEvent.click(screen.getByText('R1'));
    expect(useReceivables).toHaveBeenLastCalledWith(expect.objectContaining({ ruta: 'R1', state: 'settled' }));
});

it('disables financial actions until the portfolio is enabled', async () => {
    useReceivableClient.mockReturnValue({ data: { ...detail, writesEnabled: false }, mutate: refresh });
    render(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    expect(screen.getByRole('button', { name: 'Registrar abono' })).toBeDisabled();
    await act(async () => userEvent.click(screen.getByRole('button', { name: 'Más acciones' })));
    expect(screen.getByRole('button', { name: 'Cerrar deuda del cliente' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/Modo consulta: las escrituras/)).toBeInTheDocument();
});

it('accepts an overpayment and requires preview before saving', async () => {
    const callbacks = renderForm();
    const amount = screen.getByLabelText('Importe recibido');
    expect(amount).not.toHaveAttribute('max');
    fireEvent.change(amount, { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar operación' }));
    expect(await screen.findByText(/Excedente no aplicado/)).toHaveTextContent('no genera saldo a favor');
    expect(executeReceivableOperation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar abono' }));
    await waitFor(() => expect(callbacks.onSuccess).toHaveBeenCalledWith({ operationId: 'saved' }));
    expect(executeReceivableOperation).toHaveBeenCalledWith(
        'C1',
        expect.objectContaining({ amount: '120', snapshot: 'snapshot', requestId: expect.any(String) }),
    );
});

it('invalidates a preview after editing the amount', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar operación' }));
    await screen.findByText('Revisa antes de confirmar');
    fireEvent.click(screen.getByRole('button', { name: 'Editar datos' }));
    expect(screen.getByLabelText('Importe recibido')).toHaveValue(120);
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '119.70' } });
    expect(screen.queryByText('Revisa antes de confirmar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revisar operación' })).toBeInTheDocument();
});

it('retains the same request ID on network retries', async () => {
    executeReceivableOperation.mockRejectedValueOnce(new Error('Conexión interrumpida'));
    renderForm();
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar operación' }));
    await screen.findByText('Revisa antes de confirmar');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar abono' }));
    await screen.findByText('Conexión interrumpida');
    const original = executeReceivableOperation.mock.calls[0][1].requestId;
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar abono' }));
    await waitFor(() => expect(executeReceivableOperation).toHaveBeenCalledTimes(2));
    expect(executeReceivableOperation.mock.calls[1][1].requestId).toBe(original);
});

it('preserves fields but requires a new preview after a stale balance error', async () => {
    executeReceivableOperation.mockRejectedValueOnce(Object.assign(new Error('La deuda cambió'), { status: 409 }));
    renderForm();
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar operación' }));
    await screen.findByText('Revisa antes de confirmar');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar abono' }));
    await screen.findByText('La deuda cambió');
    expect(screen.getByLabelText('Importe recibido')).toHaveValue(120);
    expect(screen.queryByText('Revisa antes de confirmar')).not.toBeInTheDocument();
});

it('uses the saved rate and blocks bolivars when REF is unavailable', () => {
    renderForm({ rate: null });
    fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: 'BsS' } });
    expect(screen.getByRole('button', { name: 'Revisar operación' })).toBeDisabled();
    expect(screen.getByText(/Tasa REF: No disponible/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: 'USD' } });
    expect(screen.getByRole('button', { name: 'Revisar operación' })).not.toBeDisabled();
});

it('keeps closure separate from payment and requires a reason', async () => {
    previewReceivableOperation.mockResolvedValue({ ...preview, type: 'close', base: '100.0000' });
    renderForm({ action: { type: 'close', id: 1, scope: 'Venta A' } });
    expect(screen.queryByLabelText('Importe recibido')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Motivo')).toBeRequired();
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Redondeo acordado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar operación' }));
    await screen.findByText('Revisa antes de confirmar');
    expect(previewReceivableOperation).toHaveBeenCalledWith('C1', {
        type: 'close',
        id: 1,
        reason: 'Redondeo acordado',
    });
});

it('offers reopening a closed sale while preserving its payment history', () => {
    useReceivableClient.mockReturnValue({
        data: {
            ...detail,
            documents: {
                data: [
                    { ...detail.documents.data[0], balance: '0.0000', closed: '0.3000', status: 'Cerrada manualmente' },
                ],
                total: 1,
            },
        },
        mutate: refresh,
    });
    render(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver desglose de factura A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir cierre de factura A' }));
    expect(screen.getByRole('heading', { name: 'Reabrir cierre' })).toBeInTheDocument();
    expect(screen.getByText(/Los abonos vigentes se conservan/)).toBeInTheDocument();
});

it('keeps a successful payment visible even if refreshing its account fails', async () => {
    let state = { data: detail, isValidating: false };
    const reload = jest.fn().mockImplementation(async () => {
        state = { error: new Error('La consulta falló'), isValidating: false };
        throw new Error('La consulta falló');
    });
    useReceivableClient.mockImplementation(() => ({ ...state, mutate: reload }));
    render(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }));
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar operación' }));
    await screen.findByText('Revisa antes de confirmar');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar abono' }));
    await screen.findByText(/Operación registrada. No se pudo actualizar la vista/);
    expect(screen.getByText('La consulta falló')).toBeInTheDocument();
    expect(executeReceivableOperation).toHaveBeenCalledTimes(1);
});

it('returns focus to search when the selected client leaves the debt table', async () => {
    render(<Receivables />);
    fireEvent.click(screen.getByRole('button', { name: 'Cliente Uno' }));
    useReceivables.mockReturnValue({ data: { ...portfolio, data: [], total: 0 }, mutate: refresh });
    fireEvent.click(within(screen.getByRole('dialog')).getByLabelText('Cerrar cuenta'));
    await waitFor(() => expect(screen.getByLabelText('Buscar cliente')).toHaveFocus());
});

it('uses native table search and preserves its text while loading another query', async () => {
    const { rerender } = render(<Receivables />);
    const search = screen.getByRole('searchbox', { name: 'Buscar cliente' });
    expect(search).toHaveClass('table-search-input');
    expect(screen.queryByRole('button', { name: 'Actualizar' })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'Cliente' } });
    await waitFor(() =>
        expect(useReceivables).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Cliente', page: 1 })),
    );
    useReceivables.mockReturnValue({ data: undefined, isValidating: true, mutate: refresh });
    rerender(<Receivables />);
    expect(screen.getByRole('searchbox', { name: 'Buscar cliente' })).toBe(search);
    expect(search).toHaveValue('Cliente');
});

it('resets route, portfolio and due filters together', () => {
    render(<Receivables />);
    expect(screen.queryByRole('button', { name: 'Restablecer filtros' })).not.toBeInTheDocument();
    userEvent.click(screen.getByLabelText('Cartera'));
    userEvent.click(screen.getByText('Sin deuda'));
    userEvent.click(screen.getByLabelText('Ruta'));
    userEvent.click(screen.getByText('R1'));
    userEvent.click(screen.getByLabelText('Vencimiento'));
    userEvent.click(screen.getByText('Con deuda vencida'));
    expect(useReceivables).toHaveBeenLastCalledWith(
        expect.objectContaining({ ruta: 'R1', state: 'settled', due: 'overdue' }),
    );
    userEvent.click(screen.getByRole('button', { name: 'Restablecer filtros' }));
    expect(useReceivables).toHaveBeenLastCalledWith(
        expect.objectContaining({ ruta: '', state: 'debt', due: 'all', page: 1 }),
    );
    expect(screen.queryByRole('button', { name: 'Restablecer filtros' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Ruta')).toHaveFocus();
});

it('shows one value per portfolio column without stacked client metadata', () => {
    render(<Receivables />);
    const row = screen.getByRole('button', { name: 'Cliente Uno' }).closest('tr');
    const cells = within(row).getAllByRole('cell');
    expect(cells).toHaveLength(5);
    expect(cells[0]).toHaveTextContent(/^Cliente Uno$/);
    expect(cells[0].querySelector('small')).toBeNull();
    expect(row).not.toHaveTextContent('Ruta R1');
    expect(row).not.toHaveTextContent('C1');
});

it('only offers filter reset while a non-default selection exists', () => {
    render(<Receivables />);
    expect(screen.queryByRole('button', { name: 'Restablecer filtros' })).not.toBeInTheDocument();
    userEvent.click(screen.getByLabelText('Cartera'));
    userEvent.click(screen.getByText('Sin deuda'));
    expect(screen.getByRole('button', { name: 'Restablecer filtros' })).toHaveClass('btn-link');
    userEvent.click(screen.getByLabelText('Cartera'));
    userEvent.click(screen.getByText('Con deuda'));
    expect(screen.queryByRole('button', { name: 'Restablecer filtros' })).not.toBeInTheDocument();
    userEvent.click(screen.getByLabelText('Vencimiento'));
    userEvent.click(screen.getByText('Con deuda vencida'));
    expect(screen.getByRole('button', { name: 'Restablecer filtros' })).toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'Restablecer filtros' }));
    expect(screen.queryByRole('button', { name: 'Restablecer filtros' })).not.toBeInTheDocument();
});

it('opens the payment CTA with server-side client selection across the whole portfolio', async () => {
    const otherClient = { ...client, id: 'C2', name: 'Cliente fuera de la tabla', ruta: 'R2', balance: '25.0000' };
    fetchReceivables.mockResolvedValue({ ...portfolio, data: [otherClient] });
    useReceivableClient.mockReturnValue({
        data: { ...detail, client: otherClient },
        mutate: refresh,
        isValidating: false,
    });
    render(<Receivables />);
    userEvent.click(screen.getByRole('button', { name: 'Registrar abono' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    await waitFor(() =>
        expect(fetchReceivables).toHaveBeenCalledWith({ search: '', state: 'debt', page: 1, limit: 20 }),
    );
    userEvent.click(screen.getByLabelText('Cliente'));
    userEvent.click(await screen.findByText('Cliente fuera de la tabla · C2'));
    userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Cliente fuera de la tabla');
    expect(await screen.findByLabelText('Importe recibido')).toBeInTheDocument();
    expect(useReceivableClient).toHaveBeenLastCalledWith('C2', expect.any(Object));
});

it('does not offer payments when portfolio writes are disabled', () => {
    useReceivables.mockReturnValue({ data: { ...portfolio, writesEnabled: false }, mutate: refresh });
    render(<Receivables />);
    expect(screen.getByRole('button', { name: 'Registrar abono' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Modo consulta');
});

it('reports client selection errors instead of presenting an empty valid portfolio', async () => {
    fetchReceivables.mockRejectedValueOnce(new Error('Consulta de clientes no disponible'));
    render(<Receivables />);
    userEvent.click(screen.getByRole('button', { name: 'Registrar abono' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Consulta de clientes no disponible');
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
});

it('rechecks writes on the client before opening the initial payment form', () => {
    useReceivableClient.mockReturnValue({
        data: { ...detail, writesEnabled: false },
        mutate: refresh,
        isValidating: false,
    });
    render(<ClientModal client={client} initialAction="payment" onClose={jest.fn()} onChanged={refresh} />);
    expect(screen.queryByLabelText('Importe recibido')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar abono' })).toBeDisabled();
});

it('paginates the compact document list without changing the timeline page', () => {
    useReceivableClient.mockReturnValue({
        data: { ...detail, documents: { ...detail.documents, total: 21 } },
        mutate: refresh,
        isValidating: false,
    });
    render(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const documentSection = screen.getByRole('region', { name: 'Facturas' });
    userEvent.click(within(documentSection).getByRole('button', { name: 'Facturas: siguiente' }));
    expect(useReceivableClient).toHaveBeenLastCalledWith('C1', { page: 2, timelinePage: 1, documents: 'pending' });
});

it('opens invoice detail from the account table and restores account and focus on close', async () => {
    render(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    userEvent.click(screen.getByRole('button', { name: 'Ver factura A' }));
    expect(await screen.findByRole('dialog', { name: 'Factura #A' })).toBeInTheDocument();
    expect(await screen.findByText('Arroz')).toBeInTheDocument();
    expect(fetchInvoiceDetail).toHaveBeenCalledWith('A', false);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /close/i }));
    expect(screen.getByRole('dialog', { name: 'Cliente Uno' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ver factura A' })).toHaveFocus());
});

it('opens invoice detail from a timeline application and returns to the same timeline', async () => {
    useReceivableClient.mockReturnValue({
        data: {
            ...detail,
            timeline: {
                total: 1,
                data: [
                    {
                        eventId: 'm-1',
                        type: 'payment',
                        date: '2026-10-01',
                        amount: '10.0000',
                        base: '10.0000',
                        currency: 'USD',
                        rate: '1.000000',
                        applications: [{ id: 1, sale: 'A', amount: '10.0000' }],
                    },
                ],
            },
        },
        mutate: refresh,
        isValidating: false,
    });
    render(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    const history = screen.getByRole('region', { name: 'Historial de cobranza' });
    userEvent.click(within(history).getByRole('button', { name: /Ver detalles: Abono/ }));
    userEvent.click(within(history).getByRole('button', { name: 'Ver factura A' }));
    expect(await screen.findByText('Arroz')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Factura #A');
    userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Cliente Uno');
    await waitFor(() =>
        expect(
            within(screen.getByRole('region', { name: 'Historial de cobranza' })).getByRole('button', {
                name: 'Ver factura A',
            }),
        ).toHaveFocus(),
    );
});

it('asks before discarding unsaved edits without opening a second dialog', async () => {
    const close = jest.fn();
    render(<ClientModal client={client} onClose={close} onChanged={refresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }));
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '20' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByLabelText('Cerrar cuenta'));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(close).toHaveBeenCalledTimes(1);
});

it('keeps client-wide debt closure behind a secondary action and reviews its scope', async () => {
    render(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    expect(screen.queryByRole('button', { name: 'Cerrar deuda del cliente' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar abono' })).toHaveClass('btn-primary');
    await act(async () => userEvent.click(screen.getByRole('button', { name: 'Más acciones' })));
    userEvent.click(screen.getByRole('button', { name: 'Cerrar deuda del cliente' }));
    expect(screen.getByText('Todos los documentos pendientes del cliente')).toBeInTheDocument();
    expect(screen.getByText(/sin registrar dinero recibido/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Cierre acordado' } });
    userEvent.click(screen.getByRole('button', { name: 'Revisar operación' }));
    expect(await screen.findByRole('button', { name: 'Confirmar cierre' })).toBeInTheDocument();
    expect(executeReceivableOperation).not.toHaveBeenCalled();
    expect(previewReceivableOperation).toHaveBeenCalledWith('C1', {
        type: 'close',
        id: undefined,
        reason: 'Cierre acordado',
    });
});

it('distinguishes settled debt from money received and keeps history accessible', () => {
    useReceivableClient.mockReturnValue({
        data: {
            ...detail,
            summary: { balance: '0.0000', overdue: '0.0000', pendingCount: 0 },
            documents: { data: [], total: 0 },
        },
        mutate: refresh,
    });
    render(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    expect(screen.getByText('No hay facturas pendientes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar abono' })).toBeDisabled();
    expect(screen.getByText('Sin movimientos registrados')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'Todas' }));
    expect(useReceivableClient).toHaveBeenLastCalledWith('C1', { page: 1, timelinePage: 1, documents: 'all' });
});

it('does not present a failed account query as a zero balance', () => {
    useReceivableClient.mockReturnValue({ error: new Error('Cuenta no disponible'), mutate: refresh });
    render(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Cuenta no disponible');
    expect(screen.queryByRole('region', { name: 'Resumen de la cuenta' })).not.toBeInTheDocument();
    expect(screen.queryByText('Sin deuda pendiente')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar abono' })).toBeDisabled();
    userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refresh).toHaveBeenCalledTimes(1);
});

it('preserves unsaved payment fields when a background account refresh fails', () => {
    const { rerender } = render(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    userEvent.click(screen.getByRole('button', { name: 'Registrar abono' }));
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '35.0001' } });
    useReceivableClient.mockReturnValue({ data: detail, error: new Error('Conexión perdida'), mutate: refresh });
    rerender(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    expect(screen.getByLabelText('Importe recibido')).toHaveValue(35.0001);
    expect(screen.getByRole('alert')).toHaveTextContent('Saldos sin actualizar');
    expect(screen.getByRole('button', { name: 'Revisar operación' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Volver al historial' })).not.toBeDisabled();
    useReceivableClient.mockReturnValue({ data: detail, mutate: refresh });
    rerender(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    expect(screen.getByLabelText('Importe recibido')).toHaveValue(35.0001);
    expect(screen.getByRole('button', { name: 'Revisar operación' })).not.toBeDisabled();
});

it('locks account navigation while editing to avoid losing a payment draft', () => {
    render(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    userEvent.click(screen.getByRole('button', { name: 'Registrar abono' }));
    expect(screen.getByRole('button', { name: 'Pendientes', hidden: true })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Ver factura A' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Más acciones' })).toBeDisabled();
});

it('returns focus to the payment trigger when cancelling an untouched form', async () => {
    render(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    userEvent.click(screen.getByRole('button', { name: 'Registrar abono' }));
    userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('region', { name: 'Historial de cobranza' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar abono' })).toHaveFocus());
});

it('focuses the safe discard choice and retains the draft when continuing', () => {
    const close = jest.fn();
    render(<ClientModal client={client} onClose={close} onChanged={refresh} />);
    userEvent.click(screen.getByRole('button', { name: 'Registrar abono' }));
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '35' } });
    userEvent.click(screen.getByLabelText('Cerrar cuenta'));
    expect(screen.getByRole('button', { name: 'Seguir editando' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Revisar operación' })).toBeDisabled();
    userEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByLabelText('Importe recibido')).toHaveValue(35);
    expect(close).not.toHaveBeenCalled();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

it('uses the precise USD balance as a shortcut without calculating a bolivar amount', () => {
    renderForm({ balance: '100.0001' });
    userEvent.click(screen.getByRole('button', { name: 'Usar saldo completo' }));
    expect(screen.getByLabelText('Importe recibido')).toHaveValue(100.0001);
    userEvent.selectOptions(screen.getByLabelText('Moneda'), 'BsS');
    expect(screen.queryByRole('button', { name: 'Usar saldo completo' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Tasa REF: 100,00 Bs/USD');
});

it('focuses review, summarizes payment metadata and restores all fields on edit', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '120' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Referencia' }), { target: { value: 'REF-345' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Banco' }), { target: { value: 'Banco Uno' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Observaciones' }), { target: { value: 'Cobro de ruta' } });
    userEvent.click(screen.getByRole('button', { name: 'Revisar operación' }));
    const reviewTitle = await screen.findByRole('heading', { name: 'Revisa antes de confirmar' });
    await waitFor(() => expect(reviewTitle).toHaveFocus());
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByText('REF-345')).toBeInTheDocument();
    expect(screen.getByText('Banco Uno')).toBeInTheDocument();
    expect(screen.getByText('Cobro de ruta')).toBeInTheDocument();
    expect(screen.getByText('Saldo del cliente después')).toBeInTheDocument();
    expect(screen.getByLabelText('Importes por factura')).toHaveTextContent('Factura A');
    userEvent.click(screen.getByRole('button', { name: 'Editar datos' }));
    expect(screen.getByLabelText('Importe recibido')).toHaveValue(120);
    expect(screen.getByRole('textbox', { name: 'Referencia' })).toHaveValue('REF-345');
    expect(screen.getByRole('textbox', { name: 'Banco' })).toHaveValue('Banco Uno');
    expect(screen.getByRole('textbox', { name: 'Observaciones' })).toHaveValue('Cobro de ruta');
    expect(screen.queryByRole('button', { name: 'Confirmar abono' })).not.toBeInTheDocument();
    expect(executeReceivableOperation).not.toHaveBeenCalled();
});

it('shows the server conversion and informational excess before confirming a bolivar payment', async () => {
    previewReceivableOperation.mockResolvedValue({
        ...preview,
        amount: '10000.0000',
        currency: 'BsS',
        rate: '100.000000',
        base: '100.0000',
        excess: '0.0001',
    });
    renderForm();
    userEvent.selectOptions(screen.getByLabelText('Moneda'), 'BsS');
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '10000' } });
    userEvent.click(screen.getByRole('button', { name: 'Revisar operación' }));
    await screen.findByRole('heading', { name: 'Revisa antes de confirmar' });
    expect(screen.getByText('Equivalente en USD')).toBeInTheDocument();
    expect(screen.getByText('Tasa aplicada · Bs/USD')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Excedente no aplicado: $0,0001');
    expect(executeReceivableOperation).not.toHaveBeenCalled();
});

it('blocks duplicate confirmations while the first financial request is pending', async () => {
    let finish;
    executeReceivableOperation.mockReturnValue(
        new Promise((resolve) => {
            finish = resolve;
        }),
    );
    const callbacks = renderForm();
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '120' } });
    userEvent.click(screen.getByRole('button', { name: 'Revisar operación' }));
    const confirm = await screen.findByRole('button', { name: 'Confirmar abono' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(executeReceivableOperation).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Procesando…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    await act(async () => finish({ operationId: 'saved' }));
    expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
});
