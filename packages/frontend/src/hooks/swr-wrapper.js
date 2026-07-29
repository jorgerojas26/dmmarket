/**
 * SWR v1 compatibility wrapper.
 *
 * SWR 1.x does NOT export `isLoading` (added in v2).
 * This wrapper adds `isLoading = initial-only` — shows spinner
 * on FIRST fetch, keeps previous data visible during key changes
 * (pagination, sort, search) to avoid flash.
 */
import { useEffect, useRef } from 'react';
import useSWROriginal from 'swr';

export function useSWR(key, fetcher, config) {
    const swr = useSWROriginal(key, fetcher, config);
    const prevDataRef = useRef(undefined);

    // Track last valid data so we can return it across key changes
    useEffect(() => {
        if (swr.data !== undefined) {
            prevDataRef.current = swr.data;
        }
    }, [swr.data]);

    // If SWR has data, use it. Otherwise fall back to previous key's data.
    const data = swr.data !== undefined ? swr.data : prevDataRef.current;

    // Only show initial-load spinner when there's truly NO data yet
    const isLoading = !swr.data && !swr.error && prevDataRef.current === undefined;

    return {
        ...swr,
        data,
        isLoading,
    };
}

// Re-export everything else from swr
export { mutate, SWRConfig } from 'swr';
export default useSWR;
