import {
    fetchProducts,
    fetchCostFluctuation,
    fetchCostPerGroup,
    fetchProductsByGroup,
    fetchProductPriceList,
    fetchProductReports,
    fetchBestClients,
} from 'api/products';
import useSWR from 'hooks/swr-wrapper';

export function useProducts(filter, enabled = true) {
    const key = enabled ? ['products', filter] : null;
    return useSWR(key, () => fetchProducts({ filter }));
}

export function useCostFluctuation(productId, enabled = true) {
    const key = enabled && productId ? ['cost-fluctuation', productId] : null;
    return useSWR(key, () => fetchCostFluctuation(productId));
}

export function useCostPerGroup(enabled = true) {
    const key = enabled ? 'cost-per-group' : null;
    return useSWR(key, fetchCostPerGroup);
}

export function useProductsByGroup(enabled = true) {
    const key = enabled ? 'products-by-group' : null;
    return useSWR(key, fetchProductsByGroup);
}

export function useProductPriceList(groupId, enabled = true) {
    const key = enabled && groupId ? ['product-price-list', groupId] : null;
    return useSWR(key, () => fetchProductPriceList(groupId));
}

export function useProductReports(productId, enabled = true) {
    const key = enabled && productId ? ['product-reports', productId] : null;
    return useSWR(key, () => fetchProductReports(productId));
}

export function useBestClients(productId, dateRange, enabled = true) {
    const key =
        enabled && productId && dateRange?.from && dateRange?.to
            ? ['best-clients-product', productId, dateRange.from, dateRange.to]
            : null;
    return useSWR(key, () => fetchBestClients(productId, dateRange));
}
