import { render, screen } from '@testing-library/react';
import KpiCard from './KpiCard';

describe('KpiCard', () => {
    it('muestra el label y valor formateado', () => {
        render(<KpiCard label="Venta Bruta" value="$12,450,000" />);
        expect(screen.getByText('Venta Bruta')).toBeInTheDocument();
        expect(screen.getByText('$12,450,000')).toBeInTheDocument();
    });

    it('muestra \u25B2 con clase trend-up cuando comparison.isPositive es true', () => {
        render(<KpiCard label="Venta Bruta" value="$100" comparison={{ pct: '25.0', isPositive: true }} />);
        const indicator = screen.getByText(/\u25B2/);
        expect(indicator).toBeInTheDocument();
        expect(indicator).toHaveClass('trend-arrow');
        const trend = indicator.closest('.dashboard-kpi-trend');
        expect(trend).toHaveClass('trend-up');
    });

    it('muestra \u25BC con clase trend-down cuando comparison.isPositive es false', () => {
        render(<KpiCard label="Venta Bruta" value="$80" comparison={{ pct: '20.0', isPositive: false }} />);
        const indicator = screen.getByText(/\u25BC/);
        expect(indicator).toBeInTheDocument();
        expect(indicator).toHaveClass('trend-arrow');
        const trend = indicator.closest('.dashboard-kpi-trend');
        expect(trend).toHaveClass('trend-down');
    });

    it('no muestra indicador si comparison es undefined', () => {
        render(<KpiCard label="Margen %" value="32.5%" />);
        expect(screen.queryByText(/\u25B2/)).not.toBeInTheDocument();
        expect(screen.queryByText(/\u25BC/)).not.toBeInTheDocument();
    });

    it('no muestra indicador si comparison es null', () => {
        render(<KpiCard label="Venta Bruta" value="$100" comparison={null} />);
        expect(screen.queryByText(/\u25B2/)).not.toBeInTheDocument();
        expect(screen.queryByText(/\u25BC/)).not.toBeInTheDocument();
    });

    it('muestra spinner cuando loading es true', () => {
        render(<KpiCard label="Venta Bruta" value="$100" loading={true} />);
        expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
    });
});
