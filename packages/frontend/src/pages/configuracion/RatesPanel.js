import { ResponsiveLine } from '@nivo/line';
import { syncBcvRates } from 'api/currency_rates';
import { useAuth } from 'auth/context';
import ChartTooltip from 'components/ChartTooltip';
import DateSelect from 'components/DateSelect';
import { useBcvRateByDate, useBcvRates, useBcvStatus } from 'hooks/useBcvRates';
import { DateTime } from 'luxon';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Spinner } from 'react-bootstrap';
import './rates.css';

export const formatTasa = (value) =>
    Number(value).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatFecha = (iso) => (iso ? DateTime.fromISO(iso).toFormat('dd/MM/yyyy', { locale: 'es' }) : '—');

const formatHora = (iso) => (iso ? DateTime.fromISO(iso).toFormat("dd/MM/yyyy 'a las' HH:mm", { locale: 'es' }) : '—');

const hoyEnCaracas = () => DateTime.now().setZone('America/Caracas').toISODate();

const nivoTheme = {
    axis: {
        ticks: { text: { fill: '#adb5bd', fontSize: 11 }, line: { stroke: '#2f3338' } },
        domain: { line: { stroke: '#2f3338' } },
    },
    grid: { line: { stroke: '#2f3338', strokeDasharray: '4 4' } },
    crosshair: { line: { stroke: '#6b7280', strokeWidth: 1, strokeDasharray: '4 4' } },
};

// El eje es temporal y nivo convierte la x en un Date, así que la fecha viaja en
// el propio dato: buscarla por clave en el tooltip se corre un día con husos
// negativos. La escala se declara con useUTC: false porque las etiquetas del eje
// se formatean en hora local: con la escala en UTC, el 01/10 a las 00:00Z se
// rotulaba 30/09.
const RatesChart = ({ rates, marcada }) => {
    const serie = useMemo(
        () => [
            {
                id: 'tasa',
                data: rates.map((tasa) => ({ x: tasa.fecha, y: Number(tasa.tasa), fecha: tasa.fecha })),
            },
        ],
        [rates],
    );
    const markers = useMemo(
        () =>
            marcada
                ? [
                      {
                          axis: 'x',
                          // El eje y la serie se parsean en hora local (useUTC: false);
                          // el marcador tiene que caer en ese mismo instante.
                          value: new Date(`${marcada}T00:00:00`),
                          lineStyle: { stroke: '#fbbf24', strokeWidth: 2, strokeDasharray: '5 4' },
                      },
                  ]
                : [],
        [marcada],
    );

    return (
        <ResponsiveLine
            data={serie}
            theme={nivoTheme}
            margin={{ top: 12, right: 24, bottom: 40, left: 62 }}
            xScale={{ type: 'time', format: '%Y-%m-%d', precision: 'day', useUTC: false }}
            yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
            curve="monotoneX"
            axisBottom={{ format: '%d/%m', tickValues: 'every 2 weeks', tickSize: 5, tickPadding: 5 }}
            axisLeft={{
                format: (value) => Number(value).toLocaleString('es-VE', { maximumFractionDigits: 0 }),
                tickSize: 5,
                tickPadding: 5,
            }}
            colors={['#3b82f6']}
            lineWidth={2}
            pointSize={0}
            enableArea
            areaOpacity={0.1}
            enableGridX={false}
            markers={markers}
            // Sin `useMesh`: su malla elige el punto más cercano en 2D (Delaunay), así
            // que apuntar a una fecha podía mostrar el día de al lado. Con slices el
            // tooltip sigue la columna bajo el cursor.
            enableSlices="x"
            sliceTooltip={({ slice }) => {
                const [punto] = slice.points;
                return (
                    <ChartTooltip title={formatFecha(punto.data.fecha)} color="#3b82f6">
                        <span>Tasa</span>
                        <strong>Bs {formatTasa(punto.data.y)}</strong>
                    </ChartTooltip>
                );
            }}
        />
    );
};

const TasaDelDia = ({ vigente, buscada, buscando, error }) => {
    const mostrada = buscada || vigente;
    const noPublicada = buscada && !buscada.exacta;

    return (
        <div className="rates-card rates-card-primary">
            <span className="rates-card-label">{buscada ? 'Tasa consultada' : 'Tasa vigente'}</span>

            {error ? (
                <span className="rates-card-error">{error.message}</span>
            ) : (
                <>
                    <strong className="rates-card-value">
                        {buscando ? '…' : mostrada ? `Bs ${formatTasa(mostrada.tasa)}` : '—'}
                    </strong>
                    {!buscando && mostrada && (
                        <span className="rates-card-note">Fecha valor: {formatFecha(mostrada.fecha)}</span>
                    )}
                    {noPublicada && (
                        <span className="rates-card-aviso">
                            No se publicó tasa el {formatFecha(buscada.solicitada)}; se muestra la del{' '}
                            {formatFecha(buscada.fecha)}.
                        </span>
                    )}
                </>
            )}
        </div>
    );
};

