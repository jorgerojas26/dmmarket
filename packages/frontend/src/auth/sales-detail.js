import { useMemo } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';

export default function SalesDetail({ selection, onClose }) {
    const { data, error } = useSWR(
        `/api/invoices/${encodeURIComponent(selection.id)}/detail?${new URLSearchParams({ showNoe: selection.showNoe })}`,
        fetcher,
    );
    const financial = Object.hasOwn(data || {}, 'utilidad');
    const lines = useMemo(() => (data?.productos || []).map((line) => ({ ...line, key: crypto.randomUUID() })), [data]);
    return (
        <section aria-label="Detalle de documento" className="card bg-dark border-secondary p-4 my-3">
            <h2 className="h4">Documento {selection.id}</h2>
            <button type="button" className="btn btn-outline-light" onClick={onClose}>
                Cerrar documento
            </button>
            {error && <p role="alert">El documento no está disponible para esta sesión.</p>}
            {!data && !error && <p role="status">Consultando documento…</p>}
            {data && !error && (
                <>
                    <p>Cliente: {data.cliente}</p>
                    <p>Vendedor: {data.vendedor}</p>
                    <p>Fecha: {data.fecha}</p>
                    {Object.hasOwn(data, 'rif') && <p>Identificación: {data.rif}</p>}
                    <p>Total del documento: {data.total}</p>
                    {financial && <p>Utilidad del documento: {data.utilidad}</p>}
                    <table className="table table-dark">
                        <thead>
                            <tr>
                                <th>Descripción</th>
                                <th>Cantidad</th>
                                <th>Precio</th>
                                <th>Subtotal</th>
                                {financial && (
                                    <>
                                        <th>Costo</th>
                                        <th>Utilidad</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map((line) => (
                                <tr key={line.key}>
                                    <td>{line.descripcion}</td>
                                    <td>{line.cantidad}</td>
                                    <td>{line.precio}</td>
                                    <td>{line.subtotal}</td>
                                    {financial && (
                                        <>
                                            <td>{line.costo}</td>
                                            <td>{line.utilidad}</td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </section>
    );
}
