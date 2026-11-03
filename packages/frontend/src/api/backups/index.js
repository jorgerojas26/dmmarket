export const fetchBackups = async () => {
    const response = await fetch('/api/backups', { cache: 'no-store' });
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
};

export const createBackup = async () => {
    const response = await fetch('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
        throw Object.assign(new Error(data?.error?.message || 'No se pudo iniciar el respaldo.'), {
            status: response.status,
            code: data?.error?.code,
        });
    return { status: response.status, data };
};
