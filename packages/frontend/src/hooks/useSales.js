import { fetchFacturas, fetchProductos } from 'api/sales';
import useSWR from 'hooks/swr-wrapper';

/**
 * Facturas (paginated, filterable, sortable).
 */
export function useFacturas(
    {
        from,
        to,
        clientId,
        categoryId,
        employeeId,
        ruta,
        page = 1,
        limit = 20,
        sortBy = 'fecha',
        sortDir = 'desc',
        search,
        showNoe,
    },
    enabled = true,
) {
    const key =
        enabled && from && to
            ? [
                  'facturas',
                  from,
                  to,
                  clientId,
                  categoryId,
                  employeeId,
                  ruta,
                  page,
                  limit,
                  sortBy,
                  sortDir,
                  search,
                  showNoe,
              ]
            : null;
    return useSWR(
        key,
        () =>
            fetchFacturas({
                from,
                to,
                clientId,
                categoryId,
                employeeId,
                ruta,
                page,
                limit,
                sortBy,
                sortDir,
                search,
                showNoe,
            }),
        { keepPreviousData: true },
    );
}

/**
 * Productos (paginated, filterable, sortable).
 */
export function useProductos(
    {
        from,
        to,
        clientId,
        categoryId,
        employeeId,
        ruta,
        page = 1,
        limit = 20,
        sortBy = 'rawProfit',
        sortDir = 'desc',
        search,
        showNoe,
    },
    enabled = true,
) {
    const key =
        enabled && from && to
            ? [
                  'productos',
                  from,
                  to,
                  clientId,
                  categoryId,
                  employeeId,
                  ruta,
                  page,
                  limit,
                  sortBy,
                  sortDir,
                  search,
                  showNoe,
              ]
            : null;
    return useSWR(
        key,
        () =>
            fetchProductos({
                from,
                to,
                clientId,
                categoryId,
                employeeId,
                ruta,
                page,
                limit,
                sortBy,
                sortDir,
                search,
                showNoe,
            }),
        { keepPreviousData: true },
    );
}
