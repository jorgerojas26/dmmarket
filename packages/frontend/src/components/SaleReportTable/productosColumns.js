import columns from './columns';

const formatPeso = (value) => {
    const num = Number(value);
    if (Number.isNaN(num) || num === 0) return '';
    return num.toLocaleString(undefined, { maximumFractionDigits: 3 });
};

/**
 * Productos columns (DesgloseView): shared columns + Peso column
 * (weight = quantity x product weight, computed server-side).
 */
const productosColumns = [
    columns[0], // Producto
    columns[1], // Cantidad
    {
        Header: 'Peso',
        accessor: 'peso',
        Cell: ({ value }) => formatPeso(value),
        Footer: ({ data, summary }) => {
            // `summary` es el total de todas las páginas (server-side); si no
            // viene, se reduce la página visible (fallback).
            const total =
                summary != null ? Number(summary) : data.reduce((acc, current) => acc + (current.peso || 0), 0);
            return formatPeso(total);
        },
    },
    ...columns.slice(2),
];

export default productosColumns;
