import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useClientRoutes } from 'hooks/useClients';
import { DateTime } from 'luxon';
import { MemoryRouter } from 'react-router-dom';
import ClientesPage from './index';

jest.mock('hooks/useClients', () => ({ useClientRoutes: jest.fn() }));
jest.mock('components/ClientDashboardModal', () => () => null);
jest.mock('components/Sidebar', () => () => null);
jest.mock('components/ClientsTable', () => () => null);
jest.mock('components/Dashboard/ClientsDashboard', () => ({ ruta, dateRange }) => (
    <div data-testid="dashboard-filters">{JSON.stringify({ ruta, dateRange })}</div>
));

const renderPage = (view = 'dashboard') =>
    render(
        <MemoryRouter initialEntries={[`/clientes?view=${view}`]}>
            <ClientesPage />
        </MemoryRouter>,
    );

beforeEach(() => {
    useClientRoutes.mockReturnValue({
        data: [{ Id_Ruta: 'R1', Nombre: 'Ruta norte con nombre largo' }],
        isLoading: false,
    });
});

it('groups the dashboard title and real filters in the responsive header', () => {
    const { container } = renderPage();
    const header = screen.getByRole('heading', { name: 'Dashboard de Clientes' }).closest('.report-page-header');
    expect(header).toContainElement(screen.getByLabelText('Ruta'));
    expect(header).toContainElement(container.querySelector('.date-range-trigger'));
    expect(container.querySelector('.clients-page-route-filter')).not.toHaveAttribute('style');

    userEvent.click(screen.getByLabelText('Ruta'));
    userEvent.click(screen.getByText('Ruta norte con nombre largo (R1)'));
    expect(JSON.parse(screen.getByTestId('dashboard-filters').textContent).ruta).toBe('R1');

    fireEvent.click(container.querySelector('.date-range-trigger'));
    userEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    const today = DateTime.now().toISODate();
    expect(JSON.parse(screen.getByTestId('dashboard-filters').textContent).dateRange).toEqual({ from: today, to: today });
    userEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(container.querySelector('.date-range-dropdown')).not.toBeInTheDocument();
});

it('applies the same filter layout to the client breakdown', () => {
    const { container } = renderPage('clients');
    expect(screen.getByRole('heading', { name: 'Desglose de Clientes' }).closest('.report-page-header')).toBeInTheDocument();
    const filters = container.querySelector('.report-page-filters');
    expect(filters).toContainElement(screen.getByLabelText('Ruta'));
    expect(filters).toContainElement(container.querySelector('.date-range-trigger'));
});
