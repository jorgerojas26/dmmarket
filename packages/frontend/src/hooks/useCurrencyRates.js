import { fetchCurrencyRates } from 'api/currency_rates';
import useSWR from 'hooks/swr-wrapper';

export function useCurrencyRates(enabled = true) {
    const key = enabled ? 'currency-rates' : null;
    return useSWR(key, fetchCurrencyRates, {
        // Currency rates don't change often
        dedupingInterval: 300_000, // 5 min
        revalidateOnFocus: false,
    });
}
