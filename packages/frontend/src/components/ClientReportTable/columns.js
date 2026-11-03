import { formatCurrency } from 'utils/format';

const columns = [
    {
        Header: 'Cliente',
        accessor: 'client',
    },
    {
        Header: 'Total',
        accessor: 'total_USD',
        Cell: ({ value }) => {
            return formatCurrency(value);
        },
    },
];

export default columns;
