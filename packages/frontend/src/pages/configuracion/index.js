import { fetchUpdateHistory } from 'api/update';
import { useAuth } from 'auth/context';
import Sidebar from 'components/Sidebar';
import { useUpdate } from 'context/update';
import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import { Badge, Button, Container, ProgressBar } from 'react-bootstrap';
import ReactMarkdown from 'react-markdown';
import { useHistory, useLocation } from 'react-router-dom';
import BackupsPanel from './BackupsPanel';
import PreferencesPanel from './PreferencesPanel';
import RatesPanel from './RatesPanel';
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
        eventKey: 'preferences',
        label: 'Preferencias',
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
                aria-hidden="true"
            >
                <path d="M4 7h9m4 0h3M4 17h3m4 0h9" />
                <circle cx="15" cy="7" r="2" />
                <circle cx="9" cy="17" r="2" />
            </svg>
        ),
    },
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
    {
        eventKey: 'backups',
        label: 'Respaldos',
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
                <title>Respaldos</title>
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0" />
            </svg>
        ),
    },
    {
        eventKey: 'rates',
        label: 'Tasas BCV',
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
                <title>Tasas BCV</title>
                <path d="M3 17l6-6 4 4 7-7" />
                <path d="M14 8h6v6" />
            </svg>
        ),
    },
];

const VIEWS = {
    '#reportes': 'preferences',
    '#preferencias': 'preferences',
    '#acercade': 'about',
    '#respaldos': 'backups',
    '#tasas': 'rates',
};
const HASHES = { preferences: '#preferencias', about: '#acercade', backups: '#respaldos', rates: '#tasas' };

const ConfiguracionPage = () => {
    const { can } = useAuth();
    const availableViews = [
        ...(can('preferences.read') ? ['preferences'] : []),
        ...(can('updates.read') ? ['about'] : []),
        ...(['backups.read', 'backups.create'].some(can) ? ['backups'] : []),
        ...(['rates.read', 'rates.sync'].some(can) ? ['rates'] : []),
    ];
    const historyRouter = useHistory();
    const location = useLocation();
    const activeView = availableViews.includes(VIEWS[location.hash]) ? VIEWS[location.hash] : availableViews[0];

    useEffect(() => {
        if (!availableViews.includes(VIEWS[location.hash])) {
            historyRouter.replace({ ...location, hash: HASHES[activeView] });
        }
    }, [historyRouter, location, activeView]);

    const selectView = (view) => {
        const hash = HASHES[view] || HASHES.about;
        if (location.hash !== hash) historyRouter.push({ ...location, hash });
    };
    const update = useUpdate();
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
        if (!can('updates.read')) return undefined;
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

    const sidebarItemsMemo = sidebarItems.filter((item) => availableViews.includes(item.eventKey));

    return (
        <Container as="section" aria-label="Configuración" fluid className="clientes-layout p-0">
            <div className="clientes-row">
                <Sidebar activeKey={activeView} onSelect={selectView} items={sidebarItemsMemo} />
                <div className="clientes-content p-4">
                    {activeView === 'preferences' && <PreferencesPanel />}
                    {activeView === 'backups' && <BackupsPanel />}
                    {activeView === 'rates' && <RatesPanel />}
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
                                        <Button
                                            variant="primary"
                                            onClick={handleCheck}
                                            disabled={!status || downloading || applying || applied}
                                        >
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
                                                        <Button
                                                            variant="success"
                                                            disabled={!can('updates.execute') || !status?.standalone}
                                                            onClick={handleDownload}
                                                        >
                                                            Descargar actualización
                                                        </Button>
                                                    )}
                                                    {downloaded && !applying && !applied && (
                                                        <>
                                                            <span className="text-info">
                                                                Descargado — Reiniciar para actualizar
                                                            </span>
                                                            <Button
                                                                variant="primary"
                                                                disabled={
                                                                    !can('updates.execute') || !status?.standalone
                                                                }
                                                                onClick={handleApply}
                                                            >
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
                                    {(applying || applied) && !applyError && (
                                        <span className="text-info">
                                            Actualizando — la app se reiniciará… La página se recargará automáticamente.
                                        </span>
                                    )}
                                    {applied && applyError && (
                                        <Button variant="primary" onClick={() => window.location.reload()}>
                                            Recargar página
                                        </Button>
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
