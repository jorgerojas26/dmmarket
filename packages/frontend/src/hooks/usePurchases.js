import {
    fetchPurchasesDashboard,
    fetchPurchasesInvoices,
    fetchPurchasesPareto,
    fetchPurchasesProducts,
} from 'api/purchases';
import useSWR from 'hooks/swr-wrapper';
import { DateTime } from 'luxon';

function buildCompareRange(dateRange) {
    const fromDt = DateTime.fromISO(dateRange.from);
    const toDt = DateTime.fromISO(dateRange.to);
    const days = toDt.diff(fromDt, 'days').days;
    const compareTo = fromDt.minus({ days: 1 }).toISODate();
    const compareFrom = DateTime.fromISO(compareTo).minus({ days }).toISODate();
    return { compareFrom, compareTo };
}

/**
 * Hook: Purchases dashboard data (KPIs + charts + ranked lists).
 * Purchases never uses showNoe — always the same mastercomp/slavecomp tables.
 */
export function usePurchasesDashboard(dateRange) {
    const key = dateRange?.from && dateRange?.to ? ['purchases-dashboard', dateRange.from, dateRange.to] : null;
    return useSWR(
        key,
        () => {
            const { compareFrom, compareTo } = buildCompareRange(dateRange);
            return fetchPurchasesDashboard({ from: dateRange.from, to: dateRange.to, compareFrom, compareTo });
        },
        { keepPreviousData: true },
    );
}

/**
 * Hook: Purchases Pareto data.
 */
export function usePurchasesPareto(dateRange) {
    const key = dateRange?.from && dateRange?.to ? ['purchases-pareto', dateRange.from, dateRange.to] : null;
    return useSWR(key, () => fetchPurchasesPareto({ from: dateRange.from, to: dateRange.to }), {
        keepPreviousData: true,
    });
}

/**
 * Hook: Purchase invoices (paginated, filterable, sortable).
 */
export function usePurchasesInvoices(
    { from, to, proveedorId, groupId, page = 1, limit = 20, sortBy = 'fecha', sortDir = 'desc', search },
    enabled = true,
) {
    const key =
        enabled && from && to
            ? ['purchases-invoices', from, to, proveedorId, groupId, page, limit, sortBy, sortDir, search]
            : null;
    return useSWR(
        key,
        () =>
            fetchPurchasesInvoices({
                from,
                to,
                proveedorId,
                groupId,
                page,
                limit,
                sortBy,
                sortDir,
                search,
            }),
        { keepPreviousData: true },
    );
}

/**
 * Hook: Purchased products (paginated, filterable, sortable).
 */
export function usePurchasesProducts(
    { from, to, proveedorId, groupId, page = 1, limit = 20, sortBy = 'monto', sortDir = 'desc', search },
    enabled = true,
) {
    const key =
        enabled && from && to
            ? ['purchases-products', from, to, proveedorId, groupId, page, limit, sortBy, sortDir, search]
            : null;
    return useSWR(
        key,
        () =>
            fetchPurchasesProducts({
                from,
                to,
                proveedorId,
                groupId,
                page,
                limit,
                sortBy,
                sortDir,
                search,
            }),
        { keepPreviousData: true },
    );
}
