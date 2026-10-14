import { fireEvent, render, screen, within } from '@testing-library/react';
import { rateLabel } from './format';
import Timeline from './Timeline';

const payment = {
    eventId: 'm-1',
    type: 'payment',
    movementId: 1,
    date: '2026-10-01',
    registeredAt: '2026-10-02',
    amount: '1000.0000',
    currency: 'BsS',
    base: '10.0000',
    rate: '100.126789',
    method: 'TRANSFERENCIA',
    reference: 'REF-123',
    bank: 'Banco Uno',
    notes: 'Cobro con cero retenciones aplicadas. Acuerdo del cliente.',
    applications: [{ id: 1, sale: 'FAC-001', amount: '10.0000' }],
    excess: '0.0000',
};
const callbacks = () => ({ onInvoice: jest.fn(), onVoid: jest.fn() });
const expand = () => fireEvent.click(screen.getByRole('button', { name: /Ver detalles:/ }));

it('shows a compact summary without tables, metadata boxes or expanded applications', () => {
    render(<Timeline events={[payment]} allowed {...callbacks()} />);
    const summary = screen.getByRole('button', { name: /Ver detalles: Abono/ });
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    expect(summary).toHaveTextContent('Bs 1.000,00');
    expect(summary).toHaveTextContent('$10,00');
    expect(summary).toHaveTextContent('Transferencia');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Tasa Bs/USD')).not.toBeInTheDocument();
    expect(screen.queryByText('REF-123')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver factura FAC-001' })).not.toBeInTheDocument();
});

it('reveals rate, metadata and applications only when requested', () => {
    render(<Timeline events={[payment]} allowed {...callbacks()} />);
    expand();
    expect(screen.getByText('Tasa Bs/USD')).toBeInTheDocument();
    expect(screen.getByText('100,13')).toBeInTheDocument();
    expect(screen.getByText('REF-123')).toBeInTheDocument();
    expect(screen.getByText('Banco Uno')).toBeInTheDocument();
    expect(screen.getByText('Registrado')).toBeInTheDocument();
    expect(screen.getByText('Acuerdo del cliente.')).toBeInTheDocument();
    expect(screen.queryByText(/cobro con cero retenciones aplicadas/i)).not.toBeInTheDocument();
    expect(payment.notes).toBe('Cobro con cero retenciones aplicadas. Acuerdo del cliente.');
    expect(screen.getByRole('list', { name: 'Facturas aplicadas' })).toHaveTextContent('$10,00');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

it('keeps bolivars and their USD conversion in the same amount group', () => {
    render(<Timeline events={[payment]} allowed {...callbacks()} />);
    const received = screen.getByText('Bs 1.000,00');
    const conversion = screen.getByText('$10,00');
    expect(received.parentElement).toBe(conversion.parentElement);
    expect(received.parentElement).toHaveClass('cxc-event-amounts');
});

it('groups the payment method and reference and anchors invoice applications', () => {
    const { container } = render(<Timeline events={[payment]} allowed {...callbacks()} />);
    expand();
    const identification = container.querySelector('.cxc-payment-identification');
    expect(within(identification).getByText('Transferencia')).toBeInTheDocument();
    expect(within(identification).getByText('REF-123')).toBeInTheDocument();
    expect(screen.queryByText('Referencia', { selector: 'dt' })).not.toBeInTheDocument();
    expect(screen.getByText('Aplicado a')).toBeInTheDocument();
    const invoice = screen.getByRole('button', { name: 'Ver factura FAC-001' });
    expect(invoice.closest('.cxc-applied-invoice')).not.toBeNull();
    expect(invoice.closest('li')).toHaveTextContent('$10,00');
});

it('renders retention boilerplate as a compact badge without losing other notes', () => {
    const original = 'Cobro con Retenciones Aplicadas. Pago conciliado.';
    const movement = { ...payment, notes: original };
    const { container } = render(<Timeline events={[movement]} allowed {...callbacks()} />);
    expect(screen.queryByText('Con retenciones')).not.toBeInTheDocument();
    expand();
    expect(screen.getByText('Con retenciones')).toHaveClass('cxc-retention-badge');
    expect(screen.getByText('Pago conciliado.')).toHaveClass('cxc-movement-notes');
    expect(container.querySelector('.cxc-payment-meta')).toContainElement(screen.getByText('Con retenciones'));
    expect(screen.queryByText(/Cobro con Retenciones Aplicadas/i)).not.toBeInTheDocument();
    expect(movement.notes).toBe(original);
});

it('does not keep a retention-only note as a paragraph', () => {
    const { container } = render(
        <Timeline events={[{ ...payment, notes: 'COBRO CON RETENCIONES APLICADAS' }]} allowed {...callbacks()} />,
    );
    expand();
    expect(screen.getByText('Con retenciones')).toBeInTheDocument();
    expect(container.querySelector('.cxc-movement-notes')).toBeNull();
});

it('does not render empty legacy notes after expanding', () => {
    render(
        <Timeline events={[{ ...payment, notes: 'COBRO CON CERO RETENCIONES APLICADAS' }]} allowed {...callbacks()} />,
    );
    expand();
    expect(screen.queryByText(/retenciones/i)).not.toBeInTheDocument();
});

it('opens invoice detail and returns the movement trigger when voiding', () => {
    const handlers = callbacks();
    render(<Timeline events={[payment]} allowed {...handlers} />);
    expand();
    fireEvent.click(screen.getByRole('button', { name: 'Ver factura FAC-001' }));
    expect(handlers.onInvoice).toHaveBeenCalledWith('FAC-001', 'cxc-invoice-m-1-1');
    fireEvent.click(screen.getByRole('button', { name: 'Anular abono' }));
    expect(handlers.onVoid).toHaveBeenCalledWith(payment, screen.getByRole('button', { name: /Ocultar detalles:/ }));
});

it('keeps inspection available in read-only mode but blocks voiding', () => {
    render(<Timeline events={[payment]} allowed={false} {...callbacks()} />);
    expand();
    expect(screen.getByRole('button', { name: 'Ver factura FAC-001' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Anular abono' })).toBeDisabled();
});

it('preserves void reasons and two-decimal excess without offering another void', () => {
    const { container } = render(
        <Timeline
            events={[{ ...payment, voidReason: 'Error de referencia', excess: '0.0001' }]}
            allowed
            {...callbacks()}
        />,
    );
    expect(screen.getByText('Abono · Anulado')).toBeInTheDocument();
    expand();
    expect(screen.getByText('Error de referencia')).toBeInTheDocument();
    expect(screen.getByText('Excedente no aplicado')).toBeInTheDocument();
    expect(screen.getByText('$0,00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anular abono' })).not.toBeInTheDocument();
    expect(container.querySelector('.cxc-event-void')).toBeInTheDocument();
});

it('does not invent a conversion for USD payments', () => {
    render(
        <Timeline
            events={[{ ...payment, amount: '10.0000', currency: 'USD', rate: '1.000000' }]}
            allowed
            {...callbacks()}
        />,
    );
    const summary = screen.getByRole('button', { name: /Ver detalles:/ });
    expect(within(summary).getAllByText('$10,00')).toHaveLength(1);
    expand();
    expect(screen.queryByText('Tasa Bs/USD')).not.toBeInTheDocument();
});

it('keeps only one movement expanded at a time', () => {
    render(
        <Timeline
            events={[payment, { ...payment, eventId: 'm-2', date: '2026-10-02', reference: 'REF-456' }]}
            allowed
            {...callbacks()}
        />,
    );
    const summaries = screen.getAllByRole('button', { name: /Ver detalles:/ });
    fireEvent.click(summaries[0]);
    expect(screen.getByText('REF-123')).toBeInTheDocument();
    fireEvent.click(summaries[1]);
    expect(screen.queryByText('REF-123')).not.toBeInTheDocument();
    expect(screen.getByText('REF-456')).toBeInTheDocument();
});

it('does not leave an empty timeline taking up space in the empty state', () => {
    render(<Timeline events={[]} allowed {...callbacks()} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

it('formats missing and invalid rates as unavailable, not zero', () => {
    expect(rateLabel('1234.5678')).toBe('1.234,57');
    expect(rateLabel(null)).toBe('—');
    expect(rateLabel('bad')).toBe('—');
});
