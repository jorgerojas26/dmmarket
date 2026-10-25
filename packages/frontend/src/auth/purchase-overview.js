import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { useAuth } from './context';
import { AccessForm, Field } from './forms';
import PurchasePanels from './purchase-panels';
import PurchasePareto from './purchase-pareto';

export default function PurchaseOverview({ pareto = false }) {
    const { can } = useAuth();
    const today = new Date().toISOString().slice(0, 10);
    const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
    const [to, setTo] = useState(today);
    const [compareFrom, setCompareFrom] = useState('');
    const [compareTo, setCompareTo] = useState('');
    const [categoryId, setCategory] = useState('');
    const [proveedorId, setProvider] = useState('');
    const [query, setQuery] = useState(null);
    const { data: groups, error: groupsError } = useSWR('/api/groups', fetcher);
    const { data, error } = useSWR(
        query ? `/api/purchases/${pareto ? 'pareto' : 'dashboard'}?${new URLSearchParams(query)}` : null,
        fetcher,
    );
    const costs = data?.kpis && Object.hasOwn(data.kpis, 'totalPurchased');
    return (
        <section aria-label={pareto ? 'Pareto de compras' : 'Resumen de compras'}>
            <AccessForm
                title={pareto ? 'Pareto autorizado de compras' : 'Resumen autorizado de compras'}
                button={pareto ? 'Consultar Pareto de compras' : 'Consultar resumen de compras'}
                onSubmit={async () =>
                    setQuery({
                        from,
                        to,
                        ...(categoryId ? { categoryId } : {}),
                        ...(can('providers.read') && proveedorId ? { proveedorId } : {}),
                        ...(!pareto && (compareFrom || compareTo) ? { compareFrom, compareTo } : {}),
                    })
                }
            >
                <Field label="Resumen de compras desde" type="date" value={from} onChange={setFrom} />
                <Field label="Resumen de compras hasta" type="date" value={to} onChange={setTo} />
                {!pareto && (
                    <>
                        <Field
                            label="Comparar compras desde"
                            type="date"
                            value={compareFrom}
                            onChange={setCompareFrom}
                            required={false}
                        />
                        <Field
                            label="Comparar compras hasta"
                            type="date"
                            value={compareTo}
                            onChange={setCompareTo}
                            required={false}
                        />
                    </>
                )}
                <label htmlFor="purchase-overview-group">Grupo del resumen de compras</label>
                <select
                    id="purchase-overview-group"
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
                        label="Proveedor del resumen de compras"
                        value={proveedorId}
                        onChange={setProvider}
                        required={false}
                        maxLength={32}
                    />
                )}
            </AccessForm>
            <p>
                Los importes y costos promedio requieren permiso explícito. Sin ese permiso, los rankings se ordenan por
                unidades; los proveedores sólo aparecen si puedes consultarlos. El Pareto usa todas las compras
                filtradas, sin excluir productos nuevos.
            </p>
            {query && !data && !error && <p role="status">Consultando resumen de compras…</p>}
            {error && <p role="alert">No se pudo consultar el resumen autorizado de compras.</p>}
            {data &&
                !error &&
                (pareto ? (
                    <PurchasePareto key={JSON.stringify(query)} data={data} />
                ) : (
                    <>
                        <PurchasePanels data={data} costs={costs} />
                        {data.kpis.compareInvoices !== null && (
                            <>
                                <p>Documentos de compras del período comparado: {data.kpis.compareInvoices}</p>
                                <p>Unidades del período comparado: {data.kpis.compareQuantity ?? 'No disponible'}</p>
                                {costs && (
                                    <p>
                                        Total Compras autorizado del período comparado:{' '}
                                        {data.kpis.comparePurchased ?? 'No disponible'}
                                    </p>
                                )}
                            </>
                        )}
                        <h3 className="h5">
                            Principales productos por {costs ? 'Total Compras autorizado' : 'unidades'}
                        </h3>
                        <div className="table-responsive">
                            <table aria-label="Productos del resumen de compras" className="table table-dark">
                                <thead>
                                    <tr>
                                        <th>Producto</th>
                                        <th>Unidades</th>
                                        {costs && (
                                            <>
                                                <th>Total Compras autorizado</th>
                                                <th>Costo unitario promedio autorizado</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.topProducts.map((row) => (
                                        <tr key={row.productId}>
                                            <td>{row.product}</td>
                                            <td>{row.quantity ?? 'No disponible'}</td>
                                            {costs && (
                                                <>
                                                    <td>{row.totalPurchased ?? 'No disponible'}</td>
                                                    <td>{row.avgUnitCost ?? 'No disponible'}</td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {Object.hasOwn(data, 'topProviders') && (
                            <>
                                <h3 className="h5">Principales proveedores autorizados</h3>
                                <div className="table-responsive">
                                    <table aria-label="Proveedores del resumen de compras" className="table table-dark">
                                        <thead>
                                            <tr>
                                                <th>Proveedor</th>
                                                <th>Unidades</th>
                                                <th>Documentos</th>
                                                {costs && <th>Total Compras autorizado</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.topProviders.map((row) => (
                                                <tr key={row.id}>
                                                    <td>{row.name}</td>
                                                    <td>{row.quantity ?? 'No disponible'}</td>
                                                    <td>{row.invoiceCount}</td>
                                                    {costs && <td>{row.totalPurchased ?? 'No disponible'}</td>}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                        <h3 className="h5">Compras por grupo</h3>
                        <div className="table-responsive">
                            <table aria-label="Grupos del resumen de compras" className="table table-dark">
                                <thead>
                                    <tr>
                                        <th>Grupo</th>
                                        <th>Unidades</th>
                                        {costs && <th>Total Compras autorizado</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.groupPurchasesChart.map((row) => (
                                        <tr key={JSON.stringify(row.groupId)}>
                                            <td>{row.categoria}</td>
                                            <td>{row.quantity ?? 'No disponible'}</td>
                                            {costs && <td>{row.totalPurchased ?? 'No disponible'}</td>}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                ))}
        </section>
    );
}
