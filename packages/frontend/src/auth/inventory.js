import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { useAuth } from './context';
import { AccessForm, Field } from './forms';

export default function Inventory() {
    const { can } = useAuth();
    const [search, setSearch] = useState('');
    const [categoryId, setCategory] = useState('');
    const [proveedorId, setProvider] = useState('');
    const [stockOnly, setStockOnly] = useState(false);
    const [sortBy, setSortBy] = useState('Descripcion');
    const [sortDir, setSortDir] = useState('asc');
    const [query, setQuery] = useState(null);
    const [page, setPage] = useState(1);
    const { data: groups, error: groupsError } = useSWR('/api/groups', fetcher);
    const { data, error } = useSWR(
        query ? `/api/products?${new URLSearchParams({ ...query, page, limit: 20 })}` : null,
        fetcher,
    );
    const monetary = data?.data.some((row) => Object.hasOwn(row, 'PrecioA'));
    const providers = data?.data.some((row) => Object.hasOwn(row, 'Proveedor'));
    return (
        <section aria-label="Inventario autorizado" className="my-4">
            <AccessForm
                title="Consultar inventario autorizado"
                button="Consultar inventario"
                onSubmit={async () => {
                    setPage(1);
                    setQuery({
                        search,
                        stockOnly: String(stockOnly),
                        sortBy,
                        sortDir,
                        ...(categoryId ? { categoryId } : {}),
                        ...(can('providers.read') && proveedorId ? { proveedorId } : {}),
                    });
                }}
            >
                <Field
                    label="Buscar en inventario"
                    value={search}
                    onChange={setSearch}
                    maxLength={128}
                    required={false}
                />
                <label htmlFor="inventory-group">Grupo del inventario</label>
                <select
                    id="inventory-group"
                    className="form-select"
                    value={categoryId}
                    onChange={(event) => setCategory(event.target.value)}
                    disabled={!groups}
                >
                    <option value="">Todos los grupos</option>
                    {groups?.map((group) => (
                        <option key={group.groupId} value={group.groupId}>
                            {group.name}
                        </option>
                    ))}
                </select>
                {groupsError && <p role="alert">No se pudieron cargar los grupos autorizados.</p>}
                {can('providers.read') && (
                    <Field
                        label="Proveedor del inventario"
                        value={proveedorId}
                        onChange={setProvider}
                        maxLength={32}
                        required={false}
                    />
                )}
                <div className="form-check my-3">
                    <input
                        id="inventory-stock"
                        className="form-check-input"
                        type="checkbox"
                        checked={stockOnly}
                        onChange={(event) => setStockOnly(event.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="inventory-stock">
                        Sólo existencias positivas
                    </label>
                </div>
                <label htmlFor="inventory-sort">Orden del inventario</label>
                <select
                    id="inventory-sort"
                    className="form-select"
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                >
                    <option value="Descripcion">Descripción</option>
                    <option value="IdProducto">Identificador</option>
                    <option value="Grupo">Grupo</option>
                    <option value="Existencia">Existencias</option>
                    <option value="Peso">Peso</option>
                    {can('providers.read') && <option value="Proveedor">Proveedor</option>}
                    {can('inventory.costs') && (
                        <>
                            <option value="PrecioA">Precio A autorizado</option>
                            <option value="inventoryValue">Valor actual a precio A</option>
                        </>
                    )}
                </select>
                <label htmlFor="inventory-direction">Dirección del inventario</label>
                <select
                    id="inventory-direction"
                    className="form-select"
                    value={sortDir}
                    onChange={(event) => setSortDir(event.target.value)}
                >
                    <option value="asc">Ascendente</option>
                    <option value="desc">Descendente</option>
                </select>
            </AccessForm>
            <p>
                Las existencias son actuales. Los campos monetarios requieren permiso separado y su valoración usa
                precio A, no costo de adquisición. Los valores desconocidos no se sustituyen por cero. Los totales
                abarcan todo el filtro, no sólo esta página.
            </p>
            {query && !data && !error && <p role="status">Consultando inventario…</p>}
            {error && <p role="alert">No se pudo consultar el inventario autorizado.</p>}
            {data && !error && (
                <>
                    <p role="status">Productos autorizados: {data.total}</p>
                    <p>Existencias totales del filtro: {data.totals.existencia ?? 'No disponible'}</p>
                    {Object.hasOwn(data.totals, 'inventoryValue') && (
                        <p>Valor actual a precio A del filtro: {data.totals.inventoryValue ?? 'No disponible'}</p>
                    )}
                    <div className="table-responsive">
                        <table aria-label="Existencias autorizadas" className="table table-dark">
                            <thead>
                                <tr>
                                    <th>Identificador</th>
                                    <th>Producto</th>
                                    <th>Grupo</th>
                                    <th>Peso</th>
                                    <th>Existencias</th>
                                    {providers && <th>Proveedor autorizado</th>}
                                    {monetary && (
                                        <>
                                            <th>Precio A autorizado</th>
                                            <th>Valor actual a precio A</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((row) => (
                                    <tr key={row.IdProducto}>
                                        <td>{row.IdProducto}</td>
                                        <td>{row.Descripcion}</td>
                                        <td>{row.Grupo}</td>
                                        <td>{row.Peso ?? 'No disponible'}</td>
                                        <td>{row.Existencia ?? 'No disponible'}</td>
                                        {providers && <td>{row.Proveedor}</td>}
                                        {monetary && (
                                            <>
                                                <td>{row.PrecioA ?? 'No disponible'}</td>
                                                <td>{row.inventoryValue ?? 'No disponible'}</td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <button
                        type="button"
                        className="btn btn-outline-light"
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                    >
                        Inventario: página anterior
                    </button>
                    <button
                        type="button"
                        className="btn btn-outline-light"
                        disabled={page * data.limit >= data.total}
                        onClick={() => setPage(page + 1)}
                    >
                        Inventario: página siguiente
                    </button>
                </>
            )}
        </section>
    );
}
