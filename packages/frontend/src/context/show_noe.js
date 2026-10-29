import { fetchPreferences } from 'api/preferences';
import useSWR from 'hooks/swr-wrapper';
import { createContext } from 'react';

export const ShowNoeContext = createContext({
    showNoe: false,
    loading: true,
    error: null,
});

export const ShowNoesProvider = ({ children, enabled = true }) => {
    const { data, error, mutate } = useSWR(enabled ? '/api/preferences/effective' : null, fetchPreferences, {
        refreshInterval: 15000,
        dedupingInterval: 1000,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        shouldRetryOnError: false,
    });
    const value = {
        showNoe: data?.documentType === 'delivery-notes',
        preferences: data,
        loading: enabled && !data,
        error,
        refreshPreferences: mutate,
    };
    return <ShowNoeContext.Provider value={value}>{children}</ShowNoeContext.Provider>;
};
