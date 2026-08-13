import { fireEvent, render, screen } from '@testing-library/react';
import Table from './index';

const columns = [{ Header: 'ID', accessor: 'id' }];

const tableElement = (data, deselectSignal, onRowSelect) => (
    <Table
        data={data}
        columns={columns}
        onRowSelect={onRowSelect}
        multiSelect
        getRowId={(row) => row.id}
        preserveSelection
        deselectSignal={deselectSignal}
    />
);

describe('Table — deselección dirigida (deselectSignal)', () => {
    it('elimina una fila seleccionada en la página actual', () => {
        const onRowSelect = jest.fn();
        const { rerender } = render(tableElement([{ id: 'A1' }, { id: 'A2' }], { key: 0, ids: [] }, onRowSelect));

        fireEvent.click(screen.getByText('A1').closest('tr'));
        expect(onRowSelect).toHaveBeenLastCalledWith([{ id: 'A1' }]);

        rerender(tableElement([{ id: 'A1' }, { id: 'A2' }], { key: 1, ids: ['A1'] }, onRowSelect));
        expect(onRowSelect).toHaveBeenLastCalledWith([]);
    });

    it('elimina una fila seleccionada en OTRA página sin crashear (regresión rowsById)', () => {
        const onRowSelect = jest.fn();
        const { rerender } = render(tableElement([{ id: 'A1' }, { id: 'A2' }], { key: 0, ids: [] }, onRowSelect));

        // Seleccionar A1 en la página 1
        fireEvent.click(screen.getByText('A1').closest('tr'));
        expect(onRowSelect).toHaveBeenLastCalledWith([{ id: 'A1' }]);

        // Navegar a la página 2: A1 ya no está en rowsById pero sigue seleccionado
        rerender(tableElement([{ id: 'B1' }, { id: 'B2' }], { key: 0, ids: [] }, onRowSelect));

        // Eliminar A1 desde el modal de selección → no debe crashear
        // (antes: useRowSelect reducer hacía rowsById['A1'].isGrouped → TypeError)
        rerender(tableElement([{ id: 'B1' }, { id: 'B2' }], { key: 1, ids: ['A1'] }, onRowSelect));

        expect(onRowSelect).toHaveBeenLastCalledWith([]);
    });
});

const controlledElement = (data, selectedRows, onRowSelect, onSelectAll, totalRows, onDeselectAll) => (
    <Table
        data={data}
        columns={columns}
        onRowSelect={onRowSelect}
        selectedRows={selectedRows}
        onSelectAll={onSelectAll}
        onDeselectAll={onDeselectAll}
        multiSelect
        getRowId={(row) => row.id}
        pagination={totalRows != null ? { enabled: true, totalRows } : undefined}
    />
);

const headerCheckbox = (container) => container.querySelector('thead input');

