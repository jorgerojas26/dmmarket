import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { useAuth } from './context';
import { AccessForm, Field } from './forms';

function Products({ rows, valueKey, recent = false }) {
    const inventory = rows.some((row) => Object.hasOwn(row, 'inventoryValue'));
    return (
        <div className="table-responsive">
            <table
                aria-label={recent ? 'Productos nuevos del Pareto' : 'Productos maduros del Pareto'}
                className="table table-dark"
            >
                <thead>
                    <tr>
                        {!recent && <th>Rango canónico</th>}
                        <th>Producto</th>
                        <th>Primera compra conocida</th>
                        <th>Unidades autorizadas</th>
                        <th>Importe autorizado</th>
                        {inventory && <th>Inventario actual a precio A</th>}
                        {!recent && (
                            <>
                                <th>Acumulado (%)</th>
                                <th>Clase ABC</th>
                            </>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.productId}>
                            {!recent && <td>{row.rank}</td>}
                            <td>{row.product}</td>
                            <td>{row.firstPurchaseDate ?? 'Sin fecha conocida'}</td>
                            <td>{row.quantity ?? 'No disponible'}</td>
                            <td>{row[valueKey] ?? 'No disponible'}</td>
                            {inventory && <td>{row.inventoryValue ?? 'No disponible'}</td>}
                            {!recent && (
                                <>
                                    <td>{row.cumulativePercent ?? 'Sin base válida'}</td>
                                    <td>{row.abcClass ?? 'Sin clasificación válida'}</td>
                                </>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function Pareto() {
    const { session, can } = useAuth();
    const has = (capability) => session.permissions.some((grant) => grant.capability === capability);
    const today = new Date().toISOString().slice(0, 10);
    const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
    const [to, setTo] = useState(today);
    const [modo, setMode] = useState('ventas');
    const [metric, setMetric] = useState('rawProfit');
    const [showNoe, setShowNoe] = useState('false');
    const [employeeId, setEmployeeId] = useState('');
    const [newSearch, setNewSearch] = useState('');
    const [sortBy, setSortBy] = useState('');
    const [query, setQuery] = useState(null);
    const [newPage, setNewPage] = useState(1);
    const { data, error } = useSWR(
        query ? `/api/dashboard/pareto?${new URLSearchParams({ ...query, newPage, newLimit: 20 })}` : null,
        fetcher,
    );
    const labels = {
        rawProfit: 'Ventas autorizadas',
        netProfit: 'Utilidad autorizada',
        totalPurchased: 'Compras autorizadas',
    };
    return (
        <section aria-label="Pareto autorizado" className="my-4">
            <AccessForm
                title="Pareto de productos autorizados"
                button="Consultar Pareto"
                onSubmit={async () => {
                    setNewPage(1);
                    setQuery({
                        from,
                        to,
                        modo,
                        metric: modo === 'ventas' ? metric : 'totalPurchased',
                        showNoe,
                        newSearch,
                        ...(sortBy ? { sortBy } : {}),
                        ...(modo === 'ventas' && employeeId ? { employeeId } : {}),
                    });
                }}
            >
                <Field label="Pareto desde" type="date" value={from} onChange={setFrom} />
                <Field label="Pareto hasta" type="date" value={to} onChange={setTo} />
                <label htmlFor="pareto-mode">Modo del Pareto</label>
                <select
                    id="pareto-mode"
                    className="form-select"
                    value={modo}
                    onChange={(event) => setMode(event.target.value)}
                >
                    <option value="ventas">Ventas de productos comprados en el período</option>
                    {can('sales.read') && can('purchases.costs') && (
                        <option value="compras-sin-vender">Compras sin ventas globales en el período</option>
                    )}
                </select>
                {modo === 'ventas' && (
                    <>
                        <label htmlFor="pareto-metric">Métrica del Pareto</label>
                        <select
                            id="pareto-metric"
                            className="form-select"
                            value={metric}
                            onChange={(event) => setMetric(event.target.value)}
                        >
                            <option value="rawProfit">Ventas autorizadas</option>
                            {has('sales.costs') && has('sales.profit') && (
                                <option value="netProfit">Utilidad autorizada</option>
                            )}
                        </select>
                        <Field
                            label="Vendedor del Pareto"
                            value={employeeId}
                            onChange={setEmployeeId}
                            required={false}
                            maxLength={32}
                        />
                    </>
                )}
                <label htmlFor="pareto-system">Sistema de ventas del Pareto</label>
                <select
                    id="pareto-system"
                    className="form-select"
                    value={showNoe}
                    onChange={(event) => setShowNoe(event.target.value)}
                >
                    <option value="false">Facturas</option>
                    <option value="true">Notas de entrega</option>
                </select>
                <label htmlFor="pareto-sort">Orden del Pareto</label>
                <select
                    id="pareto-sort"
                    className="form-select"
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                >
                    <option value="">Importe autorizado</option>
                    <option value="quantity">Unidades autorizadas</option>
                    <option value="cumulativePercent">Porcentaje acumulado</option>
                    {can('inventory.read') && can('inventory.costs') && (
                        <option value="inventoryValue">Inventario actual a precio A</option>
                    )}
                </select>
                <Field
                    label="Buscar entre productos nuevos"
                    value={newSearch}
                    onChange={setNewSearch}
                    required={false}
                    maxLength={128}
                />
            </AccessForm>
            <p>
                Incluye sólo productos comprados en el período. Los que tienen menos de 30 días desde su primera compra
                al corte se muestran aparte y no cambian los porcentajes del ABC. Ventas y utilidad respetan tu alcance;
                la ausencia global de ventas exige lectura global. El inventario, cuando está autorizado, es actual y
                valorado a precio A, no histórico ni a costo.
            </p>
            {query && !data && !error && <p role="status">Consultando Pareto autorizado…</p>}
            {error && <p role="alert">No se pudo consultar el Pareto con el alcance solicitado.</p>}
            {data && !error && (
                <>
                    <p>Métrica autorizada: {labels[data.valueKey]}</p>
                    <p>Productos maduros: {data.summary.totalProducts}</p>
                    <Products rows={data.products} valueKey={data.valueKey} />
                    <h2 className="h5">Productos nuevos</h2>
                    <p role="status">
                        Productos nuevos: {data.newProductsCount}; coincidencias: {data.newProductsTotal}
                    </p>
                    {Object.hasOwn(data, 'newProductsInventoryTotal') && (
                        <p>
                            Inventario actual a precio A de los nuevos filtrados:{' '}
                            {data.newProductsInventoryTotal ?? 'No disponible'}
                        </p>
                    )}
                    <Products rows={data.newProducts} valueKey={data.valueKey} recent />
                    <button
                        type="button"
                        className="btn btn-outline-light"
                        disabled={newPage === 1}
                        onClick={() => setNewPage(newPage - 1)}
                    >
                        Pareto nuevos: página anterior
                    </button>
                    <button
                        type="button"
                        className="btn btn-outline-light"
                        disabled={newPage * 20 >= data.newProductsTotal}
                        onClick={() => setNewPage(newPage + 1)}
                    >
                        Pareto nuevos: página siguiente
                    </button>
                </>
            )}
        </section>
    );
}
