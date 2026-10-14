import { fireEvent, render, screen } from '@testing-library/react';
import DocumentList from './DocumentList';

const document = {
    id: 1,
    sale: 'FAC-001',
    original: '100.0000',
    balance: '70.0001',
    applied: '29.9999',
    closed: '0.0000',
    issued: '2026-09-01',
    due: '2026-10-01',
    eligible: true,
    status: 'Pendiente',
};
const callbacks = () => ({ onInvoice: jest.fn(), onAction: jest.fn() });

it('shows only the invoice, due date and precise balance until expanded', () => {
    render(<DocumentList documents={[document]} allowed {...callbacks()} />);
    expect(screen.getByRole('button', { name: 'Ver factura FAC-001' })).toBeInTheDocument();
    expect(screen.getByText('$70,0001')).toBeInTheDocument();
    expect(screen.getByText(/Vence/)).toBeInTheDocument();
    expect(screen.queryByText('Original')).not.toBeInTheDocument();
    expect(screen.queryByText('Abonado')).not.toBeInTheDocument();
    expect(screen.queryByText('Pendiente')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

it('opens the invoice using its original focus trigger', () => {
    const handlers = callbacks();
    render(<DocumentList documents={[document]} allowed {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver factura FAC-001' }));
    expect(handlers.onInvoice).toHaveBeenCalledWith('FAC-001', 'cxc-document-1');
});

it('reveals the financial breakdown and explicit closure action on demand', () => {
    const handlers = callbacks();
    render(<DocumentList documents={[document]} allowed {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver desglose de factura FAC-001' }));
    expect(screen.getByText('$100,00')).toBeInTheDocument();
    expect(screen.getByText('$29,9999')).toBeInTheDocument();
    expect(screen.getByText('Abonado')).toBeInTheDocument();
    expect(screen.queryByText(/CxC/)).not.toBeInTheDocument();
    expect(screen.queryByText('Cierre manual')).not.toBeInTheDocument();
    const close = screen.getByRole('button', { name: 'Cerrar deuda de factura FAC-001' });
    fireEvent.click(close);
    expect(handlers.onAction).toHaveBeenCalledWith({ type: 'close', id: 1, scope: 'Factura FAC-001' }, close);
});

it('distinguishes a manual closure and exposes reopening without inventing a payment', () => {
    render(
        <DocumentList
            documents={[{ ...document, balance: '0.0000', closed: '70.0001', status: 'Cerrada manualmente' }]}
            allowed
            {...callbacks()}
        />,
    );
    expect(screen.getByText('Cerrada manualmente')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver desglose de factura FAC-001' }));
    expect(screen.getByText('Cierre manual')).toBeInTheDocument();
    expect(screen.getByText('$70,0001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reabrir cierre de factura FAC-001' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar deuda de factura FAC-001' })).not.toBeInTheDocument();
});

it('keeps the row toggle independent from invoice navigation', () => {
    const handlers = callbacks();
    render(<DocumentList documents={[document]} allowed {...handlers} />);
    const toggle = screen.getByRole('button', { name: 'Ver desglose de factura FAC-001' });
    const invoice = screen.getByRole('button', { name: 'Ver factura FAC-001' });
    expect(toggle.parentElement).toBe(invoice.parentElement);
    expect(toggle).not.toContainElement(invoice);
    fireEvent.click(invoice);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(invoice);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(handlers.onInvoice).toHaveBeenCalledTimes(2);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

it('distinguishes overdue, due-today, settled and manually closed chips', () => {
    const { container } = render(
        <DocumentList
            documents={[
                document,
                { ...document, id: 2, due: '2026-10-14' },
                { ...document, id: 3, balance: '0.0000', status: 'Saldada' },
                { ...document, id: 4, balance: '0.0000', closed: '70.0001', status: 'Cerrada manualmente' },
                { ...document, id: 5, due: null },
            ]}
            asOf="2026-10-14"
            allowed
            {...callbacks()}
        />,
    );
    const chips = container.querySelectorAll('.cxc-status-chip');
    expect(chips[0]).toHaveClass('cxc-status-overdue');
    expect(chips[1]).toHaveClass('cxc-status-pending');
    expect(chips[2]).toHaveClass('cxc-status-settled');
    expect(chips[3]).toHaveClass('cxc-status-closed');
    expect(chips[4]).toHaveClass('cxc-status-pending');
    expect(chips[4]).toHaveTextContent('Sin vencimiento');
});

it('blocks both row expansion and invoice navigation while the account is locked', () => {
    const handlers = callbacks();
    render(<DocumentList documents={[document]} allowed locked {...handlers} />);
    const toggle = screen.getByRole('button', { name: 'Ver desglose de factura FAC-001' });
    const invoice = screen.getByRole('button', { name: 'Ver factura FAC-001' });
    expect(toggle).toBeDisabled();
    expect(invoice).toBeDisabled();
    fireEvent.click(toggle);
    fireEvent.click(invoice);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(handlers.onInvoice).not.toHaveBeenCalled();
});

it('allows read-only inspection but disables financial actions', () => {
    render(<DocumentList documents={[document]} allowed={false} {...callbacks()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver desglose de factura FAC-001' }));
    expect(screen.getByRole('button', { name: 'Cerrar deuda de factura FAC-001' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ver factura FAC-001' })).not.toBeDisabled();
});
