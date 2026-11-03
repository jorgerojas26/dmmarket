import { fetcher } from 'swr-config';

const BASE_URL = '/api/providers';
const query = (values) =>
    new URLSearchParams(
        Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    );
const sorts = {
    sales: { idFactura: 'invoiceId', cantidad: 'quantity' },
    purchases: { idFactura: 'invoiceId' },
    products: { producto: 'product', cantidad: 'quantity', totalVentas: 'rawProfit', utilidad: 'netProfit' },
    clients: {
        cliente: 'name',
        vendedor: 'sellerName',
        totalVentas: 'amount',
        cantidad: 'quantity',
        numVentas: 'invoiceCount',
        utilidad: 'profit',
    },
    sellers: {
        vendedor: 'name',
        totalVentas: 'amount',
        cantidad: 'quantity',
        numClientes: 'clientCount',
        utilidad: 'profit',
    },
};
const aliases = {
    sales: { invoiceId: 'idFactura', quantity: 'cantidad' },
    purchases: { invoiceId: 'idFactura' },
    products: { product: 'producto', quantity: 'cantidad', rawProfit: 'totalVentas', netProfit: 'utilidad' },
    clients: {
        name: 'cliente',
        amount: 'totalVentas',
        invoiceCount: 'numVentas',
        quantity: 'cantidad',
        profit: 'utilidad',
        sellerName: 'vendedor',
    },
    sellers: {
        name: 'vendedor',
        amount: 'totalVentas',
        invoiceCount: 'numVentas',
        quantity: 'cantidad',
        profit: 'utilidad',
        clientCount: 'numClientes',
    },
};
const normalizeRow = (row, kind) => ({
    ...row,
    ...Object.fromEntries(
        Object.entries(aliases[kind] || {})
            .filter(([key]) => Object.hasOwn(row, key))
            .map(([key, alias]) => [alias, row[key]]),
    ),
    ...(row.detail ? { detail: { ...row.detail, idFactura: row.detail.idFactura ?? row.detail.invoiceId } } : {}),
});
const normalize = (result, kind) => {
    const data = (result.data || []).map((row) => normalizeRow(row, kind));
    return {
        ...result,
        data,
        total: Number(result.total ?? result.pagination?.total ?? 0),
        totals: normalizeRow(result.totals || {}, kind),
        columns: [...new Set(data.flatMap((row) => Object.keys(row)))].map((key) => ({ key })),
    };
};
const filters = (kind, { sellerId, employeeId, sortBy, ...values }) => ({
    ...values,
    ...(sellerId !== undefined || employeeId !== undefined ? { employeeId: sellerId ?? employeeId } : {}),
    ...(sortBy ? { sortBy: sorts[kind]?.[sortBy] || sortBy } : {}),
});
const list = async (providerId, kind, values) =>
    normalize(
        await fetcher(`${BASE_URL}/${encodeURIComponent(providerId)}/${kind}?${query(filters(kind, values))}`),
        kind,
    );

export const fetchProviderOptions = (search) => fetcher(`${BASE_URL}/options?${query({ search })}`);
export const fetchProvidersList = ({
    search,
    from,
    to,
    page = 1,
    limit = 20,
    sortBy = 'Empresa',
    sortDir = 'desc',
    showNoe,
}) => fetcher(`${BASE_URL}/list?${query({ search, from, to, page, limit, sortBy, sortDir, showNoe })}`);
export const fetchProviderSummary = async (providerId, values) => {
    const result = await fetcher(`${BASE_URL}/${encodeURIComponent(providerId)}/summary?${query(values)}`);
    return {
        ...result,
        ...(result.sales
            ? {
                  totalVentas: result.sales.totalRawProfit,
                  numVentas: result.sales.totalInvoices,
                  ...(Object.hasOwn(result.sales, 'totalNetProfit') ? { utilidad: result.sales.totalNetProfit } : {}),
              }
            : {}),
        ...(result.purchases
            ? {
                  numCompras: result.purchases.totalInvoices,
                  ...(Object.hasOwn(result.purchases, 'totalPurchased')
                      ? { totalCompras: result.purchases.totalPurchased }
                      : {}),
              }
            : {}),
    };
};
export const fetchProviderSales = (id, values) => list(id, 'sales', values);
export const fetchProviderClients = (id, values) => list(id, 'clients', values);
export const fetchProviderSellers = (id, values) => list(id, 'sellers', values);
export const fetchProviderProducts = (id, values) => list(id, 'products', values);
export const fetchProviderPurchases = (id, values) => list(id, 'purchases', values);
export const fetchPurchaseDetail = async (id, invoiceId) => {
    const result = await fetcher(`${BASE_URL}/${encodeURIComponent(id)}/purchases/${encodeURIComponent(invoiceId)}`);
    return { ...result, idFactura: result.idFactura ?? result.invoiceId };
};
export const fetchSaleDetail = async (id, invoiceId, showNoe) => {
    const result = await fetcher(
        `${BASE_URL}/${encodeURIComponent(id)}/sales/${encodeURIComponent(invoiceId)}?${query({ showNoe })}`,
    );
    return { ...result, idFactura: result.idFactura ?? result.invoiceId };
};
export const fetchProvidersExport = (values) => fetcher(`/api/exports/providers?${query(values)}`);
export const fetchProviderExport = async (id, kind, { page, limit, ...values }) =>
    normalize(
        await fetcher(
            `/api/exports/providers/${encodeURIComponent(id)}/${kind}?${query(filters(kind.replace('-documents', '') === 'purchase' ? 'purchases' : kind.replace('-documents', ''), values))}`,
        ),
        kind === 'purchase-documents' ? 'purchases' : kind === 'sales-documents' ? 'sales' : kind,
    );
export const fetchProviderPurchaseExport = async (id, invoiceId) => {
    const result = await fetcher(
        `/api/exports/providers/${encodeURIComponent(id)}/purchases/${encodeURIComponent(invoiceId)}`,
    );
    return { ...result, idFactura: result.idFactura ?? result.invoiceId };
};
export const fetchProviderSaleExport = async (id, invoiceId, showNoe) => {
    const result = await fetcher(
        `/api/exports/sales/${encodeURIComponent(invoiceId)}?${query({ proveedorId: id, showNoe })}`,
    );
    return { ...result, idFactura: result.idFactura ?? result.invoiceId };
};
