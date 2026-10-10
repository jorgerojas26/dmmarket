export const fetchBackups = async () => {
    const response = await fetch('/api/backups', { cache: 'no-store' });
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
};

export const createBackup = async (token) => {
    const response = await fetch('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-backup-token': token },
        body: JSON.stringify({ confirmed: true }),
    });
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
};
