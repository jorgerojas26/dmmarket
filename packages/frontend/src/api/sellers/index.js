const BASE_URL = '/api/sellers';

export const fetchSellersDashboard = async (dateRange, showNoe) => {
    const response = await fetch(`${BASE_URL}/dashboard?from=${dateRange.from}&to=${dateRange.to}&showNoe=${showNoe}`);
    if (!response.ok) throw new Error('Error al cargar el dashboard de vendedores');
    return response.json();
};

export const fetchSellersList = async ({
    search,
    from,
    to,
    page = 1,
    limit = 20,
    sortBy = 'sales',
    sortDir = 'desc',
    showNoe,
}) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    params.append('page', page);
    params.append('limit', limit);
    params.append('sortBy', sortBy);
    params.append('sortDir', sortDir);
    params.append('showNoe', showNoe);
    const response = await fetch(`${BASE_URL}/list?${params.toString()}`);
    if (!response.ok) throw new Error('Error al cargar el desglose de vendedores');
    return response.json();
};

export const fetchSellerSummary = async (sellerId, { from, to, showNoe }) => {
    const response = await fetch(
        `${BASE_URL}/${encodeURIComponent(sellerId)}/summary?from=${from}&to=${to}&showNoe=${showNoe}`,
    );
    if (!response.ok) throw new Error('Error al cargar el detalle del vendedor');
    return response.json();
};

export const fetchSellerSales = async (
    sellerId,
    { from, to, page = 1, limit = 20, search, sortBy = 'fecha', sortDir = 'desc', showNoe },
) => {
    const params = new URLSearchParams({ from, to, page, limit, sortBy, sortDir, showNoe });
    if (search) params.set('search', search);
    const response = await fetch(`${BASE_URL}/${encodeURIComponent(sellerId)}/sales?${params.toString()}`);
    if (!response.ok) throw new Error('Error al cargar las ventas del vendedor');
    return response.json();
};
