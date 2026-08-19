import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as api from 'api/providers';
import { CurrencyRateContext } from 'context/currency_rate';
import { ShowNoeContext } from 'context/show_noe';
import { SWRConfig } from 'hooks/swr-wrapper';
import ProviderDashboardModal from './index';

// Mock the API module
jest.mock('api/providers', () => ({
    fetchProviderSummary: jest.fn(),
    fetchProviderSales: jest.fn(),
    fetchProviderPurchases: jest.fn(),
    fetchProviderClients: jest.fn(),
    fetchProviderProducts: jest.fn(),
    fetchPurchaseDetail: jest.fn(),
    fetchSaleDetail: jest.fn(),
}));

// Mock DateRangePicker to avoid react-date-range complexity
jest.mock('components/DateRangePicker', () => {
    return function MockDateRangePicker({ onChange, initialFrom, initialTo }) {
        return (
            <button
                data-testid="mock-date-picker"
                onClick={() => onChange({ from: initialFrom || '2024-01-01', to: initialTo || '2024-12-31' })}
            >
                Date Picker
            </button>
        );
    };
});

// Mock pdfmake (avoids loading heavy fonts in test)
jest.mock('pdfmake/build/pdfmake', () => ({
    createPdf: () => ({ open: jest.fn() }),
}));
jest.mock('pdfmake/build/vfs_fonts', () => ({}));

const swrWrapper = ({ children }) => (
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>{children}</SWRConfig>
);

const mockProvider = {
    IdProveedor: 1,
    Empresa: 'Proveedor Test',
};

const mockSummary = {
    totalCompras: 5000,
    numCompras: 10,
    totalVentas: 8000,
    numVentas: 15,
    bestSeller: 'Vendedor Top',
};

const mockPurchases = {
    data: [
        { idFactura: 'FAC-001', fecha: '2024-06-15', monto: 1500 },
        { idFactura: 'FAC-002', fecha: '2024-05-10', monto: 800 },
    ],
    total: 2,
};

const mockSales = {
    data: [
        { idFactura: 'FAC-101', cliente: 'Client A', vendedor: 'Vendor A', fecha: '2024-06-15', monto: 500 },
        { idFactura: 'FAC-102', cliente: 'Client B', vendedor: 'Vendor B', fecha: '2024-05-10', monto: 300 },
    ],
    total: 2,
};

const mockClients = {
    data: [
        { cliente: 'Client A', numVentas: 5, totalVentas: 500, utilidad: 100 },
        { cliente: 'Client B', numVentas: 3, totalVentas: 300, utilidad: 60 },
    ],
    total: 2,
};
const mockProducts = {
    data: [
        { producto: 'Product A', cantidad: 10, totalVentas: 500, utilidad: 100 },
        { producto: 'Product B', cantidad: 4, totalVentas: 300, utilidad: 60 },
    ],
    total: 2,
};

const renderModal = (show = true, provider = mockProvider, showNoe = false) => {
    return render(
        <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
            <CurrencyRateContext.Provider value={{ currencyRate: { Cambio: 1 }, setCurrencyRate: jest.fn() }}>
                <ShowNoeContext.Provider value={{ showNoe, setShowNoe: jest.fn() }}>
                    <ProviderDashboardModal show={show} onClose={jest.fn()} provider={provider} />
                </ShowNoeContext.Provider>
            </CurrencyRateContext.Provider>
        </SWRConfig>,
    );
};

