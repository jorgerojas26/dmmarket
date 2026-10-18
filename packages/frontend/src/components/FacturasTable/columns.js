import { DateTime } from 'luxon';
import { formatCurrency } from 'utils/format';

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
            return DateTime.fromISO(value).toFormat('dd/MM/yyyy');
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
        Cell: ({ value }) => (value != null ? formatCurrency(value) : ''),
        Footer: ({ data, summary }) => {
            // `summary` es el total de todas las páginas (server-side); si no
            // viene, se reduce la página visible (fallback).
            const total = summary != null ? Number(summary) : data.reduce((acc, cur) => acc + (cur.monto || 0), 0);
            return formatCurrency(total);
        },
    },
    {
        Header: 'Utilidad',
        accessor: 'utilidad',
        Cell: ({ value }) => (value != null ? formatCurrency(value) : ''),
        Footer: ({ data, summary }) => {
            const total = summary != null ? Number(summary) : data.reduce((acc, cur) => acc + (cur.utilidad || 0), 0);
            return formatCurrency(total);
        },
    },
    {
        Header: 'Promedio',
        accessor: 'promedio',
        Cell: ({ value }) => (value != null ? `${value}%` : ''),
        Footer: ({ data, summary }) => {
            const validRows = data.filter((row) => row.promedio != null);
            const average =
                summary != null
                    ? Number(summary)
                    : validRows.reduce((sum, row) => sum + Number(row.promedio), 0) / (validRows.length || 1);
            return `${average.toFixed(2)}%`;
        },
    },
];

export default columns;
