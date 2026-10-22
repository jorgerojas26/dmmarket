import { fetchSellerSales, fetchSellerSummary, fetchSellersDashboard, fetchSellersList } from 'api/sellers';
import useSWR from 'hooks/swr-wrapper';

export function useSellersDashboard(dateRange, showNoe) {
    const key = dateRange?.from && dateRange?.to ? ['sellers-dashboard', dateRange.from, dateRange.to, showNoe] : null;
    return useSWR(key, () => fetchSellersDashboard(dateRange, showNoe), { keepPreviousData: true });
}

export function useSellersList(
    { search, from, to, page = 1, limit = 20, sortBy = 'sales', sortDir = 'desc', showNoe },
    enabled = true,
) {
    const key = enabled ? ['sellers-list', search, from, to, page, limit, sortBy, sortDir, showNoe] : null;
    return useSWR(key, () => fetchSellersList({ search, from, to, page, limit, sortBy, sortDir, showNoe }), {
        keepPreviousData: true,
    });
}

export function useSellerSummary(sellerId, { from, to, showNoe }, enabled = true) {
    const key = enabled && sellerId && from && to ? ['seller-summary', sellerId, from, to, showNoe] : null;
    return useSWR(key, () => fetchSellerSummary(sellerId, { from, to, showNoe }));
}

export function useSellerSales(
    sellerId,
    { from, to, page = 1, limit = 20, search, sortBy = 'fecha', sortDir = 'desc', showNoe },
    enabled = true,
) {
    const key =
        enabled && sellerId && from && to
            ? ['seller-sales', sellerId, from, to, page, limit, search, sortBy, sortDir, showNoe]
            : null;
    return useSWR(key, () => fetchSellerSales(sellerId, { from, to, page, limit, search, sortBy, sortDir, showNoe }), {
        keepPreviousData: true,
    });
}
