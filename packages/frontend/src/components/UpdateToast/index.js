import { useUpdate } from 'context/update';
import { useState } from 'react';
import { Button, ProgressBar, Spinner, Toast } from 'react-bootstrap';
import './styles.css';

const UpdateToast = () => {
    const update = useUpdate();
    const [dismissedVersion, setDismissedVersion] = useState(null);
    const { status, checkResult, checking, downloading, downloaded, applying, applied, downloadError, applyError } =
        update;
    const busy = downloading || applying;
    const error = downloadError || applyError;
    const version = checkResult?.latestVersion;
    const show = status?.standalone && checkResult?.updateAvailable && dismissedVersion !== version;

    const handleUpdate = async () => {
        if (downloaded || (await update.handleDownload())) await update.handleApply();
    };

    return (
        <Toast
            show={Boolean(show)}
            onClose={() => setDismissedVersion(version)}
            className="update-toast text-light border-secondary"
            bg={error ? 'danger' : applied ? 'success' : 'dark'}
        >
            <Toast.Header closeButton={!busy} closeLabel="Cerrar">
                <strong className="me-auto">Actualización de DMMarket</strong>
            </Toast.Header>
            <Toast.Body>
                {applied ? (
                    <p className="mb-0">Actualización preparada. La app se reiniciará.</p>
                ) : (
                    <>
                        <p>Versión {version} disponible.</p>
                        <p>Actualizar reiniciará el sistema. Termina tu trabajo antes de continuar.</p>
                        {error && <p>{error}</p>}
                        {downloading && (
                            <ProgressBar
                                className="mb-3"
                                now={update.percent}
                                label={update.progress.total ? `${update.percent}%` : 'Descargando…'}
                                animated
                            />
                        )}
                        <Button variant="light" disabled={busy || checking} onClick={handleUpdate}>
                            {busy && <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />}
                            {downloading
                                ? 'Descargando…'
                                : applying
                                  ? 'Reiniciando…'
                                  : error
                                    ? 'Reintentar actualización'
                                    : 'Actualizar y reiniciar'}
                        </Button>
                    </>
                )}
            </Toast.Body>
        </Toast>
    );
};

export default UpdateToast;
