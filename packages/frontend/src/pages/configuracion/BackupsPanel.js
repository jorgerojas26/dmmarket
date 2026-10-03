import { fetchBackups } from 'api/backups';
import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Table } from 'react-bootstrap';
import DrivePanel from './DrivePanel';

export const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KiB', 'MiB', 'GiB', 'TiB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1);
    return `${(bytes / 1024 ** (index + 1)).toLocaleString('es', { maximumFractionDigits: 2 })} ${units[index]}`;
};

const formatDate = (value) => DateTime.fromISO(value).toFormat('dd/MM/yyyy HH:mm');

const BackupsPanel = () => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [refresh, setRefresh] = useState(0);
    const [drive, setDrive] = useState(null);
    const uploads = Object.fromEntries((drive?.uploads || []).map((entry) => [entry.name, entry]));

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const response = await fetchBackups();
                if (response.status !== 200 || !response.data) {
                    throw new Error(response.data?.error?.message || 'No se pudieron cargar los respaldos.');
                }
                if (!cancelled) {
                    setStatus(response.data);
                    setError(null);
                }
            } catch (failure) {
                if (!cancelled) setError(failure.message || 'No se pudieron cargar los respaldos.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        setLoading(true);
        void load();
        const timer = setInterval(load, 60000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [refresh]);

    return (
        <div className="dashboard-panel">
            <div className="dashboard-panel-header d-flex justify-content-between align-items-center">
                <h3>Respaldos</h3>
                <Button
                    variant="outline-light"
                    size="sm"
                    disabled={loading}
                    onClick={() => setRefresh((value) => value + 1)}
                >
                    Actualizar lista
                </Button>
            </div>
            <div className="dashboard-panel-body p-3">
                <p>Respaldo automático de la base MySQL completa a las 02:00 (hora local del servidor).</p>
                <p className="text-secondary">
                    Si el servidor estaba apagado, se genera el último respaldo pendiente al arrancar. La aplicación
                    debe estar ejecutándose.
                </p>
                <DrivePanel onStatus={setDrive} />
                {loading && <p role="status">Cargando respaldos…</p>}
                {error && <Alert variant="danger">{error}</Alert>}
                {status && (
                    <>
                        <p>
                            Carpeta en el servidor: <code className="text-break">{status.directory}</code>
                        </p>
                        <p>
                            Se conservan los últimos {status.retention} respaldos exitosos. Próxima ejecución diaria:{' '}
                            {formatDate(status.nextRunAt)} (hora de este navegador).
                        </p>
                        {status.running && (
                            <Alert variant="info">
                                Respaldo en curso. Aparecerá en la lista cuando termine correctamente.
                            </Alert>
                        )}
                        {status.lastError && (
                            <Alert variant="warning">
                                Último intento fallido: {formatDate(status.lastError.occurredAt)}.{' '}
                                {status.lastError.message} Los intentos fallidos se reintentan automáticamente cada
                                hora.
                            </Alert>
                        )}
                        {status.retentionError && <Alert variant="warning">{status.retentionError.message}</Alert>}
                        {status.backups.length === 0 ? (
                            <p>No hay respaldos exitosos todavía.</p>
                        ) : (
                            <Table responsive variant="dark" striped hover>
                                <thead>
                                    <tr>
                                        <th>Archivo</th>
                                        <th>Finalizado</th>
                                        <th>Tamaño comprimido</th>
                                        <th>Estado</th>
                                        {drive?.connected && <th>Google Drive</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {status.backups.map((backup) => (
                                        <tr key={backup.name}>
                                            <td className="text-break">{backup.name}</td>
                                            <td>{formatDate(backup.completedAt)}</td>
                                            <td>{formatSize(backup.sizeBytes)}</td>
                                            <td>
                                                <Badge bg="success">Exitoso</Badge>
                                            </td>
                                            {drive?.connected && (
                                                <td>
                                                    <Badge
                                                        bg={
                                                            uploads[backup.name]?.status === 'uploaded'
                                                                ? 'success'
                                                                : uploads[backup.name]?.status === 'error'
                                                                  ? 'warning'
                                                                  : 'secondary'
                                                        }
                                                    >
                                                        {!drive.recoveryConfirmed
                                                            ? 'Desactivado'
                                                            : {
                                                                  uploaded: 'Subido',
                                                                  uploading: 'Subiendo',
                                                                  error: 'Error',
                                                              }[uploads[backup.name]?.status] || 'Pendiente'}
                                                    </Badge>
                                                    {uploads[backup.name]?.uploadedAt && (
                                                        <div className="small text-secondary">
                                                            {formatDate(uploads[backup.name].uploadedAt)}
                                                        </div>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default BackupsPanel;
