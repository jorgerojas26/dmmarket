const BASE_URL = '/api/update';
async function request(path, { method = 'GET', body, signal } = {}) {
    const response = await fetch(`${BASE_URL}/${path}`, {
        method,
        cache: 'no-store',
        signal,
        ...(method === 'POST'
            ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }
            : {}),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
        throw Object.assign(new Error(data?.error?.message || 'No se pudo completar la actualización.'), {
            status: response.status,
            code: data?.error?.code,
        });
    return { status: response.status, data };
}
export const fetchUpdateStatus = (options) => request('status', options);
export const checkForUpdate = () => request('check', { method: 'POST' });
export const fetchUpdateHistory = () => request('history');
export const downloadUpdate = ({ assetUrl, sha256AssetUrl }) =>
    request('download', { method: 'POST', body: { confirmed: true, assetUrl, sha256AssetUrl } });
export const getDownloadProgress = () => request('progress');
export const applyUpdate = () => request('apply', { method: 'POST', body: { confirmed: true } });
