import { applyUpdate, checkForUpdate, downloadUpdate, fetchUpdateStatus, getDownloadProgress } from 'api/update';
import { useAuth } from 'auth/context';
import usePrivateState from 'hooks/usePrivateState';
import { useCallback, useEffect, useRef, useState } from 'react';

const useUpdateFlow = () => {
    const { can, runPrivileged } = useAuth();
    const enabled = can('updates.read');
    const executable = can('updates.execute');
    const [status, setStatus] = usePrivateState('update-status', null);
    const [checking, setChecking] = useState(false);
    const [checkResult, setCheckResult] = usePrivateState('update-check', null);
    const [checkError, setCheckError] = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [downloaded, setDownloaded] = usePrivateState('update-downloaded', false);
    const [downloadError, setDownloadError] = useState(null);
    const [progress, setProgress] = useState({ bytes: 0, total: 0 });
    const [applying, setApplying] = useState(false);
    const [applied, setApplied] = usePrivateState('update-applied', false);
    const [applyError, setApplyError] = useState(null);
    const busy = useRef(false);

    useEffect(() => {
        if (!enabled) return undefined;
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
    }, [enabled]);

    useEffect(() => {
        if (!enabled || !downloading) return undefined;
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
    }, [downloading, enabled]);

    useEffect(() => {
        if (!applied) return undefined;
        let cancelled = false;
        let timer;
        let controller;
        const timeout = setTimeout(() => {
            cancelled = true;
            clearTimeout(timer);
            controller?.abort();
            setApplyError('El reinicio está tardando más de lo esperado. Recarga la página para comprobar el estado.');
        }, 120000);

        const waitForRestart = async () => {
            controller = new AbortController();
            const requestTimeout = setTimeout(() => controller.abort(), 5000);
            try {
                const { status: resStatus, data } = await fetchUpdateStatus({ signal: controller.signal });
                if (
                    !cancelled &&
                    resStatus === 200 &&
                    data?.currentVersion &&
                    data.currentVersion === checkResult?.latestVersion &&
                    data.currentVersion !== status?.currentVersion
                ) {
                    cancelled = true;
                    clearTimeout(timeout);
                    window.location.reload();
                    return;
                }
            } catch {
            } finally {
                clearTimeout(requestTimeout);
            }
            if (!cancelled) timer = setTimeout(waitForRestart, 1000);
        };

        timer = setTimeout(waitForRestart, 1000);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            clearTimeout(timeout);
            controller?.abort();
        };
    }, [applied, checkResult?.latestVersion, status?.currentVersion]);

    const handleCheck = useCallback(async () => {
        if (!enabled || busy.current) return;
        busy.current = true;
        setChecking(true);
        setCheckError(null);
        setCheckResult(null);
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
    }, [enabled]);

    const handleDownload = useCallback(async () => {
        if (!enabled || !executable || !status?.standalone || busy.current || !checkResult?.updateAvailable)
            return false;
        busy.current = true;
        setDownloading(true);
        setDownloadError(null);
        setApplyError(null);
        setDownloaded(false);
        setProgress({ bytes: 0, total: 0 });
        try {
            const { status: resStatus, data } = await runPrivileged(() =>
                downloadUpdate({
                    assetUrl: checkResult.assetUrl,
                    sha256AssetUrl: checkResult.sha256AssetUrl,
                }),
            );
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
    }, [checkResult, enabled, executable, status?.standalone, runPrivileged]);

    const handleApply = useCallback(async () => {
        if (!enabled || !executable || !status?.standalone || !downloaded || busy.current) return false;
        busy.current = true;
        setApplying(true);
        setApplyError(null);
        try {
            const { status: resStatus, data } = await runPrivileged(() => applyUpdate());
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
    }, [enabled, executable, status?.standalone, downloaded, runPrivileged]);

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
