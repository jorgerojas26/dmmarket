import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { executeReceivableOperation, previewReceivableOperation } from 'api/receivables';
import { useReceivableClient } from 'hooks/useReceivables';
import ClientModal from './ClientModal';

jest.mock('api/receivables', () => ({
    executeReceivableOperation: jest.fn(),
    previewReceivableOperation: jest.fn(),
}));
jest.mock('hooks/useReceivables', () => ({ useReceivableClient: jest.fn() }));
jest.mock('pdfmake/build/pdfmake', () => ({ createPdf: jest.fn() }));
jest.mock('pdfmake/build/vfs_fonts', () => ({ pdfMake: { vfs: {} } }));

Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto, configurable: true });

const client = { id: 'C1', name: 'Cliente Uno', rif: 'J-123', ruta: 'R1' };
const document = {
    id: 1,
    sale: 'FAC-001',
    original: '100.0000',
    balance: '70.0000',
    applied: '30.0000',
    closed: '0.0000',
    issued: '2026-09-01',
    due: '2026-10-01',
    eligible: true,
    status: 'Pendiente',
};
const otherDocument = {
    ...document,
    id: 2,
    sale: 'FAC-002',
    original: '50.0000',
    balance: '50.0000',
    applied: '0.0000',
};
const detail = {
    client,
    summary: { balance: '120.0000', overdue: '70.0000', pendingCount: 2 },
    documents: { data: [document, otherDocument], total: 2 },
    timeline: { data: [], total: 0 },
};
const preview = {
    type: 'close',
    id: 1,
    reason: 'Redondeo acordado',
    base: '65.0000',
    balanceBefore: '115.0000',
    balanceAfter: '50.0000',
    applications: [{ id: 1, sale: 'FAC-001', amount: '65.0000' }],
    snapshot: 'snapshot',
};
const saved = { ...preview, operationId: 'saved' };
const closedDetail = {
    ...detail,
    summary: { balance: '50.0000', overdue: '0.0000', pendingCount: 1 },
    documents: { data: [otherDocument], total: 1 },
    timeline: {
        data: [
            {
                eventId: 'saved',
                type: 'CIERRE',
                date: '2026-10-01',
                reason: saved.reason,
                data: saved,
                applications: saved.applications,
            },
        ],
        total: 1,
    },
};
const refresh = jest.fn();
const portfolioRefresh = jest.fn();
let current;

beforeEach(() => {
    jest.clearAllMocks();
    current = detail;
    refresh.mockImplementation(async () => {
        current = closedDetail;
        return current;
    });
    portfolioRefresh.mockResolvedValue(undefined);
    previewReceivableOperation.mockResolvedValue(preview);
    executeReceivableOperation.mockResolvedValue(saved);
    useReceivableClient.mockImplementation(() => ({ data: current, mutate: refresh, isValidating: false }));
});

const open = () => {
    const onClose = jest.fn();
    const view = render(<ClientModal client={client} onClose={onClose} onChanged={portfolioRefresh} />);
    const modal = screen.getByRole('dialog');
    userEvent.click(screen.getByRole('button', { name: 'Ver desglose de factura FAC-001' }));
    userEvent.click(screen.getByRole('button', { name: 'Cerrar deuda de factura FAC-001' }));
    return { ...view, modal, onClose };
};
const review = async () => {
    fireEvent.change(screen.getByLabelText('Motivo del cierre'), { target: { value: 'Redondeo acordado' } });
    userEvent.click(screen.getByRole('button', { name: 'Revisar cierre' }));
    await screen.findByRole('button', { name: 'Confirmar cierre' });
};
const confirm = async () => {
    await review();
    userEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }));
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Cierre de deuda' })).not.toBeInTheDocument());
};

