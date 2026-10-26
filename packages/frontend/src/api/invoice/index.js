import { fetcher } from 'swr-config';

const BASE_URL = '/api/invoices';

export const fetchInvoiceReport = async ({
    from,
    to,
    showNoe,
    page = 1,
    limit = 20,
    sortBy = 'rawProfit',
    sortDir = 'desc',
}) => {
    const params = new URLSearchParams({
        from,
        to,
        showNoe,
        page,
        limit,
        sortBy,
        sortDir,
    });
    const response = await fetch(`${BASE_URL}/sales?${params}`);
    const report = await response.json();
    return report;
};

export const fetchInvoiceList = async ({
    from,
    to,
    showNoe,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortDir = 'desc',
    search,
    ruta,
    all = false,
}) => {
    const params = new URLSearchParams();
    params.append('from', from);
    params.append('to', to);
    params.append('showNoe', String(showNoe));
    params.append('page', String(page));
    params.append('limit', String(limit));
    params.append('sortBy', sortBy);
    params.append('sortDir', sortDir);
    if (search) params.append('search', search);
    if (ruta) params.append('ruta', ruta);
    if (all) params.append('all', 'true');

    return fetcher(`${BASE_URL}?${params.toString()}`);
};

export const fetchInvoiceDetail = async (invoiceId, showNoe) => {
    const response = await fetch(`${BASE_URL}/${encodeURIComponent(invoiceId)}/detail?showNoe=${showNoe}`);
    if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message =
            typeof body?.error === 'string' ? body.error : `No se pudo cargar la factura (HTTP ${response.status})`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }
    return response.json();
};

export const fetchInvoiceSelection = (parameters) =>
    fetcher(
        `/api/invoices/selection?${new URLSearchParams(Object.entries(parameters).filter(([, value]) => value !== undefined && value !== null && value !== ''))}`,
    );
export const exportInvoiceSelection = (invoiceIds, showNoe) =>
    fetcher('/api/exports/sales/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: invoiceIds.map(String), showNoe }),
    });
