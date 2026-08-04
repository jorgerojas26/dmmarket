const columns = [
    {
        Header: 'Factura',
        // Server sort key is 'numero' (maps to IdFactura); row field is invoiceId.
        id: 'numero',
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
        Header: 'Proveedor',
        accessor: 'proveedor',
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
        Header: 'Unidades',
        accessor: 'unidades',
        Cell: ({ value }) => (value != null ? Number(value).toLocaleString() : ''),
        Footer: ({ data }) => {
            const total = data.reduce((acc, cur) => acc + (cur.unidades || 0), 0);
            return Number(total).toFixed(2);
        },
    },
];

export default columns;
