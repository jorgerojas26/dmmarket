import { useMemo } from 'react';

/**
 * Aggregates products across selected invoices for dispatch/picking.
 *
 * @param {Array} selectedRows - Invoices with nested .products[] array
 * @returns {{ productsSummary: Array, invoicesTotalSummary: number }}
 */
export const useInvoiceDispatch = (selectedRows) => {
    const { productsSummary, invoicesTotalSummary } = useMemo(() => {
        const invoices = selectedRows || [];
        const financial = invoices.length > 0 && invoices.every((row) => Object.hasOwn(row, 'utilidad'));
        const grouped = new Map();
        const add = (left, right) => (left == null || right == null ? null : left + right);
        for (const invoice of invoices)
            for (const product of invoice.products) {
                let row = grouped.get(product.productId);
                if (!row) {
                    row = { ...product, quantity: 0, peso: 0, total: 0, ...(financial ? { utilidad: 0 } : {}) };
                    grouped.set(product.productId, row);
                }
                row.quantity = add(row.quantity, product.quantity);
                row.peso = add(
                    row.peso,
                    product.quantity == null || product.peso == null ? null : product.quantity * product.peso,
                );
                row.total = add(
                    row.total,
                    product.quantity == null || product.price == null ? null : product.quantity * product.price,
                );
                if (financial)
                    row.utilidad = add(
                        row.utilidad,
                        product.quantity == null || product.price == null || product.cost == null
                            ? null
                            : (product.price - product.cost) * product.quantity,
                    );
            }
        const productsSummary = [...grouped.values()];
        return { productsSummary, invoicesTotalSummary: productsSummary.reduce((sum, row) => add(sum, row.total), 0) };
    }, [selectedRows]);

    return { productsSummary, invoicesTotalSummary };
};
