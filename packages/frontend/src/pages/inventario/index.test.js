import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InventarioPage from './index';

jest.mock('components/Sidebar', () => () => null);
jest.mock('components/GroupSearch', () => ({ onSelect }) => (
    <select aria-label="Categoría" onChange={(event) => onSelect(event.target.value ? { groupId: event.target.value } : null)}>
        <option value="">Todas las categorías</option>
        <option value="G1">Categoría con nombre largo</option>
    </select>
));
jest.mock('components/ProveedorSearch', () => ({ onSelect }) => (
    <select
        aria-label="Proveedor"
        onChange={(event) => onSelect(event.target.value ? { IdProveedor: event.target.value } : null)}
    >
        <option value="">Todos los proveedores</option>
        <option value="P1">Proveedor con nombre largo</option>
    </select>
));
jest.mock('components/InventoryTable', () => ({ categoryId, proveedorId }) => (
    <div data-testid="inventory-filters">{JSON.stringify({ categoryId, proveedorId })}</div>
));

it('groups the title and both filters in the shared responsive header', () => {
    render(<InventarioPage />);
    const header = screen.getByRole('heading', { name: 'Inventario' }).closest('.report-page-header');
    expect(header).toContainElement(screen.getByRole('group', { name: 'Categoría' }));
    expect(header).toContainElement(screen.getByRole('group', { name: 'Proveedor' }));
    expect(header.querySelector('.report-page-filters')).not.toHaveAttribute('style');
    expect(within(header).getAllByRole('combobox')).toHaveLength(2);
    expect(within(header).queryByText('Categoría')).not.toBeInTheDocument();
    expect(within(header).queryByText('Proveedor')).not.toBeInTheDocument();
});

it('preserves selecting and clearing both inventory filters', () => {
    render(<InventarioPage />);
    userEvent.selectOptions(screen.getByRole('combobox', { name: 'Categoría' }), 'G1');
    userEvent.selectOptions(screen.getByRole('combobox', { name: 'Proveedor' }), 'P1');
    expect(JSON.parse(screen.getByTestId('inventory-filters').textContent)).toEqual({ categoryId: 'G1', proveedorId: 'P1' });

    userEvent.selectOptions(screen.getByRole('combobox', { name: 'Categoría' }), '');
    userEvent.selectOptions(screen.getByRole('combobox', { name: 'Proveedor' }), '');
    expect(JSON.parse(screen.getByTestId('inventory-filters').textContent)).toEqual({});
});
