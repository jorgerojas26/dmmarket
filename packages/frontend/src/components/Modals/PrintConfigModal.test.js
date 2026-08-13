import { fireEvent, render, screen, within } from '@testing-library/react';
import PrintConfigModal from './PrintConfigModal';

const COLUMNS = [
    { Header: 'ID', accessor: 'id' },
    { Header: 'Cliente', accessor: 'client' },
    { Header: 'Total', accessor: 'total' },
];

const renderModal = (overrides = {}) => {
    const onPrint = jest.fn();
    const onClose = jest.fn();
    const utils = render(
        <PrintConfigModal
            show
            columns={COLUMNS}
            storageKey="test-tabla"
            onPrint={onPrint}
            onClose={onClose}
            {...overrides}
        />,
    );
    return { ...utils, onPrint, onClose };
};

const printButton = () => screen.getByRole('button', { name: 'Imprimir' });

describe('PrintConfigModal — persistencia por tabla en localStorage', () => {
    beforeEach(() => localStorage.clear());

    it('guarda columnas seleccionadas, orientación y moneda al imprimir', () => {
        renderModal();

        // Desmarcar "Cliente" y elegir Bs + horizontal
        fireEvent.click(screen.getByRole('checkbox', { name: 'Cliente' }));
        fireEvent.click(screen.getByRole('button', { name: 'Bs' }));
        fireEvent.click(screen.getByRole('button', { name: 'Horizontal' }));

        fireEvent.click(printButton());

        const saved = JSON.parse(localStorage.getItem('print-config:test-tabla'));
        expect(saved.columns).toEqual(['id', 'total']);
        expect(saved.currency).toBe('Bs');
        expect(saved.orientation).toBe('landscape');
    });

    it('persiste al cerrar el modal SIN imprimir (X/Cancelar)', () => {
        renderModal();

        fireEvent.click(screen.getByRole('checkbox', { name: 'Cliente' }));
        fireEvent.click(screen.getByRole('button', { name: 'Horizontal' }));

        const saved = JSON.parse(localStorage.getItem('print-config:test-tabla'));
        expect(saved.columns).toEqual(['id', 'total']);
        expect(saved.orientation).toBe('landscape');
    });

    it('restaura la config guardada al volver a abrir (mismo storageKey)', () => {
        localStorage.setItem(
            'print-config:test-tabla',
            JSON.stringify({
                columns: [{ accessor: 'total', Header: 'Total' }],
                orientation: 'landscape',
                currency: 'Bs',
                sortBy: [],
            }),
        );

        renderModal();

        expect(screen.getByRole('checkbox', { name: 'ID' }).getAttribute('aria-checked')).toBe('false');
        expect(screen.getByRole('checkbox', { name: 'Cliente' }).getAttribute('aria-checked')).toBe('false');
        expect(screen.getByRole('checkbox', { name: 'Total' }).getAttribute('aria-checked')).toBe('true');
        expect(screen.getByRole('radio', { name: /Bs/ })).toBeChecked();
        expect(screen.getByRole('radio', { name: /Horizontal/ })).toBeChecked();
    });

    it('descarta columnas guardadas que ya no existen y cae a defaults si no queda ninguna', () => {
        localStorage.setItem(
            'print-config:test-tabla',
            JSON.stringify({
                columns: [{ accessor: 'columna-vieja', Header: 'Vieja' }],
                orientation: 'landscape',
                currency: 'Bs',
                sortBy: [],
            }),
        );

        renderModal();

        // Ninguna columna guardada es válida → todas seleccionadas (default)
        expect(screen.getByRole('checkbox', { name: 'ID' }).getAttribute('aria-checked')).toBe('true');
        expect(screen.getByRole('checkbox', { name: 'Cliente' }).getAttribute('aria-checked')).toBe('true');
        expect(screen.getByRole('checkbox', { name: 'Total' }).getAttribute('aria-checked')).toBe('true');
    });

    it('sin storageKey no persiste nada', () => {
        const { onPrint } = renderModal({ storageKey: undefined });
        fireEvent.click(screen.getByRole('checkbox', { name: 'Cliente' }));
        fireEvent.click(printButton());

        expect(onPrint).toHaveBeenCalled();
        expect(localStorage.getItem('print-config:test-tabla')).toBeNull();
    });
});
