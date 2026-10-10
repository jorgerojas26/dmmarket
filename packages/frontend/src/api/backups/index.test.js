import { createBackup, fetchBackups } from './index';

const originalFetch = global.fetch;

beforeEach(() => {
    global.fetch = jest.fn();
});

afterEach(() => {
    global.fetch = originalFetch;
});

it('reads live backup status without caching', async () => {
    const data = { backups: [], controlToken: 'token' };
    global.fetch.mockResolvedValue({ status: 200, json: async () => data });
    expect(await fetchBackups()).toEqual({ status: 200, data });
    expect(global.fetch).toHaveBeenCalledWith('/api/backups', { cache: 'no-store' });
});

it('starts a manual backup with its control token and explicit confirmation', async () => {
    global.fetch.mockResolvedValue({ status: 202, json: async () => ({ ok: true }) });
    expect(await createBackup('token')).toEqual({ status: 202, data: { ok: true } });
    expect(global.fetch).toHaveBeenCalledWith('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-backup-token': 'token' },
        body: JSON.stringify({ confirmed: true }),
    });
});

it('returns HTTP failures even when the response is not JSON', async () => {
    global.fetch.mockResolvedValue({
        status: 502,
        json: async () => {
            throw new Error('not JSON');
        },
    });
    expect(await createBackup('token')).toEqual({ status: 502, data: null });
});

it('propagates network failures', async () => {
    global.fetch.mockRejectedValue(new Error('offline'));
    await expect(createBackup('token')).rejects.toThrow('offline');
});
