import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as api from 'api/purchases';
import { CurrencyRateContext } from 'context/currency_rate';
import { createMemoryHistory } from 'history';
import { SWRConfig } from 'hooks/swr-wrapper';
import { Router } from 'react-router-dom';
import DesgloseView from './DesgloseView';

// Mock the API module
jest.mock('api/purchases', () => ({
    fetchPurchasesDashboard: jest.fn(),
    fetchPurchasesPareto: jest.fn(),
    fetchPurchasesInvoices: jest.fn(),
    fetchPurchasesProducts: jest.fn(),
}));

// Mock DateRangePicker to avoid react-date-range complexity
jest.mock('components/DateRangePicker', () => {
    return function MockDateRangePicker({ onChange, initialFrom, initialTo }) {
        return (
            <button
                type="button"
                data-testid="mock-date-picker"
                onClick={() => onChange({ from: initialFrom || '2026-01-01', to: initialTo || '2026-01-31' })}
            >
                Date Picker
            </button>
        );
    };
});

// Mock search components — trigger onSelect directly
jest.mock('components/ProveedorSearch', () => {
    return function MockProveedorSearch({ onSelect }) {
        return (
            <button
                type="button"
                data-testid="mock-prov-search"
                onClick={() => onSelect({ IdProveedor: 7, Empresa: 'Proveedor X' })}
            >
                Proveedor
            </button>
        );
    };
});

jest.mock('components/GroupSearch', () => {
    return function MockGroupSearch({ onSelect }) {
        return (
            <button
                type="button"
                data-testid="mock-group-search"
                onClick={() => onSelect({ groupId: 3, name: 'Grupo Y' })}
            >
                Grupo
            </button>
        );
    };
});

// Mock pdfmake (avoids loading heavy fonts in test)
jest.mock('pdfmake/build/pdfmake', () => ({
    createPdf: () => ({ open: jest.fn() }),
}));
jest.mock('pdfmake/build/vfs_fonts', () => ({ pdfMake: { vfs: {} } }));

const mockInvoices = {
    data: [
        { invoiceId: 'PUR-001', proveedor: 'Proveedor A', fecha: '2026-07-15', monto: 1500.5, unidades: 10 },
        { invoiceId: 'PUR-002', proveedor: 'Proveedor B', fecha: '2026-07-20', monto: 800, unidades: 5 },
    ],
    pagination: { page: 1, limit: 50, total: 2 },
};

const mockProducts = {
    data: [
        { product: 'Arroz 1kg', quantity: 100, monto: 2200, avgUnitCost: 22 },
        { product: 'Aceite 1L', quantity: 50, monto: 1100, avgUnitCost: 22 },
    ],
    pagination: { page: 1, limit: 50, total: 2 },
};

const renderView = (history) => {
    return render(
        <Router history={history}>
            <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
                <CurrencyRateContext.Provider value={{ currencyRate: { Cambio: 1 }, setCurrencyRate: jest.fn() }}>
                    <DesgloseView isActive />
                </CurrencyRateContext.Provider>
            </SWRConfig>
        </Router>,
    );
};

