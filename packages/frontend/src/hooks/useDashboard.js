import { fetchDashboardSales, fetchDashboardPareto } from 'api/dashboard';
import useSWR from 'hooks/swr-wrapper';
import { fetcher } from 'swr-config';
import { DateTime } from 'luxon';
import { useMemo } from 'react';

function buildCompareRange(dateRange) {
    const fromDt = DateTime.fromISO(dateRange.from);
    const toDt = DateTime.fromISO(dateRange.to);
    const days = toDt.diff(fromDt, 'days').days;
    const compareTo = fromDt.minus({ days: 1 }).toISODate();
    const compareFrom = DateTime.fromISO(compareTo).minus({ days }).toISODate();
    return { compareFrom, compareTo };
}

function buildDashboardUrl({ from, to, showNoe }) {
    const { compareFrom, compareTo } = buildCompareRange({ from, to });
    const params = new URLSearchParams({ from, to, showNoe, compareFrom, compareTo });
    return `/api/dashboard/sales?${params.toString()}`;
}

function buildParetoUrl({ from, to, showNoe }) {
    const params = new URLSearchParams({ from, to, showNoe });
    return `/api/dashboard/pareto?${params.toString()}`;
}

/**
 * Hook: Sales dashboard data (KPIs + charts + ranked lists).
 */
export function useDashboardSales(dateRange, showNoe) {
    const key = dateRange?.from && dateRange?.to ? buildDashboardUrl({ ...dateRange, showNoe }) : null;
    const swr = useSWR(key, fetcher, { keepPreviousData: true });

    // Build comparison ranges for KPI cards — pass through from the original call.
    // The SWR hook only needs the raw URL; the comparison calc still happens here.
    const compareRange = useMemo(() => {
        if (!dateRange?.from || !dateRange?.to) return null;
        return buildCompareRange(dateRange);
    }, [dateRange?.from, dateRange?.to]);

    return { ...swr, compareRange };
}

/**
 * Hook: Pareto data.
 */
export function useDashboardPareto(dateRange, showNoe) {
    const key = dateRange?.from && dateRange?.to ? buildParetoUrl({ ...dateRange, showNoe }) : null;
    return useSWR(key, fetcher, { keepPreviousData: true });
}

/**
 * Raw hooks — using direct API functions (for cases where URL-building is awkward).
 * These use a key pattern that lets SWR deduplicate properly.
 */
export function useDashboardSalesRaw(dateRange, showNoe) {
    const key = dateRange?.from && dateRange?.to ? ['dashboard-sales', dateRange.from, dateRange.to, showNoe] : null;
    return useSWR(
        key,
        () => {
            const { compareFrom, compareTo } = buildCompareRange(dateRange);
            return fetchDashboardSales({ from: dateRange.from, to: dateRange.to, showNoe, compareFrom, compareTo });
        },
        { keepPreviousData: true },
    );
}

export function useDashboardParetoRaw(dateRange, showNoe, modo = 'ventas') {
    const key =
        dateRange?.from && dateRange?.to ? ['dashboard-pareto', dateRange.from, dateRange.to, showNoe, modo] : null;
    return useSWR(key, () => fetchDashboardPareto({ from: dateRange.from, to: dateRange.to, showNoe, modo }), {
        keepPreviousData: true,
    });
}
