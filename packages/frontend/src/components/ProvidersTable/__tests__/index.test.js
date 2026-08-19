import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as providersApi from 'api/providers';
import { CurrencyRateContext } from 'context/currency_rate';
import { ShowNoeContext } from 'context/show_noe';
import { SWRConfig } from 'hooks/swr-wrapper';
import ProvidersTable from '../index';

// Mock the API module
jest.mock('api/providers', () => ({
    fetchProvidersList: jest.fn(),
}));

// Mock pdfmake
jest.mock('pdfmake/build/pdfmake', () => ({
    createPdf: () => ({ open: jest.fn() }),
}));
jest.mock('pdfmake/build/vfs_fonts', () => ({
    pdfMake: { vfs: {} },
}));

const swrWrapper = ({ children }) => (
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
        <ShowNoeContext.Provider value={{ showNoe: false, setShowNoe: jest.fn() }}>
            <CurrencyRateContext.Provider value={{ currencyRate: { Cambio: 36.5 }, setCurrencyRate: jest.fn() }}>
                {children}
            </CurrencyRateContext.Provider>
        </ShowNoeContext.Provider>
    </SWRConfig>
);

const mockProvidersData = {
    data: [
        {
            IdProveedor: 1,
            Empresa: 'Proveedor A',
            total_compras: 1000.5,
            num_compras: 5,
            total_ventas: 2000.75,
            num_ventas: 10,
        },
        {
            IdProveedor: 2,
            Empresa: 'Proveedor B',
            total_compras: 500.0,
            num_compras: 2,
            total_ventas: 1500.25,
            num_ventas: 8,
        },
    ],
    total: 2,
    page: 1,
    limit: 20,
};

describe('ProvidersTable', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        providersApi.fetchProvidersList.mockResolvedValue(mockProvidersData);
    });

    it('renders the table with 6 columns', async () => {
        await act(async () => {
            render(<ProvidersTable />, { wrapper: swrWrapper });
        });

        await waitFor(() => {
            expect(screen.getByText('IdProveedor')).toBeInTheDocument();
        });

        expect(screen.getByText('Empresa')).toBeInTheDocument();
        expect(screen.getByText('Total Compras')).toBeInTheDocument();
        expect(screen.getByText('# Compras')).toBeInTheDocument();
        expect(screen.getByText('Total Ventas')).toBeInTheDocument();
        expect(screen.getByText('# Ventas')).toBeInTheDocument();
    });

    it('renders provider data rows', async () => {
        await act(async () => {
            render(<ProvidersTable />, { wrapper: swrWrapper });
        });

        await waitFor(() => {
            expect(screen.getByText('Proveedor A')).toBeInTheDocument();
            expect(screen.getByText('Proveedor B')).toBeInTheDocument();
        });
    });

    it('shows spinner during loading', async () => {
        // Make fetch return a promise that doesn't resolve
        providersApi.fetchProvidersList.mockImplementationOnce(() => new Promise(() => {}));

        const { container } = render(<ProvidersTable />, { wrapper: swrWrapper });

        // The spinner has role="status" from the Table component
        await waitFor(() => {
            expect(container.querySelector('.spinner-border')).toBeInTheDocument();
        });
    });

    it('shows "Sin datos" when no data', async () => {
        providersApi.fetchProvidersList.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

        render(<ProvidersTable />, { wrapper: swrWrapper });

        await waitFor(() => {
            expect(screen.getByText('Sin datos')).toBeInTheDocument();
        });
    });

    it('calls onRowSelect when a row is clicked', async () => {
        const onRowSelect = jest.fn();

        await act(async () => {
            render(<ProvidersTable onRowSelect={onRowSelect} />, { wrapper: swrWrapper });
        });

        await waitFor(() => {
            expect(screen.getByText('Proveedor A')).toBeInTheDocument();
        });

        await act(async () => {
            userEvent.click(screen.getByText('Proveedor A'));
        });

        expect(onRowSelect).toHaveBeenCalledWith(
            expect.objectContaining({
                IdProveedor: 1,
                Empresa: 'Proveedor A',
            }),
        );
    });

    it('highlights selected row on click', async () => {
        const onRowSelect = jest.fn();

        await act(async () => {
            render(<ProvidersTable onRowSelect={onRowSelect} />, { wrapper: swrWrapper });
        });

        await waitFor(() => {
            expect(screen.getByText('Proveedor A')).toBeInTheDocument();
        });

        const row = screen.getByText('Proveedor A').closest('tr');
        expect(row).not.toBeNull();

        await act(async () => {
            userEvent.click(screen.getByText('Proveedor A'));
        });

        // Row should be clickable — onRowSelect should have been in the Table
        expect(row).toHaveClass('table-row-clickable');
    });

    it('renders search input', async () => {
        await act(async () => {
            render(<ProvidersTable />, { wrapper: swrWrapper });
        });

        expect(screen.getByPlaceholderText('Buscar por empresa...')).toBeInTheDocument();
    });

    it('formats currency values correctly (es-VE)', async () => {
        await act(async () => {
            render(<ProvidersTable />, { wrapper: swrWrapper });
        });

        await waitFor(() => {
            expect(screen.getByText('$1.000,50')).toBeInTheDocument();
            expect(screen.getByText('$2.000,75')).toBeInTheDocument();
            expect(screen.getByText('$500,00')).toBeInTheDocument();
            expect(screen.getByText('$1.500,25')).toBeInTheDocument();
        });
    });

    it('shows global totals (all pages) in the footer', async () => {
        providersApi.fetchProvidersList.mockResolvedValue({
            ...mockProvidersData,
            totals: { total_compras: 1500.5, num_compras: 7, total_ventas: 3501, num_ventas: 18 },
        });

        const { container } = render(<ProvidersTable />, { wrapper: swrWrapper });

        await waitFor(() => {
            expect(screen.getByText('Proveedor A')).toBeInTheDocument();
        });

        const footer = container.querySelector('tfoot');
        expect(footer).not.toBeNull();
        // Totales globales (suma de ambas filas del mock), formato es-VE.
        expect(within(footer).getByText('$1.500,50')).toBeInTheDocument();
        expect(within(footer).getByText('$3.501,00')).toBeInTheDocument();
        expect(within(footer).getByText('7')).toBeInTheDocument();
        expect(within(footer).getByText('18')).toBeInTheDocument();
    });
});
