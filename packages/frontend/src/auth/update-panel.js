import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { useAuth } from './context';
import { AccessForm, ReauthenticationForm } from './forms';

export default function UpdatePanel() {
    const { can } = useAuth();
    const { data: status, error } = useSWR('/api/update/status', fetcher);
    const [release, setRelease] = useState(null);
    const [history, setHistory] = useState(null);
    const [downloaded, setDownloaded] = useState(false);
    const [downloadConfirmed, setDownloadConfirmed] = useState(false);
    const [applyConfirmed, setApplyConfirmed] = useState(false);
    const [applied, setApplied] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const { data: progress } = useSWR(downloading ? '/api/update/progress' : null, fetcher, {
        refreshInterval: 1000,
        dedupingInterval: 0,
    });
    return (
        <section aria-label="Estado autorizado de actualización">
            <h3 className="h5">Actualización</h3>
            {error && <p role="alert">No se pudo consultar el estado de actualización.</p>}
            {status && !error && (
                <>
                    <p>Versión actual: {status.currentVersion}</p>
                    <p>Plataforma: {status.platform}</p>
                    <p>{status.standalone ? 'Ejecutable compilado' : 'Ejecución desde código fuente'}</p>
                    {!status.standalone && (
                        <p>La descarga y el reinicio sólo están disponibles en el ejecutable compilado.</p>
                    )}
                    <AccessForm
                        title="Buscar versiones publicadas"
                        button="Buscar actualizaciones"
                        onSubmit={async () => {
                            setRelease(
                                await fetcher('/api/update/check', {
                                    method: 'POST',
                                    headers: { 'content-type': 'application/json' },
                                    body: '{}',
                                }),
                            );
                            setDownloaded(false);
                        }}
                    />
                    <AccessForm
                        title="Consultar versiones anteriores"
                        button="Consultar historial de versiones"
                        onSubmit={async () => setHistory(await fetcher('/api/update/history'))}
                    />
                    {release && (
                        <section aria-label="Versión publicada">
                            <p>Última versión publicada: {release.latestVersion}</p>
                            <p>
                                {release.updateAvailable
                                    ? 'Hay una actualización disponible.'
                                    : 'La versión instalada está actualizada.'}
                            </p>
                            <p>{release.notes}</p>
                        </section>
                    )}
                    {history && (
                        <ul aria-label="Historial de versiones publicadas">
                            {history.map((item) => (
                                <li key={item.version}>
                                    <strong>{item.version}</strong>
                                    <p>{item.notes}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                    {can('updates.execute') && status.standalone && (
                        <>
                            <ReauthenticationForm />
                            {release?.updateAvailable && !downloaded && (
                                <AccessForm
                                    title="Descargar actualización autorizada"
                                    button="Descargar actualización verificada"
                                    onSubmit={async () => {
                                        setDownloading(true);
                                        try {
                                            await fetcher('/api/update/download', {
                                                method: 'POST',
                                                headers: { 'content-type': 'application/json' },
                                                body: JSON.stringify({
                                                    confirmed: downloadConfirmed,
                                                    assetUrl: release.assetUrl,
                                                    sha256AssetUrl: release.sha256AssetUrl,
                                                }),
                                            });
                                            setDownloaded(true);
                                            setDownloadConfirmed(false);
                                        } finally {
                                            setDownloading(false);
                                        }
                                    }}
                                >
                                    <p>
                                        Requiere autenticación reciente. Sólo se aceptan archivos y hashes del
                                        repositorio de DMMarket para esta plataforma y una versión posterior.
                                    </p>
                                    <div className="form-check">
                                        <input
                                            id="update-download-confirm"
                                            className="form-check-input"
                                            type="checkbox"
                                            checked={downloadConfirmed}
                                            onChange={(event) => setDownloadConfirmed(event.target.checked)}
                                            required
                                        />
                                        <label className="form-check-label" htmlFor="update-download-confirm">
                                            Confirmar descarga de actualización
                                        </label>
                                    </div>
                                </AccessForm>
                            )}
                            {downloading && (
                                <p role="status">
                                    Descargando actualización: {progress?.bytes ?? 0} de {progress?.total ?? 0} bytes
                                </p>
                            )}
                            {downloaded && (
                                <AccessForm
                                    title="Aplicar actualización autorizada"
                                    button="Aplicar actualización y reiniciar"
                                    onSubmit={async () => {
                                        await fetcher('/api/update/apply', {
                                            method: 'POST',
                                            headers: { 'content-type': 'application/json' },
                                            body: JSON.stringify({ confirmed: applyConfirmed }),
                                        });
                                        setApplied(true);
                                    }}
                                >
                                    <p>
                                        Esta acción reemplaza el ejecutable y reinicia el servicio. Requiere una nueva
                                        comprobación de permisos y autenticación reciente.
                                    </p>
                                    <div className="form-check">
                                        <input
                                            id="update-apply-confirm"
                                            className="form-check-input"
                                            type="checkbox"
                                            checked={applyConfirmed}
                                            onChange={(event) => setApplyConfirmed(event.target.checked)}
                                            required
                                        />
                                        <label className="form-check-label" htmlFor="update-apply-confirm">
                                            Confirmar aplicación y reinicio
                                        </label>
                                    </div>
                                </AccessForm>
                            )}
                            {applied && (
                                <p role="status">
                                    Actualización aplicada. Espera el reinicio del servicio antes de continuar.
                                </p>
                            )}
                        </>
                    )}
                </>
            )}
        </section>
    );
}
