import { DateTime } from 'luxon';

const formatPeso = (value) => {
    const num = Number(value);
    if (Number.isNaN(num) || num === 0) return '';
    return num.toLocaleString(undefined, { maximumFractionDigits: 3 });
};

const pdfschema = (productList, quantityTotal, totalSummary, pesoTotal, currency) => ({
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
                widths: [85, '*', 'auto', 'auto', 'auto'],
                body: [
                    ['CATEGORÍA', 'PRODUCTO', 'CANTIDAD', 'PESO', `TOTAL (${currency})`],
                    ...productList.map(({ group, product, quantity, peso, total }) => [
                        group,
                        product,
                        quantity,
                        formatPeso(peso),
                        total,
                    ]),
                    [
                        '',
                        '',
                        { text: quantityTotal, bold: true },
                        { text: formatPeso(pesoTotal), bold: true },
                        { text: `${currency} ${totalSummary}`, bold: true },
                    ],
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
});

export default pdfschema;
