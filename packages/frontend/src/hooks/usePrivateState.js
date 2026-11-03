import { useCallback } from 'react';
import useSWR from 'swr';

export default function usePrivateState(key, initial) {
    const { data = initial, mutate } = useSWR(['private-ui', key], null, {
        fallbackData: initial,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
    });
    const set = useCallback(
        (value) => mutate((current) => (typeof value === 'function' ? value(current ?? initial) : value), false),
        [mutate, initial],
    );
    const reset = useCallback(() => mutate(undefined, false), [mutate]);
    return [data, set, reset];
}
