import {
    fetchClients,
    fetchBestClients,
    fetchBestClientsPerProduct,
    fetchMonthlyAverage,
    fetchClientSales,
    fetchClientSummary,
    fetchClientsDashboard,
    fetchClientsList,
} from 'api/clients';
import useSWR from 'hooks/swr-wrapper';

/**
 * Clients list (paginated, searchable).
 * Null key = no fetch.
 */
export function useClientsList(
    { search, page = 1, limit = 20, sortBy = 'total_ventas', sortDir = 'desc', showNoe },
    enabled = true,
) {
    const key = enabled ? ['clients-list', search, page, limit, sortBy, sortDir, showNoe] : null;
    return useSWR(key, () => fetchClientsList({ search, page, limit, sortBy, sortDir, showNoe }), {
        keepPreviousData: true,
    });
}

/**
 * Client aggregate dashboard (KPIs + charts).
 */
export function useClientsDashboard(dateRange, showNoe) {
    const key = dateRange?.from && dateRange?.to ? ['clients-dashboard', dateRange.from, dateRange.to, showNoe] : null;
    return useSWR(key, () => fetchClientsDashboard(dateRange, showNoe), { keepPreviousData: true });
}

/**
 * Best clients report.
 */
export function useBestClients(dateRange, showNoe, enabled = true) {
    const key =
        enabled && dateRange?.from && dateRange?.to ? ['best-clients', dateRange.from, dateRange.to, showNoe] : null;
    return useSWR(key, () => fetchBestClients(dateRange, showNoe));
}

/**
 * Best clients per product.
 */
export function useBestClientsPerProduct(productId, dateRange, showNoe, enabled = true) {
    const key =
        enabled && productId && dateRange?.from && dateRange?.to
            ? ['best-clients-per-product', productId, dateRange.from, dateRange.to, showNoe]
            : null;
    return useSWR(key, () => fetchBestClientsPerProduct(productId, dateRange, showNoe));
}

/**
 * Client monthly average.
 */
export function useMonthlyAverage(clientId, showNoe, enabled = true) {
    const key = enabled && clientId ? ['monthly-average', clientId, showNoe] : null;
    return useSWR(key, () => fetchMonthlyAverage(clientId, showNoe));
}

/**
 * Client sales (paginated).
 */
export function useClientSales(clientId, { from, to, page = 1, limit = 20, showNoe }, enabled = true) {
    const key = enabled && clientId && from && to ? ['client-sales', clientId, from, to, page, limit, showNoe] : null;
    return useSWR(key, () => fetchClientSales(clientId, { from, to, page, limit, showNoe }), {
        keepPreviousData: true,
    });
}

/**
 * Client summary (KPIs).
 */
export function useClientSummary(clientId, { from, to, showNoe }, enabled = true) {
    const key = enabled && clientId && from && to ? ['client-summary', clientId, from, to, showNoe] : null;
    return useSWR(key, () => fetchClientSummary(clientId, { from, to, showNoe }));
}

/**
 * Simple clients fetch (for dropdowns / autocomplete).
 */
export function useClients(filter, enabled = true) {
    const key = enabled ? ['clients', filter] : null;
    return useSWR(key, () => fetchClients({ filter }));
}
