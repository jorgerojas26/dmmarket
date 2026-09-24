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
jest.mock('./KpiCard', () => () => null);
jest.mock('./PanelHelpTitle', () => () => null);
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

    it('defaults to utility and can switch to total sales', () => {
        render(<ClientsDashboard dateRange={{ from: '2026-01-01', to: '2026-01-31' }} showNoe={false} />);

        expect(screen.getByRole('button', { name: 'Utilidad' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByTestId('pareto-value').textContent).toBe('80|Utilidad');

        fireEvent.click(screen.getByRole('button', { name: 'Ventas totales' }));

        expect(screen.getByRole('button', { name: 'Ventas totales' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByTestId('pareto-value').textContent).toBe('800|Venta total');
    });
});
