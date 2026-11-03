import { fetcher } from 'swr-config';

const BASE_URL = '/api/sales';

export const fetchFacturas = async ({
    from,
    to,
    clientId,
    categoryId,
    employeeId,
    ruta,
    proveedorId,
    page = 1,
    limit = 20,
    sortBy = 'fecha',
    sortDir = 'desc',
    search,
    showNoe,
}) => {
    const params = new URLSearchParams();
    params.append('from', from);
    params.append('to', to);
    params.append('page', String(page));
    params.append('limit', String(limit));
    params.append('sortBy', sortBy);
    params.append('sortDir', sortDir);
    params.append('showNoe', String(showNoe));
    if (clientId) params.append('clientId', clientId);
    if (categoryId) params.append('categoryId', categoryId);
    if (employeeId) params.append('employeeId', employeeId);
    if (ruta) params.append('ruta', ruta);
    if (proveedorId) params.append('proveedorId', proveedorId);
    if (search) params.append('search', search);

    return fetcher(`${BASE_URL}/facturas?${params.toString()}`);
};

export const fetchProductos = async ({
    from,
    to,
    clientId,
    categoryId,
    employeeId,
    ruta,
    proveedorId,
    page = 1,
    limit = 20,
    sortBy = 'rawProfit',
    sortDir = 'desc',
    search,
    showNoe,
}) => {
    const params = new URLSearchParams();
    params.append('from', from);
    params.append('to', to);
    params.append('page', String(page));
    params.append('limit', String(limit));
    params.append('sortBy', sortBy);
    params.append('sortDir', sortDir);
    params.append('showNoe', String(showNoe));
    if (clientId) params.append('clientId', clientId);
    if (categoryId) params.append('categoryId', categoryId);
    if (employeeId) params.append('employeeId', employeeId);
    if (ruta) params.append('ruta', ruta);
    if (proveedorId) params.append('proveedorId', proveedorId);
    if (search) params.append('search', search);

    return fetcher(`${BASE_URL}/productos?${params.toString()}`);
};

export const fetchSalesExport = (parameters) => {
    const query = new URLSearchParams(
        Object.entries(parameters).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    );
    return fetcher(`/api/exports/sales?${query}`);
};
export const fetchInvoiceExport = (id, showNoe) =>
    fetcher(`/api/exports/sales/${encodeURIComponent(id)}?${new URLSearchParams({ showNoe: String(showNoe) })}`);
