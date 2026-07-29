/**
 * SWR v1 compatibility wrapper.
 *
 * SWR 1.x does NOT export `isLoading` (added in v2).
 * This wrapper adds `isLoading = !data && !error` for v1 compatibility.
 */
import useSWROriginal from 'swr';

export function useSWR(key, fetcher, config) {
    const swr = useSWROriginal(key, fetcher, config);
    return {
        ...swr,
        isLoading: !swr.data && !swr.error,
    };
}

// Re-export everything else from swr
export { mutate, SWRConfig } from 'swr';
export default useSWR;
