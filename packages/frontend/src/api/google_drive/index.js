export const fetchDriveStatus = async () => {
    const response = await fetch('/api/backups/drive', { cache: 'no-store' });
    return { status: response.status, data: await response.json().catch(() => null) };
};
