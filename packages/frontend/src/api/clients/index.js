const BASE_URL = '/api/clients';

export const fetchClients = async ({ filter }) => {
    const filterParam = filter ? `?filter=${filter}` : '';
    const response = await fetch(`${BASE_URL}${filterParam}`);
    const clients = response.json();
    return clients;
};
export const fetchBestClients = async (dateRange, showNoe) => {
    const response = await fetch(`${BASE_URL}/best/?from=${dateRange.from}&to=${dateRange.to}&showNoe=${showNoe}`);
    const report = response.json();
    return report;
};

export const fetchBestClientsPerProduct = async (productId, dateRange, showNoe) => {
    const response = await fetch(
        `${BASE_URL}/best/product/${productId}?from=${dateRange.from}&to=${dateRange.to}&showNoe=${showNoe}`,
    );
    const report = response.json();
    return report;
};

export const fetchMonthlyAverage = async (clientId, showNoe) => {
    const response = await fetch(`${BASE_URL}/average/month/${clientId}?showNoe=${showNoe}`);
    const report = response.json();
    return report;
};

export const fetchClientSales = async (clientId, { from, to, page = 1, limit = 20, showNoe }) => {
    const response = await fetch(
        `${BASE_URL}/${clientId}/sales?from=${from}&to=${to}&page=${page}&limit=${limit}&showNoe=${showNoe}`,
    );
    return response.json();
};

export const fetchClientSummary = async (clientId, { from, to, showNoe }) => {
    const response = await fetch(`${BASE_URL}/${clientId}/summary?from=${from}&to=${to}&showNoe=${showNoe}`);
    return response.json();
};

export const fetchClientsDashboard = async (dateRange, showNoe, ruta) => {
    const rutaParam = ruta ? `&ruta=${encodeURIComponent(ruta)}` : '';
    const response = await fetch(
        `${BASE_URL}/dashboard?from=${dateRange.from}&to=${dateRange.to}&showNoe=${showNoe}${rutaParam}`,
    );
    return response.json();
};

export const fetchClientsList = async ({
    search,
    ruta,
    from,
    to,
    page = 1,
    limit = 20,
    sortBy = 'total_ventas',
    sortDir = 'desc',
    showNoe,
}) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (ruta) params.append('ruta', ruta);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    params.append('page', page);
    params.append('limit', limit);
    params.append('sortBy', sortBy);
    params.append('sortDir', sortDir);
    params.append('showNoe', showNoe);
    const response = await fetch(`${BASE_URL}/list?${params.toString()}`);
    return response.json();
};

export const fetchClientRoutes = async (showNoe) => {
    const response = await fetch(`${BASE_URL}/routes?showNoe=${showNoe}`);
    return response.json();
};

export const fetchClientsSinFacturar = async ({
    from,
    to,
    search,
    ruta,
    page = 1,
    limit = 20,
    sortBy = 'revenue_historico',
    sortDir = 'desc',
    showNoe,
}) => {
    const params = new URLSearchParams();
    params.append('from', from);
    params.append('to', to);
    if (search) params.append('search', search);
    if (ruta) params.append('ruta', ruta);
    params.append('page', page);
    params.append('limit', limit);
    params.append('sortBy', sortBy);
    params.append('sortDir', sortDir);
    params.append('showNoe', showNoe);
    const response = await fetch(`${BASE_URL}/sin-facturar?${params.toString()}`);
    return response.json();
};
