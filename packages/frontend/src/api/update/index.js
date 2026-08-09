const BASE_URL = '/api/update';

export const fetchUpdateStatus = async () => {
    const response = await fetch(`${BASE_URL}/status`);
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
};

export const checkForUpdate = async () => {
    const response = await fetch(`${BASE_URL}/check`, { method: 'POST' });
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
};

export const downloadUpdate = async ({ assetUrl, sha256AssetUrl }) => {
    const response = await fetch(`${BASE_URL}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetUrl, sha256AssetUrl }),
    });
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
};

export const getDownloadProgress = async () => {
    const response = await fetch(`${BASE_URL}/progress`);
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
};

export const applyUpdate = async () => {
    const response = await fetch(`${BASE_URL}/apply`, { method: 'POST' });
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
};
