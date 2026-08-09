import { applyUpdate, checkForUpdate, downloadUpdate, fetchUpdateStatus, getDownloadProgress } from 'api/update';
import { useEffect, useState } from 'react';

// Estado y acciones del flujo de auto-update: status → check (GitHub) → descargar → reiniciar.
// El check corre en dev también (solo lee GitHub); descarga/apply solo operan en el binario compilado.
const useUpdateFlow = () => {
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

    return {
        status,
        checking,
        checkResult,
        checkError,
        downloading,
        downloaded,
        downloadError,
        progress,
        applying,
        applied,
        applyError,
        percent,
        handleCheck,
        handleDownload,
        handleApply,
    };
};

export default useUpdateFlow;
