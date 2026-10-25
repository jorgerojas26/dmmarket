/**
 * Centralized SWR configuration.
 *
 * Global defaults: revalidateOnFocus, dedupingInterval.
 * Export a vanilla `fetcher` for ad-hoc imperative calls (mutations, detail modals, etc.).
 */

const DEFAULT_DEDUPING_INTERVAL = 30_000; // 30 s — don't re-fetch same key across components

export const swrConfig = {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: DEFAULT_DEDUPING_INTERVAL,
    shouldRetryOnError: false,
};

/**
 * Generic fetch wrapper — throws on !ok so SWR populates `error`.
 * Use as the default `fetcher` in SWRConfig or pass directly to useSWR calls.
 */
export async function fetcher(url, init) {
    const res = await fetch(url, init);
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        const error = new Error(body?.error?.message || `HTTP ${res.status}`);
        error.status = res.status;
        error.code = body?.error?.code;
        throw error;
    }
    return res.json();
}
