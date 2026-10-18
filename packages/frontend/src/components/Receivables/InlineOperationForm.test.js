import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { executeReceivableOperation, previewReceivableOperation } from 'api/receivables';
import { useReceivableClient } from 'hooks/useReceivables';
import ClientModal from './ClientModal';
import InlineOperationForm from './InlineOperationForm';

jest.mock('api/receivables', () => ({
    executeReceivableOperation: jest.fn(),
    previewReceivableOperation: jest.fn(),
}));
jest.mock('hooks/useReceivables', () => ({ useReceivableClient: jest.fn() }));
jest.mock('pdfmake/build/pdfmake', () => ({ createPdf: jest.fn() }));
jest.mock('pdfmake/build/vfs_fonts', () => ({ pdfMake: { vfs: {} } }));

Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto, configurable: true });

const client = { id: 'C1', name: 'Cliente Uno', rif: 'J-123', ruta: 'R1' };
const payment = {
    eventId: 'm-1',
    type: 'payment',
    movementId: 1,
    date: '2026-10-01',
    registeredAt: '2026-10-01',
    amount: '12000.0000',
    currency: 'BsS',
    base: '120.0000',
    rate: '100.000000',
    method: 'TRANSFERENCIA',
    reference: 'REF-123',
    bank: 'Banco Uno',
    excess: '20.0000',
    applications: [{ id: 1, sale: 'FAC-001', amount: '100.0000' }],
};
const preview = {
    type: 'void',
    id: 1,
    reason: 'Abono duplicado',
    base: '120.0000',
    balanceBefore: '250.0000',
    restored: '100.0000',
    balanceAfter: '350.0000',
    applications: payment.applications,
    snapshot: 'snapshot',
};
const detail = {
    client,
    summary: { balance: '250.0000', overdue: '50.0000', pendingCount: 0 },
    documents: { data: [], total: 0 },
    timeline: { data: [payment], total: 1 },
};
const saved = { ...preview, operationId: 'saved' };
const refresh = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    refresh.mockResolvedValue(undefined);
    previewReceivableOperation.mockResolvedValue(preview);
    executeReceivableOperation.mockResolvedValue(saved);
    useReceivableClient.mockReturnValue({ data: detail, mutate: refresh, isValidating: false });
});

const renderForm = (overrides = {}) => {
    const callbacks = { onCancel: jest.fn(), onSuccess: jest.fn(), onBusyChange: jest.fn(), onDirtyChange: jest.fn() };
    const view = render(
        <InlineOperationForm
            client={client}
            action={{ type: 'void', id: payment.movementId }}
            {...callbacks}
            {...overrides}
        />,
    );
    return { ...callbacks, ...view };
};
const review = async () => {
    fireEvent.change(screen.getByLabelText('Motivo de anulación'), { target: { value: 'Abono duplicado' } });
    userEvent.click(screen.getByRole('button', { name: 'Revisar anulación' }));
    await screen.findByRole('button', { name: 'Confirmar anulación' });
};
const openFromAccount = (onClose = jest.fn()) => {
    const view = render(<ClientModal client={client} onClose={onClose} onChanged={refresh} />);
    const modal = screen.getByRole('dialog');
    userEvent.click(screen.getByRole('button', { name: /Ver detalles: Abono/ }));
    userEvent.click(screen.getByRole('button', { name: 'Anular abono' }));
    return { ...view, modal, onClose };
};