describe('ProviderDashboardModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        api.fetchProviderSummary.mockResolvedValue(mockSummary);
        api.fetchProviderPurchases.mockResolvedValue(mockPurchases);
        api.fetchProviderSales.mockResolvedValue(mockSales);
        api.fetchProviderClients.mockResolvedValue(mockClients);
        api.fetchProviderProducts.mockResolvedValue(mockProducts);
    });

    it('renders nothing when show is false', () => {
        const { container } = renderModal(false);
        expect(container.innerHTML).toBe('');
    });

    it('renders modal with provider info when show is true', async () => {
        renderModal(true);

        await waitFor(() => {
            expect(screen.getByText('Proveedor Test')).toBeInTheDocument();
        });

        expect(screen.getByText('Proveedor #1')).toBeInTheDocument();
    });

    it('renders 4 stat cards after loading summary', async () => {
        renderModal(true);

        await waitFor(() => {
            expect(screen.getByText('Total Compras')).toBeInTheDocument();
            expect(screen.getByText('# Compras')).toBeInTheDocument();
            expect(screen.getByText('Total Ventas')).toBeInTheDocument();
            expect(screen.getByText('Mejor Vendedor')).toBeInTheDocument();
        });

        // Check formatted values (es-VE locale: 5000 → $5.000,00)
        await waitFor(() => {
            expect(screen.getByText('$5.000,00')).toBeInTheDocument();
            expect(screen.getByText('10')).toBeInTheDocument();
            expect(screen.getByText('$8.000,00')).toBeInTheDocument();
            expect(screen.getByText('Vendedor Top')).toBeInTheDocument();
        });
    });

    it('shows \u2014 for bestSeller when null', async () => {
        api.fetchProviderSummary.mockResolvedValue({
            ...mockSummary,
            bestSeller: null,
        });

        renderModal(true);

        await waitFor(() => {
            expect(screen.getByText('\u2014')).toBeInTheDocument();
        });
    });

    it('renders purchases table with data', async () => {
        renderModal(true);

        // Wait for summary stats
        await waitFor(() => {
            expect(screen.getByText('Total Compras')).toBeInTheDocument();
        });

        // Switch to Compras tab
        act(() => {
            screen.getByText('Compras').click();
        });

        await waitFor(() => {
            expect(screen.getByText('FAC-001')).toBeInTheDocument();
            expect(screen.getByText('FAC-002')).toBeInTheDocument();
        });
    });

    it('renders sales table with data', async () => {
        renderModal(true);

        await waitFor(() => {
            expect(screen.getByText('Ventas')).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(screen.getByText('Vendor A')).toBeInTheDocument();
            expect(screen.getByText('Vendor B')).toBeInTheDocument();
        });
    });

    it('shows empty state when purchases data is empty', async () => {
        api.fetchProviderPurchases.mockResolvedValue({ data: [], total: 0 });

        renderModal(true);

        // Switch to Compras tab
        await waitFor(() => {
            expect(screen.getByText('Compras')).toBeInTheDocument();
        });
        act(() => {
            screen.getByText('Compras').click();
        });

        await waitFor(() => {
            expect(screen.getByText('Sin compras en este período')).toBeInTheDocument();
        });
    });

    it('shows empty state when sales data is empty', async () => {
        api.fetchProviderSales.mockResolvedValue({ data: [], total: 0 });

        renderModal(true);

        await waitFor(() => {
            expect(screen.getByText('Sin ventas en este período')).toBeInTheDocument();
        });
    });

    it('renders clients table with client name and # ventas', async () => {
        renderModal(true);

        await waitFor(() => {
            expect(screen.getByText('Ventas')).toBeInTheDocument();
        });
        act(() => {
            screen.getByText('Clientes').click();
        });

        await waitFor(() => {
            expect(screen.getByText('Client A')).toBeInTheDocument();
            expect(screen.getByText('Client B')).toBeInTheDocument();
        });
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
        expect(screen.getByText('$500,00')).toBeInTheDocument();
    });

    it('renders products table with product name and quantity', async () => {
        renderModal(true);

        await waitFor(() => {
            expect(screen.getByText('Ventas')).toBeInTheDocument();
        });
        act(() => {
            screen.getByText('Productos').click();
        });

        await waitFor(() => {
            expect(screen.getByText('Product A')).toBeInTheDocument();
            expect(screen.getByText('Product B')).toBeInTheDocument();
        });
        expect(screen.getByText('4')).toBeInTheDocument();
        expect(screen.getByText('$500,00')).toBeInTheDocument();
    });

    it('shows empty state when clients data is empty', async () => {
        api.fetchProviderClients.mockResolvedValue({ data: [], total: 0 });

        renderModal(true);

        await waitFor(() => {
            expect(screen.getByText('Ventas')).toBeInTheDocument();
        });
        act(() => {
            screen.getByText('Clientes').click();
        });

        await waitFor(() => {
            expect(screen.getByText('Sin clientes en este período')).toBeInTheDocument();
        });
    });

    it('shows empty state when products data is empty', async () => {
        api.fetchProviderProducts.mockResolvedValue({ data: [], total: 0 });

        renderModal(true);

        await waitFor(() => {
            expect(screen.getByText('Ventas')).toBeInTheDocument();
        });
        act(() => {
            screen.getByText('Productos').click();
        });

        await waitFor(() => {
            expect(screen.getByText('Sin productos en este período')).toBeInTheDocument();
        });
    });

    it('shows global print button on clients and products tabs', async () => {
        renderModal(true);

        await waitFor(() => {
            expect(screen.getByText('Ventas')).toBeInTheDocument();
        });

        act(() => {
            screen.getByText('Clientes').click();
        });
        await waitFor(() => {
            expect(screen.getByLabelText('Imprimir')).toBeInTheDocument();
        });

        act(() => {
            screen.getByText('Productos').click();
        });
        await waitFor(() => {
            expect(screen.getAllByLabelText('Imprimir').length).toBeGreaterThan(0);
        });
    });

    it('shows the searchable columns in each tab search placeholder', async () => {
        renderModal(true);

        await waitFor(() => {
            expect(screen.getByPlaceholderText('Buscar por factura, cliente o vendedor...')).toBeInTheDocument();
        });

        act(() => {
            screen.getByText('Compras').click();
        });
        await waitFor(() => {
            expect(screen.getByPlaceholderText('Buscar por factura...')).toBeInTheDocument();
        });

        act(() => {
            screen.getByText('Clientes').click();
        });
        await waitFor(() => {
            expect(screen.getByPlaceholderText('Buscar por cliente...')).toBeInTheDocument();
        });

        act(() => {
            screen.getByText('Productos').click();
        });
        await waitFor(() => {
            expect(screen.getByPlaceholderText('Buscar por producto...')).toBeInTheDocument();
        });
    });

    it('calls fetchProviderSummary with correct params', async () => {
        renderModal(true);

        await waitFor(() => {
            expect(api.fetchProviderSummary).toHaveBeenCalledWith(1, {
                from: expect.any(String),
                to: expect.any(String),
                showNoe: false,
            });
        });
    });

    it('calls fetchProviderSales with correct params when showNoe changes', async () => {
        renderModal(true, mockProvider, true);

        await waitFor(() => {
            expect(api.fetchProviderSales).toHaveBeenCalledWith(1, {
                from: expect.any(String),
                to: expect.any(String),
                page: 1,
                limit: 50,
                showNoe: true,
                search: undefined,
                sortBy: 'fecha',
                sortDir: 'desc',
            });
        });
    });

    it('triggers server-side sorting when a column header is clicked', async () => {
        renderModal(true);

        await waitFor(() => {
            expect(screen.getByText('Fecha')).toBeInTheDocument();
        });

        act(() => {
            fireEvent.click(screen.getByText('Fecha'));
        });

        await waitFor(() => {
            expect(api.fetchProviderSales).toHaveBeenCalledWith(
                1,
                expect.objectContaining({ sortBy: 'fecha', sortDir: 'asc' }),
            );
        });
    });

    it('triggers server-side search when typing in the search box', async () => {
        renderModal(true);

        await waitFor(() => {
            expect(screen.getByPlaceholderText('Buscar por factura, cliente o vendedor...')).toBeInTheDocument();
        });

        act(() => {
            fireEvent.change(screen.getByPlaceholderText('Buscar por factura, cliente o vendedor...'), {
                target: { value: 'Cliente A' },
            });
        });

        await waitFor(
            () => {
                expect(api.fetchProviderSales).toHaveBeenCalledWith(
                    1,
                    expect.objectContaining({ search: 'Cliente A' }),
                );
            },
            { timeout: 3000 },
        );
    });

    it('renders pagination when there are more records than LIMIT', async () => {
        api.fetchProviderPurchases.mockResolvedValue({
            data: Array(20).fill({
                idFactura: 'FAC',
                fecha: '2024-01-01',
                monto: 100,
            }),
            total: 120,
        });

        renderModal(true);

        // Switch to Compras tab
        await waitFor(() => {
            expect(screen.getByText('Compras')).toBeInTheDocument();
        });
        act(() => {
            screen.getByText('Compras').click();
        });

        await waitFor(() => {
            expect(screen.getByText('Mostrando 1–50 de 120 resultados')).toBeInTheDocument();
        });
    });

    it('closes modal when onClose is called', async () => {
        const onClose = jest.fn();
        render(
            <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
                <CurrencyRateContext.Provider value={{ currencyRate: { Cambio: 1 }, setCurrencyRate: jest.fn() }}>
                    <ShowNoeContext.Provider value={{ showNoe: false, setShowNoe: jest.fn() }}>
                        <ProviderDashboardModal show={true} onClose={onClose} provider={mockProvider} />
                    </ShowNoeContext.Provider>
                </CurrencyRateContext.Provider>
            </SWRConfig>,
        );

        // Find and click the close button
        const closeButton = document.querySelector('.btn-close');
        if (closeButton) {
            act(() => {
                closeButton.click();
            });
            expect(onClose).toHaveBeenCalled();
        }
    });
});