describe('Table — selección controlada (selectedRows)', () => {
    it('el click en una fila agrega/quita de la lista del padre', () => {
        const onRowSelect = jest.fn();
        const onSelectAll = jest.fn();
        const { rerender } = render(controlledElement([{ id: 'A1' }, { id: 'A2' }], [], onRowSelect, onSelectAll));

        fireEvent.click(screen.getByText('A1').closest('tr'));
        expect(onRowSelect).toHaveBeenLastCalledWith([{ id: 'A1' }]);

        // El padre actualiza el estado → la fila aparece seleccionada
        rerender(controlledElement([{ id: 'A1' }, { id: 'A2' }], [{ id: 'A1' }], onRowSelect, onSelectAll));
        expect(screen.getByText('A1').closest('tr').className).toContain('row-selected');

        // Click de nuevo la quita
        fireEvent.click(screen.getByText('A1').closest('tr'));
        expect(onRowSelect).toHaveBeenLastCalledWith([]);
    });

    it('el checkbox del header llama onSelectAll cuando no está todo seleccionado', () => {
        const onRowSelect = jest.fn();
        const onSelectAll = jest.fn();
        const { container } = render(
            controlledElement([{ id: 'A1' }, { id: 'A2' }], [{ id: 'A1' }], onRowSelect, onSelectAll, 3),
        );

        const cb = headerCheckbox(container);
        expect(cb.checked).toBe(false);
        expect(cb.indeterminate).toBe(true); // algunos seleccionados

        fireEvent.click(cb);
        expect(onSelectAll).toHaveBeenCalledTimes(1);
        expect(onRowSelect).not.toHaveBeenCalled();
    });

    it('con todo seleccionado el header queda checked y su uncheck delega en onDeselectAll', () => {
        const onRowSelect = jest.fn();
        const onSelectAll = jest.fn();
        const onDeselectAll = jest.fn();
        const { container } = render(
            controlledElement(
                [{ id: 'A1' }, { id: 'A2' }],
                [{ id: 'A1' }, { id: 'A2' }, { id: 'A3' }],
                onRowSelect,
                onSelectAll,
                3,
                onDeselectAll,
            ),
        );

        const cb = headerCheckbox(container);
        expect(cb.checked).toBe(true);

        // El padre es quien resta TODAS las filas del filtro actual (todas las
        // páginas) — la Table no sabe qué hay fuera de la página visible.
        fireEvent.click(cb);
        expect(onDeselectAll).toHaveBeenCalledTimes(1);
        expect(onRowSelect).not.toHaveBeenCalled();
        expect(onSelectAll).not.toHaveBeenCalled();
    });

    it('uncheck sin onDeselectAll cae al fallback: quita solo las filas visibles', () => {
        const onRowSelect = jest.fn();
        const onSelectAll = jest.fn();
        const { container } = render(
            controlledElement(
                [{ id: 'A1' }, { id: 'A2' }],
                [{ id: 'A1' }, { id: 'A2' }, { id: 'A3' }],
                onRowSelect,
                onSelectAll,
                3,
            ),
        );

        const cb = headerCheckbox(container);
        fireEvent.click(cb);
        expect(onRowSelect).toHaveBeenLastCalledWith([{ id: 'A3' }]);
    });

    it('tras deseleccionar las visibles, el click del header vuelve a hacer select all (regresión)', () => {
        const onRowSelect = jest.fn();
        const onSelectAll = jest.fn();
        const { container } = render(
            controlledElement([{ id: 'A1' }, { id: 'A2' }], [{ id: 'A3' }, { id: 'A4' }], onRowSelect, onSelectAll, 2),
        );

        // Las visibles (A1, A2) NO están seleccionadas; el padre conserva A3, A4
        // de un select-all previo con otro filtro.
        const cb = headerCheckbox(container);
        expect(cb.checked).toBe(false);
        expect(cb.indeterminate).toBe(false);

        fireEvent.click(cb);
        expect(onSelectAll).toHaveBeenCalledTimes(1);
    });

    it('una fila de OTRA página aparece seleccionada según el estado del padre', () => {
        const onRowSelect = jest.fn();
        const onSelectAll = jest.fn();
        // Página 2 visible, pero la selección incluye A1 (página 1) y B1
        render(controlledElement([{ id: 'B1' }, { id: 'B2' }], [{ id: 'A1' }, { id: 'B1' }], onRowSelect, onSelectAll));

        expect(screen.getByText('B1').closest('tr').className).toContain('row-selected');
        expect(screen.getByText('B2').closest('tr').className).not.toContain('row-selected');
    });

    it('el click en la celda del checkbox de una fila la selecciona (regresión stopPropagation)', () => {
        const onRowSelect = jest.fn();
        const onSelectAll = jest.fn();
        render(controlledElement([{ id: 'A1' }, { id: 'A2' }], [], onRowSelect, onSelectAll));

        const rowInput = screen.getByText('A1').closest('tr').querySelector('input');
        fireEvent.click(rowInput);

        expect(onRowSelect).toHaveBeenLastCalledWith([{ id: 'A1' }]);
    });
});
