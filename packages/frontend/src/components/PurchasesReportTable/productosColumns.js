const productosColumns = [
    {
        Header: 'Producto',
        accessor: 'product',
    },
    {
        Header: 'Unidades',
        accessor: 'quantity',
        Footer: ({ data }) => {
            const total = data.reduce((acc, cur) => acc + (cur.quantity || 0), 0);
            return Number(total).toFixed(2);
        },
    },
    {
        Header: 'Monto',
        accessor: 'monto',
        Cell: ({ value }) => (value != null ? `$${value.toLocaleString()}` : ''),
        Footer: ({ data }) => {
            const total = data.reduce((acc, cur) => acc + (cur.monto || 0), 0);
            return `$${Number(total.toFixed(2)).toLocaleString()}`;
        },
    },
    {
        Header: 'Costo Prom.',
        accessor: 'avgUnitCost',
        Cell: ({ value }) => (value != null ? `$${value.toLocaleString()}` : ''),
    },
];

export default productosColumns;