const RatesPanel = () => {
    const { can, runPrivileged } = useAuth();
    const readable = can('rates.read');
    const [requestId, setRequestId] = useState(null);
    const {
        data: status,
        error: statusError,
        isLoading: statusLoading,
        mutate: refreshStatus,
    } = useBcvStatus(readable);
    const { data: rates, error: ratesError, isLoading: ratesLoading, mutate: refreshRates } = useBcvRates(readable);
    const [fecha, setFecha] = useState('');
    const {
        data: buscada,
        error: busquedaError,
        isLoading: buscando,
        mutate: refreshBuscada,
    } = useBcvRateByDate(fecha, readable);
    const [syncing, setSyncing] = useState(false);
    const [syncError, setSyncError] = useState(null);
    const [syncMessage, setSyncMessage] = useState(null);

    const vigente = status?.ultimaTasa;
    const publicada = status?.ultimaPublicada;
    const loading = statusLoading || ratesLoading;
    const error = statusError || ratesError;
    const publicadaFutura = publicada?.fecha > hoyEnCaracas();

    const sync = async () => {
        setSyncing(true);
        setSyncError(null);
        setSyncMessage(null);
        try {
            const resultado = await runPrivileged(() => syncBcvRates());
            setRequestId(resultado.operationId);
            setSyncMessage('Consulta del BCV solicitada.');
            if (readable) await refreshStatus();
        } catch (fallo) {
            setSyncError(fallo.message);
        } finally {
            setSyncing(false);
        }
    };

    useEffect(() => {
        const request = status?.lastRequest;
        if (!requestId || request?.operationId !== requestId || request.outcome === 'running') return;
        setRequestId(null);
        if (request.outcome === 'success') {
            setSyncMessage(
                request.written === 0
                    ? 'No se encontraron tasas nuevas ni correcciones en los archivos del BCV.'
                    : request.written != null
                      ? `Se actualizaron ${request.written} tasas.`
                      : 'Consulta del BCV finalizada.',
            );
            void Promise.all([refreshRates(), ...(fecha ? [refreshBuscada()] : [])]);
        } else setSyncError('La consulta del BCV no pudo completarse.');
    }, [status, requestId, refreshRates, refreshBuscada, fecha]);

    return (
        <div className="rates-panel">
            <header className="rates-header">
                <div>
                    <h3>Tasas BCV</h3>
                    <p>Tipo de cambio de referencia Bs/USD publicado por el Banco Central de Venezuela.</p>
                </div>
                <div className="rates-header-actions">
                    {readable && (
                        <DateSelect
                            value={fecha || vigente?.fecha}
                            min={rates?.[0]?.fecha}
                            max={hoyEnCaracas()}
                            today={vigente?.fecha}
                            onChange={setFecha}
                            ariaLabel="Fecha de la tasa"
                        />
                    )}
                    <Button
                        className="rates-sync"
                        variant="outline-light"
                        disabled={!can('rates.sync') || syncing || status?.lastRequest?.outcome === 'running'}
                        onClick={sync}
                    >
                        {syncing ? <Spinner animation="border" size="sm" aria-hidden="true" /> : null}
                        {syncing ? 'Consultando…' : 'Consultar BCV'}
                    </Button>
                </div>
            </header>

            {error && (
                <Alert variant="danger">
                    <strong>No se pudieron leer las tasas.</strong>
                    <div>{error.message}</div>
                </Alert>
            )}
            {status?.ultimoError && (
                <Alert variant="warning">
                    <strong>La última sincronización falló.</strong>
                    <div>{status.ultimoError}</div>
                </Alert>
            )}
            {syncError && (
                <Alert variant="warning">
                    <strong>No se pudo consultar el BCV ahora.</strong>
                    <div>{syncError}</div>
                </Alert>
            )}
            {syncMessage && <Alert variant="success">{syncMessage}</Alert>}

            {loading && !status && <div className="rates-loading">Cargando tasas…</div>}

            {status && !status.disponible && (
                <Alert variant="secondary">
                    <strong>Las tasas todavía no están habilitadas.</strong>
                    <div>Solicita al responsable que prepare la tabla de tasas de forma segura en este equipo.</div>
                </Alert>
            )}

            {status?.disponible && (
                <>
                    <section className="rates-summary" aria-label="Resumen de tasas">
                        <TasaDelDia
                            vigente={vigente}
                            buscada={fecha ? buscada : null}
                            buscando={buscando}
                            error={busquedaError}
                        />
                        <div className="rates-card">
                            <span className="rates-card-label">Última tasa publicada</span>
                            <strong className="rates-card-value">
                                {publicada ? `Bs ${formatTasa(publicada.tasa)}` : '—'}
                            </strong>
                            {publicada && (
                                <span className="rates-card-note">Fecha valor: {formatFecha(publicada.fecha)}</span>
                            )}
                            {publicadaFutura && (
                                <span className="rates-card-aviso">
                                    Aplica desde el {formatFecha(publicada.fecha)}; todavía no está vigente.
                                </span>
                            )}
                        </div>
                        <div className="rates-card">
                            <span className="rates-card-label">Última consulta</span>
                            <strong className="rates-card-value rates-card-value-sm">
                                {formatHora(status.ultimaSincronizacion || status.lastRequest?.completedAt)}
                            </strong>
                            <span className="rates-card-note">
                                {status.intervaloMinutos
                                    ? `Se consulta automáticamente cada ${status.intervaloMinutos} minutos`
                                    : 'Última consulta registrada'}
                            </span>
                        </div>
                    </section>

                    <div className="dashboard-panel rates-chart">
                        <div className="dashboard-panel-header">
                            <h3>Evolución de la tasa</h3>
                        </div>
                        <div className="rates-chart-body">
                            {rates?.length ? (
                                <RatesChart rates={rates} marcada={fecha ? buscada?.fecha : null} />
                            ) : (
                                <div className="rates-chart-empty">Todavía no hay tasas guardadas.</div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default RatesPanel;
