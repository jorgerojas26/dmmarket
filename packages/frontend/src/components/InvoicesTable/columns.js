import dayjs from 'dayjs';
import { formatCurrency } from 'utils/format';

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
        Header: 'RIF',
        accessor: 'rif',
    },
    {
        Header: 'TOTAL',
        accessor: 'total',
        disableSortBy: true,
        Cell: ({ value }) => (value != null ? formatCurrency(value) : ''),
        Footer: ({ data, summary }) => {
            const total =
                summary != null ? Number(summary) : data.reduce((sum, row) => sum + Number(row.total || 0), 0);
            return formatCurrency(total);
        },
    },
    {
        Header: 'UTILIDAD',
        accessor: 'utilidad',
        Cell: ({ value }) => (value != null ? formatCurrency(value) : ''),
        Footer: ({ data, summary }) => {
            const total =
                summary != null ? Number(summary) : data.reduce((sum, row) => sum + Number(row.utilidad || 0), 0);
            return formatCurrency(total);
        },
    },
    {
        Header: 'Fecha',
        accessor: 'createdAt',
        Cell: ({ value }) => {
            return dayjs(value).format('MMM DD, YYYY');
        },
    },
];

export default columns;
