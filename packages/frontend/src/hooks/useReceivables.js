import { fetchReceivableClient, fetchReceivables } from 'api/receivables';
import useSWR from 'swr';

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
