import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { useAuth } from './context';
import ExportButton from './export-button';
import { AccessForm, Field } from './forms';
import SalesDetail from './sales-detail';
import SalesSummary from './sales-summary';

export default function Sales() {
    const { session } = useAuth();
    const exportGrant = session.permissions.find((grant) => grant.capability === 'sales.export');
    const readGrant = session.permissions.find((grant) => grant.capability === 'sales.read');
    const today = new Date().toISOString().slice(0, 10);
    const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
    const [to, setTo] = useState(today);
    const [employeeId, setEmployeeId] = useState('');
    const [showNoe, setShowNoe] = useState('false');
    const [kind, setKind] = useState('facturas');
    const [query, setQuery] = useState(null);
    const [page, setPage] = useState(1);
    const [detail, setDetail] = useState(null);
    const [compareFrom, setCompareFrom] = useState('');
    const [compareTo, setCompareTo] = useState('');
    const key = query
        ? `/api/sales/${query.kind}?${new URLSearchParams({ ...query.parameters, page, limit: 20 })}`
        : null;
    const { data, error } = useSWR(key, fetcher);
    const columns =
        query?.kind === 'productos'
            ? [
                  ['product', 'Producto'],
                  ['quantity', 'Cantidad'],
                  ['peso', 'Peso'],
                  ['rawProfit', 'Total ventas'],
                  ['netProfit', 'Utilidad'],
                  ['averageProfitPercent', 'Margen %'],
              ]
            : [
                  ['invoiceId', 'Documento'],
                  ['fecha', 'Fecha'],
                  ['cliente', 'Cliente'],
                  ['vendedor', 'Vendedor'],
                  ['monto', 'Total ventas'],
                  ['utilidad', 'Utilidad'],
                  ['promedio', 'Margen %'],
              ];
    const financial = ['netProfit', 'averageProfitPercent', 'utilidad', 'promedio'];
    const visibleColumns = columns.filter(
        ([field]) => !financial.includes(field) || Object.hasOwn(data?.totals || {}, field),
    );
    return (
        <section aria-label="Consulta de ventas">
            <AccessForm
                title="Consultar ventas autorizadas"
                button="Consultar ventas"
                onSubmit={async () => {
                    if (Boolean(compareFrom) !== Boolean(compareTo))
                        throw new Error('Indica ambas fechas de comparación.');
                    setPage(1);
                    setDetail(null);
                    setQuery({
                        kind,
                        parameters: { from, to, employeeId, showNoe },
                        comparison: compareFrom ? { compareFrom, compareTo } : {},
                    });
                }}
            >
                <Field label="Ventas desde" type="date" value={from} onChange={setFrom} />
                <Field label="Ventas hasta" type="date" value={to} onChange={setTo} />
                <Field
                    label="Comparar ventas desde"
                    type="date"
                    required={false}
                    value={compareFrom}
                    onChange={setCompareFrom}
                />
                <Field
                    label="Comparar ventas hasta"
                    type="date"
                    required={false}
                    value={compareTo}
                    onChange={setCompareTo}
                />
                <Field
                    label="Filtrar vendedor"
                    required={false}
                    value={employeeId}
                    onChange={setEmployeeId}
                    maxLength={32}
                />
                <label htmlFor="sales-system">Sistema de ventas</label>
                <select
                    id="sales-system"
                    className="form-select"
                    value={showNoe}
                    onChange={(event) => setShowNoe(event.target.value)}
                >
                    <option value="false">Facturas</option>
                    <option value="true">Notas de entrega</option>
                </select>
                <label htmlFor="sales-report">Agrupar ventas por</label>
                <select
                    id="sales-report"
                    className="form-select"
                    value={kind}
                    onChange={(event) => setKind(event.target.value)}
                >
                    <option value="facturas">Documentos</option>
                    <option value="productos">Productos</option>
                </select>
            </AccessForm>
            <p>
                Solo se muestran datos y métricas cubiertos por tus permisos. Sin cobertura suficiente, la métrica se
                omite.
            </p>
            {query && !data && !error && <p role="status">Consultando ventas…</p>}
            {error && <p role="alert">No se pudo completar la consulta de ventas autorizada.</p>}
            {query && <SalesSummary query={query} />}
            {detail && <SalesDetail selection={detail} onClose={() => setDetail(null)} />}
            {query &&
                data &&
                !error &&
                exportGrant &&
                (exportGrant.scope === 'global' || readGrant?.scope === 'assigned' || query.parameters.employeeId) && (
                    <ExportButton
                        resource="sales"
                        parameters={{
                            ...query.parameters,
                            kind: query.kind === 'productos' ? 'products' : 'documents',
                        }}
                    />
                )}
            {data && !error && (
                <>
                    <table aria-label="Desglose autorizado de ventas" className="table table-dark">
                        <thead>
                            <tr>
                                {visibleColumns.map(([field, label]) => (
                                    <th key={field}>{label}</th>
                                ))}
                                {query.kind === 'facturas' && <th>Detalle</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {data.data.map((row, index) => (
                                <tr key={row.invoiceId || row.product || index}>
                                    {visibleColumns.map(([field]) => (
                                        <td key={field}>{row[field] ?? '—'}</td>
                                    ))}
                                    {query.kind === 'facturas' && (
                                        <td>
                                            <button
                                                type="button"
                                                className="btn btn-outline-light"
                                                onClick={() =>
                                                    setDetail({ id: row.invoiceId, showNoe: query.parameters.showNoe })
                                                }
                                            >
                                                Ver documento {row.invoiceId}
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                {visibleColumns.map(([field]) => (
                                    <td key={field}>{data.totals[field] ?? '—'}</td>
                                ))}
                                {query.kind === 'facturas' && <td />}
                            </tr>
                        </tfoot>
                    </table>
                    <p role="status">Documentos o productos autorizados: {data.pagination.total}</p>
                    <button
                        type="button"
                        className="btn btn-outline-light"
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                    >
                        Ventas: página anterior
                    </button>
                    <span className="mx-2">Página {page}</span>
                    <button
                        type="button"
                        className="btn btn-outline-light"
                        disabled={page * data.pagination.limit >= data.pagination.total}
                        onClick={() => setPage(page + 1)}
                    >
                        Ventas: página siguiente
                    </button>
                </>
            )}
        </section>
    );
}
