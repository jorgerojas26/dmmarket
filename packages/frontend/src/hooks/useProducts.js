import { fetchProducts } from 'api/products';
import useSWR from 'hooks/swr-wrapper';

/**
 * Products list (paginated, server-side search/sort).
 */
export function useProducts(
    { search, categoryId, proveedorId, stockOnly, page = 1, limit = 20, sortBy, sortDir } = {},
    enabled = true,
) {
    const key = enabled ? ['products', search, categoryId, proveedorId, stockOnly, page, limit, sortBy, sortDir] : null;
    return useSWR(
        key,
        () => fetchProducts({ search, categoryId, proveedorId, stockOnly, page, limit, sortBy, sortDir }),
        { keepPreviousData: true },
    );
}
