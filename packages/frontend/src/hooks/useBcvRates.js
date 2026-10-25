import { fetchBcvRateByDate, fetchBcvRates, fetchBcvStatus } from 'api/currency_rates';
import useSWR from 'hooks/swr-wrapper';

// Las tasas cambian una vez por día hábil: no hace falta revalidar al enfocar ni
// cada minuto, salvo el estado mientras una sincronización está en curso.
export function useBcvRates(enabled = true) {
    return useSWR(enabled ? 'bcv-rates' : null, fetchBcvRates, {
        dedupingInterval: 300_000,
        revalidateOnFocus: false,
    });
}

export function useBcvStatus(enabled = true) {
    return useSWR(enabled ? 'bcv-status' : null, fetchBcvStatus, {
        dedupingInterval: 10_000,
        revalidateOnFocus: false,
        refreshInterval: (data) => (data?.sincronizando ? 3000 : 0),
    });
}

// La tasa de una fecha es un dato cerrado: no se revalida al enfocar.
export function useBcvRateByDate(fecha, enabled = true) {
    return useSWR(enabled && fecha ? ['bcv-rate', fecha] : null, () => fetchBcvRateByDate(fecha), {
        dedupingInterval: 300_000,
        revalidateOnFocus: false,
    });
}
