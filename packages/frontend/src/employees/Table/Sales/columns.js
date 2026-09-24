import { DateTime } from 'luxon';

const columns = [
    {
        Header: 'ID',
        accessor: 'invoiceId',
    },
    {
        Header: 'Cliente',
        accessor: 'client',
    },

    {
        Header: 'Rif',
        accessor: 'rif',
    },
    {
        Header: 'Fecha',
        accessor: 'createdAt',
        Cell: ({ value }) => {
            return DateTime.fromISO(value, { setZone: true }).toFormat('F');
        },
    },

    {
        Header: 'Total',
        accessor: 'invoiceTotal',
        Cell: ({ value }) => {
            return value ? `$${value}` : '';
        },
        Footer: ({ data }) => {
            const total = data.reduce((acc, current) => {
                return acc + current.invoiceTotal;
            }, 0);
            return total ? `$${Number(total).toLocaleString()}` : 0;
        },
    },

    {
        Header: 'Utilidad',
        accessor: 'utilidad',
        Cell: ({ value }) => (value != null ? `$${Number(value).toLocaleString()}` : ''),
        Footer: ({ data }) => {
            const total = data.reduce((sum, row) => sum + Number(row.utilidad || 0), 0);
            return total ? `$${total.toLocaleString()}` : 0;
        },
    },

    {
        Header: 'Comisión',
        accessor: 'commissionTotal',
        Cell: ({ value }) => {
            return value ? `$${value}` : '';
        },
        Footer: ({ data }) => {
            const total = data.reduce((acc, current) => {
                return acc + current.commissionTotal;
            }, 0);
            return total ? `$${Number(total).toLocaleString()}` : 0;
        },
    },
];

export default columns;
