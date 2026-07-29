import { render, screen, waitFor } from '@testing-library/react';
import * as dashboardApi from 'api/dashboard';
import { SWRConfig } from 'hooks/swr-wrapper';
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
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>{children}</SWRConfig>
);

describe('SalesDashboard', () => {
    beforeEach(() => {
        dashboardApi.fetchDashboardSales.mockResolvedValue(mockData);
        dashboardApi.fetchDashboardPareto.mockResolvedValue({ products: [], summary: null });
    });

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
