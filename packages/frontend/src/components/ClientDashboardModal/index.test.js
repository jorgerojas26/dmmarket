import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fetchInvoiceDetail } from 'api/invoice';
import { ShowNoeContext } from 'context/show_noe';
import { useClientSales, useClientSummary } from 'hooks/useClients';
import ClientDashboardModal from './index';

jest.mock('api/invoice', () => ({ fetchInvoiceDetail: jest.fn() }));
jest.mock('hooks/useClients', () => ({
    useClientSales: jest.fn(),
    useClientSummary: jest.fn(),
}));

const sale = {
    idFactura: 101,
    vendedor: 'Vendedor A',
    fecha: '2026-05-10',
    monto: 500,
    utilidad: 125,
};

const detail = {
    idFactura: 101,
    fecha: '2026-05-10',
    vendedor: 'Vendedor A',
    total: 500,
    utilidad: 125,
    productos: [{ descripcion: 'Producto de prueba', cantidad: 2, precio: 250, subtotal: 500, utilidad: 125 }],
};

const wrapper = ({ children }) => (
    <ShowNoeContext.Provider value={{ showNoe: false }}>{children}</ShowNoeContext.Provider>
);

describe('ClientDashboardModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        useClientSummary.mockReturnValue({
            data: { totalAmount: 500, totalCount: 0, avgTicket: null, avgDaysBetweenSales: null },
            isLoading: false,
        });
        useClientSales.mockImplementation((clientId, { limit }, enabled) => ({
            data: enabled && limit === 50 ? { data: [sale], total: 1 } : undefined,
            isLoading: false,
        }));
        fetchInvoiceDetail.mockResolvedValue(detail);
    });

    it('opens the invoice details when a sales row is clicked', async () => {
        render(<ClientDashboardModal show client={{ IdCliente: 1, Empresa: 'Cliente A' }} onClose={jest.fn()} />, {
            wrapper,
        });

        fireEvent.click(await screen.findByText('Vendedor A'));

        await waitFor(() => expect(fetchInvoiceDetail).toHaveBeenCalledWith(101, false));
        expect(await screen.findByText('Venta #101')).toBeInTheDocument();
        expect(screen.getByText('Producto de prueba')).toBeInTheDocument();
    });
});
