import {
    executeReceivableOperation,
    fetchReceivableBanks,
    fetchReceivableClient,
    fetchReceivables,
} from './receivables';

beforeEach(() => {
    global.fetch = jest.fn();
});
afterEach(() => {
    delete global.fetch;
});

it('encodes identifiers and filters without constructing ambiguous URLs', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ client: {} }) });
    await fetchReceivableClient('A/B', { documents: 'all' });
    expect(fetch).toHaveBeenCalledWith('/api/receivables/A%2FB?documents=all', undefined);
    await fetchReceivables({ search: 'Cliente & Uno', page: 1 });
    expect(fetch.mock.calls[1][0]).toBe('/api/receivables?search=Cliente+%26+Uno&page=1');
});

it('propagates financial API errors instead of returning empty data', async () => {
    fetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: { message: 'La tasa cambió' } }) });
    await expect(executeReceivableOperation('C1', { amount: '10' })).rejects.toMatchObject({
        status: 409,
        message: 'La tasa cambió',
    });
    expect(fetch.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
});

it('reports an unreadable success response as a failure', async () => {
    fetch.mockResolvedValue({
        ok: true,
        json: async () => {
            throw new Error('invalid');
        },
    });
    await expect(fetchReceivables({})).rejects.toThrow('respuesta');
});

it('fetches the bank catalog from its read-only endpoint', async () => {
    const banks = [{ id: 'BV', name: 'BANCO DE VENEZUELA' }];
    fetch.mockResolvedValue({ ok: true, json: async () => banks });
    expect(await fetchReceivableBanks()).toEqual(banks);
    expect(fetch).toHaveBeenCalledWith('/api/receivables/banks', undefined);
});
