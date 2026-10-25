import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { useAuth } from './context';
import ExportButton from './export-button';
import { AccessForm, Field } from './forms';

function Document({ selection, onClose }) {
    const { data, error } = useSWR(
        `/api/providers/${encodeURIComponent(selection.providerId)}/${selection.kind}/${encodeURIComponent(selection.id)}?${new URLSearchParams(selection.parameters)}`,
        fetcher,
    );
    const lines = useMemo(() => (data?.productos || []).map((row) => ({ ...row, key: crypto.randomUUID() })), [data]);
    const columns = [
        ['descripcion', 'Producto'],
        ['cantidad', 'Cantidad'],
        ['precio', 'Precio autorizado'],
        ['subtotal', 'Subtotal autorizado'],
        ['costo', 'Costo autorizado'],
        ['utilidad', 'Utilidad autorizada'],
    ].filter(([key]) => data?.productos.some((row) => Object.hasOwn(row, key)));
    return (
        <section aria-label="Documento del proveedor" className="card bg-dark border-secondary p-3 my-3">
            <h3 className="h5">Documento {selection.id}</h3>
            <button type="button" className="btn btn-outline-light" onClick={onClose}>
                Cerrar documento del proveedor
            </button>
            {error && <p role="alert">El documento no está disponible para este proveedor y sesión.</p>}
            {!data && !error && <p role="status">Consultando documento del proveedor…</p>}
            {data && !error && (
                <>
                    <p>Fecha: {data.fecha}</p>
                    {Object.hasOwn(data, 'total') && <p>Total autorizado del documento: {data.total}</p>}
                    {Object.hasOwn(data, 'utilidad') && <p>Utilidad autorizada del documento: {data.utilidad}</p>}
                    <div className="table-responsive">
                        <table className="table table-dark">
                            <thead>
                                <tr>
                                    {columns.map(([key, label]) => (
                                        <th key={key}>{label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map((row) => (
                                    <tr key={row.key}>
                                        {columns.map(([key]) => (
                                            <td key={key}>{row[key] ?? 'No disponible'}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </section>
    );
}

function Provider({ provider, onClose }) {
    const { session, can } = useAuth();
    const hasSales = session.permissions.some((grant) => grant.capability === 'sales.read');
    const hasPurchases = can('purchases.read');
    const [kind, setKind] = useState('summary');
    const today = new Date().toISOString().slice(0, 10);
    const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
    const [to, setTo] = useState(today);
    const [showNoe, setShowNoe] = useState('false');
    const [query, setQuery] = useState(null);
    const [page, setPage] = useState(1);
    const [document, setDocument] = useState(null);
    const { data, error } = useSWR(
        query
            ? `/api/providers/${encodeURIComponent(provider.IdProveedor)}/${query.kind}?${new URLSearchParams({ ...query.parameters, ...(query.kind !== 'summary' ? { page, limit: 20 } : {}) })}`
            : null,
        fetcher,
    );
    const columns = [
        ['invoiceId', 'Documento'],
        ['fecha', 'Fecha'],
        ['product', 'Producto'],
        ['name', query?.kind === 'sellers' ? 'Vendedor' : 'Cliente'],
        ['amount', 'Total Ventas autorizado'],
        ['invoiceCount', 'Documentos'],
        ['profit', 'Utilidad autorizada'],
        ['quantity', 'Cantidad'],
        ['unidades', 'Unidades'],
        ['cliente', 'Cliente'],
        ['vendedor', 'Vendedor'],
        ['monto', 'Importe autorizado'],
        ['rawProfit', 'Total Ventas autorizado'],
        ['netProfit', 'Utilidad autorizada'],
        ['utilidad', 'Utilidad autorizada'],
        ['avgUnitCost', 'Costo unitario promedio autorizado'],
    ].filter(([key]) => data?.data?.some((row) => Object.hasOwn(row, key)));
    return (
        <section aria-label="Detalle autorizado del proveedor" className="my-3">
            <h3 className="h5">{provider.Empresa}</h3>
            <button type="button" className="btn btn-outline-light" onClick={onClose}>
                Cerrar proveedor
            </button>
            {hasSales || hasPurchases ? (
                <AccessForm
                    title="Consultar actividad autorizada del proveedor"
                    button="Consultar actividad del proveedor"
                    onSubmit={async () => {
                        setPage(1);
                        setDocument(null);
                        setQuery({ kind, parameters: { from, to, ...(kind !== 'purchases' ? { showNoe } : {}) } });
                    }}
                >
                    <Field label="Proveedor desde" type="date" value={from} onChange={setFrom} />
                    <Field label="Proveedor hasta" type="date" value={to} onChange={setTo} />
                    <label htmlFor="provider-view">Actividad del proveedor</label>
                    <select
                        id="provider-view"
                        className="form-select"
                        value={kind}
                        onChange={(event) => setKind(event.target.value)}
                    >
                        <option value="summary">Resumen autorizado</option>
                        {hasSales && (
                            <>
                                <option value="sales">Ventas autorizadas</option>
                                <option value="products">Productos vendidos autorizados</option>
                                {can('clients.read') && <option value="clients">Clientes del proveedor</option>}
                                {session.permissions.some((grant) => grant.capability === 'sellers.read') && (
                                    <option value="sellers">Vendedores del proveedor</option>
                                )}
                            </>
                        )}
                        {hasPurchases && <option value="purchases">Compras autorizadas</option>}
                    </select>
                    {hasSales && kind !== 'purchases' && (
                        <>
                            <label htmlFor="provider-system">Sistema de ventas del proveedor</label>
                            <select
                                id="provider-system"
                                className="form-select"
                                value={showNoe}
                                onChange={(event) => setShowNoe(event.target.value)}
                            >
                                <option value="false">Facturas</option>
                                <option value="true">Notas de entrega</option>
                            </select>
                        </>
                    )}
                </AccessForm>
            ) : (
                <p>No tienes permisos para consultar transacciones del proveedor.</p>
            )}
            <p>
                Las ventas se limitan a tu alcance. Las compras requieren su propia autorización; los importes y la
                utilidad tienen permisos separados. Un documento de venta muestra sólo las líneas vinculadas a este
                proveedor.
            </p>
            {query && !data && !error && <p role="status">Consultando actividad…</p>}
            {error && <p role="alert">No se pudo consultar la actividad autorizada del proveedor.</p>}
            {data && !error && query.kind === 'summary' && (
                <>
                    {data.sales && (
                        <section aria-label="Ventas del proveedor">
                            <p>Total Ventas autorizado del proveedor: {data.sales.totalRawProfit}</p>
                            <p>Documentos de venta autorizados: {data.sales.totalInvoices}</p>
                            {Object.hasOwn(data.sales, 'totalNetProfit') && (
                                <p>Utilidad autorizada del proveedor: {data.sales.totalNetProfit}</p>
                            )}
                        </section>
                    )}
                    {data.purchases && (
                        <section aria-label="Compras del proveedor">
                            <p>Documentos de compra autorizados: {data.purchases.totalInvoices}</p>
                            <p>Unidades compradas autorizadas: {data.purchases.totalQuantity ?? 'No disponible'}</p>
                            {Object.hasOwn(data.purchases, 'totalPurchased') && (
                                <p>
                                    Total Compras autorizado del proveedor:{' '}
                                    {data.purchases.totalPurchased ?? 'No disponible'}
                                </p>
                            )}
                        </section>
                    )}
                </>
            )}
            {data && !error && query.kind !== 'summary' && (
                <>
                    <p role="status">Registros autorizados del proveedor: {data.pagination.total}</p>
                    <div className="table-responsive">
                        <table aria-label="Actividad autorizada del proveedor" className="table table-dark">
                            <thead>
                                <tr>
                                    {columns.map(([key, label]) => (
                                        <th key={key}>{label}</th>
                                    ))}
                                    {['sales', 'purchases'].includes(query.kind) && <th>Detalle</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((row) => (
                                    <tr key={row.invoiceId ?? row.productId ?? row.clientId ?? row.sellerId}>
                                        {columns.map(([key]) => (
                                            <td key={key}>{row[key] ?? 'No disponible'}</td>
                                        ))}
                                        {['sales', 'purchases'].includes(query.kind) && (
                                            <td>
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-light"
                                                    onClick={() =>
                                                        setDocument({
                                                            providerId: provider.IdProveedor,
                                                            kind: query.kind,
                                                            id: row.invoiceId,
                                                            parameters: query.parameters,
                                                        })
                                                    }
                                                >
                                                    Abrir documento {row.invoiceId}
                                                </button>
                                            </td>
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
                        Proveedor: página anterior
                    </button>
                    <button
                        type="button"
                        className="btn btn-outline-light"
                        disabled={page * data.pagination.limit >= data.pagination.total}
                        onClick={() => setPage(page + 1)}
                    >
                        Proveedor: página siguiente
                    </button>
                </>
            )}
            {document && <Document selection={document} onClose={() => setDocument(null)} />}
        </section>
    );
}

export default function Providers() {
    const { can } = useAuth();
    const [search, setSearch] = useState('');
    const [requested, setRequested] = useState('');
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState(null);
    const { data, error } = useSWR(
        `/api/providers/list?${new URLSearchParams({ search: requested, page, limit: 20, sortBy: 'Empresa', sortDir: 'asc' })}`,
        fetcher,
    );
    return (
        <section aria-label="Directorio autorizado de proveedores">
            <AccessForm
                title="Consultar proveedores autorizados"
                button="Buscar proveedores"
                onSubmit={async () => {
                    setPage(1);
                    setSelected(null);
                    setRequested(search);
                }}
            >
                <Field label="Buscar proveedor" value={search} onChange={setSearch} required={false} maxLength={128} />
            </AccessForm>
            <p>
                El directorio muestra sólo identificador y nombre; no entrega contactos ni identificación fiscal. El
                acceso al directorio no concede acceso a ventas o compras.
            </p>
            {!data && !error && <p role="status">Consultando proveedores…</p>}
            {error && <p role="alert">No se pudo consultar el directorio autorizado.</p>}
            {data && !error && can('providers.export') && (
                <ExportButton
                    resource="providers"
                    parameters={{ search: requested, sortBy: 'Empresa', sortDir: 'asc' }}
                />
            )}
            {data && !error && (
                <>
                    <p role="status">Proveedores autorizados: {data.total}</p>
                    <table aria-label="Proveedores autorizados" className="table table-dark">
                        <thead>
                            <tr>
                                <th>Identificador</th>
                                <th>Proveedor</th>
                                <th>Actividad</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.data.map((row) => (
                                <tr key={row.IdProveedor}>
                                    <td>{row.IdProveedor}</td>
                                    <td>{row.Empresa}</td>
                                    <td>
                                        <button
                                            type="button"
                                            className="btn btn-outline-light"
                                            onClick={() => setSelected(row)}
                                        >
                                            Abrir proveedor {row.IdProveedor}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <button
                        type="button"
                        className="btn btn-outline-light"
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                    >
                        Proveedores: página anterior
                    </button>
                    <button
                        type="button"
                        className="btn btn-outline-light"
                        disabled={page * data.limit >= data.total}
                        onClick={() => setPage(page + 1)}
                    >
                        Proveedores: página siguiente
                    </button>
                </>
            )}
            {selected && <Provider key={selected.IdProveedor} provider={selected} onClose={() => setSelected(null)} />}
        </section>
    );
}
