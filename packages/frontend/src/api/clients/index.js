import { fetcher } from 'swr-config';

const BASE_URL = '/api/clients';

export const fetchClients = async ({ filter }) => {
    const filterParam = filter ? `?filter=${filter}` : '';
    return fetcher(`${BASE_URL}${filterParam}`);
};
export const fetchBestClients = async (dateRange, showNoe) => {
    return fetcher(`${BASE_URL}/best/?from=${dateRange.from}&to=${dateRange.to}&showNoe=${showNoe}`);
};

export const fetchBestClientsPerProduct = async (productId, dateRange, showNoe) => {
    return fetcher(
        `${BASE_URL}/best/product/${productId}?from=${dateRange.from}&to=${dateRange.to}&showNoe=${showNoe}`,
    );
};

export const fetchMonthlyAverage = async (clientId, showNoe) => {
    return fetcher(`${BASE_URL}/average/month/${encodeURIComponent(clientId)}?showNoe=${showNoe}`);
};

export const fetchClientSales = async (
    clientId,
    { from, to, page = 1, limit = 20, showNoe, search, sortBy = 'fecha', sortDir = 'desc' },
) => {
    const params = new URLSearchParams({ from, to, page, limit, showNoe, sortBy, sortDir });
    if (search) params.set('search', search);
    const response = await fetch(`${BASE_URL}/${encodeURIComponent(clientId)}/sales?${params}`);
    if (!response.ok) throw new Error('Error al cargar las ventas del cliente');
    return response.json();
};

export const fetchClientSummary = async (clientId, { from, to, showNoe }) => {
    return fetcher(`${BASE_URL}/${encodeURIComponent(clientId)}/summary?from=${from}&to=${to}&showNoe=${showNoe}`);
};

export const fetchClientsDashboard = async (dateRange, showNoe, ruta) => {
    const rutaParam = ruta ? `&ruta=${encodeURIComponent(ruta)}` : '';
    return fetcher(`${BASE_URL}/dashboard?from=${dateRange.from}&to=${dateRange.to}&showNoe=${showNoe}${rutaParam}`);
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
    return fetcher(`${BASE_URL}/list?${params.toString()}`);
};

export const fetchClientRoutes = async () => {
    return fetcher(`${BASE_URL}/routes`);
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
    return fetcher(`${BASE_URL}/sin-facturar?${params.toString()}`);
};

export const fetchClientExport = (parameters) =>
    fetcher(
        `/api/exports/clients?${new URLSearchParams(Object.entries(parameters).filter(([, value]) => value !== undefined && value !== null && value !== ''))}`,
    );
