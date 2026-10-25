import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CurrencyRateProvider } from 'context/currency_rate';
import { SWRConfig } from 'swr';
import DespachoView from './DespachoView';

const invoice = (id) => ({
    invoiceId: String(id).padStart(10, '0'),
    client: `Cliente ${id}`,
    rif: `J-${id}`,
    createdAt: '2026-10-25',
    products: [],
    total: 0,
    utilidad: 0,
});

it('selecciona todas las facturas aunque el total de la tabla haya quedado desactualizado', async () => {
    const originalFetch = global.fetch;
    let invoices = Array.from({ length: 68 }, (_, index) => invoice(68 - index));
    const requests = [];
    global.fetch = jest.fn(async (url) => {
        const { pathname, searchParams } = new URL(url, 'http://localhost');
        if (pathname !== '/api/invoices') {
            return { ok: true, json: async () => [{ Id_Ruta: 'VP', Nombre: 'Valle de la pascua' }] };
        }
        requests.push(searchParams);
        const page = Number(searchParams.get('page') || 1);
        const limit = Number(searchParams.get('limit') || 20);
        return {
            ok: true,
            json: async () => ({
                data: searchParams.get('all') === 'true' ? invoices : invoices.slice((page - 1) * limit, page * limit),
                pagination: { page, limit, total: invoices.length },
                totals: { total: 0, utilidad: 0 },
            }),
        };
    });

    try {
        const { container } = render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false }}>
                <CurrencyRateProvider>
                    <DespachoView dateRange={{ from: '2026-10-25', to: '2026-10-25' }} showNoe={false} isActive />
                </CurrencyRateProvider>
            </SWRConfig>,
        );
        userEvent.click(screen.getByLabelText('Ruta'));
        userEvent.click(await screen.findByText('Valle de la pascua (VP)'));
        await waitFor(() => expect(requests.some((params) => params.get('ruta') === 'VP')).toBe(true));
        await screen.findByText('Mostrando 1–50 de 68 resultados');
        userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
        await screen.findByText('Cliente 1');
        invoices = [invoice(70), invoice(69), ...invoices];
        const table = container.querySelector('table');
        fireEvent.click(within(table).getAllByRole('checkbox')[0]);
        await screen.findByRole('button', { name: 'Ver selección (70)' });
        await screen.findByText('Mostrando 51–70 de 70 resultados');
        await waitFor(() => {
            const checkboxes = within(table).getAllByRole('checkbox');
            expect(checkboxes.length).toBe(21);
            checkboxes.forEach((checkbox) => {
                expect(checkbox).toBeChecked();
            });
        });
        expect(requests.some((params) => params.get('all') === 'true' && params.get('ruta') === 'VP')).toBe(true);
        fireEvent.click(within(table).getAllByRole('checkbox')[0]);
        await waitFor(() => expect(screen.queryByRole('button', { name: /Ver selección/ })).not.toBeInTheDocument());
    } finally {
        global.fetch = originalFetch;
    }
});
