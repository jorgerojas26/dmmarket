import useSWROriginal from 'swr';

export function useSWR(key, fetcher, config) {
    const swr = useSWROriginal(key, fetcher, { ...config, keepPreviousData: false });
    return {
        ...swr,
        data: key && !swr.error ? swr.data : undefined,
        isLoading: Boolean(key) && swr.isValidating && swr.data === undefined,
    };
}

export { mutate, SWRConfig } from 'swr';
export default useSWR;
