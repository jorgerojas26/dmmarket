import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fetchInvoiceDetail } from 'api/invoice';
import {
    executeReceivableOperation,
    fetchReceivableClient,
    fetchReceivables,
    previewReceivableOperation,
} from 'api/receivables';
import { useClientRoutes } from 'hooks/useClients';
import { useReceivableBanks, useReceivableClient, useReceivables } from 'hooks/useReceivables';
import pdfMake from 'pdfmake/build/pdfmake';
import ClientModal from './ClientModal';
import { dateLabel, money, today } from './format';
import Receivables from './index';
import OperationForm from './OperationForm';
import PaymentDrawer from './PaymentDrawer';

jest.mock('hooks/useReceivables', () => ({
    useReceivables: jest.fn(),
    useReceivableClient: jest.fn(),
    useReceivableBanks: jest.fn(),
}));
jest.mock('hooks/useClients', () => ({ useClientRoutes: jest.fn() }));
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
    data: [{ ...client, balance: '100.0000', overdue: '50.0000', pendingCount: 1, lastPayment: null }],
    total: 1,
    routes: [{ id: 'R1' }],
    summary: { balance: '100.0000', overdue: '50.0000', debtors: 1, received: '30.0000' },
};
const detail = {
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
    useClientRoutes.mockReturnValue({ data: [{ Id_Ruta: 'R1', Nombre: 'R1' }], isLoading: false });
    useReceivableBanks.mockReturnValue({ data: [{ id: 'BA', name: 'Banco Uno' }], mutate: refresh });
    pdfMake.createPdf.mockReturnValue({ open: jest.fn() });
    useReceivables.mockReturnValue({ data: portfolio, mutate: refresh, isValidating: false });
    useReceivableClient.mockReturnValue({ data: detail, mutate: refresh, isValidating: false });
    previewReceivableOperation.mockResolvedValue(preview);
    executeReceivableOperation.mockResolvedValue({ ...preview, operationId: 'saved' });
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
    if (!overrides.action || overrides.action.type === 'payment') {
        userEvent.selectOptions(screen.getByLabelText('Moneda'), 'USD');
    }
    return callbacks;
};

it('rounds displayed ledger amounts to exactly two decimals without losing large integer digits', () => {
    expect(money('12345678901234.1234')).toBe('$12.345.678.901.234,12');
    expect(money('0.0001')).toBe('$0,00');
    expect(money('29.9999')).toBe('$30,00');
    expect(money('1.0050')).toBe('$1,01');
    expect(money('9999999999999999.9999')).toBe('$10.000.000.000.000.000,00');
    expect(money('-12.3456')).toBe('$-12,35');
    expect(money('-0.0001')).toBe('$0,00');
    expect(money(0)).toBe('$0,00');
    expect(money('1.5')).toBe('$1,50');
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

it('keeps KPI cards and values visible while filters reload the portfolio', async () => {
    const { container } = render(<Receivables />);
    const stats = container.querySelector('.cxc-stats');
    await waitFor(() => expect(within(stats).getByText('$100,00')).toBeInTheDocument());
    useReceivables.mockReturnValue({ data: undefined, isValidating: true, mutate: refresh });
    await userEvent.click(screen.getByLabelText('Vencimiento'));
    await userEvent.click(screen.getByText('Con deuda vencida'));
    expect(within(stats).getByText('$100,00')).toBeInTheDocument();
    expect(stats).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelectorAll('.cxc-stat-loading')).toHaveLength(4);
    expect(screen.queryByText('Cargando cartera…')).not.toBeInTheDocument();
});

it('keeps financial errors distinct from an empty debt portfolio', () => {
    useReceivables.mockReturnValue({ error: new Error('No se pudo conectar'), mutate: refresh });
    render(<Receivables />);
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo conectar');
    expect(screen.queryByText('No hay clientes con deuda en esta cartera')).not.toBeInTheDocument();
});

it('always queries clients with debt and does not offer a portfolio filter', () => {
    render(<Receivables />);
    expect(screen.queryByLabelText('Cartera')).not.toBeInTheDocument();
    expect(useReceivables).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'debt', page: 1 }));
    userEvent.click(screen.getByLabelText('Ruta'));
    userEvent.click(screen.getByText('R1'));
    userEvent.click(screen.getByLabelText('Vencimiento'));
    userEvent.click(screen.getByText('Con deuda vencida'));
    expect(useReceivables).toHaveBeenLastCalledWith(
        expect.objectContaining({ ruta: 'R1', state: 'debt', due: 'overdue' }),
    );
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
    await waitFor(() =>
        expect(callbacks.onSuccess).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'saved' })),
    );
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
    expect(screen.getByText('Tasa pendiente')).toBeInTheDocument();
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
    userEvent.click(screen.getByRole('button', { name: 'USD' }));
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar abono' }));
    await screen.findByText('Revisa antes de confirmar');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar abono' }));
    await screen.findByText(/El abono está guardado. No se pudo actualizar la vista/);
    expect(screen.getByRole('region', { name: 'Abono registrado' })).toHaveTextContent('$120,00');
    expect(screen.getByRole('region', { name: 'Abono registrado' })).toHaveTextContent('Saldo pendiente · USD');
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

