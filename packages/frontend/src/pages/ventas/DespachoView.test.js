import { diffSelection, unionSelection } from './DespachoView';

describe('unionSelection — select all suma al historial acumulado', () => {
    it('agrega las filas del filtro actual a la selección previa', () => {
        const prev = [{ invoiceId: 'A1' }, { invoiceId: 'A2' }];
        const incoming = [{ invoiceId: 'B1' }, { invoiceId: 'B2' }];
        expect(unionSelection(prev, incoming, (inv) => inv.invoiceId)).toEqual([
            { invoiceId: 'A1' },
            { invoiceId: 'A2' },
            { invoiceId: 'B1' },
            { invoiceId: 'B2' },
        ]);
    });

    it('no duplica filas ya seleccionadas (overlap)', () => {
        const prev = [{ invoiceId: 'A1' }, { invoiceId: 'A2' }, { invoiceId: 'A3' }];
        const incoming = [{ invoiceId: 'A1' }, { invoiceId: 'A2' }];
        expect(unionSelection(prev, incoming, (inv) => inv.invoiceId)).toEqual([
            { invoiceId: 'A1' },
            { invoiceId: 'A2' },
            { invoiceId: 'A3' },
        ]);
    });

    it('con selección vacía devuelve solo las entrantes', () => {
        const incoming = [{ invoiceId: 'B1' }];
        expect(unionSelection([], incoming, (inv) => inv.invoiceId)).toEqual([{ invoiceId: 'B1' }]);
    });
});

describe('diffSelection — deselect all resta todo el filtro actual (todas las páginas)', () => {
    it('resta todas las filas del filtro y conserva el resto', () => {
        const prev = [
            { invoiceId: 'A1' },
            { invoiceId: 'A2' },
            { invoiceId: 'A3' },
            { invoiceId: 'B1' },
            { invoiceId: 'B2' },
        ];
        const filtered = [{ invoiceId: 'A1' }, { invoiceId: 'A2' }, { invoiceId: 'A3' }];
        expect(diffSelection(prev, filtered, (inv) => inv.invoiceId)).toEqual([
            { invoiceId: 'B1' },
            { invoiceId: 'B2' },
        ]);
    });

    it('no toca filas fuera del filtro', () => {
        const prev = [{ invoiceId: 'A1' }, { invoiceId: 'X1' }];
        const filtered = [{ invoiceId: 'A1' }];
        expect(diffSelection(prev, filtered, (inv) => inv.invoiceId)).toEqual([{ invoiceId: 'X1' }]);
    });

    it('con filtro vacío conserva todo', () => {
        const prev = [{ invoiceId: 'A1' }];
        expect(diffSelection(prev, [], (inv) => inv.invoiceId)).toEqual([{ invoiceId: 'A1' }]);
    });
});
