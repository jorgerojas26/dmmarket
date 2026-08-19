const columns = [
    {
        Header: 'Producto',
        accessor: 'product',
    },
    {
        Header: 'Cantidad',
        accessor: 'quantity',
        Footer: ({ data, summary }) => {
            // `summary` es el total de todas las páginas (server-side); si no
            // viene, se reduce la página visible (fallback).
            const total = summary != null ? Number(summary) : data.reduce((acc, current) => acc + current.quantity, 0);
            return Number(total).toFixed(2);
        },
    },
    {
        Header: 'Bruto',
        accessor: 'rawProfit',
        Cell: ({ value }) => {
            return value != null ? `$${value.toLocaleString()}` : '';
        },
        Footer: ({ data, summary }) => {
            const total = summary != null ? Number(summary) : data.reduce((acc, current) => acc + current.rawProfit, 0);
            return `$${Number(total.toFixed(2)).toLocaleString()}`;
        },
    },
    {
        Header: 'Utilidad',
        accessor: 'netProfit',
        Cell: ({ value }) => {
            return value != null ? `$${value.toLocaleString()}` : '';
        },
        Footer: ({ data, summary }) => {
            const total = summary != null ? Number(summary) : data.reduce((acc, current) => acc + current.netProfit, 0);
            return `$${Number(total.toFixed(2)).toLocaleString()}`;
        },
    },
    {
        Header: 'Promedio',
        accessor: 'averageProfitPercent',
        Cell: ({ value }) => {
            return `${value}%`;
        },
    },
];

export default columns;
