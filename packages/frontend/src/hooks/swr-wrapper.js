import { ReportRevisionContext } from 'context/report_revision';
import { useContext } from 'react';
import useSWROriginal from 'swr';
import { fetcher as defaultFetcher } from 'swr-config';

export function useSWR(key, fetcher, config) {
    const revision = useContext(ReportRevisionContext);
    const scoped = key && revision != null;
    const scopedKey = scoped ? ['document-revision', revision, key] : key;
    const scopedFetcher = scoped ? () => (fetcher || defaultFetcher)(...(Array.isArray(key) ? key : [key])) : fetcher;
    const swr = useSWROriginal(scopedKey, scopedFetcher, { ...config, keepPreviousData: false });
    return {
        ...swr,
        data: key && !swr.error ? swr.data : undefined,
        isLoading: Boolean(key) && swr.isValidating && swr.data === undefined,
    };
}

export { mutate, SWRConfig } from 'swr';
export default useSWR;
