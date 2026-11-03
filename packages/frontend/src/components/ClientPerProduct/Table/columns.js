import { formatCurrency } from 'utils/format';

const columns = [
    {
        Header: 'Cliente',
        accessor: 'client',
    },
    {
        Header: 'Cantidad',
        accessor: 'quantity_total',
    },
    {
        Header: 'Total',
        accessor: 'total_USD',
        Cell: ({ value }) => {
            return value ? formatCurrency(value) : '';
        },
    },
    {
        Header: 'Utilidad',
        accessor: 'utilidad',
        Cell: ({ value }) => {
            return value ? formatCurrency(value) : 0;
        },
    },
];

export default columns;
