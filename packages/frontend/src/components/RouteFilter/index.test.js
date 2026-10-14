import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useClientRoutes } from 'hooks/useClients';
import { useState } from 'react';
import RouteFilter from './index';

jest.mock('hooks/useClients', () => ({ useClientRoutes: jest.fn() }));

const routes = [
    { Id_Ruta: 'R1', Nombre: 'Norte' },
    { Id_Ruta: 'R2', Nombre: 'R2' },
    { Id_Ruta: 'R3', Nombre: null },
];

beforeEach(() => {
    jest.clearAllMocks();
    useClientRoutes.mockReturnValue({ data: routes, isLoading: false });
});

it('loads the official catalog and shows route names with their IDs without duplicating identical names', () => {
    render(<RouteFilter onChange={jest.fn()} />);
    expect(useClientRoutes).toHaveBeenCalledWith(false, true);
    userEvent.click(screen.getByLabelText('Ruta'));
    expect(screen.getByText('Norte (R1)')).toBeVisible();
    expect(screen.getByText('R2')).toBeVisible();
    expect(screen.getByText('R3')).toBeVisible();
    expect(screen.queryByText('R2 (R2)')).not.toBeInTheDocument();
});

it('uses the official name for an ID-only selected value and keeps deep-link labels while loading', () => {
    const { rerender } = render(<RouteFilter value={{ value: 'R1', label: 'R1' }} onChange={jest.fn()} />);
    expect(screen.getByText('Norte (R1)')).toBeVisible();
    useClientRoutes.mockReturnValue({ isLoading: true });
    rerender(<RouteFilter value={{ value: 'R1', label: 'Norte (R1)' }} onChange={jest.fn()} />);
    expect(screen.getByText('Norte (R1)')).toBeVisible();
});

it('passes the selected ID to its parent and allows clearing the route', () => {
    const change = jest.fn();
    function ControlledFilter() {
        const [value, setValue] = useState(null);
        return (
            <RouteFilter
                value={value}
                onChange={(option) => {
                    setValue(option);
                    change(option);
                }}
            />
        );
    }
    render(<ControlledFilter />);
    const input = screen.getByLabelText('Ruta');
    userEvent.click(input);
    userEvent.click(screen.getByText('Norte (R1)'));
    expect(change).toHaveBeenLastCalledWith({ value: 'R1', label: 'Norte (R1)' });
    fireEvent.keyDown(screen.getByLabelText('Ruta'), { key: 'Backspace', code: 'Backspace', keyCode: 8 });
    expect(change).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Todas las rutas')).toBeVisible();
});

it('preserves the module source and inactive-view loading controls', () => {
    render(<RouteFilter showNoe enabled={false} onChange={jest.fn()} placeholder="Seleccionar ruta" />);
    expect(useClientRoutes).toHaveBeenCalledWith(true, false);
    expect(screen.getByText('Seleccionar ruta')).toBeVisible();
});

it('distinguishes an unavailable catalog from an empty one without crashing', () => {
    useClientRoutes.mockReturnValue({ data: { error: 'Error al obtener las rutas' }, isLoading: false });
    const { rerender } = render(<RouteFilter onChange={jest.fn()} />);
    userEvent.click(screen.getByLabelText('Ruta'));
    expect(screen.getByText('No se pudieron cargar las rutas')).toBeVisible();
    useClientRoutes.mockReturnValue({ data: [], isLoading: false });
    rerender(<RouteFilter onChange={jest.fn()} />);
    expect(screen.getByText('Sin rutas')).toBeVisible();
    useClientRoutes.mockReturnValue({ error: new Error('Sin conexión'), isLoading: false });
    rerender(<RouteFilter onChange={jest.fn()} />);
    expect(screen.getByText('No se pudieron cargar las rutas')).toBeVisible();
});
