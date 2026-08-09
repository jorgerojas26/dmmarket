import Sidebar from 'components/Sidebar';
import useUpdateFlow from 'hooks/useUpdateFlow';
import { useMemo, useState } from 'react';
import { Badge, Button, Container, ProgressBar } from 'react-bootstrap';
import './styles.css';

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
                                <p>
                                    DMMarket es el sistema de reportes de distribución de alimentos: ventas, compras,
                                    clientes y proveedores en una sola aplicación de escritorio.
                                </p>
                                <p>
                                    Esta es una aplicación local: se instala como un único ejecutable y los datos se
                                    consultan directamente de la base de datos de la empresa.
                                </p>

                                <div className="configuracion-about__version">
                                    <span>Versión instalada</span>
                                    <Badge pill bg="dark" className="border border-secondary">
                                        {status ? `v${status.currentVersion}` : '…'}
                                    </Badge>
                                </div>

                                <div className="configuracion-about__update">
                                    <h4>Actualizaciones</h4>
                                    <p>
                                        El sistema puede buscar versiones nuevas de forma manual. Cuando haya una
                                        disponible, se descarga, se verifica y se aplica al reiniciar la aplicación.
                                    </p>

                                    {checking ? (
                                        <span className="text-secondary">Buscando…</span>
                                    ) : (
                                        <Button variant="primary" onClick={handleCheck} disabled={!status}>
                                            Buscar actualizaciones
                                        </Button>
                                    )}

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
                                                            <pre>{checkResult.notes}</pre>
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
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Container>
    );
};

export default ConfiguracionPage;