it('keeps the same account modal, invoices and history visible while cancelling inline', async () => {
    const { modal, container } = openFromAccount();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog')).toBe(modal);
    expect(modal).toHaveAccessibleName('Cliente Uno');
    expect(screen.getByRole('region', { name: 'Facturas' })).toBeVisible();
    const history = screen.getByRole('region', { name: 'Historial de cobranza' });
    expect(within(history).getByRole('form', { name: 'Anulación de abono' })).toBeInTheDocument();
    expect(screen.getByText('REF-123')).toBeVisible();
    expect(screen.getByText('Banco Uno')).toBeVisible();
    expect(container.querySelector('.offcanvas')).toBeNull();
    await waitFor(() => expect(screen.getByLabelText('Motivo de anulación')).toHaveFocus());
    fireEvent.change(screen.getByLabelText('Motivo de anulación'), { target: { value: 'Error' } });
    userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('form', { name: 'Anulación de abono' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBe(modal);
    expect(screen.getByRole('button', { name: 'Anular abono' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Ocultar detalles: Abono/ })).toHaveFocus());
    expect(executeReceivableOperation).not.toHaveBeenCalled();
});

it('requires a non-blank reason before asking the server for a review', () => {
    const { onDirtyChange } = renderForm();
    expect(screen.getByLabelText('Motivo de anulación')).toBeRequired();
    expect(screen.getByRole('button', { name: 'Revisar anulación' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motivo de anulación'), { target: { value: '   ' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Anulación de abono' }));
    expect(previewReceivableOperation).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Motivo de anulación'), { target: { value: '' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
});

it('shows a compact server-calculated balance change without counting excess as restored debt', async () => {
    const { modal } = openFromAccount();
    await review();
    expect(screen.getByRole('dialog')).toBe(modal);
    expect(previewReceivableOperation).toHaveBeenCalledWith('C1', { type: 'void', id: 1, reason: 'Abono duplicado' });
    const impact = screen.getByRole('status', { name: 'Impacto de la anulación' });
    expect(impact).toHaveTextContent('Saldo USD: $250,00 → $350,00');
    expect(impact).toHaveTextContent('+$100,00 pendiente');
    expect(impact).toHaveTextContent('El excedente no aumenta la deuda.');
    expect(impact).not.toHaveTextContent('$120,00');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar anulación' })).toHaveFocus());
    expect(screen.getByLabelText('Motivo de anulación')).toHaveValue('Abono duplicado');
    expect(executeReceivableOperation).not.toHaveBeenCalled();
});

it('invalidates the review immediately when editing the reason, without switching views', async () => {
    renderForm();
    await review();
    fireEvent.change(screen.getByLabelText('Motivo de anulación'), { target: { value: '  Referencia incorrecta  ' } });
    expect(screen.queryByRole('status', { name: 'Impacto de la anulación' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar anulación' })).not.toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'Revisar anulación' }));
    await screen.findByRole('button', { name: 'Confirmar anulación' });
    expect(previewReceivableOperation).toHaveBeenLastCalledWith('C1', {
        type: 'void',
        id: 1,
        reason: 'Referencia incorrecta',
    });
});

it('explains a reversal with no applications without inventing debt', async () => {
    previewReceivableOperation.mockResolvedValue({
        ...preview,
        restored: '0.0000',
        balanceAfter: '250.0000',
        applications: [],
    });
    renderForm();
    await review();
    expect(screen.getByRole('status', { name: 'Impacto de la anulación' })).toHaveTextContent('+$0,00 pendiente');
    expect(screen.getByText('Sin aplicaciones: el saldo no cambia.')).toBeInTheDocument();
});

it('keeps the draft when closing the account and choosing to continue editing', async () => {
    const { onClose, modal } = openFromAccount();
    fireEvent.change(screen.getByLabelText('Motivo de anulación'), { target: { value: 'Error' } });
    userEvent.click(screen.getByLabelText('Cerrar cuenta'));
    expect(screen.getByRole('alert')).toHaveTextContent('¿Descartar cambios sin guardar?');
    expect(screen.getByRole('button', { name: 'Seguir editando' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Revisar anulación' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    userEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByLabelText('Motivo de anulación')).toHaveValue('Error');
    expect(screen.getByRole('dialog')).toBe(modal);
    await waitFor(() => expect(screen.getByLabelText('Motivo de anulación')).toHaveFocus());
    expect(onClose).not.toHaveBeenCalled();
});

it('allows closing an untouched or cleared draft without a discard prompt', () => {
    const { onClose } = openFromAccount();
    fireEvent.change(screen.getByLabelText('Motivo de anulación'), { target: { value: 'Error' } });
    fireEvent.change(screen.getByLabelText('Motivo de anulación'), { target: { value: '' } });
    userEvent.click(screen.getByLabelText('Cerrar cuenta'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('blocks navigation that would unmount the active form but keeps the account content visible', () => {
    openFromAccount();
    expect(screen.getByRole('button', { name: /Ocultar detalles: Abono/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ver factura FAC-001' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Registrar abono' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Todas' })).toBeDisabled();
    expect(screen.getByRole('region', { name: 'Facturas' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Historial de cobranza' })).toBeVisible();
});

it('retains the reason and focuses an error when the first review fails', async () => {
    previewReceivableOperation.mockRejectedValueOnce(new Error('No se pudo conectar'));
    renderForm();
    fireEvent.change(screen.getByLabelText('Motivo de anulación'), { target: { value: 'Error' } });
    userEvent.click(screen.getByRole('button', { name: 'Revisar anulación' }));
    await screen.findByText('No se pudo conectar');
    expect(screen.getByRole('alert')).toHaveFocus();
    expect(screen.getByLabelText('Motivo de anulación')).toHaveValue('Error');
    expect(executeReceivableOperation).not.toHaveBeenCalled();
    userEvent.click(screen.getByRole('button', { name: 'Revisar anulación' }));
    await screen.findByRole('button', { name: 'Confirmar anulación' });
});

it('blocks duplicate confirmations and closing the account while execution is pending', async () => {
    let finish;
    executeReceivableOperation.mockReturnValue(
        new Promise((resolve) => {
            finish = resolve;
        }),
    );
    const { onClose } = openFromAccount();
    await review();
    const button = screen.getByRole('button', { name: 'Confirmar anulación' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(executeReceivableOperation).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.queryByLabelText('Cerrar cuenta')).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape', keyCode: 27 });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => finish(saved));
    expect(screen.queryByRole('form', { name: 'Anulación de abono' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ocultar detalles: Abono · Anulado/ })).not.toBeDisabled();
});

it('retains the snapshot and request ID when retrying an interrupted confirmation', async () => {
    executeReceivableOperation.mockRejectedValueOnce(new Error('Conexión interrumpida'));
    const { onSuccess } = renderForm();
    await review();
    userEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));
    await screen.findByText('Conexión interrumpida');
    const payload = executeReceivableOperation.mock.calls[0][1];
    expect(payload).toEqual({
        type: 'void',
        id: 1,
        reason: 'Abono duplicado',
        snapshot: 'snapshot',
        requestId: expect.any(String),
    });
    expect(screen.getByRole('alert')).toHaveFocus();
    userEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(saved));
    expect(executeReceivableOperation.mock.calls[1][1]).toEqual(payload);
});

it('requires a fresh review after a conflict while preserving the reason', async () => {
    executeReceivableOperation.mockRejectedValueOnce(Object.assign(new Error('La deuda cambió'), { status: 409 }));
    const { onSuccess } = renderForm();
    await review();
    userEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));
    await screen.findByText('La deuda cambió');
    const previousId = executeReceivableOperation.mock.calls[0][1].requestId;
    expect(screen.getByLabelText('Motivo de anulación')).toHaveValue('Abono duplicado');
    expect(screen.queryByRole('button', { name: 'Confirmar anulación' })).not.toBeInTheDocument();
    await review();
    userEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(saved));
    expect(executeReceivableOperation.mock.calls[1][1].requestId).not.toBe(previousId);
});

it('blocks editing and confirmation if account writes become unavailable', async () => {
    const { rerender, onCancel, onSuccess, onBusyChange, onDirtyChange } = renderForm();
    await review();
    rerender(
        <InlineOperationForm
            client={client}
            action={{ type: 'void', id: payment.movementId }}
            disabled
            {...{ onCancel, onSuccess, onBusyChange, onDirtyChange }}
        />,
    );
    expect(screen.getByLabelText('Motivo de anulación')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirmar anulación' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form', { name: 'Anulación de abono' }));
    expect(executeReceivableOperation).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).not.toBeDisabled();
});

it('allows reversing a payment in a fully settled account', async () => {
    useReceivableClient.mockReturnValue({
        data: { ...detail, summary: { ...detail.summary, balance: '0.0000' } },
        mutate: refresh,
    });
    openFromAccount();
    await review();
    expect(screen.getByRole('button', { name: 'Confirmar anulación' })).not.toBeDisabled();
});

it('marks the movement as void even when refresh fails and retries only the query', async () => {
    const reload = jest.fn().mockRejectedValueOnce(new Error('Consulta interrumpida')).mockResolvedValue(detail);
    useReceivableClient.mockReturnValue({ data: detail, mutate: reload });
    const { modal } = openFromAccount();
    await review();
    userEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));
    await screen.findByRole('button', { name: 'Reintentar consulta' });
    expect(screen.getByRole('dialog')).toBe(modal);
    expect(screen.getByRole('status')).toHaveTextContent('Abono de Bs 12.000,00 anulado');
    expect(screen.getByRole('status')).toHaveTextContent('No se pudo actualizar la vista');
    expect(screen.getByRole('button', { name: /Ocultar detalles: Abono · Anulado/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anular abono' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar anulación' })).not.toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'Reintentar consulta' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reintentar consulta' })).not.toBeInTheDocument());
    expect(reload).toHaveBeenCalledTimes(2);
    expect(executeReceivableOperation).toHaveBeenCalledTimes(1);
});

it('updates the movement and restores focus without replacing the modal after saving', async () => {
    let current = detail;
    const reload = jest.fn().mockImplementation(async () => {
        current = {
            ...detail,
            summary: { ...detail.summary, balance: saved.balanceAfter },
            timeline: { data: [{ ...payment, voidReason: preview.reason }], total: 2 },
        };
        return current;
    });
    useReceivableClient.mockImplementation(() => ({ data: current, mutate: reload }));
    const { modal } = openFromAccount();
    await review();
    userEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Anulación de abono' })).not.toBeInTheDocument());
    expect(screen.getByRole('dialog')).toBe(modal);
    const movement = screen.getByRole('button', { name: /Ocultar detalles: Abono · Anulado/ });
    expect(
        within(screen.getByRole('region', { name: 'Historial de cobranza' })).getByText('Abono duplicado'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anular abono' })).not.toBeInTheDocument();
    await waitFor(() => expect(movement).toHaveFocus());
});

it('follows a movement to the next history page when the reversal displaces it at a page boundary', async () => {
    const others = Array.from({ length: 19 }, (_, index) => ({
        ...payment,
        eventId: `m-${index + 2}`,
        movementId: index + 2,
        reference: `REF-${index + 2}`,
    }));
    const firstPage = { ...detail, timeline: { data: [...others, payment], total: 20 } };
    const afterSave = {
        ...detail,
        timeline: {
            data: [
                { eventId: 'saved', type: 'ANULACION', date: '2026-10-02', data: saved, applications: [] },
                ...others,
            ],
            total: 21,
        },
    };
    let current = firstPage;
    const reload = jest.fn().mockImplementation(async () => {
        current = afterSave;
        return afterSave;
    });
    useReceivableClient.mockImplementation((_id, filters) => ({
        data:
            filters.timelinePage === 2
                ? { ...detail, timeline: { data: [{ ...payment, voidReason: preview.reason }], total: 21 } }
                : current,
        mutate: reload,
    }));
    render(<ClientModal client={client} onClose={jest.fn()} onChanged={refresh} />);
    userEvent.click(screen.getByRole('button', { name: /Ver detalles: Abono,.*referencia REF-123$/ }));
    userEvent.click(screen.getByRole('button', { name: 'Anular abono' }));
    await review();
    userEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));
    await waitFor(() =>
        expect(useReceivableClient).toHaveBeenLastCalledWith('C1', expect.objectContaining({ timelinePage: 2 })),
    );
    await waitFor(() =>
        expect(screen.getByRole('button', { name: /Ocultar detalles: Abono · Anulado/ })).toHaveFocus(),
    );
});
