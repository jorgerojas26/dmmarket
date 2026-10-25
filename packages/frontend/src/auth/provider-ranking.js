import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { useAuth } from './context';
import { AccessForm, Field } from './forms';

export default function ProviderRanking() {
    const { session, can } = useAuth();
    const sales = session.permissions.some((grant) => grant.capability === 'sales.read');
    const purchases = can('purchases.read') && can('purchases.costs');
    const [mode, setMode] = useState(sales ? 'ventas' : 'compras');
    const today = new Date().toISOString().slice(0, 10);
    const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
    const [to, setTo] = useState(today);
    const [showNoe, setShowNoe] = useState('false');
    const [query, setQuery] = useState(null);
    const { data, error } = useSWR(query ? `/api/providers/best?${new URLSearchParams(query)}` : null, fetcher);
    return (
        <section aria-label="Comparativo autorizado de proveedores">
            <AccessForm
                title="Comparar proveedores autorizados"
                button="Consultar comparativo de proveedores"
                onSubmit={async () => setQuery({ from, to, mode, ...(mode === 'ventas' ? { showNoe } : {}) })}
            >
                <Field label="Comparativo de proveedores desde" type="date" value={from} onChange={setFrom} />
                <Field label="Comparativo de proveedores hasta" type="date" value={to} onChange={setTo} />
                <label htmlFor="provider-ranking-mode">Métrica del comparativo</label>
                <select
                    id="provider-ranking-mode"
                    className="form-select"
                    value={mode}
                    onChange={(event) => setMode(event.target.value)}
                >
                    {sales && <option value="ventas">Total Ventas autorizado</option>}
                    {purchases && <option value="compras">Total Compras autorizado</option>}
                </select>
                {mode === 'ventas' && (
                    <>
                        <label htmlFor="provider-ranking-system">Sistema del comparativo de proveedores</label>
                        <select
                            id="provider-ranking-system"
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
            <p>
                Ventas usa sólo los vendedores que puedes consultar. Comparar compras exige permiso para consultar sus
                importes; no se infiere desde ventas o proveedores.
            </p>
            {query && !data && !error && <p role="status">Consultando comparativo…</p>}
            {error && <p role="alert">No se pudo consultar el comparativo autorizado.</p>}
            {data && !error && (
                <table aria-label="Ranking autorizado de proveedores" className="table table-dark">
                    <thead>
                        <tr>
                            <th>Proveedor</th>
                            <th>{query.mode === 'ventas' ? 'Total Ventas autorizado' : 'Total Compras autorizado'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row) => (
                            <tr key={row.providerId}>
                                <td>{row.proveedor}</td>
                                <td>{row.monto ?? 'No disponible'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}
