import useSWR from 'hooks/swr-wrapper';
import { useState } from 'react';
import { fetcher } from 'swr-config';
import { AccessForm, Field } from './forms';

export default function Sales() {
    const today = new Date().toISOString().slice(0, 10);
    const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
    const [to, setTo] = useState(today);
    const [employeeId, setEmployeeId] = useState('');
    const [showNoe, setShowNoe] = useState('false');
    const [kind, setKind] = useState('facturas');
    const [query, setQuery] = useState(null);
    const [page, setPage] = useState(1);
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
                    setPage(1);
                    setQuery({ kind, parameters: { from, to, employeeId, showNoe } });
                }}
            >
                <Field label="Ventas desde" type="date" value={from} onChange={setFrom} />
                <Field label="Ventas hasta" type="date" value={to} onChange={setTo} />
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
            {data && (
                <>
                    <table className="table table-dark">
                        <thead>
                            <tr>
                                {visibleColumns.map(([field, label]) => (
                                    <th key={field}>{label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.data.map((row, index) => (
                                <tr key={row.invoiceId || row.product || index}>
                                    {visibleColumns.map(([field]) => (
                                        <td key={field}>{row[field] ?? '—'}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                {visibleColumns.map(([field]) => (
                                    <td key={field}>{data.totals[field] ?? '—'}</td>
                                ))}
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
