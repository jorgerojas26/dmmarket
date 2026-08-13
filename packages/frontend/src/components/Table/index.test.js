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
