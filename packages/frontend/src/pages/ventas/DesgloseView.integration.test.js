import { render, waitFor } from '@testing-library/react';
import { CurrencyRateProvider } from 'context/currency_rate';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import DesgloseView from './DesgloseView';

jest.mock('auth/context', () => ({
    useAuth: () => ({ session: { permissions: [{ capability: 'sales.read', scope: 'global' }] }, can: () => true }),
}));

it('consulta las facturas de desglose por ID descendente por defecto', async () => {
    const originalFetch = global.fetch;
    const requests = [];
    global.fetch = jest.fn(async (url) => {
        requests.push(new URL(url, 'http://localhost'));
        return {
            ok: true,
            json: async () => ({ data: [], pagination: { page: 1, limit: 50, total: 0 } }),
        };
    });
    try {
        render(
            <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false }}>
                <MemoryRouter initialEntries={['/ventas?dFrom=2026-10-25&dTo=2026-10-25']}>
                    <CurrencyRateProvider>
                        <DesgloseView isActive />
                    </CurrencyRateProvider>
                </MemoryRouter>
            </SWRConfig>,
        );
        await waitFor(() => {
            const request = requests.find((url) => url.pathname === '/api/sales/facturas');
            expect(request).toBeDefined();
            expect(request.searchParams.get('sortBy')).toBe('invoiceId');
            expect(request.searchParams.get('sortDir')).toBe('desc');
        });
    } finally {
        global.fetch = originalFetch;
    }
});
