import { applyUpdate, checkForUpdate, downloadUpdate, fetchUpdateStatus, getDownloadProgress } from 'api/update';
import { useCallback, useEffect, useRef, useState } from 'react';

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
    const busy = useRef(false);

    useEffect(() => {
        let cancelled = false;
        fetchUpdateStatus()
            .then(({ status: resStatus, data }) => {
                if (!cancelled && resStatus === 200) setStatus(data);
            })
            .catch(() => {
                if (!cancelled) setStatus(null);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!downloading) return undefined;
        let cancelled = false;
        const id = setInterval(async () => {
            try {
                const { data } = await getDownloadProgress();
                if (!cancelled) setProgress({ bytes: data?.bytes || 0, total: data?.total || 0 });
            } catch {}
        }, 400);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [downloading]);

    const handleCheck = useCallback(async () => {
        if (busy.current) return;
        busy.current = true;
        setChecking(true);
        setCheckError(null);
        try {
            const { status: resStatus, data } = await checkForUpdate();
            if (resStatus === 200 && data) {
                setCheckResult(data);
                setDownloaded(false);
                setDownloadError(null);
                setApplyError(null);
            } else setCheckError(data?.error?.message || 'Error al buscar actualizaciones');
        } catch {
            setCheckError('No se pudo contactar al servidor');
        } finally {
            busy.current = false;
            setChecking(false);
        }
    }, []);

    const handleDownload = useCallback(async () => {
        if (busy.current || !checkResult?.updateAvailable) return false;
        busy.current = true;
        setDownloading(true);
        setDownloadError(null);
        setApplyError(null);
        setDownloaded(false);
        setProgress({ bytes: 0, total: 0 });
        try {
            const { status: resStatus, data } = await downloadUpdate({
                assetUrl: checkResult.assetUrl,
                sha256AssetUrl: checkResult.sha256AssetUrl,
            });
            if (resStatus === 200) {
                setDownloaded(true);
                return true;
            }
            setDownloadError(data?.error?.message || 'Error al descargar la actualización');
        } catch {
            setDownloadError('No se pudo contactar al servidor');
        } finally {
            busy.current = false;
            setDownloading(false);
        }
        return false;
    }, [checkResult]);

    const handleApply = useCallback(async () => {
        if (busy.current) return false;
        busy.current = true;
        setApplying(true);
        setApplyError(null);
        try {
            const { status: resStatus, data } = await applyUpdate();
            if (resStatus === 200) {
                setApplied(true);
                return true;
            }
            setApplyError(data?.error?.message || 'Error al aplicar la actualización');
        } catch {
            setApplyError('No se pudo contactar al servidor');
        } finally {
            busy.current = false;
            setApplying(false);
        }
        return false;
    }, []);

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
