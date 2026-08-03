import { useMemo } from 'react';

/**
 * Aggregates products across selected invoices for dispatch/picking.
 *
 * @param {Array} selectedRows - Invoices with nested .products[] array
 * @returns {{ productsSummary: Array, invoicesTotalSummary: number }}
 */
export const useInvoiceDispatch = (selectedRows) => {
    const productsSummary = useMemo(() => {
        if (!selectedRows || selectedRows.length === 0) return [];

        const products = {};

        selectedRows.forEach((row) => {
            row.products.forEach((product) => {
                if (!products[product.productId]) {
                    products[product.productId] = {
                        ...product,
                        quantity: 0,
                        peso: 0,
                        utilidad: 0,
                    };
                }
                products[product.productId].quantity += product.quantity;
                products[product.productId].peso = Number(
                    (products[product.productId].peso + product.quantity * (product.peso || 0)).toFixed(3),
                );
                products[product.productId].utilidad = Number(
                    (
                        products[product.productId].utilidad +
                        (product.price - (product.cost || 0)) * product.quantity
                    ).toFixed(2),
                );
                products[product.productId].total = Number(
                    (products[product.productId].quantity * products[product.productId].price).toFixed(2),
                );
            });
        });

        return Object.values(products);
    }, [selectedRows]);

    const invoicesTotalSummary = useMemo(
        () =>
            selectedRows && selectedRows.length > 0
                ? selectedRows.reduce((total, inv) => total + (inv?.total || 0), 0)
                : 0,
        [selectedRows],
    );

    return { productsSummary, invoicesTotalSummary };
};
