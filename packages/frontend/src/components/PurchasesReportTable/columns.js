import { DateTime } from 'luxon';
import { formatCurrency, formatQuantity } from 'utils/format';

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
            return DateTime.fromISO(value).toFormat('dd/MM/yyyy');
        },
    },
    {
        Header: 'Proveedor',
        accessor: 'proveedor',
    },
    {
        Header: 'Monto',
        accessor: 'monto',
        Cell: ({ value }) => (value != null ? formatCurrency(value) : ''),
        Footer: ({ data, summary }) => {
            // `summary` es el total de todas las páginas (server-side); si no
            // viene, se reduce la página visible (fallback).
            const total = summary != null ? Number(summary) : data.reduce((acc, cur) => acc + (cur.monto || 0), 0);
            return formatCurrency(total);
        },
    },
    {
        Header: 'Unidades',
        accessor: 'unidades',
        Cell: ({ value }) => (value != null ? formatQuantity(value) : ''),
        Footer: ({ data, summary }) => {
            const total = summary != null ? Number(summary) : data.reduce((acc, cur) => acc + (cur.unidades || 0), 0);
            return formatQuantity(total);
        },
    },
];

export default columns;
