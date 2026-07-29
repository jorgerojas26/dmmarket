import {
    fetchProvidersList,
    fetchBestProviders,
    fetchProviderSummary,
    fetchProviderSales,
    fetchProviderClients,
    fetchProviderProducts,
    fetchProviderPurchases,
    fetchPurchaseDetail,
    fetchSaleDetail,
} from 'api/providers';
import useSWR from 'hooks/swr-wrapper';

/**
 * Providers list (paginated, searchable).
 */
export function useProvidersList(
    { search, page = 1, limit = 20, sortBy = 'total_ventas', sortDir = 'desc', showNoe },
    enabled = true,
) {
    const key = enabled ? ['providers-list', search, page, limit, sortBy, sortDir, showNoe] : null;
    return useSWR(key, () => fetchProvidersList({ search, page, limit, sortBy, sortDir, showNoe }), {
        keepPreviousData: true,
    });
}

/**
 * Best providers report.
 */
export function useBestProviders(dateRange, showNoe, mode, enabled = true) {
    const key =
        enabled && dateRange?.from && dateRange?.to
            ? ['best-providers', dateRange.from, dateRange.to, showNoe, mode]
            : null;
    return useSWR(key, () => fetchBestProviders(dateRange, showNoe, mode));
}

/**
 * Provider summary (KPIs).
 */
export function useProviderSummary(providerId, { from, to, showNoe }, enabled = true) {
    const key = enabled && providerId && from && to ? ['provider-summary', providerId, from, to, showNoe] : null;
    return useSWR(key, () => fetchProviderSummary(providerId, { from, to, showNoe }));
}

/**
 * Provider sales (paginated/sortable).
 */
export function useProviderSales(
    providerId,
    { from, to, page = 1, limit = 20, search, sortBy, sortDir, showNoe },
    enabled = true,
) {
    const key =
        enabled && providerId && from && to
            ? ['provider-sales', providerId, from, to, page, limit, search, sortBy, sortDir, showNoe]
            : null;
    return useSWR(
        key,
        () =>
            fetchProviderSales(providerId, {
                from,
                to,
                page,
                limit,
                search,
                sortBy,
                sortDir,
                showNoe,
            }),
        { keepPreviousData: true },
    );
}

/**
 * Provider clients.
 */
export function useProviderClients(
    providerId,
    { from, to, page = 1, limit = 20, search, sortBy, sortDir, showNoe },
    enabled = true,
) {
    const key =
        enabled && providerId && from && to
            ? ['provider-clients', providerId, from, to, page, limit, search, sortBy, sortDir, showNoe]
            : null;
    return useSWR(
        key,
        () =>
            fetchProviderClients(providerId, {
                from,
                to,
                page,
                limit,
                search,
                sortBy,
                sortDir,
                showNoe,
            }),
        { keepPreviousData: true },
    );
}

/**
 * Provider products.
 */
export function useProviderProducts(
    providerId,
    { from, to, page = 1, limit = 20, search, sortBy, sortDir, showNoe },
    enabled = true,
) {
    const key =
        enabled && providerId && from && to
            ? ['provider-products', providerId, from, to, page, limit, search, sortBy, sortDir, showNoe]
            : null;
    return useSWR(
        key,
        () =>
            fetchProviderProducts(providerId, {
                from,
                to,
                page,
                limit,
                search,
                sortBy,
                sortDir,
                showNoe,
            }),
        { keepPreviousData: true },
    );
}

/**
 * Provider purchases.
 */
export function useProviderPurchases(
    providerId,
    { from, to, page = 1, limit = 20, search, sortBy, sortDir },
    enabled = true,
) {
    const key =
        enabled && providerId && from && to
            ? ['provider-purchases', providerId, from, to, page, limit, search, sortBy, sortDir]
            : null;
    return useSWR(
        key,
        () =>
            fetchProviderPurchases(providerId, {
                from,
                to,
                page,
                limit,
                search,
                sortBy,
                sortDir,
            }),
        { keepPreviousData: true },
    );
}

/**
 * NOTE: fetchPurchaseDetail and fetchSaleDetail are one-shot detail fetches.
 * They're used imperatively (on row click) — not via SWR hooks.
 * The ProviderDashboardModal calls them directly with try/catch.
 */
export { fetchPurchaseDetail, fetchSaleDetail };
