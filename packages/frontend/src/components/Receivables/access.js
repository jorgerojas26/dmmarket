import { useAuth } from 'auth/context';
import useSWR from 'swr';
import { fetcher } from 'swr-config';

export function useReceivablesAccess() {
    const { can } = useAuth();
    const { data: status, error, mutate } = useSWR(can('receivables.read') ? '/api/receivables/status' : null, fetcher);
    return {
        status,
        error,
        refreshStatus: () => mutate(),
        canOperate: (type) => !error && status?.writesAvailable === true && can(`receivables.${type}`),
        canExport: can('receivables.export'),
    };
}
