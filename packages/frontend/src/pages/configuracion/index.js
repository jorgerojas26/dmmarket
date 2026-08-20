import { fetchUpdateHistory } from 'api/update';
import Sidebar from 'components/Sidebar';
import useUpdateFlow from 'hooks/useUpdateFlow';
import { DateTime } from 'luxon';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Container, ProgressBar } from 'react-bootstrap';
import ReactMarkdown from 'react-markdown';
import './styles.css';

// Renderiza las notas de una release como markdown (seguro: react-markdown
// escapa el HTML crudo, no lo inyecta).
const MarkdownNotes = ({ children }) => (
    <div className="configuracion-about__notes-markdown">
        <ReactMarkdown>{children}</ReactMarkdown>
    </div>
);

const sidebarItems = [
    {
        eventKey: 'about',
        label: 'Acerca de',
        icon: (
            <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <title>Acerca de</title>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
        ),
    },
];

const ConfiguracionPage = () => {
    const [activeView, setActiveView] = useState('about');
    const update = useUpdateFlow();
    const {
        status,
        checking,
        checkResult,
        checkError,
        downloading,
        downloaded,
        downloadError,
        applying,
        applied,
        applyError,
    } = update;
    const { handleCheck, handleDownload, handleApply } = update;

    // ── Historial de versiones (releases publicadas con sus notas) ──
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [historyError, setHistoryError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        fetchUpdateHistory()
            .then(({ status: resStatus, data }) => {
                if (cancelled) return;
                if (resStatus === 200) setHistory(data || []);
                else setHistoryError(data?.error?.message || 'No se pudo cargar el historial de versiones');
            })
            .catch(() => {
                if (!cancelled) setHistoryError('No se pudo cargar el historial de versiones');
            })
            .finally(() => {
                if (!cancelled) setHistoryLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const sidebarItemsMemo = useMemo(() => sidebarItems, []);

    return (
        <Container fluid className="clientes-layout p-0">
            <div className="clientes-row">
                <Sidebar activeKey={activeView} onSelect={setActiveView} items={sidebarItemsMemo} />
                <div className="clientes-content p-4">
                    {activeView === 'about' && (
                        <div className="dashboard-panel configuracion-about">
                            <div className="dashboard-panel-header">
                                <h3>Acerca de</h3>
                            </div>
                            <div className="dashboard-panel-body configuracion-about__body">
                                <div className="configuracion-about__version">
                                    <span>Versión instalada</span>
                                    <Badge pill bg="dark" className="border border-secondary">
                                        {status ? `v${status.currentVersion}` : '…'}
                                    </Badge>

                                    {checking ? (
                                        <span className="text-secondary">Buscando…</span>
                                    ) : (
                                        <Button variant="primary" onClick={handleCheck} disabled={!status}>
                                            Buscar actualizaciones
                                        </Button>
                                    )}
                                </div>

                                <div className="configuracion-about__update">
                                    {checkResult && (
                                        <div className="configuracion-about__result">
                                            {checkResult.updateAvailable ? (
                                                <>
                                                    <span className="text-warning fw-bold">
                                                        Versión {checkResult.latestVersion} disponible
                                                    </span>
                                                    {checkResult.notes && (
                                                        <details>
                                                            <summary className="text-secondary">
                                                                Notas de la versión
                                                            </summary>
                                                            <MarkdownNotes>{checkResult.notes}</MarkdownNotes>
                                                        </details>
                                                    )}

                                                    {downloading && (
                                                        <div className="configuracion-about__progress">
                                                            <ProgressBar
                                                                now={update.percent}
                                                                label={`${update.percent}%`}
                                                            />
                                                        </div>
                                                    )}
                                                    {!downloading && !downloaded && (
                                                        <Button variant="success" onClick={handleDownload}>
                                                            Descargar actualización
                                                        </Button>
                                                    )}
                                                    {downloaded && !applying && !applied && (
                                                        <>
                                                            <span className="text-info">
                                                                Descargado — Reiniciar para actualizar
                                                            </span>
                                                            <Button variant="primary" onClick={handleApply}>
                                                                Reiniciar ahora
                                                            </Button>
                                                        </>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="text-success">
                                                    Estás al día (v{checkResult.latestVersion})
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {checkError && <span className="text-danger">{checkError}</span>}
                                    {downloadError && <span className="text-danger">{downloadError}</span>}
                                    {applyError && <span className="text-danger">{applyError}</span>}
                                    {(applying || applied) && (
                                        <span className="text-info">Actualizando — la app se reiniciará…</span>
                                    )}
                                </div>

                                <div className="configuracion-about__history">
                                    <h4>Historial de versiones</h4>
                                    {historyLoading ? (
                                        <span className="text-secondary">Cargando…</span>
                                    ) : historyError ? (
                                        <span className="text-danger">{historyError}</span>
                                    ) : (
                                        <ul className="configuracion-about__history-list">
                                            {history.map((r) => (
                                                <li key={r.version} className="configuracion-about__history-item">
                                                    <div className="configuracion-about__history-head">
                                                        <Badge pill bg="dark" className="border border-secondary">
                                                            v{r.version}
                                                        </Badge>
                                                        {r.publishedAt && (
                                                            <span className="configuracion-about__history-date">
                                                                {DateTime.fromISO(r.publishedAt).toFormat(
                                                                    'dd MMM yyyy',
                                                                    {
                                                                        locale: 'es',
                                                                    },
                                                                )}
                                                            </span>
                                                        )}
                                                        {r.version === status?.currentVersion && (
                                                            <span className="text-success">Instalada</span>
                                                        )}
                                                    </div>
                                                    {r.notes && (
                                                        <details className="configuracion-about__history-notes">
                                                            <summary className="text-secondary">
                                                                Notas de la versión
                                                            </summary>
                                                            <MarkdownNotes>{r.notes}</MarkdownNotes>
                                                        </details>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Container>
    );
};

export default ConfiguracionPage;
