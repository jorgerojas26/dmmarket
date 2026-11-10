import { fetchReceivableBanks, fetchReceivableClient, fetchReceivableMethods, fetchReceivables } from 'api/receivables';
import useSWR from 'swr';

export function useReceivableBanks() {
    return useSWR('receivable-banks', fetchReceivableBanks);
}

export function useReceivableMethods(enabled = true) {
    return useSWR(enabled ? 'receivable-methods' : null, fetchReceivableMethods);
}

export function useReceivables(filters) {
    return useSWR(['receivables', JSON.stringify(filters)], () => fetchReceivables(filters), {
        revalidateOnFocus: true,
    });
}

export function useReceivableClient(id, filters) {
    return useSWR(
        id ? ['receivable-client', id, JSON.stringify(filters)] : null,
        () => fetchReceivableClient(id, filters),
        { revalidateOnFocus: true },
    );
}
