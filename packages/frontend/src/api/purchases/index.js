const BASE_URL = '/api/purchases';

export const fetchPurchasesDashboard = async ({ from, to, compareFrom, compareTo }) => {
    let url = `${BASE_URL}/dashboard?from=${from}&to=${to}`;
    if (compareFrom && compareTo) {
        url += `&compareFrom=${compareFrom}&compareTo=${compareTo}`;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Purchases dashboard API error: ${response.status}`);
    return response.json();
};

export const fetchPurchasesPareto = async ({ from, to }) => {
    const url = `${BASE_URL}/pareto?from=${from}&to=${to}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Purchases pareto API error: ${response.status}`);
    return response.json();
};

export const fetchPurchasesInvoices = async ({
    from,
    to,
    proveedorId,
    groupId,
    page = 1,
    limit = 20,
    sortBy = 'fecha',
    sortDir = 'desc',
    search,
}) => {
    const params = new URLSearchParams();
    params.append('from', from);
    params.append('to', to);
    params.append('page', String(page));
    params.append('limit', String(limit));
    params.append('sortBy', sortBy);
    params.append('sortDir', sortDir);
    if (proveedorId) params.append('proveedorId', proveedorId);
    if (groupId) params.append('groupId', groupId);
    if (search) params.append('search', search);

    const response = await fetch(`${BASE_URL}/invoices?${params.toString()}`);
    if (!response.ok) throw new Error(`Purchases invoices API error: ${response.status}`);
    return response.json();
};

export const fetchPurchasesProducts = async ({
    from,
    to,
    proveedorId,
    groupId,
    page = 1,
    limit = 20,
    sortBy = 'monto',
    sortDir = 'desc',
    search,
}) => {
    const params = new URLSearchParams();
    params.append('from', from);
    params.append('to', to);
    params.append('page', String(page));
    params.append('limit', String(limit));
    params.append('sortBy', sortBy);
    params.append('sortDir', sortDir);
    if (proveedorId) params.append('proveedorId', proveedorId);
    if (groupId) params.append('groupId', groupId);
    if (search) params.append('search', search);

    const response = await fetch(`${BASE_URL}/products?${params.toString()}`);
    if (!response.ok) throw new Error(`Purchases products API error: ${response.status}`);
    return response.json();
};
