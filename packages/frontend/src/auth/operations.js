import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { fetcher } from 'swr-config';
import { useAuth } from './context';
import { AccessForm, ReauthenticationForm } from './forms';

export default function Operations() {
    const { can } = useAuth();
    const { cache } = useSWRConfig();
    const [confirmed, setConfirmed] = useState(false);
    const [receipt, setReceipt] = useState(null);
    const [confirmBackup, setConfirmBackup] = useState(false);
    const [confirmRates, setConfirmRates] = useState(false);
    const [backupRequest, setBackupRequest] = useState(null);
    const [rateRequest, setRateRequest] = useState(null);
    const { data: backups, error: backupError } = useSWR(can('backups.read') ? '/api/backups' : null, fetcher, {
        refreshInterval: 1000,
        dedupingInterval: 0,
    });
    const { data: update, error: updateError } = useSWR(can('updates.read') ? '/api/update/status' : null, fetcher);
    const { data: rates, error: ratesError } = useSWR(
        can('rates.read') && can('rates.sync') ? '/api/currency_rates/bcv/status' : null,
        fetcher,
        { refreshInterval: 1000, dedupingInterval: 0 },
    );
    return (
        <section aria-label="Operación autorizada del sistema">
            {['cache.clear', 'rates.sync', 'backups.create'].some(can) && <ReauthenticationForm />}
            {can('cache.clear') && (
                <>
                    <AccessForm
                        title="Limpieza autorizada de caché"
                        button="Limpiar caché"
                        onSubmit={async () => {
                            const result = await fetcher('/api/cache/clear', {
                                method: 'POST',
                                headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({ confirmed }),
                            });
                            cache.clear();
                            setReceipt(result);
                            setConfirmed(false);
                        }}
                    >
                        <p>
                            Requiere autenticación reciente. Se invalida la caché de reportes del servidor y la caché de
                            esta sesión, sin modificar saldos ni permisos.
                        </p>
                        <div className="form-check">
                            <input
                                id="cache-confirm"
                                className="form-check-input"
                                type="checkbox"
                                checked={confirmed}
                                onChange={(event) => setConfirmed(event.target.checked)}
                                required
                            />
                            <label className="form-check-label" htmlFor="cache-confirm">
                                Confirmar limpieza de caché
                            </label>
                        </div>
                    </AccessForm>
                    {receipt && <p role="status">Caché limpiada: {receipt.operationId}</p>}
                </>
            )}
            {can('rates.sync') && (
                <AccessForm
                    title="Sincronización autorizada del BCV"
                    button="Sincronizar BCV"
                    onSubmit={async () => {
                        const result = await fetcher('/api/currency_rates/bcv/sync', {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ confirmed: confirmRates }),
                        });
                        setRateRequest(result);
                        setConfirmRates(false);
                    }}
                >
                    <p>
                        Consulta los archivos oficiales y actualiza sólo el historial BCV. No cambia REF ni los abonos
                        registrados. La tarea autorizada puede continuar aunque cierres sesión.
                    </p>
                    <div className="form-check">
                        <input
                            id="sync-confirm"
                            className="form-check-input"
                            type="checkbox"
                            checked={confirmRates}
                            onChange={(event) => setConfirmRates(event.target.checked)}
                            required
                        />
                        <label htmlFor="sync-confirm" className="form-check-label">
                            Confirmar sincronización BCV
                        </label>
                    </div>
                </AccessForm>
            )}
            {rateRequest && <p role="status">Sincronización BCV autorizada: {rateRequest.operationId}</p>}
            {ratesError && <p role="alert">No se pudo consultar el resultado de sincronización.</p>}
            {rates && !ratesError && rates.lastRequest && (
                <p role="status">
                    Estado de sincronización BCV: {rates.lastRequest.outcome}; filas escritas:{' '}
                    {rates.lastRequest.written ?? 'En curso'}.
                </p>
            )}
            {can('backups.create') && (
                <AccessForm
                    title="Crear respaldo autorizado"
                    button="Crear respaldo"
                    onSubmit={async () => {
                        const result = await fetcher('/api/backups', {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ confirmed: confirmBackup }),
                        });
                        setBackupRequest(result);
                        setConfirmBackup(false);
                    }}
                >
                    <p>
                        La copia incluye la base completa y puede contener datos financieros y de identidad. Se guarda
                        en la ubicación configurada del servidor; no se descarga al navegador. La tarea autorizada puede
                        continuar tras cerrar sesión.
                    </p>
                    <div className="form-check">
                        <input
                            id="backup-confirm"
                            className="form-check-input"
                            type="checkbox"
                            checked={confirmBackup}
                            onChange={(event) => setConfirmBackup(event.target.checked)}
                            required
                        />
                        <label htmlFor="backup-confirm" className="form-check-label">
                            Confirmar respaldo completo
                        </label>
                    </div>
                </AccessForm>
            )}
            {backupRequest && <p role="status">Respaldo autorizado: {backupRequest.operationId}</p>}
            {can('backups.read') && (
                <section aria-label="Respaldos autorizados">
                    <h3 className="h5">Respaldos</h3>
                    {backupError && <p role="alert">No se pudo consultar el estado de respaldos.</p>}
                    {backups && !backupError && (
                        <>
                            <p>Respaldos registrados: {backups.backups.length}</p>
                            <p>{backups.running ? 'Respaldo en curso' : 'Sin respaldo en curso'}</p>
                            {backups.lastRequest && (
                                <p role="status">
                                    Estado del último respaldo solicitado: {backups.lastRequest.outcome}
                                </p>
                            )}
                            {backups.lastError && <p role="alert">{backups.lastError.message}</p>}
                            <div className="table-responsive">
                                <table className="table table-dark">
                                    <thead>
                                        <tr>
                                            <th>Archivo</th>
                                            <th>Completado</th>
                                            <th>Bytes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {backups.backups.map((row) => (
                                            <tr key={row.name}>
                                                <td>{row.name}</td>
                                                <td>{row.completedAt}</td>
                                                <td>{row.sizeBytes}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </section>
            )}
            {can('updates.read') && (
                <section aria-label="Estado autorizado de actualización">
                    <h3 className="h5">Actualización</h3>
                    {updateError && <p role="alert">No se pudo consultar el estado de actualización.</p>}
                    {update && !updateError && (
                        <>
                            <p>Versión actual: {update.currentVersion}</p>
                            <p>Plataforma: {update.platform}</p>
                            <p>{update.standalone ? 'Ejecutable compilado' : 'Ejecución desde código fuente'}</p>
                        </>
                    )}
                </section>
            )}
        </section>
    );
}
