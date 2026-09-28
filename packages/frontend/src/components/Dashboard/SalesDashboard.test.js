import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as dashboardApi from 'api/dashboard';
import { CurrencyRateContext } from 'context/currency_rate';
import { SWRConfig } from 'hooks/swr-wrapper';
import pdfMake from 'pdfmake/build/pdfmake';
import SalesDashboard from './SalesDashboard';

jest.mock('api/dashboard');

const mockData = {
    kpis: {
        totalRawProfit: 50000,
        totalNetProfit: 15000,
        totalQuantity: 200,
        totalInvoices: 50,
        avgTicket: 1000,
        avgMarginPercent: 30,
        compareRawProfit: 45000,
        compareNetProfit: 13000,
        compareQuantity: 180,
        compareInvoices: 45,
    },
    bestEmployee: { id: 1, name: 'Juan Pérez', totalSales: 25000 },
    topProducts: [
        { product: 'Producto A', quantity: 100, rawProfit: 20000, netProfit: 6000, averageProfitPercent: 30 },
    ],
    topClients: [{ client: 'Empresa X', total_USD: 30000 }],
    groupSalesChart: [{ categoria: 'Electrónicos', rawProfit: 30000, netProfit: 9000 }],
};

const swrWrapper = ({ children }) => (
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
        <CurrencyRateContext.Provider value={{ currencyRate: { Cambio: 1 }, setCurrencyRate: jest.fn() }}>
            {children}
        </CurrencyRateContext.Provider>
    </SWRConfig>
);

