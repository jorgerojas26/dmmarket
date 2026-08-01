import { DateTime } from 'luxon';

const formatPeso = (value) => {
    const num = Number(value);
    if (Number.isNaN(num) || num === 0) return '';
    return num.toLocaleString(undefined, { maximumFractionDigits: 3 });
};

/**
 * Builds the products PDF. `config` comes from the print config dialog:
 * `{ columns: selected column definitions, orientation: 'landscape' | 'portrait' }`.
 */
const pdfschema = (productList, { quantityTotal, totalSummary, pesoTotal, currency }, config = {}) => {
    // Column metadata for the PDF, keyed by accessor (order defines layout).
    const pdfColumns = [
        { accessor: 'group', label: 'CATEGORÍA', width: 85, render: (p) => p.group },
        { accessor: 'productId', label: 'ID', width: 40, render: (p) => String(p.productId ?? '') },
        { accessor: 'product', label: 'PRODUCTO', width: '*', render: (p) => p.product },
        { accessor: 'quantity', label: 'CANTIDAD', width: 'auto', render: (p) => p.quantity },
        { accessor: 'peso', label: 'PESO', width: 'auto', render: (p) => formatPeso(p.peso) },
        { accessor: 'total', label: `TOTAL (${currency})`, width: 'auto', render: (p) => p.total },
    ];

    const selectedAccessors = new Set((config?.columns || []).map((col) => col.accessor));
    const selected =
        selectedAccessors.size > 0 ? pdfColumns.filter((col) => selectedAccessors.has(col.accessor)) : pdfColumns;

    return {
        content: [
            { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
            {
                text: 'CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.',
                style: 'header',
            },
            { text: 'R.I.F.: J-41270446-0', style: 'header' },
            { text: DateTime.local().toFormat('dd/MM/yyyy'), style: 'header' },
            {
                style: 'table',
                table: {
                    widths: selected.map((col) => col.width),
                    body: [
                        selected.map((col) => col.label),
                        ...productList.map((p) => selected.map((col) => col.render(p))),
                        selected.map((col) => {
                            if (col.accessor === 'quantity') return { text: quantityTotal, bold: true };
                            if (col.accessor === 'peso') return { text: formatPeso(pesoTotal), bold: true };
                            if (col.accessor === 'total') return { text: `${currency} ${totalSummary}`, bold: true };
                            return '';
                        }),
                    ],
                },
            },
        ],
        styles: {
            header: {
                alignment: 'center',
            },
            table: {
                margin: [0, 20, 0, 0],
            },
        },

        pageMargins: 40,
        pageSize: 'LETTER',
        pageOrientation: config?.orientation || 'portrait',
    };
};

export default pdfschema;
