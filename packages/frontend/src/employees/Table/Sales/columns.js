import { DateTime } from 'luxon';
import { formatCurrency as formatReportCurrency } from 'utils/format';

const formatCurrency = (value) =>
    formatReportCurrency(value, 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

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
            return value ? formatCurrency(value) : '';
        },
        Footer: ({ data }) => {
            const total = data.reduce((acc, current) => {
                return acc + current.invoiceTotal;
            }, 0);
            return total ? formatCurrency(total) : 0;
        },
    },

    {
        Header: 'Utilidad',
        accessor: 'utilidad',
        Cell: ({ value }) => (value != null ? formatCurrency(value) : ''),
        Footer: ({ data }) => {
            const total = data.reduce((sum, row) => sum + Number(row.utilidad || 0), 0);
            return total ? formatCurrency(total) : 0;
        },
    },

    {
        Header: 'Comisión',
        accessor: 'commissionTotal',
        Cell: ({ value }) => {
            return value == null ? 'No disponible' : value ? formatCurrency(value) : '';
        },
        Footer: ({ data }) => {
            if (data.some((row) => row.commissionTotal == null)) return 'No disponible';
            const total = data.reduce((acc, current) => {
                return acc + current.commissionTotal;
            }, 0);
            return total ? formatCurrency(total) : 0;
        },
    },
];

export default columns;
