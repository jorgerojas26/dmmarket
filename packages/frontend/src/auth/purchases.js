import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { useAuth } from './context';
import { AccessForm, Field } from './forms';

export default function Purchases() {
    const { can } = useAuth();
    const today = new Date().toISOString().slice(0, 10);
    const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
    const [to, setTo] = useState(today);
    const [view, setView] = useState('invoices');
    const [search, setSearch] = useState('');
    const [categoryId, setCategory] = useState('');
    const [proveedorId, setProvider] = useState('');
    const [sortBy, setSortBy] = useState('fecha');
    const [sortDir, setSortDir] = useState('desc');
    const [query, setQuery] = useState(null);
    const [page, setPage] = useState(1);
    const { data: groups, error: groupsError } = useSWR('/api/groups', fetcher);
    const { data, error } = useSWR(
        query ? `/api/purchases/${query.view}?${new URLSearchParams({ ...query.parameters, page, limit: 20 })}` : null,
        fetcher,
    );
    const products = query?.view === 'products';
    const costs = data && Object.hasOwn(data.totals, 'monto');
    const providers = data?.data.some((row) => Object.hasOwn(row, 'proveedor'));
    return (
        <section aria-label="Consulta autorizada de compras" className="my-4">
            <AccessForm
                title="Consultar compras autorizadas"
                button="Consultar compras"
                onSubmit={async () => {
                    setPage(1);
                    setQuery({
                        view,
                        parameters: {
                            from,
                            to,
                            search,
                            sortBy,
                            sortDir,
                            ...(categoryId ? { categoryId } : {}),
                            ...(can('providers.read') && proveedorId ? { proveedorId } : {}),
                        },
                    });
                }}
            >
                <Field label="Compras desde" type="date" value={from} onChange={setFrom} />
                <Field label="Compras hasta" type="date" value={to} onChange={setTo} />
                <label htmlFor="purchase-view">Vista de compras</label>
                <select
                    id="purchase-view"
                    className="form-select"
                    value={view}
                    onChange={(event) => {
                        setView(event.target.value);
                        setSortBy(event.target.value === 'products' ? 'product' : 'fecha');
                    }}
                >
                    <option value="invoices">Documentos</option>
                    <option value="products">Productos</option>
                </select>
                <Field label="Buscar en compras" value={search} onChange={setSearch} required={false} maxLength={128} />
                <label htmlFor="purchase-group">Grupo de compras</label>
                <select
                    id="purchase-group"
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
                        label="Proveedor de compras"
                        value={proveedorId}
                        onChange={setProvider}
                        required={false}
                        maxLength={32}
                    />
                )}
                <label htmlFor="purchase-sort">Orden de compras</label>
                <select
                    id="purchase-sort"
                    className="form-select"
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                >
                    {view === 'products' ? (
                        <>
                            <option value="product">Producto</option>
                            <option value="quantity">Unidades</option>
                            {can('purchases.costs') && (
                                <option value="avgUnitCost">Costo unitario promedio autorizado</option>
                            )}
                        </>
                    ) : (
                        <>
                            <option value="fecha">Fecha</option>
                            <option value="numero">Documento</option>
                            <option value="unidades">Unidades</option>
                            {can('providers.read') && <option value="proveedor">Proveedor autorizado</option>}
                        </>
                    )}
                    {can('purchases.costs') && <option value="monto">Total Compras autorizado</option>}
                </select>
                <label htmlFor="purchase-direction">Dirección de compras</label>
                <select
                    id="purchase-direction"
                    className="form-select"
                    value={sortDir}
                    onChange={(event) => setSortDir(event.target.value)}
                >
                    <option value="desc">Descendente</option>
                    <option value="asc">Ascendente</option>
                </select>
            </AccessForm>
            <p>
                Las compras usan su propio registro, sin alternar con los sistemas de ventas. Importes y costos promedio
                requieren permiso separado. Los totales abarcan todo el filtro; un grupo limita también las líneas
                incluidas de cada documento.
            </p>
            {query && !data && !error && <p role="status">Consultando compras…</p>}
            {error && <p role="alert">No se pudieron consultar las compras autorizadas.</p>}
            {data && !error && (
                <>
                    <p role="status">Registros de compras autorizados: {data.pagination.total}</p>
                    <p>
                        Unidades del filtro de compras:{' '}
                        {(products ? data.totals.quantity : data.totals.unidades) ?? 'No disponible'}
                    </p>
                    {costs && <p>Total Compras autorizado del filtro: {data.totals.monto ?? 'No disponible'}</p>}
                    <div className="table-responsive">
                        <table aria-label="Compras autorizadas" className="table table-dark">
                            <thead>
                                <tr>
                                    <th>{products ? 'Producto' : 'Documento'}</th>
                                    {!products && <th>Fecha</th>}
                                    {providers && <th>Proveedor autorizado</th>}
                                    <th>Unidades</th>
                                    {costs && <th>Total Compras autorizado</th>}
                                    {costs && products && <th>Costo unitario promedio autorizado</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((row) => (
                                    <tr key={products ? row.productId : row.invoiceId}>
                                        <td>{products ? row.product : row.invoiceId}</td>
                                        {!products && <td>{row.fecha}</td>}
                                        {providers && <td>{row.proveedor}</td>}
                                        <td>{(products ? row.quantity : row.unidades) ?? 'No disponible'}</td>
                                        {costs && <td>{row.monto ?? 'No disponible'}</td>}
                                        {costs && products && <td>{row.avgUnitCost ?? 'No disponible'}</td>}
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
                        Compras: página anterior
                    </button>
                    <button
                        type="button"
                        className="btn btn-outline-light"
                        disabled={page * data.pagination.limit >= data.pagination.total}
                        onClick={() => setPage(page + 1)}
                    >
                        Compras: página siguiente
                    </button>
                </>
            )}
        </section>
    );
}
