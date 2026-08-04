import { fetchProducts } from 'api/products';
import useSWR from 'hooks/swr-wrapper';

export function useProducts(filter, enabled = true) {
    const key = enabled ? ['products', filter] : null;
    return useSWR(key, () => fetchProducts({ filter }));
}
