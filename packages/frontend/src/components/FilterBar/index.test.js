import { fireEvent, render, screen, within } from '@testing-library/react';
import FilterBar from './index';

const baseFilters = [
    { key: 'ruta', label: 'Ruta', added: false, value: null, render: () => <div>select-ruta</div> },
    { key: 'client', label: 'Cliente', added: false, value: null, render: () => <div>select-cliente</div> },
];

describe('FilterBar', () => {
    const onAdd = jest.fn();
    const onClear = jest.fn();

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('muestra "+ Filtro" y el menú con los tipos disponibles al abrirlo', () => {
        render(<FilterBar filters={baseFilters} onAdd={onAdd} onClear={onClear} />);

        expect(screen.getByRole('button', { name: '+ Filtro' })).toBeInTheDocument();
        expect(screen.queryByText('Cliente')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '+ Filtro' }));
        expect(screen.getByText('Ruta')).toBeInTheDocument();
        expect(screen.getByText('Cliente')).toBeInTheDocument();
    });

    it('añade el filtro elegido y cierra el menú', () => {
        render(<FilterBar filters={baseFilters} onAdd={onAdd} onClear={onClear} />);

        fireEvent.click(screen.getByRole('button', { name: '+ Filtro' }));
        fireEvent.click(screen.getByText('Ruta'));

        expect(onAdd).toHaveBeenCalledWith('ruta');
        expect(screen.queryByText('Cliente')).not.toBeInTheDocument();
    });

    it('no ofrece tipos ya añadidos en el menú', () => {
        const { container } = render(
            <FilterBar
                filters={[{ ...baseFilters[0], added: true }, baseFilters[1]]}
                onAdd={onAdd}
                onClear={onClear}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '+ Filtro' }));
        const menu = container.querySelector('.filter-bar-menu');
        expect(within(menu).queryByText('Ruta')).not.toBeInTheDocument();
        expect(within(menu).getByText('Cliente')).toBeInTheDocument();
    });

    it('muestra el chip de un filtro añadido con su selector y lo quita con ✕', () => {
        const filters = [{ ...baseFilters[0], added: true }, baseFilters[1]];
        render(<FilterBar filters={filters} onAdd={onAdd} onClear={onClear} />);

        // Añadido sin valor → selector expandido
        expect(screen.getByText('select-ruta')).toBeInTheDocument();
        expect(screen.getByLabelText('Quitar filtro Ruta')).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Quitar filtro Ruta'));
        expect(onClear).toHaveBeenCalledWith('ruta');
    });

    it('cierra el menú al hacer click en cualquier lugar fuera', () => {
        render(<FilterBar filters={baseFilters} onAdd={onAdd} onClear={onClear} />);

        fireEvent.click(screen.getByRole('button', { name: '+ Filtro' }));
        expect(screen.getByText('Ruta')).toBeInTheDocument();

        fireEvent.mouseDown(document.body);
        expect(screen.queryByText('Ruta')).not.toBeInTheDocument();
    });

    it('muestra un icono en cada opción del menú', () => {
        const { container } = render(<FilterBar filters={baseFilters} onAdd={onAdd} onClear={onClear} />);

        fireEvent.click(screen.getByRole('button', { name: '+ Filtro' }));
        expect(container.querySelectorAll('.filter-bar-menu-item svg').length).toBe(baseFilters.length);
    });

    it('muestra "Limpiar todos" con 2+ filtros añadidos y limpia todos', () => {
        const filters = [
            { ...baseFilters[0], added: true, value: { value: 1 }, valueLabel: 'Ruta 1' },
            { ...baseFilters[1], added: true, value: { value: 2 }, valueLabel: 'Cliente 2' },
        ];
        const onClearAll = jest.fn();
        render(<FilterBar filters={filters} onAdd={onAdd} onClear={onClear} onClearAll={onClearAll} />);

        const btn = screen.getByRole('button', { name: 'Limpiar todos' });
        expect(btn).toBeInTheDocument();
        fireEvent.click(btn);
        expect(onClearAll).toHaveBeenCalled();
    });

    it('no muestra "Limpiar todos" con un solo filtro añadido', () => {
        const filters = [{ ...baseFilters[0], added: true, value: { value: 1 }, valueLabel: 'Ruta 1' }, baseFilters[1]];
        render(<FilterBar filters={filters} onAdd={onAdd} onClear={onClear} onClearAll={jest.fn()} />);

        expect(screen.queryByRole('button', { name: 'Limpiar todos' })).not.toBeInTheDocument();
    });

    it('contrae el chip a un tag "Label: valor" cuando tiene valor y lo expande al hacer click', () => {
        const filters = [{ ...baseFilters[0], added: true, value: { value: 1 }, valueLabel: 'Ruta 1' }, baseFilters[1]];
        render(<FilterBar filters={filters} onAdd={onAdd} onClear={onClear} />);

        // Contraído: tag con el valor, sin el selector
        expect(screen.getByText('Ruta 1')).toBeInTheDocument();
        expect(screen.queryByText('select-ruta')).not.toBeInTheDocument();

        // Click en el tag → expande el selector para editar
        fireEvent.click(screen.getByText('Ruta 1'));
        expect(screen.getByText('select-ruta')).toBeInTheDocument();
    });
});
