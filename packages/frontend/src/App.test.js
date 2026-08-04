import { render, screen } from '@testing-library/react';
import { CurrencyRateProvider } from 'context/currency_rate';
import { ShowNoesProvider } from 'context/show_noe';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

// Mock the currency rates hook — App only uses it to set a default currency.
jest.mock('hooks/useCurrencyRates', () => ({
    useCurrencyRates: () => ({ data: null }),
}));

// Mock pages so the test focuses on routing + navbar wiring.
jest.mock('pages/ventas', () => () => <div>VENTAS_PAGE</div>);
jest.mock('pages/compras', () => () => <div>COMPRAS_PAGE</div>);
jest.mock('pages/clientes', () => () => <div>CLIENTES_PAGE</div>);
jest.mock('./pages/proveedores', () => () => <div>PROVEEDORES_PAGE</div>);

const renderAt = (path) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <CurrencyRateProvider>
                <ShowNoesProvider>
                    <App />
                </ShowNoesProvider>
            </CurrencyRateProvider>
        </MemoryRouter>,
    );

describe('App navigation', () => {
    it('shows "compras" in the navbar and hides "productos"', () => {
        renderAt('/compras');
        expect(screen.getByText('compras')).toBeInTheDocument();
        expect(screen.queryByText('productos')).not.toBeInTheDocument();
    });

    it('renders the compras page at /compras', () => {
        renderAt('/compras');
        expect(screen.getByText('COMPRAS_PAGE')).toBeInTheDocument();
    });

    it('renders nothing at /productos (route removed)', () => {
        renderAt('/productos');
        expect(screen.queryByText('PRODUCTOS_PAGE')).not.toBeInTheDocument();
        expect(screen.getByText('SISTEMA DE REPORTES')).toBeInTheDocument();
    });
});
