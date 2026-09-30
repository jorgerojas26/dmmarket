import { fireEvent, render, screen } from '@testing-library/react';
import { useClientsDashboard } from 'hooks/useClients';
import ClientsDashboard from './ClientsDashboard';

jest.mock('hooks/useClients', () => ({ useClientsDashboard: jest.fn() }));
jest.mock('./ParetoChart', () => ({
    __esModule: true,
    default: ({ products, config }) =>
        require('react').createElement(
            'div',
            { 'data-testid': 'pareto-value' },
            `${products[0]?.[config.valueKey]}|${config.valueLabel}`,
        ),
}));
jest.mock('./KpiCard', () => ({ label }) => require('react').createElement('div', null, label));
jest.mock('./PanelHelpTitle', () => ({ title }) => require('react').createElement('h3', null, title));
jest.mock('./RankedList', () => () => null);
jest.mock('./SinFacturarTable', () => () => null);

const mockData = {
    kpis: {},
    monthlyActive: [],
    revenueBySegment: [],
    inactiveBuckets: [],
    coverage: { routes: [] },
    waterfall: null,
    treemapTop50: [],
    abc: { clients: [{ name: 'Cliente por ventas', total_usd: 800 }], summary: {} },
    abcUtility: { clients: [{ name: 'Cliente por utilidad', utilidad: 80 }], summary: {} },
};

describe('ClientsDashboard Pareto modes', () => {
    beforeEach(() => {
        useClientsDashboard.mockReturnValue({ data: mockData, error: null, isLoading: false });
    });

    it('uses the adaptive KPI grid and places Pareto immediately below it', () => {
        const { container } = render(
            <ClientsDashboard dateRange={{ from: '2026-01-01', to: '2026-01-31' }} showNoe={false} />,
        );

        const grid = container.querySelector('.clients-dashboard-kpi-grid');
        expect(grid.children).toHaveLength(9);
        const kpiRow = grid.closest('.row');
        const paretoRow = screen.getByTestId('pareto-value').closest('.row');
        expect(kpiRow.nextElementSibling).toBe(paretoRow);
        expect(paretoRow.nextElementSibling).toContainElement(
            screen.getByRole('heading', { name: 'Clientes Activos por Mes' }),
        );
    });

    it('keeps the adaptive grid when filtering by route', () => {
        const { container } = render(
            <ClientsDashboard dateRange={{ from: '2026-01-01', to: '2026-01-31' }} showNoe={false} ruta="R1" />,
        );

        expect(container.querySelector('.clients-dashboard-kpi-grid').children).toHaveLength(8);
        expect(screen.queryByText('Clientes Sin Ruta')).not.toBeInTheDocument();
        expect(screen.getByText('Cobertura Ruta')).toBeInTheDocument();
        expect(screen.getByTestId('pareto-value')).toBeInTheDocument();
    });

    it('defaults to utility and can switch to total sales', () => {
        render(<ClientsDashboard dateRange={{ from: '2026-01-01', to: '2026-01-31' }} showNoe={false} />);

        expect(screen.getByRole('button', { name: 'Utilidad' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByTestId('pareto-value').textContent).toBe('80|Utilidad');

        fireEvent.click(screen.getByRole('button', { name: 'Ventas totales' }));

        expect(screen.getByRole('button', { name: 'Ventas totales' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByTestId('pareto-value').textContent).toBe('800|Venta total');
    });
});