it('resets route and due filters while retaining debt-only scope', () => {
    render(<Receivables />);
    expect(screen.queryByRole('button', { name: 'Restablecer filtros' })).not.toBeInTheDocument();
    userEvent.click(screen.getByLabelText('Ruta'));
    userEvent.click(screen.getByText('R1'));
    userEvent.click(screen.getByLabelText('Vencimiento'));
    userEvent.click(screen.getByText('Con deuda vencida'));
    expect(useReceivables).toHaveBeenLastCalledWith(
        expect.objectContaining({ ruta: 'R1', state: 'debt', due: 'overdue' }),
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
    expect(cells).toHaveLength(6);
    expect(cells[0]).toHaveTextContent(/^Cliente Uno$/);
    expect(cells[0].querySelector('small')).toBeNull();
    expect(row).not.toHaveTextContent('Ruta R1');
    expect(row).not.toHaveTextContent('C1');
});

it('only offers filter reset while a non-default selection exists', () => {
    render(<Receivables />);
    expect(screen.queryByRole('button', { name: 'Restablecer filtros' })).not.toBeInTheDocument();
    userEvent.click(screen.getByLabelText('Ruta'));
    userEvent.click(screen.getByText('R1'));
    expect(screen.getByRole('button', { name: 'Restablecer filtros' })).toHaveClass('btn-link');
    userEvent.click(screen.getByRole('button', { name: 'Restablecer filtros' }));
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
    expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument();
    const drawer = screen.getByRole('dialog');
    await waitFor(() =>
        expect(fetchReceivables).toHaveBeenCalledWith({ search: '', state: 'debt', page: 1, limit: 20 }),
    );
    userEvent.click(screen.getByLabelText('Cliente'));
    userEvent.click(await screen.findByText('Cliente fuera de la tabla · C2'));
    expect(screen.getByRole('dialog')).toBe(drawer);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Registrar abono');
    expect(screen.getByRole('region', { name: 'Cliente del abono' })).toHaveTextContent('Cliente fuera de la tabla');
    expect(await screen.findByLabelText('Importe recibido')).toBeInTheDocument();
    expect(useReceivableClient).toHaveBeenLastCalledWith('C2', expect.any(Object));
});

it('reports client selection errors instead of presenting an empty valid portfolio', async () => {
    fetchReceivables.mockRejectedValueOnce(new Error('Consulta de clientes no disponible'));
    render(<Receivables />);
    userEvent.click(screen.getByRole('button', { name: 'Registrar abono' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Consulta de clientes no disponible');
    expect(screen.queryByRole('button', { name: 'Revisar abono' })).not.toBeInTheDocument();
});

it('requires a registered client before opening the initial payment form', () => {
    useReceivableClient.mockReturnValue({
        data: { ...detail, client: { ...client, unregistered: true } },
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
    fireEvent.click(within(screen.getByRole('dialog')).getByLabelText('Cerrar abono'));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Cliente Uno');
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
    expect(screen.getByRole('button', { name: 'Revisar abono' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).not.toBeDisabled();
    useReceivableClient.mockReturnValue({ data: detail, mutate: refresh });
    rerender(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    expect(screen.getByLabelText('Importe recibido')).toHaveValue(35.0001);
    expect(screen.getByRole('button', { name: 'Revisar abono' })).not.toBeDisabled();
});

it('locks account navigation while editing to avoid losing a payment draft', () => {
    render(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    userEvent.click(screen.getByRole('button', { name: 'Registrar abono' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Registrar abono');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Ver factura A' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Más acciones' })).not.toBeInTheDocument();
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
    userEvent.click(screen.getByLabelText('Cerrar abono'));
    expect(screen.getByRole('button', { name: 'Seguir editando' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Revisar abono', hidden: true })).toBeDisabled();
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

it('focuses payment confirmation, summarizes metadata and restores all fields on edit', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '120' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Referencia' }), { target: { value: 'REF-345' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Banco' }), { target: { value: 'Banco Uno' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Observaciones' }), { target: { value: 'Cobro de ruta' } });
    userEvent.click(screen.getByRole('button', { name: 'Revisar operación' }));
    const confirmation = await screen.findByRole('button', { name: 'Confirmar abono' });
    await waitFor(() => expect(confirmation).toHaveFocus());
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByText('REF-345')).toBeInTheDocument();
    expect(screen.getByText('Banco Uno')).toBeInTheDocument();
    expect(screen.getByText('Cobro de ruta')).toBeInTheDocument();
    expect(screen.getByText('Saldo del cliente después')).toBeInTheDocument();
    expect(screen.getByLabelText('Importes por factura')).toHaveTextContent('Factura A');
    userEvent.click(screen.getByRole('button', { name: 'Editar datos' }));
    expect(screen.getByLabelText('Importe recibido')).toHaveValue(120);
    expect(screen.getByRole('textbox', { name: 'Referencia' })).toHaveValue('REF-345');
    expect(screen.getByRole('combobox', { name: 'Banco' })).toHaveValue('Banco Uno');
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
    expect(screen.getByRole('alert')).toHaveTextContent('Excedente no aplicado: $0,00');
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

it('opens a row payment directly in the drawer and keeps the portfolio behind it', async () => {
    render(<Receivables />);
    userEvent.click(screen.getByRole('button', { name: 'Abonar a Cliente Uno' }));
    expect(screen.getByRole('dialog')).toHaveClass('cxc-payment-drawer', 'offcanvas-end');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Cliente del abono' })).toHaveTextContent('J-123');
    expect(screen.queryByText('Historial de cobranza')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cliente Uno', hidden: true })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Importe recibido')).toHaveFocus());
    userEvent.click(screen.getByRole('button', { name: 'USD' }));
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '35' } });
    const estimate = screen.getByRole('region', { name: 'Estimación del abono' });
    expect(estimate).toHaveTextContent('$35,00');
    expect(estimate).toHaveTextContent('$65,00');
    expect(previewReceivableOperation).not.toHaveBeenCalled();
    userEvent.click(screen.getByLabelText('Cerrar abono'));
    expect(screen.getByRole('button', { name: 'Seguir editando' })).toHaveFocus();
    userEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abonar a Cliente Uno' })).toHaveFocus());
});

it('excludes row payment actions from the portfolio PDF configuration', async () => {
    render(<Receivables />);
    userEvent.click(screen.getByRole('button', { name: 'Imprimir', exact: true }));
    expect(within(screen.getByRole('dialog')).queryByText('Acciones')).not.toBeInTheDocument();
    userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Imprimir', exact: true }));
    await waitFor(() => expect(pdfMake.createPdf).toHaveBeenCalled());
    const table = pdfMake.createPdf.mock.calls[0][0].content.find((item) => item.table);
    expect(table.table.body[0]).toHaveLength(5);
});

it('disables row payments for settled clients and while the portfolio reloads', () => {
    useReceivables.mockReturnValue({
        data: { ...portfolio, data: [{ ...portfolio.data[0], balance: '0.0000' }] },
        mutate: refresh,
    });
    const { rerender } = render(<Receivables />);
    expect(screen.getByRole('button', { name: 'Abonar a Cliente Uno' })).toBeDisabled();
    useReceivables.mockReturnValue({ data: portfolio, isValidating: true, mutate: refresh });
    rerender(<Receivables />);
    expect(screen.getByRole('button', { name: 'Abonar a Cliente Uno' })).toBeDisabled();
});

it('reveals optional drawer details and preserves them when editing a review', async () => {
    render(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    expect(screen.getByRole('textbox', { name: 'Referencia' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Banco' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Observaciones' })).not.toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: '+ Agregar observaciones' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Referencia' }), { target: { value: 'REF-345' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Banco' }), { target: { value: 'Banco Uno' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Observaciones' }), { target: { value: 'Cobro de ruta' } });
    userEvent.click(screen.getByRole('button', { name: 'USD' }));
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '120' } });
    userEvent.click(screen.getByRole('button', { name: 'Revisar abono' }));
    await screen.findByRole('heading', { name: 'Revisa antes de confirmar' });
    expect(screen.getByText('REF-345')).toBeInTheDocument();
    expect(screen.getByText('Cobro de ruta')).toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'Editar datos' }));
    expect(screen.getByRole('textbox', { name: 'Referencia' })).toHaveValue('REF-345');
    expect(screen.getByRole('textbox', { name: 'Observaciones' })).toHaveValue('Cobro de ruta');
    userEvent.selectOptions(screen.getByLabelText('Método'), 'EFECTIVO');
    expect(screen.queryByRole('textbox', { name: 'Referencia' })).not.toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'Revisar abono' }));
    await screen.findByRole('button', { name: 'Confirmar abono' });
    expect(previewReceivableOperation).toHaveBeenLastCalledWith(
        'C1',
        expect.objectContaining({
            method: 'EFECTIVO',
            reference: '',
            bank: '',
            notes: 'Cobro de ruta',
        }),
    );
});

it('shows a local bolivar estimate but reviews and saves only the server conversion', async () => {
    const conversion = {
        ...preview,
        amount: '5000.0000',
        currency: 'BsS',
        rate: '125.000000',
        base: '40.0000',
        applied: '40.0000',
        excess: '0.0000',
        balanceAfter: '60.0000',
        applications: [{ id: 1, sale: 'A', amount: '40.0000' }],
    };
    previewReceivableOperation.mockResolvedValue(conversion);
    executeReceivableOperation.mockResolvedValue({ ...conversion, operationId: 'saved' });
    render(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    userEvent.click(screen.getByRole('button', { name: 'Bolívares' }));
    expect(screen.getByRole('button', { name: 'Bolívares' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '5000' } });
    expect(screen.getByRole('region', { name: 'Estimación del abono' })).toHaveTextContent('$50,00');
    expect(previewReceivableOperation).not.toHaveBeenCalled();
    userEvent.click(screen.getByRole('button', { name: 'Revisar abono' }));
    await screen.findByRole('button', { name: 'Confirmar abono' });
    expect(screen.getByText('125,00')).toBeInTheDocument();
    expect(screen.getAllByText('$40,00')).toHaveLength(3);
    userEvent.click(screen.getByRole('button', { name: 'Confirmar abono' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Listo' })).not.toBeDisabled());
    expect(screen.getByRole('region', { name: 'Abono registrado' })).toHaveTextContent('Bs 5.000,00');
    expect(screen.getByRole('region', { name: 'Abono registrado' })).toHaveTextContent('$60,00');
    expect(executeReceivableOperation).toHaveBeenCalledWith(
        'C1',
        expect.objectContaining({
            currency: 'BsS',
            amount: '5000',
            snapshot: conversion.snapshot,
            requestId: expect.any(String),
        }),
    );
});

it('blocks unavailable REF in the drawer without blocking a USD payment', () => {
    useReceivableClient.mockReturnValue({ data: { ...detail, rate: null }, mutate: refresh });
    render(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    userEvent.click(screen.getByRole('button', { name: 'Bolívares' }));
    expect(screen.getByRole('button', { name: 'Revisar abono' })).toBeDisabled();
    expect(screen.getByText('Tasa pendiente')).toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'USD' }));
    expect(screen.getByRole('button', { name: 'Revisar abono' })).not.toBeDisabled();
});

it('rechecks client registration and debt before allowing a direct row payment', () => {
    useReceivableClient.mockReturnValue({
        data: { ...detail, client: { ...client, unregistered: true } },
        mutate: refresh,
    });
    const { rerender } = render(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    expect(screen.getByRole('button', { name: 'Revisar abono' })).toBeDisabled();
    useReceivableClient.mockReturnValue({
        data: { ...detail, summary: { ...detail.summary, balance: '0.0000' } },
        mutate: refresh,
    });
    rerender(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    expect(screen.getByRole('button', { name: 'Revisar abono' })).toBeDisabled();
    expect(screen.getByText(/El cliente no tiene deuda pendiente/)).toBeInTheDocument();
});

it('requires a safe discard before changing clients and clears the previous draft', async () => {
    const otherClient = { ...client, id: 'C2', name: 'Cliente Dos', balance: '100.0000' };
    fetchReceivables.mockResolvedValue({ ...portfolio, data: [otherClient] });
    render(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '35' } });
    userEvent.click(screen.getByRole('button', { name: 'Cambiar cliente' }));
    expect(screen.getByRole('button', { name: 'Seguir editando' })).toHaveFocus();
    userEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByLabelText('Importe recibido')).toHaveValue(35);
    userEvent.click(screen.getByRole('button', { name: 'Cambiar cliente' }));
    userEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    useReceivableClient.mockReturnValue({ data: { ...detail, client: otherClient }, mutate: refresh });
    userEvent.click(screen.getByLabelText('Cliente'));
    userEvent.click(await screen.findByText('Cliente Dos · C2'));
    expect(screen.getByLabelText('Importe recibido')).toHaveValue(null);
    expect(useReceivableClient).toHaveBeenLastCalledWith('C2', expect.any(Object));
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '15' } });
    userEvent.click(screen.getByRole('button', { name: 'Revisar abono' }));
    await screen.findByRole('button', { name: 'Confirmar abono' });
    expect(previewReceivableOperation).toHaveBeenLastCalledWith('C2', expect.objectContaining({ amount: '15' }));
});

it('keeps the saved result after refresh errors and retries queries without registering again', async () => {
    const reload = jest.fn().mockRejectedValueOnce(new Error('Consulta falló')).mockResolvedValue(undefined);
    useReceivableClient.mockReturnValue({ data: detail, mutate: reload });
    render(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    userEvent.click(screen.getByRole('button', { name: 'USD' }));
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '120' } });
    userEvent.click(screen.getByRole('button', { name: 'Revisar abono' }));
    userEvent.click(await screen.findByRole('button', { name: 'Confirmar abono' }));
    await screen.findByText(/El abono está guardado/);
    expect(screen.getByRole('region', { name: 'Abono registrado' })).toHaveTextContent('Excedente no aplicado: $20,00');
    userEvent.click(screen.getByRole('button', { name: 'Reintentar consulta' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reintentar consulta' })).not.toBeInTheDocument());
    expect(executeReceivableOperation).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('region', { name: 'Abono registrado' })).toBeInTheDocument();
});

it('retains the drawer request ID on retries and blocks closing a pending confirmation', async () => {
    const close = jest.fn();
    let finish;
    executeReceivableOperation.mockRejectedValueOnce(new Error('Conexión interrumpida')).mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    render(<PaymentDrawer client={client} onClose={close} onChanged={refresh} />);
    userEvent.click(screen.getByRole('button', { name: 'USD' }));
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '120' } });
    userEvent.click(screen.getByRole('button', { name: 'Revisar abono' }));
    userEvent.click(await screen.findByRole('button', { name: 'Confirmar abono' }));
    await screen.findByText('Conexión interrumpida');
    const original = executeReceivableOperation.mock.calls[0][1].requestId;
    const confirm = screen.getByRole('button', { name: 'Confirmar abono' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(screen.queryByLabelText('Cerrar abono')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(executeReceivableOperation).toHaveBeenCalledTimes(2);
    expect(executeReceivableOperation.mock.calls[1][1].requestId).toBe(original);
    expect(close).not.toHaveBeenCalled();
    await act(async () => finish({ ...preview, operationId: 'saved' }));
    expect(screen.getByRole('region', { name: 'Abono registrado' })).toBeInTheDocument();
});

it('returns focus to portfolio search after the paid client leaves the table', async () => {
    render(<Receivables />);
    userEvent.click(screen.getByRole('button', { name: 'Abonar a Cliente Uno' }));
    userEvent.click(screen.getByRole('button', { name: 'USD' }));
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '120' } });
    userEvent.click(screen.getByRole('button', { name: 'Revisar abono' }));
    useReceivables.mockReturnValue({ data: { ...portfolio, data: [], total: 0 }, mutate: refresh });
    userEvent.click(await screen.findByRole('button', { name: 'Confirmar abono' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Listo' })).not.toBeDisabled());
    userEvent.click(screen.getByRole('button', { name: 'Listo' }));
    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Buscar cliente' })).toHaveFocus());
});

it('allows retrying the drawer client search after a failed request', async () => {
    fetchReceivables.mockRejectedValueOnce(new Error('Búsqueda interrumpida'));
    render(<PaymentDrawer onClose={jest.fn()} onChanged={refresh} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Búsqueda interrumpida');
    userEvent.click(screen.getByRole('button', { name: 'Reintentar búsqueda' }));
    userEvent.click(screen.getByLabelText('Cliente'));
    userEvent.click(await screen.findByText('Cliente Uno · C1'));
    expect(screen.queryByText('Búsqueda interrumpida')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Importe recibido')).toBeInTheDocument();
});

it('defaults drawer payments to bolivars on the left with reference and bank visible', async () => {
    render(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    const currencies = within(screen.getByRole('group', { name: 'Moneda' })).getAllByRole('button');
    expect(currencies[0]).toHaveTextContent('Bolívares');
    expect(currencies[0]).toHaveAttribute('aria-pressed', 'true');
    expect(currencies[1]).toHaveTextContent('USD');
    expect(currencies[1]).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('textbox', { name: 'Referencia' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Banco' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Observaciones' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Se aplica automáticamente por vencimiento/)).not.toBeInTheDocument();
    userEvent.selectOptions(screen.getByRole('combobox', { name: 'Banco' }), 'Banco Uno');
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '10000' } });
    userEvent.click(screen.getByRole('button', { name: 'Revisar abono' }));
    await screen.findByRole('button', { name: 'Confirmar abono' });
    expect(previewReceivableOperation).toHaveBeenLastCalledWith(
        'C1',
        expect.objectContaining({ currency: 'BsS', amount: '10000', bank: 'Banco Uno' }),
    );
});

it('shares a stable helper row between the bolivar rate and USD balance shortcut', () => {
    render(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    const rateSlot = screen.getByText('Tasa REF: 100,00 Bs/USD').parentElement.parentElement;
    const helper = rateSlot.parentElement;
    const balanceSlot = helper.children[1];
    expect(helper).toHaveClass('cxc-payment-helper');
    expect(rateSlot).toHaveAttribute('aria-hidden', 'false');
    expect(balanceSlot).toHaveAttribute('aria-hidden', 'true');
    expect(balanceSlot).toHaveClass('cxc-payment-helper-inactive');
    expect(screen.getByText('Tasa REF: 100,00 Bs/USD')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Usar saldo completo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Estimación del abono' })).not.toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'USD' }));
    expect(rateSlot).toHaveAttribute('aria-hidden', 'true');
    expect(rateSlot).toHaveClass('cxc-payment-helper-inactive');
    expect(balanceSlot).toHaveAttribute('aria-hidden', 'false');
    expect(balanceSlot).not.toHaveClass('cxc-payment-helper-inactive');
    expect(helper.children[0]).toBe(rateSlot);
    expect(helper.children[1]).toBe(balanceSlot);
    userEvent.click(screen.getByRole('button', { name: 'Usar saldo completo' }));
    expect(screen.getByLabelText('Importe recibido')).toHaveValue(100);
    expect(screen.getByRole('region', { name: 'Estimación del abono' })).toHaveTextContent(
        'Abono de $100,00 USD · Quedarían $0,00 USD',
    );
    userEvent.click(screen.getByRole('button', { name: 'Bolívares' }));
    expect(screen.getByText('Tasa REF: 100,00 Bs/USD')).toBeVisible();
    expect(rateSlot).toHaveAttribute('aria-hidden', 'false');
    expect(rateSlot).not.toHaveClass('cxc-payment-helper-inactive');
    expect(balanceSlot).toHaveAttribute('aria-hidden', 'true');
    expect(balanceSlot).toHaveClass('cxc-payment-helper-inactive');
    expect(helper.children[0]).toBe(rateSlot);
    expect(helper.children[1]).toBe(balanceSlot);
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '' } });
    expect(screen.queryByRole('region', { name: 'Estimación del abono' })).not.toBeInTheDocument();
});

it('confirms discard in an overlay while keeping the draft in place and inert', () => {
    const { container } = render(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    const amount = screen.getByLabelText('Importe recibido');
    fireEvent.change(amount, { target: { value: '3500' } });
    userEvent.click(screen.getByLabelText('Cerrar abono'));
    const content = container.ownerDocument.querySelector('.cxc-payment-content');
    expect(content).toHaveAttribute('inert');
    expect(content).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('alert')).toHaveClass('cxc-payment-discard');
    expect(screen.getByRole('button', { name: 'Seguir editando' })).toHaveFocus();
    userEvent.tab();
    expect(screen.getByRole('button', { name: 'Descartar cambios' })).toHaveFocus();
    userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Seguir editando' })).toHaveFocus();
    expect(screen.getByLabelText('Importe recibido')).toBe(amount);
    userEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(content).not.toHaveAttribute('inert');
    expect(screen.getByLabelText('Importe recibido')).toHaveValue(3500);
});

it('reports a missing bank catalog and retries its query without clearing the payment', () => {
    const reload = jest.fn();
    useReceivableBanks.mockReturnValue({ error: new Error('Conexión perdida'), mutate: reload });
    const { rerender } = render(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '3500' } });
    expect(screen.getByRole('combobox', { name: 'Banco' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar el catálogo de bancos');
    userEvent.click(screen.getByRole('button', { name: 'Reintentar bancos' }));
    expect(reload).toHaveBeenCalledTimes(1);
    useReceivableBanks.mockReturnValue({ data: [{ id: 'BV', name: 'BANCO DE VENEZUELA' }], mutate: reload });
    rerender(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    expect(screen.getByRole('combobox', { name: 'Banco' })).not.toBeDisabled();
    expect(screen.getByRole('option', { name: 'BANCO DE VENEZUELA' })).toHaveValue('BANCO DE VENEZUELA');
    expect(screen.getByLabelText('Importe recibido')).toHaveValue(3500);
});

it('shows a date input defaulting to today and preserves changes through review and edit', async () => {
    render(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    const date = screen.getByLabelText('Fecha del pago');
    expect(date).toBeVisible();
    expect(date).toHaveValue(today());
    expect(date).toHaveAttribute('max', today());
    expect(screen.queryByText('Hoy')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cambiar fecha' })).not.toBeInTheDocument();
    fireEvent.change(date, { target: { value: '2020-01-15' } });
    expect(screen.getByRole('button', { name: 'Revisar abono' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '1000' } });
    userEvent.click(screen.getByRole('button', { name: 'Editar la tasa del pago' }));
    fireEvent.change(screen.getByLabelText('Bolívares por dólar'), { target: { value: '50' } });
    userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.getByText('Tasa aplicada: 50,00 Bs/USD')).toBeVisible();
    userEvent.click(screen.getByRole('button', { name: 'Revisar abono' }));
    await screen.findByRole('button', { name: 'Confirmar abono' });
    expect(previewReceivableOperation).toHaveBeenLastCalledWith(
        'C1',
        expect.objectContaining({ date: '2020-01-15', rate: '50' }),
    );
    expect(screen.getByText(dateLabel('2020-01-15'))).toBeVisible();
    userEvent.click(screen.getByRole('button', { name: 'Editar datos' }));
    expect(screen.getByLabelText('Fecha del pago')).toBeVisible();
    expect(screen.getByLabelText('Fecha del pago')).toHaveValue('2020-01-15');
});

it('keeps empty or future dates invalid and lets the operator correct them directly', () => {
    render(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    const date = screen.getByLabelText('Fecha del pago');
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '1000' } });
    fireEvent.change(date, { target: { value: '' } });
    expect(date).toBeVisible();
    expect(date).toBeInvalid();
    expect(date.form).toBeInvalid();
    fireEvent.change(date, { target: { value: '2999-01-01' } });
    expect(date).toBeInvalid();
    expect(date.form).toBeInvalid();
    fireEvent.change(date, { target: { value: today() } });
    expect(date).toBeValid();
    expect(date).toHaveValue(today());
});

it('keeps the compact estimate concise and warns about excess before review', () => {
    render(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '12000' } });
    const estimate = screen.getByRole('region', { name: 'Estimación del abono' });
    expect(estimate).toHaveTextContent('Equivale a $120,00 USD · Quedarían $0,00 USD');
    expect(within(estimate).queryByRole('definition')).not.toBeInTheDocument();
    expect(within(estimate).getByRole('alert')).toHaveTextContent(
        'El excedente no genera saldo a favor ni devolución.',
    );
    expect(screen.getByRole('textbox', { name: 'Referencia' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Banco' })).toBeVisible();
    userEvent.selectOptions(screen.getByLabelText('Método'), 'EFECTIVO');
    expect(screen.queryByRole('textbox', { name: 'Referencia' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Banco' })).not.toBeInTheDocument();
    expect(previewReceivableOperation).not.toHaveBeenCalled();
});

it('groups method, bank, reference and a visible date input in four aligned cells', () => {
    render(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    const group = screen.getByRole('group', { name: 'Datos del pago' });
    const cells = Array.from(group.children);
    expect(cells).toHaveLength(4);
    expect(within(cells[0]).getByLabelText('Método')).toBeVisible();
    expect(within(cells[1]).getByRole('combobox', { name: 'Banco' })).toBeVisible();
    expect(within(cells[2]).getByRole('textbox', { name: 'Referencia' })).toBeVisible();
    expect(within(cells[3]).getByLabelText('Fecha del pago')).toBeVisible();
    expect(within(cells[3]).getByLabelText('Fecha del pago')).toHaveValue(today());
    fireEvent.change(screen.getByLabelText('Fecha del pago'), { target: { value: '2020-01-15' } });
    userEvent.selectOptions(screen.getByLabelText('Método'), 'EFECTIVO');
    expect(group.children).toHaveLength(2);
    expect(group.children[0]).toBe(cells[0]);
    expect(within(group.children[1]).getByLabelText('Fecha del pago')).toBeVisible();
    expect(within(group.children[1]).getByLabelText('Fecha del pago')).toHaveValue('2020-01-15');
});

it('shows two decimals in review and success while preserving the server snapshot and amounts', async () => {
    const precise = {
        ...preview,
        amount: '4012.3400',
        currency: 'BsS',
        base: '40.1234',
        applied: '40.1234',
        balanceAfter: '59.8766',
        excess: '0.0000',
        applications: [{ id: 1, sale: 'A', amount: '40.1234' }],
    };
    previewReceivableOperation.mockResolvedValue(precise);
    executeReceivableOperation.mockResolvedValue(precise);
    render(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '4012.34' } });
    userEvent.click(screen.getByRole('button', { name: 'Revisar abono' }));
    await screen.findByRole('button', { name: 'Confirmar abono' });
    expect(screen.getAllByText('$40,12')).toHaveLength(3);
    expect(screen.getByText('$59,88')).toBeVisible();
    expect(screen.queryByText(/40,1234|59,8766/)).not.toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'Confirmar abono' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Listo' })).not.toBeDisabled());
    const result = screen.getByRole('region', { name: 'Abono registrado' });
    expect(result).toHaveTextContent('Bs 4.012,34');
    expect(result).toHaveTextContent('$40,12');
    expect(result).toHaveTextContent('$59,88');
    expect(executeReceivableOperation).toHaveBeenCalledWith(
        'C1',
        expect.objectContaining({ amount: '4012.34', snapshot: precise.snapshot }),
    );
    expect(precise.applied).toBe('40.1234');
    expect(precise.balanceAfter).toBe('59.8766');
});

it('keeps the unavailable-rate helper mounted across currency changes and hides it from USD accessibility', () => {
    useReceivableClient.mockReturnValue({ data: { ...detail, rate: null }, mutate: refresh });
    render(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    const rate = screen.getByRole('status');
    const slot = rate.parentElement;
    const helper = slot.parentElement;
    expect(rate).toHaveTextContent('Tasa pendiente');
    expect(rate).toHaveTextContent('Indica la tasa o registra el abono en USD.');
    userEvent.click(screen.getByRole('button', { name: 'USD' }));
    expect(helper.children[0]).toBe(slot);
    expect(slot).toContainElement(rate);
    expect(slot).toHaveClass('cxc-payment-helper-inactive');
    expect(slot).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usar saldo completo' })).not.toBeDisabled();
    userEvent.click(screen.getByRole('button', { name: 'Bolívares' }));
    expect(screen.getByRole('status')).toBe(rate);
    expect(slot).not.toHaveClass('cxc-payment-helper-inactive');
    expect(slot).toHaveAttribute('aria-hidden', 'false');
    expect(screen.queryByRole('button', { name: 'Usar saldo completo' })).not.toBeInTheDocument();
});

it('reviews, confirms and closes a drawer payment with three consecutive Enter presses', async () => {
    const close = jest.fn();
    render(<PaymentDrawer client={client} onClose={close} onChanged={refresh} />);
    expect(screen.getByLabelText('Importe recibido')).toHaveFocus();
    userEvent.type(document.activeElement, '3500{enter}', { skipClick: true });
    const confirm = await screen.findByRole('button', { name: 'Confirmar abono' });
    await waitFor(() => expect(confirm).toHaveFocus());
    expect(previewReceivableOperation).toHaveBeenCalledTimes(1);
    expect(executeReceivableOperation).not.toHaveBeenCalled();
    userEvent.type(document.activeElement, '{enter}', { skipClick: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Listo' })).not.toBeDisabled());
    expect(executeReceivableOperation).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Listo' })).toHaveFocus());
    userEvent.type(document.activeElement, '{enter}', { skipClick: true });
    expect(close).toHaveBeenCalledTimes(1);
});

it('focuses a failed confirmation error instead of leaving focus on the financial action', async () => {
    executeReceivableOperation.mockRejectedValueOnce(new Error('Conexión interrumpida'));
    render(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '3500' } });
    userEvent.click(screen.getByRole('button', { name: 'Revisar abono' }));
    const confirm = await screen.findByRole('button', { name: 'Confirmar abono' });
    await waitFor(() => expect(confirm).toHaveFocus());
    userEvent.type(document.activeElement, '{enter}', { skipClick: true });
    const error = await screen.findByText('Conexión interrumpida');
    await waitFor(() => expect(error).toHaveFocus());
    expect(error).toHaveTextContent('Conexión interrumpida');
    expect(executeReceivableOperation).toHaveBeenCalledTimes(1);
    expect(confirm).not.toBeDisabled();
});

it('focuses Done only after pending account refreshes settle, including failed refreshes', async () => {
    let rejectRefresh;
    const reload = jest.fn(
        () =>
            new Promise((_resolve, reject) => {
                rejectRefresh = reject;
            }),
    );
    useReceivableClient.mockReturnValue({ data: detail, mutate: reload });
    const close = jest.fn();
    render(<PaymentDrawer client={client} onClose={close} onChanged={refresh} />);
    fireEvent.change(screen.getByLabelText('Importe recibido'), { target: { value: '3500' } });
    userEvent.click(screen.getByRole('button', { name: 'Revisar abono' }));
    userEvent.click(await screen.findByRole('button', { name: 'Confirmar abono' }));
    const done = await screen.findByRole('button', { name: 'Listo' });
    expect(done).toBeDisabled();
    expect(done).not.toHaveFocus();
    expect(close).not.toHaveBeenCalled();
    await act(async () => rejectRefresh(new Error('Consulta interrumpida')));
    await waitFor(() => expect(done).toHaveFocus());
    expect(done).not.toBeDisabled();
    expect(screen.getByText(/El abono está guardado/)).toBeVisible();
    userEvent.type(document.activeElement, '{enter}', { skipClick: true });
    expect(close).toHaveBeenCalledTimes(1);
    expect(executeReceivableOperation).toHaveBeenCalledTimes(1);
});

it('uses official route names instead of orphan route values from the receivables database response', () => {
    useReceivables.mockReturnValue({
        data: { ...portfolio, routes: [{ id: 'R1' }, { id: '-1' }, { id: 'G' }, { id: 'val' }, { id: '' }] },
        mutate: refresh,
        isValidating: false,
    });
    useClientRoutes.mockReturnValue({
        data: [
            { Id_Ruta: 'R1', Nombre: 'Ruta Norte' },
            { Id_Ruta: 'R2', Nombre: 'Ruta Sur' },
        ],
        isLoading: false,
    });
    render(<Receivables />);
    expect(useClientRoutes).toHaveBeenCalledWith(false, true);
    userEvent.click(screen.getByLabelText('Ruta'));
    expect(screen.getByLabelText('Ruta').closest('.cxc-filter')).toHaveClass('cxc-route-filter');
    expect(screen.getByText('Ruta Norte (R1)')).toBeVisible();
    expect(screen.getByText('Ruta Sur (R2)')).toBeVisible();
    expect(screen.queryByText('-1')).not.toBeInTheDocument();
    expect(screen.queryByText('G')).not.toBeInTheDocument();
    expect(screen.queryByText('val')).not.toBeInTheDocument();
    userEvent.click(screen.getByText('Ruta Norte (R1)'));
    expect(useReceivables).toHaveBeenLastCalledWith(expect.objectContaining({ ruta: 'R1', page: 1 }));
    expect(screen.getByText('Ruta Norte (R1)')).toBeVisible();
    userEvent.click(screen.getByRole('button', { name: 'Restablecer filtros' }));
    expect(useReceivables).toHaveBeenLastCalledWith(expect.objectContaining({ ruta: '', page: 1 }));
    expect(screen.getByLabelText('Ruta')).toHaveFocus();
});

it('autofocuses the amount once an asynchronously loaded account becomes editable without stealing focus on unrelated renders', () => {
    useReceivableClient.mockReturnValue({ isValidating: true, mutate: refresh });
    const close = jest.fn();
    const { rerender } = render(<PaymentDrawer client={client} onClose={close} onChanged={refresh} />);
    expect(screen.queryByLabelText('Importe recibido')).not.toBeInTheDocument();
    useReceivableClient.mockReturnValue({ data: detail, isValidating: true, mutate: refresh });
    rerender(<PaymentDrawer client={client} onClose={close} onChanged={refresh} />);
    const amount = screen.getByLabelText('Importe recibido');
    expect(amount).toBeDisabled();
    expect(amount).not.toHaveFocus();
    useReceivableClient.mockReturnValue({ data: detail, isValidating: false, mutate: refresh });
    rerender(<PaymentDrawer client={client} onClose={close} onChanged={refresh} />);
    expect(amount).not.toBeDisabled();
    expect(amount).toHaveFocus();
    const reference = screen.getByRole('textbox', { name: 'Referencia' });
    userEvent.click(reference);
    rerender(<PaymentDrawer client={client} onClose={close} onChanged={refresh} />);
    expect(reference).toHaveFocus();
});

it('returns focus to the amount when editing a reviewed drawer payment', async () => {
    render(<PaymentDrawer client={client} onClose={jest.fn()} onChanged={refresh} />);
    expect(screen.getByLabelText('Importe recibido')).toHaveFocus();
    userEvent.type(document.activeElement, '3500{enter}', { skipClick: true });
    const confirm = await screen.findByRole('button', { name: 'Confirmar abono' });
    await waitFor(() => expect(confirm).toHaveFocus());
    userEvent.click(screen.getByRole('button', { name: 'Editar datos' }));
    expect(screen.getByLabelText('Importe recibido')).toHaveFocus();
    expect(screen.getByLabelText('Importe recibido')).toHaveValue(3500);
});
