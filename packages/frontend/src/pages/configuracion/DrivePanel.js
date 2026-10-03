import {
    connectDrive,
    disconnectDrive,
    enableDrive,
    exportDriveKey,
    fetchDriveStatus,
    testDriveUpload,
} from 'api/google_drive';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Form } from 'react-bootstrap';

const DrivePanel = ({ onStatus }) => {
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(null);
    const [readError, setReadError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [busy, setBusy] = useState(false);
    const [refresh, setRefresh] = useState(0);
    const [authorizationUrl, setAuthorizationUrl] = useState(null);
    const [downloaded, setDownloaded] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const polling = status?.connecting || status?.running ? 3000 : 60000;

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const response = await fetchDriveStatus();
                if (response.status !== 200 || !response.data)
                    throw new Error('No se pudo consultar Google Drive. Los respaldos locales siguen funcionando.');
                if (!cancelled) {
                    setStatus(response.data);
                    setReadError(null);
                    onStatus?.(response.data);
                }
            } catch (failure) {
                if (!cancelled) setReadError(failure.message);
            }
        };
        void load();
        const timer = setInterval(load, polling);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [refresh, polling, onStatus]);

    const perform = async (operation, success) => {
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            const response = await operation(status.controlToken);
            if (response.status < 200 || response.status >= 300)
                throw new Error(response.data?.error?.message || 'No se pudo completar la operación de Google Drive.');
            await success?.(response.data);
            setRefresh((value) => value + 1);
        } catch (failure) {
            setError(failure.message || 'No se pudo completar la operación de Google Drive.');
            throw failure;
        } finally {
            setBusy(false);
        }
    };

    const connect = async () => {
        let popup;
        try {
            popup = window.open('about:blank', '_blank');
            if (popup) popup.opener = null;
        } catch {
            popup = null;
        }
        try {
            await perform(connectDrive, (data) => {
                const url = new URL(data.authorizationUrl);
                if (url.origin !== 'https://accounts.google.com')
                    throw new Error('El enlace de autorización no es válido.');
                setAuthorizationUrl(url.toString());
                if (popup && !popup.closed) popup.location.href = url.toString();
            });
        } catch {
            popup?.close();
        }
    };

    const download = () =>
        perform(exportDriveKey, (blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'DMMarket-clave-recuperacion.txt';
            link.click();
            URL.revokeObjectURL(url);
            setDownloaded(true);
            setNotice(
                'Descarga iniciada. Guarda la clave en un gestor de contraseñas o en otro dispositivo, fuera del servidor.',
            );
        }).catch(() => {});

    const disconnect = () =>
        perform(disconnectDrive, (data) => {
            setAuthorizationUrl(null);
            setDownloaded(false);
            setConfirmed(false);
            setNotice(data.warning || 'Google Drive está desconectado. Los respaldos locales siguen funcionando.');
        }).catch(() => {});

    const disabled = busy || !status?.localAccess || status?.running;

    return (
        <section className="border border-secondary rounded p-3 mb-4" aria-label="Google Drive opcional">
            <div className="d-flex align-items-center gap-2 mb-2">
                <h4 className="m-0">Google Drive</h4>
                <Badge bg="secondary">Opcional</Badge>
            </div>
            <p>
                Los respaldos locales funcionan sin Google Drive y sin Internet. Al conectarlo, se copian cifrados los
                archivos terminados; nunca se sincronizan borrados locales.
            </p>
            {!status && !readError && <p>Cargando conexión de Google Drive…</p>}
            {readError && <Alert variant="warning">{readError}</Alert>}
            {error && <Alert variant="danger">{error}</Alert>}
            {notice && <Alert variant="info">{notice}</Alert>}
            {status?.lastError && <Alert variant="warning">{status.lastError}</Alert>}
            {status && (
                <>
                    <p>Cuenta: {status.connected ? status.email || 'Conectada' : 'No conectada'}</p>
                    {!status.configured && (
                        <p className="text-secondary">
                            Google Drive no está habilitado en esta versión. El mantenedor debe configurar una vez el
                            cliente OAuth de DMMarket. Esto no afecta los respaldos locales.
                        </p>
                    )}
                    {!status.localAccess && (
                        <p className="text-warning">
                            Para conectar o desconectar una cuenta, abre esta pantalla en el servidor:{' '}
                            <code className="text-break">{status.localSetupUrl}</code>
                        </p>
                    )}
                    {!status.connected && !status.connecting && (
                        <Button disabled={disabled || !status.configured} onClick={connect}>
                            Conectar con Google
                        </Button>
                    )}
                    {status.connecting && (
                        <div>
                            <p>Esperando autorización de Google. Completa el acceso en la nueva pestaña.</p>
                            {authorizationUrl && (
                                <a href={authorizationUrl} target="_blank" rel="noreferrer">
                                    Autorizar en Google
                                </a>
                            )}
                            <Button className="ms-2" variant="outline-light" disabled={disabled} onClick={disconnect}>
                                Cancelar conexión
                            </Button>
                        </div>
                    )}
                    {status.connected && (
                        <>
                            <p>
                                Carpeta: {status.folderName}.{' '}
                                {status.recoveryConfirmed
                                    ? 'Cargas automáticas habilitadas.'
                                    : 'Las cargas están desactivadas hasta que guardes la clave de recuperación.'}
                            </p>
                            <div className="d-flex flex-wrap gap-2 mb-3">
                                <Button variant="outline-light" disabled={disabled} onClick={download}>
                                    Descargar clave de recuperación
                                </Button>
                                <Button
                                    variant="outline-light"
                                    disabled={disabled || !status.recoveryConfirmed || !status.configured}
                                    onClick={() =>
                                        perform(testDriveUpload, () =>
                                            setNotice('Prueba de subida iniciada con el respaldo más reciente.'),
                                        ).catch(() => {})
                                    }
                                >
                                    Probar subida
                                </Button>
                                <Button
                                    variant="outline-danger"
                                    disabled={busy || !status.localAccess}
                                    onClick={disconnect}
                                >
                                    Desconectar
                                </Button>
                            </div>
                            {!status.recoveryConfirmed && (
                                <div>
                                    <p className="text-warning">
                                        Sin esta clave no podrás recuperar las copias cifradas si se pierde el servidor.
                                        La clave descargada solo sirve para descifrar respaldos; no contiene tokens ni
                                        la contraseña de Google.
                                    </p>
                                    <Form.Check
                                        id="drive-recovery-confirmed"
                                        label="Guardé la clave de recuperación fuera del servidor"
                                        checked={confirmed}
                                        disabled={!downloaded || disabled}
                                        onChange={(event) => setConfirmed(event.target.checked)}
                                    />
                                    <Button
                                        className="mt-2"
                                        disabled={disabled || !downloaded || !confirmed}
                                        onClick={() =>
                                            perform(enableDrive, () =>
                                                setNotice('Cargas automáticas habilitadas.'),
                                            ).catch(() => {})
                                        }
                                    >
                                        Habilitar cargas automáticas
                                    </Button>
                                </div>
                            )}
                            {status.running && (
                                <p role="status">
                                    {status.currentBackup
                                        ? `Subiendo ${status.currentBackup}…`
                                        : 'Procesando Google Drive…'}
                                </p>
                            )}
                        </>
                    )}
                </>
            )}
        </section>
    );
};

export default DrivePanel;
