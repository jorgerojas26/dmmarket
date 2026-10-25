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
    const { data: backups, error: backupError } = useSWR(can('backups.read') ? '/api/backups' : null, fetcher);
    const { data: update, error: updateError } = useSWR(can('updates.read') ? '/api/update/status' : null, fetcher);
    return (
        <section aria-label="Operación autorizada del sistema">
            {can('cache.clear') && (
                <>
                    <ReauthenticationForm />
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
            {can('backups.read') && (
                <section aria-label="Respaldos autorizados">
                    <h3 className="h5">Respaldos</h3>
                    {backupError && <p role="alert">No se pudo consultar el estado de respaldos.</p>}
                    {backups && !backupError && (
                        <>
                            <p>Respaldos registrados: {backups.backups.length}</p>
                            <p>{backups.running ? 'Respaldo en curso' : 'Sin respaldo en curso'}</p>
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
