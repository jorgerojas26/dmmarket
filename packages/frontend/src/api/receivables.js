const BASE = '/api/receivables';

async function request(path, options) {
    const response = await fetch(`${BASE}${path}`, options);
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        const error = new Error(
            body?.error?.message || 'No se pudo comunicar con cuentas por cobrar. Vuelve a intentar.',
        );
        error.status = response.status;
        throw error;
    }
    if (!body) throw new Error('La respuesta de cuentas por cobrar no es válida.');
    return body;
}

const params = (filters) => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    return query.toString();
};

export const fetchReceivableBanks = () => request('/banks');
export const fetchReceivables = (filters) => request(`?${params(filters)}`);
export const fetchReceivableClient = (id, filters) => request(`/${encodeURIComponent(id)}?${params(filters)}`);
const post = (id, endpoint, body) =>
    request(`/${encodeURIComponent(id)}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
export const previewReceivableOperation = (id, body) => post(id, 'preview', body);
export const executeReceivableOperation = (id, body) => post(id, 'operations', body);
