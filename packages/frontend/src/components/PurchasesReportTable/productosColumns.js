import { formatCurrency, formatQuantity } from 'utils/format';

const productosColumns = [
    {
        Header: 'Producto',
        accessor: 'product',
    },
    {
        Header: 'Unidades',
        accessor: 'quantity',
        Footer: ({ data, summary }) => {
            // `summary` es el total de todas las páginas (server-side); si no
            // viene, se reduce la página visible (fallback).
            const total = summary != null ? Number(summary) : data.reduce((acc, cur) => acc + (cur.quantity || 0), 0);
            return formatQuantity(total);
        },
    },
    {
        Header: 'Monto',
        accessor: 'monto',
        Cell: ({ value }) => (value != null ? formatCurrency(value) : ''),
        Footer: ({ data, summary }) => {
            const total = summary != null ? Number(summary) : data.reduce((acc, cur) => acc + (cur.monto || 0), 0);
            return formatCurrency(total);
        },
    },
    {
        Header: 'Costo Prom.',
        accessor: 'avgUnitCost',
        Cell: ({ value }) => (value != null ? formatCurrency(value) : ''),
    },
];

export default productosColumns;
