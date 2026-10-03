import { fetchBackups } from 'api/backups';
import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Spinner, Table } from 'react-bootstrap';
import BackupIcon from './BackupIcon';
import DrivePanel from './DrivePanel';
import './backups.css';

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
    const latest = status?.backups[0];
    const needsAttention = status?.lastError || status?.retentionError;
    const localVariant = error
        ? 'warning'
        : status?.running
          ? 'info'
          : needsAttention
            ? 'warning'
            : latest
              ? 'success'
              : 'secondary';
    const localLabel = error
        ? 'Sin actualizar'
        : status?.running
          ? 'En curso'
          : needsAttention
            ? 'Requiere atención'
            : latest
              ? 'Disponible'
              : 'Sin copias';

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
        <div className="backups-panel">
            <header className="backups-header">
                <div>
                    <h3>Respaldos</h3>
                    <p>Copias automáticas de tu base de datos, en el servidor y opcionalmente en la nube.</p>
                </div>
                <Button
                    className="backups-refresh"
                    variant="outline-light"
                    disabled={loading}
                    onClick={() => setRefresh((value) => value + 1)}
                >
                    {loading ? (
                        <Spinner animation="border" size="sm" aria-hidden="true" />
                    ) : (
                        <BackupIcon name="refresh" />
                    )}
                    Actualizar lista
                </Button>
            </header>

            {loading && (
                <div className="backups-loading" role="status">
                    Cargando respaldos…
                </div>
            )}
            {error && (
                <Alert variant="danger">
                    <strong>No se pudo actualizar la información.</strong>
                    <div>{error}</div>
                    {status && <div className="small">Se muestran los últimos datos disponibles.</div>}
                </Alert>
            )}

            {status && (
                <section className="backups-summary" aria-label="Resumen de respaldos">
                    <div className="backups-stat">
                        <span className="backups-stat-icon">
                            <BackupIcon name="database" />
                        </span>
                        <dl>
                            <dt>Último respaldo exitoso</dt>
                            <dd>{latest ? formatDate(latest.completedAt) : 'Sin respaldos todavía'}</dd>
                            <dd className="backups-stat-note">
                                {latest ? 'Guardado en el servidor' : 'Aún no hay una copia local disponible'}
                            </dd>
                        </dl>
                    </div>
                    <div className="backups-stat">
                        <span className="backups-stat-icon">
                            <BackupIcon name="clock" />
                        </span>
                        <dl>
                            <dt>Próxima ejecución</dt>
                            <dd>{formatDate(status.nextRunAt)}</dd>
                            <dd className="backups-stat-note">Hora de este navegador</dd>
                        </dl>
                    </div>
                    <div className="backups-stat">
                        <span className="backups-stat-icon">
                            <BackupIcon name="shield" />
                        </span>
                        <dl>
                            <dt>Copias locales disponibles</dt>
                            <dd>
                                {status.backups.length} <small>/ {status.retention}</small>
                            </dd>
                            <dd className="backups-stat-note">
                                Se conservan los últimos {status.retention} respaldos exitosos
                            </dd>
                        </dl>
                    </div>
                </section>
            )}

            <div className="backups-layout">
                <section
                    className="backups-card backups-local"
                    aria-labelledby="local-backups-title"
                    aria-busy={loading}
                >
                    <div className="backups-section-heading">
                        <div>
                            <h4 id="local-backups-title">
                                <BackupIcon name="database" /> Respaldos locales
                            </h4>
                            <p>Base MySQL completa · Todos los días a las 02:00, hora del servidor.</p>
                        </div>
                        {status && <Badge bg={`backups-${localVariant}`}>{localLabel}</Badge>}
                    </div>
                    {status && (
                        <>
                            {status.running && (
                                <Alert variant="info">
                                    <strong>Respaldo en curso.</strong> Aparecerá en la lista cuando termine
                                    correctamente.
                                </Alert>
                            )}
                            {status.lastError && (
                                <Alert variant="warning">
                                    <strong>Último intento fallido: {formatDate(status.lastError.occurredAt)}</strong>
                                    <div>{status.lastError.message}</div>
                                    <div className="backups-alert-note">
                                        Los intentos fallidos se reintentan automáticamente cada hora.
                                    </div>
                                </Alert>
                            )}
                            {status.retentionError && <Alert variant="warning">{status.retentionError.message}</Alert>}
                            <div className="backups-directory">
                                <span>Carpeta en el servidor</span>
                                <code>{status.directory}</code>
                            </div>
                            <div className="backups-history-heading">
                                <h5>Historial de respaldos</h5>
                                <span>Más recientes primero</span>
                            </div>
                            {status.backups.length === 0 ? (
                                <div className="backups-empty">
                                    <BackupIcon name="file" />
                                    <strong>No hay respaldos exitosos todavía.</strong>
                                    <p>Las copias completadas aparecerán aquí con su fecha y tamaño.</p>
                                </div>
                            ) : (
                                <Table className="backups-table" responsive>
                                    <caption className="visually-hidden">
                                        Respaldos exitosos guardados en el servidor, del más reciente al más antiguo.
                                    </caption>
                                    <thead>
                                        <tr>
                                            <th scope="col">Archivo</th>
                                            <th scope="col">Finalizado</th>
                                            <th scope="col">Tamaño</th>
                                            <th scope="col">Estado</th>
                                            {drive?.connected && <th scope="col">Google Drive</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {status.backups.map((backup) => {
                                            const upload = uploads[backup.name];
                                            const uploadStatus = !drive?.recoveryConfirmed
                                                ? 'disabled'
                                                : upload?.status;
                                            return (
                                                <tr key={backup.name}>
                                                    <th scope="row" className="backups-filename">
                                                        <BackupIcon name="file" /> <span>{backup.name}</span>
                                                    </th>
                                                    <td data-label="Finalizado">{formatDate(backup.completedAt)}</td>
                                                    <td data-label="Tamaño">{formatSize(backup.sizeBytes)}</td>
                                                    <td data-label="Estado">
                                                        <Badge bg="backups-success">Exitoso</Badge>
                                                    </td>
                                                    {drive?.connected && (
                                                        <td data-label="Google Drive">
                                                            <div>
                                                                <Badge
                                                                    bg={`backups-${
                                                                        {
                                                                            uploaded: 'success',
                                                                            uploading: 'info',
                                                                            error: 'warning',
                                                                        }[uploadStatus] || 'secondary'
                                                                    }`}
                                                                >
                                                                    {{
                                                                        disabled: 'Desactivado',
                                                                        uploaded: 'Subido',
                                                                        uploading: 'Subiendo',
                                                                        error: 'Error',
                                                                    }[uploadStatus] || 'Pendiente'}
                                                                </Badge>
                                                                {upload?.uploadedAt && (
                                                                    <div className="backups-upload-date">
                                                                        {formatDate(upload.uploadedAt)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </Table>
                            )}
                        </>
                    )}
                    {!status && !loading && (
                        <p className="backups-unavailable">
                            No hay información disponible. Usa «Actualizar lista» para reintentar.
                        </p>
                    )}
                    <details className="backups-details">
                        <summary>¿Cómo funciona el respaldo automático?</summary>
                        <p>
                            Si el servidor estaba apagado, se genera el último respaldo pendiente al arrancar. La
                            aplicación debe estar ejecutándose. Los respaldos locales funcionan sin Internet.
                        </p>
                    </details>
                </section>
                <DrivePanel onStatus={setDrive} refreshKey={refresh} />
            </div>
        </div>
    );
};

export default BackupsPanel;