describe('DesgloseView (compras)', () => {
    let history;

    beforeEach(() => {
        jest.clearAllMocks();
        api.fetchPurchasesInvoices.mockResolvedValue(mockInvoices);
        api.fetchPurchasesProducts.mockResolvedValue(mockProducts);
        history = createMemoryHistory({ initialEntries: ['/compras?view=desglose'] });
    });

    it('renders both tables with invoice and product data', async () => {
        renderView(history);

        await waitFor(() => {
            expect(screen.getByText('PUR-001')).toBeInTheDocument();
            expect(screen.getByText('Proveedor A')).toBeInTheDocument();
            expect(screen.getByText('Arroz 1kg')).toBeInTheDocument();
            expect(screen.getByText('Aceite 1L')).toBeInTheDocument();
        });

        expect(screen.getByText('Costo Prom.')).toBeInTheDocument();
        expect(api.fetchPurchasesInvoices).toHaveBeenCalledWith(
            expect.objectContaining({ from: expect.any(String), to: expect.any(String), page: 1, limit: 50 }),
        );
        expect(api.fetchPurchasesProducts).toHaveBeenCalledWith(
            expect.objectContaining({ from: expect.any(String), to: expect.any(String), page: 1, limit: 50 }),
        );
    });

    it('restores proveedor, group and dates from the URL', async () => {
        history = createMemoryHistory({
            initialEntries: [
                '/compras?view=desglose&dFrom=2026-01-01&dTo=2026-06-30&proveedorId=7&proveedorName=Proveedor%20X&groupId=3&groupName=Grupo%20Y',
            ],
        });
        renderView(history);

        await waitFor(() => {
            expect(api.fetchPurchasesInvoices).toHaveBeenCalledWith(
                expect.objectContaining({
                    from: '2026-01-01',
                    to: '2026-06-30',
                    proveedorId: '7',
                    groupId: '3',
                }),
            );
            expect(api.fetchPurchasesProducts).toHaveBeenCalledWith(
                expect.objectContaining({
                    from: '2026-01-01',
                    to: '2026-06-30',
                    proveedorId: '7',
                    groupId: '3',
                }),
            );
        });
    });

    it('applies proveedor and group filters to both tables simultaneously', async () => {
        renderView(history);

        await waitFor(() => {
            expect(screen.getByTestId('mock-prov-search')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('mock-prov-search'));
        fireEvent.click(screen.getByTestId('mock-group-search'));

        await waitFor(() => {
            expect(api.fetchPurchasesInvoices).toHaveBeenLastCalledWith(
                expect.objectContaining({ proveedorId: 7, groupId: 3, page: 1 }),
            );
            expect(api.fetchPurchasesProducts).toHaveBeenLastCalledWith(
                expect.objectContaining({ proveedorId: 7, groupId: 3, page: 1 }),
            );
        });
    });

    it('persists filters and dates to the URL', async () => {
        renderView(history);

        await waitFor(() => {
            expect(screen.getByTestId('mock-prov-search')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('mock-prov-search'));
        fireEvent.click(screen.getByTestId('mock-group-search'));

        await waitFor(() => {
            expect(history.location.search).toContain('proveedorId=7');
            expect(history.location.search).toContain('proveedorName=Proveedor+X');
            expect(history.location.search).toContain('groupId=3');
            expect(history.location.search).toContain('groupName=Grupo+Y');
        });
    });

    it('resets pagination to page 1 when a filter changes', async () => {
        api.fetchPurchasesInvoices.mockResolvedValue({
            data: mockInvoices.data,
            pagination: { page: 1, limit: 50, total: 80 },
        });
        api.fetchPurchasesProducts.mockResolvedValue({
            data: mockProducts.data,
            pagination: { page: 1, limit: 50, total: 80 },
        });

        renderView(history);

        // Go to page 2 on both tables
        await waitFor(() => {
            expect(screen.getAllByText('2').length).toBeGreaterThan(0);
        });
        fireEvent.click(screen.getAllByText('2')[0]);

        await waitFor(() => {
            expect(api.fetchPurchasesInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
        });

        // Change a filter — pagination must reset to page 1
        fireEvent.click(screen.getByTestId('mock-prov-search'));

        await waitFor(() => {
            expect(api.fetchPurchasesInvoices).toHaveBeenLastCalledWith(
                expect.objectContaining({ page: 1, proveedorId: 7 }),
            );
        });
    });

    it('shows loading spinners while fetching', () => {
        api.fetchPurchasesInvoices.mockImplementation(() => new Promise(() => {}));
        api.fetchPurchasesProducts.mockImplementation(() => new Promise(() => {}));

        const { container } = renderView(history);

        expect(container.querySelectorAll('.spinner-border').length).toBeGreaterThan(0);
    });

    it('shows an error alert when the invoices fetch fails', async () => {
        api.fetchPurchasesInvoices.mockRejectedValue(new Error('boom'));

        renderView(history);

        await waitFor(() => {
            expect(screen.getByText('Error al cargar las facturas: boom')).toBeInTheDocument();
        });
    });

    it('shows an error alert when the products fetch fails', async () => {
        api.fetchPurchasesProducts.mockRejectedValue(new Error('boom'));

        renderView(history);

        await waitFor(() => {
            expect(screen.getByText('Error al cargar los productos: boom')).toBeInTheDocument();
        });
    });
});
