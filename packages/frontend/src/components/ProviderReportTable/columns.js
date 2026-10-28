import { formatCurrency } from 'utils/format';

const columns = [
    {
        Header: 'Proveedor',
        accessor: 'proveedor',
    },
    {
        Header: 'Total',
        accessor: 'monto',
        Cell: ({ value }) => {
            return formatCurrency(value);
        },
    },
];

export default columns;