describe('SalesDashboard', () => {
    beforeEach(() => {
        dashboardApi.fetchDashboardSales.mockResolvedValue(mockData);
        dashboardApi.fetchDashboardPareto.mockReset();
        dashboardApi.fetchDashboardPareto.mockResolvedValue({ products: [], summary: null });
    });
    afterEach(() => jest.restoreAllMocks());

    it('muestra spinner mientras carga', () => {
        render(<SalesDashboard dateRange={{ from: '2026-07-01', to: '2026-07-27' }} showNoe={false} />, {
            wrapper: swrWrapper,
        });
        expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('renderiza KPIs, tablas y gráfico al recibir datos', async () => {
        render(<SalesDashboard dateRange={{ from: '2026-07-01', to: '2026-07-27' }} showNoe={false} />, {
            wrapper: swrWrapper,
        });
        await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeInTheDocument());
        expect(screen.getByText('Venta Bruta')).toBeInTheDocument();
        expect(screen.getByText('Producto A')).toBeInTheDocument();
        expect(screen.getByText('Empresa X')).toBeInTheDocument();
    });

    it('muestra el valor total del inventario filtrado y solicita ordenamiento al servidor', async () => {
        dashboardApi.fetchDashboardPareto.mockResolvedValue({
            products: [
                { product: 'Pareto A', rank: 1, netProfit: 200, quantity: 2, inventoryValue: 125, cumulativePercent: 70, abcClass: 'A' },
                { product: 'Pareto B', rank: 2, netProfit: 100, quantity: 1, inventoryValue: 75, cumulativePercent: 100, abcClass: 'C' },
            ],
            newProducts: [
                { product: 'Pareto Nuevo', netProfit: 50, quantity: 1, inventoryValue: 30, firstPurchaseDate: '2026-07-20' },
            ],
            newProductsCount: 1,
            newProductsTotal: 1,
            newProductsInventoryTotal: 30,
            summary: { classA: { count: 1, profitPercent: 70 }, classB: { count: 0, profitPercent: 0 }, classC: { count: 1, profitPercent: 30 }, totalProducts: 2 },
        });
        render(<SalesDashboard dateRange={{ from: '2026-07-01', to: '2026-07-27' }} showNoe={false} />, {
            wrapper: swrWrapper,
        });
        await waitFor(() => expect(screen.getByText('Pareto A')).toBeInTheDocument());
        const table = screen.getAllByText('Valor inventario')[0].closest('table');
        expect(within(table.querySelector('tfoot')).getByText('$200,00')).toBeInTheDocument();
        expect(screen.getByText('Productos nuevos (1)')).toBeInTheDocument();
        expect(screen.getByText('Pareto Nuevo')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Ayuda sobre Modos del Pareto' }));
        expect(screen.getByText(/un producto no puede aparecer en ambos modos/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Ayuda sobre Modos del Pareto' }));
        fireEvent.click(screen.getByRole('button', { name: 'Ayuda sobre Productos nuevos (1)' }));
        expect(screen.getByText(/Por eso cada modo muestra productos nuevos distintos/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Clase A' }));
        expect(within(table.querySelector('tfoot')).getByText('$125,00')).toBeInTheDocument();
        fireEvent.click(within(table).getByText('Valor inventario'));
        await waitFor(() => expect(dashboardApi.fetchDashboardPareto).toHaveBeenCalledWith(
            expect.objectContaining({ sortBy: 'inventoryValue', sortDir: 'asc' }),
        ));
    });

    it('muestra los productos nuevos aun cuando no haya productos maduros', async () => {
        dashboardApi.fetchDashboardPareto.mockResolvedValue({
            products: [],
            newProducts: [
                { product: 'Nuevo', netProfit: 10, quantity: 1, inventoryValue: 20, firstPurchaseDate: '2026-07-20' },
            ],
            newProductsCount: 1,
            newProductsTotal: 1,
            newProductsInventoryTotal: 20,
            summary: { totalProducts: 0 },
        });
        render(<SalesDashboard dateRange={{ from: '2026-07-01', to: '2026-07-27' }} showNoe={false} />, {
            wrapper: swrWrapper,
        });
        await waitFor(() => expect(screen.getByText('Nuevo')).toBeInTheDocument());
        expect(screen.getByText(/No hay productos con al menos 30 días/)).toBeInTheDocument();
    });

    it('busca y ordena nuevos en el servidor e imprime todos los resultados, no solo la página', async () => {
        const first = { product: 'Nuevo A', netProfit: 10, quantity: 1, inventoryValue: 30, firstPurchaseDate: '2026-07-20' };
        const second = { product: 'Nuevo B', netProfit: 20, quantity: 2, inventoryValue: 40, firstPurchaseDate: '2026-07-21' };
        const page = {
            products: [], newProducts: [first], newProductsCount: 2,
            newProductsTotal: 2, newProductsInventoryTotal: 70, summary: { totalProducts: 0 },
        };
        dashboardApi.fetchDashboardPareto.mockImplementation(async ({ newLimit }) =>
            newLimit ? page : { ...page, newProducts: [first, second] },
        );
        const printSpy = jest.spyOn(pdfMake, 'createPdf').mockReturnValue({ open: jest.fn() });
        render(<SalesDashboard dateRange={{ from: '2026-07-01', to: '2026-07-27' }} showNoe={false} />, {
            wrapper: swrWrapper,
        });
        await waitFor(() => expect(screen.getByText('Nuevo A')).toBeInTheDocument());
        const section = screen.getByText('Productos nuevos (2)').closest('section');
        expect(within(section).queryByText('Nuevo B')).not.toBeInTheDocument();
        expect(within(section.querySelector('tfoot')).getByText('$70,00')).toBeInTheDocument();

        fireEvent.click(within(section).getByText('Valor inventario'));
        await waitFor(() => expect(dashboardApi.fetchDashboardPareto).toHaveBeenCalledWith(
            expect.objectContaining({ newSortBy: 'inventoryValue', newSortDir: 'asc', newLimit: 20 }),
        ));
        fireEvent.change(within(section).getByPlaceholderText('Buscar producto nuevo...'), { target: { value: 'Nuevo' } });
        await waitFor(() => expect(dashboardApi.fetchDashboardPareto).toHaveBeenCalledWith(
            expect.objectContaining({ newSearch: 'Nuevo', newPage: 1 }),
        ));

        fireEvent.click(within(section).getByRole('button', { name: 'Imprimir' }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Imprimir' }));
        await waitFor(() => expect(printSpy).toHaveBeenCalled());
        const printRequest = dashboardApi.fetchDashboardPareto.mock.calls.slice(-1)[0][0];
        expect(printRequest).toEqual(expect.objectContaining({ newSearch: 'Nuevo', newSortBy: 'inventoryValue' }));
        expect(printRequest).not.toHaveProperty('newLimit');
        const body = printSpy.mock.calls[0][0].content[3].table.body;
        expect(body.some((row) => row.includes('Nuevo B'))).toBe(true);
    });

    it('muestra error si el endpoint falla', async () => {
        dashboardApi.fetchDashboardSales.mockRejectedValue(new Error('Network error'));
        render(<SalesDashboard dateRange={{ from: '2026-07-01', to: '2026-07-27' }} showNoe={false} />, {
            wrapper: swrWrapper,
        });
        await waitFor(() => expect(screen.getByText(/Error al cargar/)).toBeInTheDocument());
    });

    it('renderiza KPIs en $0 cuando no hay datos', async () => {
        dashboardApi.fetchDashboardSales.mockResolvedValue({
            kpis: {
                totalRawProfit: 0,
                totalNetProfit: 0,
                totalQuantity: 0,
                totalInvoices: 0,
                avgTicket: 0,
                avgMarginPercent: 0,
                compareRawProfit: null,
                compareNetProfit: null,
                compareQuantity: null,
                compareInvoices: null,
            },
            bestEmployee: null,
            topProducts: [],
            topClients: [],
            groupSalesChart: [],
        });
        render(<SalesDashboard dateRange={{ from: '2000-01-01', to: '2000-01-02' }} showNoe={false} />, {
            wrapper: swrWrapper,
        });
        await waitFor(() => expect(screen.getByText('Venta Bruta')).toBeInTheDocument());
        expect(screen.getAllByText('$0,00').length).toBeGreaterThan(0);
    });

    it('calcula compareFrom/compareTo y los envía al endpoint', async () => {
        render(<SalesDashboard dateRange={{ from: '2026-07-01', to: '2026-07-15' }} showNoe={false} />, {
            wrapper: swrWrapper,
        });
        await waitFor(() => {
            expect(dashboardApi.fetchDashboardSales).toHaveBeenCalledWith(
                expect.objectContaining({
                    from: '2026-07-01',
                    to: '2026-07-15',
                    compareFrom: expect.any(String),
                    compareTo: expect.any(String),
                }),
            );
        });
    });
});
