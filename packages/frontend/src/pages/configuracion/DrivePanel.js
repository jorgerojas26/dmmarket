import {
    connectDrive,
    disconnectDrive,
    enableDrive,
    exportDriveKey,
    fetchDriveStatus,
    testDriveUpload,
} from 'api/google_drive';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Form, Spinner } from 'react-bootstrap';
import BackupIcon from './BackupIcon';
import './backups.css';

const DrivePanel = ({ onStatus, refreshKey = 0 }) => {
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
    }, [refresh, refreshKey, polling, onStatus]);

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

    const disabled = busy || Boolean(readError) || !status?.localAccess || status?.running;

    const connectionLabel = readError
        ? 'Sin conexión'
        : !status
          ? 'Consultando'
          : status.connecting
            ? 'Conectando'
            : status.connected
              ? status.recoveryConfirmed
                  ? 'Activa'
                  : 'Falta guardar la clave'
              : status.configured
                ? 'No conectada'
                : 'No disponible';
    const connectionColor =
        readError || (status?.connected && !status.recoveryConfirmed)
            ? 'warning'
            : status?.connected && status.recoveryConfirmed
              ? 'success'
              : status?.connecting
                ? 'info'
                : 'secondary';

    return (
        <section className="backups-card backups-drive" aria-label="Google Drive opcional">
            <div className="backups-section-heading">
                <div>
                    <h4>
                        <BackupIcon name="cloud" /> Google Drive
                    </h4>
                    <p>Una copia adicional fuera del servidor.</p>
                </div>
                <Badge bg="backups-secondary">Opcional</Badge>
            </div>
            <div className="backups-drive-state">
                <Badge bg={`backups-${connectionColor}`}>{connectionLabel}</Badge>
                {status && <p>Cuenta: {status.connected ? status.email || 'Conectada' : 'No conectada'}</p>}
            </div>
            {!status && !readError && <p role="status">Cargando conexión de Google Drive…</p>}
            {readError && <Alert variant="warning">{readError}</Alert>}
            {error && <Alert variant="danger">{error}</Alert>}
            {notice && <Alert variant="info">{notice}</Alert>}
            {status?.lastError && <Alert variant="warning">{status.lastError}</Alert>}
            {busy && (
                <div className="backups-loading" role="status">
                    <Spinner animation="border" size="sm" aria-hidden="true" /> Procesando solicitud…
                </div>
            )}
            {status && (
                <>
                    {!status.configured && (
                        <div className="backups-drive-note">
                            <strong>Google Drive no está habilitado en esta versión.</strong>
                            <p>
                                El mantenedor debe configurar una vez el cliente OAuth de DMMarket. Esto no afecta los
                                respaldos locales.
                            </p>
                        </div>
                    )}
                    {!status.localAccess && (status.configured || status.connected) && (
                        <div className="backups-drive-note">
                            <strong>Configura la cuenta desde el servidor</strong>
                            <p>Para conectar o desconectar una cuenta, abre esta pantalla en el servidor:</p>
                            <code>{status.localSetupUrl}</code>
                        </div>
                    )}
                    {!status.connected && !status.connecting && (
                        <Button className="backups-connect" disabled={disabled || !status.configured} onClick={connect}>
                            Conectar con Google
                        </Button>
                    )}
                    {status.connecting && (
                        <div className="backups-drive-note">
                            <p>Esperando autorización de Google. Completa el acceso en la nueva pestaña.</p>
                            <div className="backups-actions">
                                {authorizationUrl && (
                                    <a href={authorizationUrl} target="_blank" rel="noreferrer">
                                        Autorizar en Google
                                    </a>
                                )}
                                <Button variant="outline-light" disabled={disabled} onClick={disconnect}>
                                    Cancelar conexión
                                </Button>
                            </div>
                        </div>
                    )}
                    {status.connected && (
                        <>
                            <div className="backups-drive-note">
                                <span>Carpeta de destino</span>
                                <strong>{status.folderName}</strong>
                                <p>
                                    {status.recoveryConfirmed
                                        ? 'Cargas automáticas habilitadas.'
                                        : 'Las cargas están desactivadas hasta que guardes la clave de recuperación.'}
                                </p>
                            </div>
                            {!status.recoveryConfirmed ? (
                                <div className="backups-recovery">
                                    <h5>
                                        <BackupIcon name="shield" /> Protege tu clave de recuperación
                                    </h5>
                                    <p>
                                        Sin esta clave no podrás recuperar las copias cifradas si se pierde el servidor.
                                    </p>
                                    <ol className="backups-recovery-steps">
                                        <li>
                                            <strong>Descarga y guarda la clave</strong>
                                            <p>
                                                Guárdala en otro dispositivo o en un gestor de contraseñas, fuera del
                                                servidor.
                                            </p>
                                            <Button variant="outline-light" disabled={disabled} onClick={download}>
                                                Descargar clave de recuperación
                                            </Button>
                                        </li>
                                        <li>
                                            <strong>Confirma que está a salvo</strong>
                                            <Form.Check
                                                id="drive-recovery-confirmed"
                                                label="Guardé la clave de recuperación fuera del servidor"
                                                checked={confirmed}
                                                disabled={!downloaded || disabled}
                                                onChange={(event) => setConfirmed(event.target.checked)}
                                            />
                                            <Button
                                                disabled={disabled || !status.configured || !downloaded || !confirmed}
                                                onClick={() =>
                                                    perform(enableDrive, () =>
                                                        setNotice('Cargas automáticas habilitadas.'),
                                                    ).catch(() => {})
                                                }
                                            >
                                                Habilitar cargas automáticas
                                            </Button>
                                        </li>
                                    </ol>
                                    <p className="backups-fine-print">
                                        La clave solo sirve para descifrar respaldos; no contiene tokens ni la
                                        contraseña de Google.
                                    </p>
                                </div>
                            ) : (
                                <div className="backups-actions">
                                    <Button variant="outline-light" disabled={disabled} onClick={download}>
                                        Descargar clave de recuperación
                                    </Button>
                                    <Button
                                        variant="outline-light"
                                        disabled={disabled || !status.configured}
                                        onClick={() =>
                                            perform(testDriveUpload, () =>
                                                setNotice('Prueba de subida iniciada con el respaldo más reciente.'),
                                            ).catch(() => {})
                                        }
                                    >
                                        Probar subida
                                    </Button>
                                </div>
                            )}
                            {status.running && (
                                <p role="status" className="backups-loading">
                                    <Spinner animation="border" size="sm" aria-hidden="true" />
                                    {status.currentBackup
                                        ? `Subiendo ${status.currentBackup}…`
                                        : 'Procesando Google Drive…'}
                                </p>
                            )}
                            <div className="backups-disconnect">
                                <span>Los respaldos locales seguirán funcionando.</span>
                                <Button
                                    variant="outline-danger"
                                    disabled={busy || Boolean(readError) || !status.localAccess}
                                    onClick={disconnect}
                                >
                                    Desconectar
                                </Button>
                            </div>
                        </>
                    )}
                </>
            )}
            <details className="backups-details">
                <summary>Qué se guarda en Google Drive</summary>
                <p>
                    Los respaldos locales funcionan sin Google Drive y sin Internet. Al conectarlo, se copian cifrados
                    los archivos terminados; nunca se sincronizan borrados locales.
                </p>
            </details>
        </section>
    );
};

export default DrivePanel;
