import { applyUpdate, checkForUpdate, downloadUpdate, fetchUpdateStatus, getDownloadProgress } from 'api/update';
import { useEffect, useState } from 'react';
import { Badge, Button, ProgressBar } from 'react-bootstrap';
import './styles.css';

// Widget global de auto-update (navbar). Visible siempre: en dev permite probar el check contra
// GitHub real; el flujo completo (descarga/apply) solo opera en el binario compilado.
// Flujo: status → check (GitHub) → descargar → reiniciar.
const UpdateChecker = () => {
    const [status, setStatus] = useState(null);
    const [checking, setChecking] = useState(false);
    const [checkResult, setCheckResult] = useState(null);
    const [checkError, setCheckError] = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [downloaded, setDownloaded] = useState(false);
    const [downloadError, setDownloadError] = useState(null);
    const [progress, setProgress] = useState({ bytes: 0, total: 0 });
    const [applying, setApplying] = useState(false);
    const [applied, setApplied] = useState(false);
    const [applyError, setApplyError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        fetchUpdateStatus()
            .then(({ data }) => {
                if (!cancelled) setStatus(data);
            })
            .catch(() => {
                if (!cancelled) setStatus(null);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Polling de progreso mientras descarga.
    useEffect(() => {
        if (!downloading) return undefined;
        const id = setInterval(async () => {
            try {
                const { data } = await getDownloadProgress();
                setProgress({ bytes: data?.bytes || 0, total: data?.total || 0 });
            } catch {
                // polling best-effort: el próximo tick reintenta
            }
        }, 400);
        return () => clearInterval(id);
    }, [downloading]);

    if (!status) return null;

    const handleCheck = async () => {
        setChecking(true);
        setCheckError(null);
        setCheckResult(null);
        try {
            const { status: resStatus, data } = await checkForUpdate();
            if (resStatus === 200) setCheckResult(data);
            else setCheckError(data?.error?.message || 'Error al buscar actualizaciones');
        } catch {
            setCheckError('No se pudo contactar al servidor');
        } finally {
            setChecking(false);
        }
    };

    const handleDownload = async () => {
        setDownloading(true);
        setDownloadError(null);
        setDownloaded(false);
        setProgress({ bytes: 0, total: 0 });
        try {
            const { status: resStatus, data } = await downloadUpdate({
                assetUrl: checkResult.assetUrl,
                sha256AssetUrl: checkResult.sha256AssetUrl,
            });
            if (resStatus === 200) setDownloaded(true);
            else setDownloadError(data?.error?.message || 'Error al descargar la actualización');
        } catch {
            setDownloadError('No se pudo contactar al servidor');
        } finally {
            setDownloading(false);
        }
    };

    const handleApply = async () => {
        setApplying(true);
        setApplyError(null);
        try {
            const { status: resStatus, data } = await applyUpdate();
            if (resStatus === 200) setApplied(true);
            else setApplyError(data?.error?.message || 'Error al aplicar la actualización');
        } catch {
            setApplyError('No se pudo contactar al servidor');
        } finally {
            setApplying(false);
        }
    };

    const percent = progress.total ? Math.min(100, Math.round((progress.bytes / progress.total) * 100)) : 0;

    return (
        <div className="update-checker d-flex align-items-center gap-2">
            <Badge pill bg="dark" className="border border-secondary">
                v{status.currentVersion}
            </Badge>

            {checking ? (
                <span className="text-light small">Buscando…</span>
            ) : (
                <Button size="sm" variant="outline-light" onClick={handleCheck}>
                    Buscar actualizaciones
                </Button>
            )}

            {checkResult && (
                <div className="update-checker__result d-flex flex-column gap-1">
                    {checkResult.updateAvailable ? (
                        <>
                            <span className="text-warning small fw-bold">
                                Versión {checkResult.latestVersion} disponible
                            </span>
                            {checkResult.notes && (
                                <details className="update-checker__notes">
                                    <summary className="small text-secondary">Notas de la versión</summary>
                                    <pre>{checkResult.notes}</pre>
                                </details>
                            )}

                            {downloading && (
                                <div className="d-flex align-items-center gap-2">
                                    <ProgressBar now={percent} label={`${percent}%`} />
                                </div>
                            )}
                            {!downloading && !downloaded && (
                                <Button size="sm" variant="success" onClick={handleDownload}>
                                    Descargar actualización
                                </Button>
                            )}
                            {downloaded && !applying && !applied && (
                                <>
                                    <span className="text-info small">Descargado — Reiniciar para actualizar</span>
                                    <Button size="sm" variant="primary" onClick={handleApply}>
                                        Reiniciar ahora
                                    </Button>
                                </>
                            )}
                        </>
                    ) : (
                        <span className="text-success small">Estás al día (v{checkResult.latestVersion})</span>
                    )}
                </div>
            )}

            {checkError && <span className="text-danger small">{checkError}</span>}
            {downloadError && <span className="text-danger small">{downloadError}</span>}
            {applyError && <span className="text-danger small">{applyError}</span>}
            {(applying || applied) && <span className="text-info small">Actualizando — la app se reiniciará…</span>}
        </div>
    );
};

export default UpdateChecker;
