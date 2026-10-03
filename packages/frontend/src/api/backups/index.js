export const fetchBackups = async () => {
    const response = await fetch('/api/backups', { cache: 'no-store' });
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
};
