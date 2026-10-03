const BASE = '/api/backups/drive';

const request = async (path = '', token, body) => {
    const response = await fetch(`${BASE}${path}`, {
        method: token ? 'POST' : 'GET',
        cache: 'no-store',
        headers: token ? { 'X-Drive-Token': token, 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json().catch(() => null) };
};

export const fetchDriveStatus = () => request();
export const connectDrive = (token) => request('/connect', token);
export const enableDrive = (token) => request('/enable', token, { confirmed: true });
export const testDriveUpload = (token) => request('/test', token);
export const disconnectDrive = (token) => request('/disconnect', token);
export const exportDriveKey = async (token) => {
    const response = await fetch(`${BASE}/recovery-key`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'X-Drive-Token': token },
    });
    return {
        status: response.status,
        data: response.ok ? await response.blob() : await response.json().catch(() => null),
    };
};