it('opens a compact form inside the selected row without replacing the modal or history', async () => {
    const { modal, container } = open();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog')).toBe(modal);
    expect(screen.getByRole('region', { name: 'Facturas' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Historial de cobranza' })).toBeVisible();
    const form = screen.getByRole('form', { name: 'Cierre de deuda' });
    expect(form.closest('li')).toHaveTextContent('FAC-001');
    expect(form.closest('li')).not.toHaveTextContent('FAC-002');
    expect(screen.getByRole('button', { name: 'Ver factura FAC-002' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Cerrar deuda' })).not.toBeInTheDocument();
    expect(container.querySelector('.offcanvas')).toBeNull();
    await waitFor(() => expect(screen.getByLabelText('Motivo del cierre')).toHaveFocus());
});

it('requires a reason and reviews only the chosen document using authoritative amounts', async () => {
    open();
    expect(screen.getByRole('button', { name: 'Revisar cierre' })).toBeDisabled();
    expect(screen.getByLabelText('Motivo del cierre')).toBeRequired();
    fireEvent.change(screen.getByLabelText('Motivo del cierre'), { target: { value: '  ' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Cierre de deuda' }));
    expect(previewReceivableOperation).not.toHaveBeenCalled();
    await review();
    expect(previewReceivableOperation).toHaveBeenCalledWith('C1', {
        type: 'close',
        id: 1,
        reason: 'Redondeo acordado',
    });
    const impact = screen.getByRole('status', { name: 'Impacto del cierre' });
    expect(impact).toHaveTextContent('Cerrar $65,00 USD sin recibir dinero.');
    expect(impact).toHaveTextContent('Saldo cliente USD: $115,00 → $50,00');
    expect(impact).not.toHaveTextContent('$70,00');
    expect(screen.queryByLabelText('Importe recibido')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar cierre' })).toHaveFocus());
    expect(executeReceivableOperation).not.toHaveBeenCalled();
});

it('invalidates the review when editing the reason without opening another screen', async () => {
    const { modal } = open();
    await review();
    fireEvent.change(screen.getByLabelText('Motivo del cierre'), { target: { value: '  Acuerdo con el cliente  ' } });
    expect(screen.queryByRole('button', { name: 'Confirmar cierre' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Impacto del cierre' })).not.toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'Revisar cierre' }));
    await screen.findByRole('button', { name: 'Confirmar cierre' });
    expect(screen.getByRole('dialog')).toBe(modal);
    expect(previewReceivableOperation).toHaveBeenLastCalledWith('C1', {
        type: 'close',
        id: 1,
        reason: 'Acuerdo con el cliente',
    });
});

it('cancels just the row form and returns focus to its breakdown without sending requests', async () => {
    const { modal, onClose } = open();
    fireEvent.change(screen.getByLabelText('Motivo del cierre'), { target: { value: 'Error' } });
    userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('dialog')).toBe(modal);
    expect(screen.queryByRole('form', { name: 'Cierre de deuda' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar deuda de factura FAC-001' })).not.toBeDisabled();
    await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Ocultar desglose de factura FAC-001' })).toHaveFocus(),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(executeReceivableOperation).not.toHaveBeenCalled();
});

it('protects the draft when closing the account and restores the reason on continuing', async () => {
    const { onClose } = open();
    fireEvent.change(screen.getByLabelText('Motivo del cierre'), { target: { value: 'Redondeo acordado' } });
    userEvent.click(screen.getByLabelText('Cerrar cuenta'));
    expect(screen.getByRole('button', { name: 'Seguir editando' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    userEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByLabelText('Motivo del cierre')).toHaveValue('Redondeo acordado');
    await waitFor(() => expect(screen.getByLabelText('Motivo del cierre')).toHaveFocus());
    expect(onClose).not.toHaveBeenCalled();
});

it('keeps other account content visible but blocks navigation that would lose the draft', () => {
    open();
    expect(screen.getByRole('button', { name: 'Ocultar desglose de factura FAC-001' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ver desglose de factura FAC-002' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ver factura FAC-002' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Registrar abono' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Todas' })).toBeDisabled();
});

it('saves a row closure with snapshot and request ID, then focuses the invoices when the row disappears', async () => {
    const { modal } = open();
    await confirm();
    expect(executeReceivableOperation).toHaveBeenCalledWith('C1', {
        type: 'close',
        id: 1,
        reason: 'Redondeo acordado',
        snapshot: 'snapshot',
        requestId: expect.any(String),
    });
    expect(screen.getByRole('dialog')).toBe(modal);
    expect(screen.queryByRole('button', { name: 'Ver factura FAC-001' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver factura FAC-002' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Historial de cobranza' })).toHaveTextContent('Cierre manual');
    expect(screen.getByRole('status')).toHaveTextContent(
        'Deuda de factura FAC-001 cerrada. Saldo cliente: $50,00 USD.',
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Facturas' })).toHaveFocus());
});

it('retains the same request ID and snapshot when retrying a network interruption', async () => {
    executeReceivableOperation.mockRejectedValueOnce(new Error('Conexión interrumpida'));
    open();
    await review();
    userEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }));
    await screen.findByText('Conexión interrumpida');
    expect(screen.getByRole('alert')).toHaveFocus();
    const original = executeReceivableOperation.mock.calls[0][1];
    userEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }));
    await waitFor(() => expect(executeReceivableOperation).toHaveBeenCalledTimes(2));
    expect(executeReceivableOperation.mock.calls[1][1]).toEqual(original);
});

it('preserves the reason but requires a new review after a balance conflict', async () => {
    executeReceivableOperation.mockRejectedValueOnce(Object.assign(new Error('La deuda cambió'), { status: 409 }));
    open();
    await review();
    userEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }));
    await screen.findByText('La deuda cambió');
    const originalId = executeReceivableOperation.mock.calls[0][1].requestId;
    expect(screen.getByLabelText('Motivo del cierre')).toHaveValue('Redondeo acordado');
    expect(screen.queryByRole('button', { name: 'Confirmar cierre' })).not.toBeInTheDocument();
    await review();
    userEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }));
    await waitFor(() => expect(executeReceivableOperation).toHaveBeenCalledTimes(2));
    expect(executeReceivableOperation.mock.calls[1][1].requestId).not.toBe(originalId);
});

it('blocks duplicate submissions and account closing while the closure is pending', async () => {
    let finish;
    executeReceivableOperation.mockReturnValue(
        new Promise((resolve) => {
            finish = resolve;
        }),
    );
    const { onClose } = open();
    await review();
    const button = screen.getByRole('button', { name: 'Confirmar cierre' });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.submit(screen.getByRole('form', { name: 'Cierre de deuda' }));
    expect(executeReceivableOperation).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.queryByLabelText('Cerrar cuenta')).not.toBeInTheDocument();
    fireEvent.keyDown(window.document, { key: 'Escape', code: 'Escape', keyCode: 27 });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => finish(saved));
});

it('does not offer closing the same debt again when refreshing fails and retries only the query', async () => {
    refresh.mockRejectedValueOnce(new Error('Consulta interrumpida'));
    open();
    await confirm();
    await screen.findByRole('button', { name: 'Reintentar consulta' });
    expect(screen.getByText('Cierre guardado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar deuda de factura FAC-001' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar cierre' })).not.toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'Reintentar consulta' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reintentar consulta' })).not.toBeInTheDocument());
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(executeReceivableOperation).toHaveBeenCalledTimes(1);
});

it('disables a row closure when the client is unregistered without losing the draft', async () => {
    const { rerender } = open();
    await review();
    current = { ...detail, client: { ...client, unregistered: true } };
    rerender(<ClientModal client={client} onClose={jest.fn()} onChanged={portfolioRefresh} />);
    expect(screen.getByLabelText('Motivo del cierre')).toHaveValue('Redondeo acordado');
    expect(screen.getByRole('button', { name: 'Confirmar cierre' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form', { name: 'Cierre de deuda' }));
    expect(executeReceivableOperation).not.toHaveBeenCalled();
    userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('form', { name: 'Cierre de deuda' })).not.toBeInTheDocument();
});

it('keeps the client-wide closure in its existing review flow', async () => {
    render(<ClientModal client={client} onClose={jest.fn()} onChanged={portfolioRefresh} />);
    await act(async () => userEvent.click(screen.getByRole('button', { name: 'Más acciones' })));
    await act(async () => userEvent.click(screen.getByRole('button', { name: 'Cerrar deuda del cliente' })));
    expect(screen.getByRole('heading', { name: 'Cerrar deuda' })).toBeInTheDocument();
    expect(screen.getByText('Todos los documentos pendientes del cliente')).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo')).toBeRequired();
    expect(screen.queryByRole('form', { name: 'Cierre de deuda' })).not.toBeInTheDocument();
});

it('returns to the previous documents page when closing the only remaining row on the last page', async () => {
    const lastDocument = { ...document, id: 21 };
    let closed = false;
    refresh.mockImplementation(async () => {
        closed = true;
        return { ...closedDetail, documents: { data: [], total: 20 } };
    });
    useReceivableClient.mockImplementation((_id, filters) => ({
        data: {
            ...detail,
            documents: {
                data: filters.page === 2 ? (closed ? [] : [lastDocument]) : [otherDocument],
                total: closed ? 20 : 21,
            },
        },
        mutate: refresh,
    }));
    render(<ClientModal client={client} onClose={jest.fn()} onChanged={portfolioRefresh} />);
    userEvent.click(screen.getByRole('button', { name: 'Facturas: siguiente' }));
    userEvent.click(screen.getByRole('button', { name: 'Ver desglose de factura FAC-001' }));
    userEvent.click(screen.getByRole('button', { name: 'Cerrar deuda de factura FAC-001' }));
    await confirm();
    await waitFor(() =>
        expect(useReceivableClient).toHaveBeenLastCalledWith('C1', expect.objectContaining({ page: 1 })),
    );
    expect(screen.getByRole('region', { name: 'Facturas' })).toBeVisible();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Facturas' })).toHaveFocus());
});
