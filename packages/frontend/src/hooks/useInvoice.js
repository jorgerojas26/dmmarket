import { fetchInvoiceReport, fetchInvoiceList, fetchInvoiceDetail } from 'api/invoice';
import useSWR from 'hooks/swr-wrapper';

export function useInvoiceReport(
    { from, to, showNoe, page = 1, limit = 20, sortBy = 'rawProfit', sortDir = 'desc' },
    enabled = true,
) {
    const key = enabled && from && to ? ['invoice-report', from, to, showNoe, page, limit, sortBy, sortDir] : null;
    return useSWR(key, () => fetchInvoiceReport({ from, to, showNoe, page, limit, sortBy, sortDir }), {
        keepPreviousData: true,
    });
}

export function useInvoiceList(
    { from, to, showNoe, page = 1, limit = 20, sortBy = 'createdAt', sortDir = 'desc', search, ruta },
    enabled = true,
) {
    const key =
        enabled && from && to ? ['invoice-list', from, to, showNoe, page, limit, sortBy, sortDir, search, ruta] : null;
    return useSWR(key, () => fetchInvoiceList({ from, to, showNoe, page, limit, sortBy, sortDir, search, ruta }), {
        keepPreviousData: true,
    });
}

/**
 * Invoice detail — typically used imperatively, but hook wraps it for conditional use.
 */
export function useInvoiceDetail(invoiceId, showNoe, enabled = true) {
    const key = enabled && invoiceId ? ['invoice-detail', invoiceId, showNoe] : null;
    return useSWR(key, () => fetchInvoiceDetail(invoiceId, showNoe));
}

// Export raw for imperative use
export { fetchInvoiceDetail };
