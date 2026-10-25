import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { AccessForm, Field } from './forms';

export default function ClientHistory({ selection }) {
    const parameters = new URLSearchParams(selection.parameters);
    const { data, error } = useSWR(
        `/api/clients/average/month/${encodeURIComponent(selection.id)}?${parameters}`,
        fetcher,
    );
    const [product, setProduct] = useState('');
    const [requested, setRequested] = useState(null);
    const { data: ranking, error: rankingError } = useSWR(
        requested ? `/api/clients/best/product/${encodeURIComponent(requested)}?${parameters}` : null,
        fetcher,
    );
    return (
        <>
            <section aria-label="Histórico mensual autorizado" className="my-3">
                <h3 className="h6">Ventas mensuales autorizadas</h3>
                {error && <p role="alert">No se pudo consultar el histórico mensual autorizado.</p>}
                {!data && !error && <p role="status">Consultando histórico mensual…</p>}
                {data && !error && (
                    <table className="table table-dark">
                        <thead>
                            <tr>
                                <th>Mes</th>
                                <th>Ventas autorizadas</th>
                                <th>Documentos autorizados</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.data.map((row) => (
                                <tr key={row.x}>
                                    <td>{row.x}</td>
                                    <td>
                                        {row.y ??
                                            (row.invoiceCount ? 'Importe no disponible' : 'Sin documentos autorizados')}
                                    </td>
                                    <td>{row.invoiceCount}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>
            <section aria-label="Clientes por producto autorizado" className="my-3">
                <AccessForm
                    title="Clientes por producto en el período consultado"
                    button="Consultar ranking del producto"
                    onSubmit={async () => setRequested(product)}
                >
                    <Field label="Producto del ranking" value={product} onChange={setProduct} maxLength={32} />
                </AccessForm>
                <p>El ranking incluye únicamente ventas autorizadas del producto, no sólo las de este cliente.</p>
                {rankingError && <p role="alert">No se pudo consultar el ranking autorizado.</p>}
                {requested && !ranking && !rankingError && <p role="status">Consultando ranking…</p>}
                {ranking && (
                    <table className="table table-dark">
                        <thead>
                            <tr>
                                <th>Cliente</th>
                                <th>Unidades</th>
                                <th>Ventas autorizadas</th>
                                {ranking.some((row) => Object.hasOwn(row, 'utilidad')) && <th>Utilidad autorizada</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {ranking.map((row) => (
                                <tr key={row.clientId}>
                                    <td>{row.client}</td>
                                    <td>{row.quantity_total}</td>
                                    <td>{row.total_USD}</td>
                                    {Object.hasOwn(row, 'utilidad') && <td>{row.utilidad}</td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>
        </>
    );
}
