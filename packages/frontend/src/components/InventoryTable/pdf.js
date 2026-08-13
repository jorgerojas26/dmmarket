import { DateTime } from 'luxon';

const formatPrice = (value) => {
    const num = Number(value);
    if (Number.isNaN(num)) return '';
    return num.toFixed(2);
};

const formatStock = (value) => {
    const num = Number(value);
    if (Number.isNaN(num)) return '';
    return num.toFixed(2);
};

/**
 * Builds the inventory PDF. `config` comes from the print config dialog:
 * `{ columns: selected column definitions, orientation, currency }`.
 * `stockTotal`/`valueTotal` are computed over the (already stock-filtered)
 * list passed in `productList`.
 */
const pdfschema = (productList, { stockTotal, valueTotal, currency }, config = {}) => {
    // Column metadata for the PDF, keyed by accessor (order defines layout).
    const pdfColumns = [
        { accessor: 'IdProducto', label: 'ID', width: 45, render: (p) => String(p.IdProducto ?? '') },
        { accessor: 'Grupo', label: 'CATEGORÍA', width: 90, render: (p) => p.Grupo ?? '' },
        { accessor: 'Descripcion', label: 'PRODUCTO', width: '*', render: (p) => p.Descripcion ?? '' },
        { accessor: 'Proveedor', label: 'PROVEEDOR', width: 'auto', render: (p) => p.Proveedor ?? '' },
        {
            accessor: 'PrecioA',
            label: `PRECIO (${currency})`,
            width: 'auto',
            render: (p) => (p.PrecioA != null ? formatPrice(p.PrecioA) : ''),
        },
        { accessor: 'Existencia', label: 'STOCK', width: 'auto', render: (p) => formatStock(p.Existencia) },
    ];

    const selectedAccessors = new Set((config?.columns || []).map((col) => col.accessor));
    const selected =
        selectedAccessors.size > 0 ? pdfColumns.filter((col) => selectedAccessors.has(col.accessor)) : pdfColumns;

    const hasStock = selected.some((col) => col.accessor === 'Existencia');
    const hasPrice = selected.some((col) => col.accessor === 'PrecioA');

    return {
        content: [
            { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
            {
                text: 'CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.',
                style: 'header',
            },
            { text: 'R.I.F.: J-41270446-0', style: 'header' },
            { text: `INVENTARIO — ${DateTime.local().toFormat('dd/MM/yyyy')}`, style: 'header' },
            {
                style: 'table',
                table: {
                    widths: selected.map((col) => col.width),
                    body: [
                        selected.map((col) => col.label),
                        ...productList.map((p) => selected.map((col) => col.render(p))),
                    ],
                },
            },
            {
                style: 'summary',
                text: [
                    `Total de productos: ${productList.length}`,
                    hasStock ? ` — Stock total: ${Number(stockTotal || 0).toFixed(2)}` : '',
                    hasPrice ? ` — Valor total: ${currency} ${formatPrice(valueTotal || 0)}` : '',
                ].join(''),
            },
        ],
        styles: {
            header: {
                alignment: 'center',
            },
            table: {
                margin: [0, 20, 0, 0],
            },
            summary: {
                margin: [0, 12, 0, 0],
                fontSize: 10,
            },
        },

        pageMargins: 40,
        pageSize: 'LETTER',
        pageOrientation: config?.orientation || 'landscape',
    };
};

export default pdfschema;
