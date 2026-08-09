/**
 * SWR v1 compatibility wrapper.
 *
 * SWR 1.x does NOT export `isLoading` (added in v2).
 * This wrapper adds `isLoading` = a fetch is in flight for a key with no
 * resolved data yet — the initial load AND every key change (pagination,
 * sort, search, filters). Previous data stays visible during key changes
 * (never flash empty); the spinner renders as an overlay on top of it.
 * Background revalidations (focus/reconnect) of a key that already has data
 * do NOT set loading, avoiding spinner flashes.
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

    // Fetch in flight for a key with no resolved data yet (initial or key change).
    // On key change SWR v1 resets `data` to undefined, so `!swr.data` alone
    // already distinguishes key-change fetches from background revalidations.
    const isLoading = swr.isValidating && !swr.data;

    return {
        ...swr,
        data,
        isLoading,
    };
}

// Re-export everything else from swr
export { mutate, SWRConfig } from 'swr';
export default useSWR;
