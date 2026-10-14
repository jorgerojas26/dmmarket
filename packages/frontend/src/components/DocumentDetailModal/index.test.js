import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FacturaDetailModal from 'components/FacturaDetailModal';
import PurchaseDetailModal from 'components/ProviderDashboardModal/PurchaseDetailModal';
import SaleDetailModal from 'components/ProviderDashboardModal/SaleDetailModal';
import DocumentDetailModal from './index';

const record = {
    idFactura: 'FAC-001',
    fecha: '2026-07-15',
    cliente: 'Cliente de prueba',
    vendedor: 'Vendedor de prueba',
    productos: [{ descripcion: 'CAFÉ ARAUCA 200GX15UND', cantidad: 3, precio: 33.5, subtotal: 100.5, utilidad: 4.38 }],
    total: 100.5,
    utilidad: 4.38,
};
const longRecord = {
    ...record,
    productos: Array.from({ length: 100 }, (_, index) => ({
        descripcion: `Producto ${index + 1}`,
        cantidad: 2,
        precio: index + 1,
        subtotal: (index + 1) * 2,
        utilidad: 0.1234,
    })),
    total: 10100,
    utilidad: 12.34,
};

it.each([
    ['ventas de clientes y proveedores', SaleDetailModal, { sale: record }, 'Venta #FAC-001', 'Vendedor de prueba', true],
    ['facturas de ventas', FacturaDetailModal, { invoice: record }, 'Factura #FAC-001', 'Cliente de prueba', true],
    ['compras de proveedores', PurchaseDetailModal, { purchase: record }, 'Factura #FAC-001', null, false],
])('uses the shared wide detail for %s while retaining its data', (_name, Component, props, title, subtitle, profit) => {
    render(<Component show onClose={jest.fn()} {...props} />);
    const dialog = screen.getByRole('dialog', { name: title });
    expect(dialog).toHaveClass('document-detail-modal');
    expect(dialog.querySelector('.modal-dialog')).toHaveClass('modal-xl');
    expect(screen.getByText(record.productos[0].descripcion)).toBeVisible();
    expect(screen.getByText(/jul/)).toBeVisible();
    if (subtitle) expect(screen.getByText(new RegExp(subtitle))).toBeVisible();
    if (profit) expect(screen.getByRole('columnheader', { name: 'Utilidad' })).toBeVisible();
    else expect(screen.queryByRole('columnheader', { name: 'Utilidad' })).not.toBeInTheDocument();
});

it('keeps the header and totals outside the scrolling products and renders all long-invoice rows', () => {
    render(<DocumentDetailModal show record={longRecord} onClose={jest.fn()} />);
    const dialog = screen.getByRole('dialog');
    const scroller = screen.getByRole('region', { name: 'Productos de la factura' });
    expect(scroller).toHaveAttribute('tabindex', '0');
    expect(dialog).toHaveClass('document-detail-long');
    const footer = dialog.querySelector('.modal-footer');
    expect(scroller).toContainElement(screen.getByRole('table'));
    expect(scroller).not.toContainElement(dialog.querySelector('.modal-header'));
    expect(scroller).not.toContainElement(footer);
    expect(screen.getAllByRole('row')).toHaveLength(101);
    expect(screen.getByText('Producto 100')).toBeVisible();
    expect(within(footer).getByText('100 productos')).toBeVisible();
    expect(within(footer).getByText('$10,100.00')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Página siguiente' })).not.toBeInTheDocument();
});

it('searches long invoices locally without changing their total and can restore all rows', () => {
    render(<DocumentDetailModal show record={longRecord} onClose={jest.fn()} />);
    const search = screen.getByRole('searchbox', { name: 'Buscar producto' });
    userEvent.type(search, 'pRODUCTO 100');
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('Producto 100')).toBeVisible();
    expect(screen.getByText('1 de 100 productos')).toBeVisible();
    expect(screen.getByText('$10,100.00')).toBeVisible();
    fireEvent.change(search, { target: { value: 'No existe' } });
    expect(screen.getByText('No se encontraron productos')).toBeVisible();
    expect(screen.getByText('0 de 100 productos')).toBeVisible();
    expect(screen.getByText('$10,100.00')).toBeVisible();
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getAllByRole('row')).toHaveLength(101);
    expect(screen.getByText('100 productos')).toBeVisible();
});

it('reveals profit per product and in the summary without losing the search or changing the total', () => {
    render(<DocumentDetailModal show record={longRecord} showProfit collapseProfit onClose={jest.fn()} />);
    const search = screen.getByRole('searchbox', { name: 'Buscar producto' });
    fireEvent.change(search, { target: { value: 'Producto 100' } });
    expect(screen.queryByRole('columnheader', { name: 'Utilidad' })).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Mostrar utilidad' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    userEvent.click(toggle);
    expect(screen.getByRole('columnheader', { name: 'Utilidad' })).toBeVisible();
    expect(screen.getByText('$0.12')).toBeVisible();
    expect(screen.getByText('$12.34')).toBeVisible();
    expect(search).toHaveValue('Producto 100');
    expect(screen.getByText('$10,100.00')).toBeVisible();
    userEvent.click(screen.getByRole('button', { name: 'Ocultar utilidad' }));
    expect(screen.queryByRole('columnheader', { name: 'Utilidad' })).not.toBeInTheDocument();
    expect(screen.queryByText('$12.34')).not.toBeInTheDocument();
    expect(screen.getByText('Producto 100')).toBeVisible();
});

it('resets search and profit expansion when another document is opened', () => {
    const { rerender } = render(
        <DocumentDetailModal show record={longRecord} showProfit collapseProfit onClose={jest.fn()} />,
    );
    userEvent.type(screen.getByRole('searchbox'), 'Producto 100');
    userEvent.click(screen.getByRole('button', { name: 'Mostrar utilidad' }));
    rerender(<DocumentDetailModal show record={{ ...longRecord, idFactura: 'FAC-002' }} showProfit collapseProfit />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Factura #FAC-002');
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.queryByRole('columnheader', { name: 'Utilidad' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(101);
});

it('keeps short and empty invoices simple and allows closing them from the footer', () => {
    const close = jest.fn();
    const { rerender } = render(<DocumentDetailModal show record={record} onClose={close} />);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getByText('1 producto')).toBeVisible();
    userEvent.click(screen.getByRole('button', { name: 'Cerrar', exact: true }));
    expect(close).toHaveBeenCalledTimes(1);
    rerender(<DocumentDetailModal show record={{ ...record, productos: [], total: 0 }} onClose={close} />);
    expect(screen.getByText('Sin productos en esta factura')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('0 productos')).toBeVisible();
    expect(screen.getByText('$0.00')).toBeVisible();
});

it('keeps closing available while loading or displaying errors without stale products or totals', () => {
    const retry = jest.fn();
    const close = jest.fn();
    const { rerender } = render(<DocumentDetailModal show invoiceId="FAC-001" onClose={close} />);
    expect(screen.getByRole('status', { name: 'Cargando detalle' })).toBeVisible();
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'Cerrar', exact: true }));
    expect(close).toHaveBeenCalledTimes(1);
    rerender(<DocumentDetailModal show record={record} error={new Error('Sin conexión')} onRetry={retry} onClose={close} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Sin conexión');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalledTimes(1);
});
