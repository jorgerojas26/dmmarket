const columns = [
    {
        Header: 'Factura',
        accessor: 'invoiceId',
    },
    {
        Header: 'Fecha',
        accessor: 'fecha',
        Cell: ({ value }) => {
            if (!value) return '';
            const d = new Date(value);
            return d.toLocaleDateString('es-VE', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
            });
        },
    },
    {
        Header: 'Cliente',
        accessor: 'cliente',
    },
    {
        Header: 'Vendedor',
        accessor: 'vendedor',
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
        Header: 'Utilidad',
        accessor: 'utilidad',
        Cell: ({ value }) => (value != null ? `$${value.toLocaleString()}` : ''),
        Footer: ({ data }) => {
            const total = data.reduce((acc, cur) => acc + (cur.utilidad || 0), 0);
            return `$${Number(total.toFixed(2)).toLocaleString()}`;
        },
    },
    {
        Header: 'Promedio',
        accessor: 'promedio',
        Cell: ({ value }) => (value != null ? `${value}%` : ''),
    },
];

export default columns;
