import { useAuth } from 'auth/context';
import useSWR from 'swr';
import { fetcher } from 'swr-config';

export function useReceivablesAccess() {
    const { can } = useAuth();
    const { data: status, error } = useSWR(can('receivables.read') ? '/api/receivables/status' : null, fetcher);
    return {
        status,
        error,
        canOperate: (type) => !error && status?.writesAvailable === true && can(`receivables.${type}`),
        canExport: can('receivables.export'),
    };
}
