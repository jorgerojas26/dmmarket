import { ResponsivePie } from '@nivo/pie';
import { render, screen, waitFor, within } from '@testing-library/react';
import { usePurchasesDashboard, usePurchasesPareto } from 'hooks/usePurchases';
import PurchasesDashboard from './PurchasesDashboard';

jest.mock('@nivo/pie', () => ({ ResponsivePie: jest.fn(() => <div data-testid="pie" />) }));
jest.mock('hooks/usePurchases', () => ({
    usePurchasesDashboard: jest.fn(),
    usePurchasesPareto: jest.fn(),
}));
jest.mock('./ParetoChart', () => () => <div data-testid="pareto-chart" />);
jest.mock('./RankedList', () => () => <div />);

const data = {
    kpis: {
        totalPurchased: 25000,
        totalQuantity: 200,
        totalInvoices: 50,
        avgTicket: 500,
        avgUnitCost: 125,
        comparePurchased: 22000,
        compareQuantity: 180,
        compareInvoices: 45,
    },
    bestProvider: { name: 'Proveedor Norte', totalPurchased: 9000 },
    groupPurchasesChart: [
        { categoria: 'Categoría menor', totalPurchased: 100 },
        { categoria: 'Categoría principal', totalPurchased: 300 },
    ],
    topProducts: [],
    topProviders: [],
};

beforeEach(() => {
    ResponsivePie.mockImplementation(() => <div data-testid="pie" />);
    usePurchasesDashboard.mockReturnValue({ data, isLoading: false });
    usePurchasesPareto.mockReturnValue({ data: { products: [], summary: null }, isLoading: false });
});

afterEach(() => jest.clearAllMocks());

it('groups compact purchase KPIs, category breakdown, and best provider into one responsive overview', async () => {
    const { container } = render(<PurchasesDashboard dateRange={{ from: '2026-07-01', to: '2026-07-27' }} />);
    await waitFor(() => expect(screen.getByText('Proveedor Norte')).toBeInTheDocument());

    const summary = container.querySelector('.purchases-dashboard-summary');
    const grid = summary.querySelector('.purchases-dashboard-kpi-grid');
    const insights = summary.querySelector('.purchases-dashboard-insights');
    const bestProvider = screen.getByText('Proveedor Norte').closest('.purchases-dashboard-best-provider');
    expect(grid).toHaveClass('dashboard-kpi-grid-compact');
    expect(grid.children).toHaveLength(5);
    expect(grid.querySelectorAll('.dashboard-kpi-card')).toHaveLength(5);
    expect(grid.nextElementSibling).toBe(insights);
    expect(insights).toContainElement(bestProvider);
    expect(grid).not.toContainElement(bestProvider);
    expect(within(insights).getByText('Categorías')).toBeInTheDocument();
    expect(within(insights).getByRole('list', { name: 'Categorías de compras' })).toBeInTheDocument();
    expect(container.querySelector('.dashboard-best-employee')).not.toBeInTheDocument();

    const pieData = ResponsivePie.mock.calls[0][0].data;
    expect(pieData.map((item) => item.id)).toEqual(['Categoría principal', 'Categoría menor']);
});
