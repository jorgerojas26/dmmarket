import { useReceivableClient } from 'hooks/useReceivables';
import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Offcanvas from 'react-bootstrap/Offcanvas';
import Spinner from 'react-bootstrap/Spinner';
import { money } from './format';
import OperationForm from './OperationForm';
import PaymentClientPicker from './PaymentClientPicker';
import './PaymentDrawer.css';

export default function PaymentDrawer({ client = null, onClose, onChanged }) {
    const [selected, setSelected] = useState(client);
    const [busy, setBusy] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [discard, setDiscard] = useState(null);
    const [result, setResult] = useState(null);
    const [refreshFailed, setRefreshFailed] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const safeChoice = useRef(null);
    const discardChoice = useRef(null);
    const successTitle = useRef(null);
    const doneButton = useRef(null);
    const account = useReceivableClient(selected?.id, { page: 1, timelinePage: 1, documents: 'pending' });
    const data = selected ? account.data : null;
    const error = selected ? account.error : null;
    const allowed = !!data?.writesEnabled && !error && !account.isValidating && Number(data?.summary.balance) > 0;
    const identity = data?.client || selected;
    useEffect(() => {
        if (discard) safeChoice.current?.focus();
    }, [discard]);
    useEffect(() => {
        if (result) (busy || refreshing ? successTitle : doneButton).current?.focus();
    }, [result, busy, refreshing]);
    const leave = (destination) => {
        setDiscard(null);
        setDirty(false);
        if (destination === 'client') setSelected(null);
        else onClose();
    };
    const cancel = (destination = 'close') => {
        if (busy || refreshing) return;
        if (dirty) setDiscard(destination);
        else leave(destination);
    };
    const resume = () => {
        setDiscard(null);
        setTimeout(() => document.getElementById('cxc-amount')?.focus(), 0);
    };
    const refreshViews = async () => {
        setRefreshing(true);
        const refreshed = await Promise.allSettled([account.mutate(), onChanged()]);
        setRefreshFailed(refreshed.some((entry) => entry.status === 'rejected'));
        setRefreshing(false);
    };
    const success = async (saved) => {
        setDirty(false);
        setResult(saved);
        await refreshViews();
    };
    return (
        <Offcanvas
            show
            placement="end"
            onHide={() => cancel()}
            restoreFocus={false}
            keyboard={!busy && !refreshing}
            onKeyDown={(event) => {
                if (discard && event.key === 'Tab') {
                    event.preventDefault();
                    const next = document.activeElement === safeChoice.current ? discardChoice : safeChoice;
                    next.current?.focus();
                }
            }}
            onEscapeKeyDown={(event) => {
                if (discard) {
                    event.preventDefault();
                    resume();
                }
            }}
            className="cxc-payment-drawer"
            aria-labelledby="cxc-payment-title"
        >
            <div className="cxc-payment-content" inert={discard ? '' : undefined} aria-hidden={!!discard}>
                <Offcanvas.Header closeButton={!busy && !refreshing} closeLabel="Cerrar abono">
                    <Offcanvas.Title id="cxc-payment-title">Registrar abono</Offcanvas.Title>
                </Offcanvas.Header>
                <Offcanvas.Body>
                    {identity && (
                        <section className="cxc-payment-identity" aria-label="Cliente del abono">
                            <div>
                                <h2>{identity.name || identity.id}</h2>
                                <p>
                                    {identity.id} · {identity.rif || 'Sin RIF'} · Ruta {identity.ruta || '—'}
                                </p>
                            </div>
                            {!result && (
                                <Button
                                    variant="link"
                                    disabled={busy || refreshing || !!discard}
                                    onClick={() => cancel('client')}
                                >
                                    Cambiar cliente
                                </Button>
                            )}
                            {data && !result && (
                                <div className="cxc-payment-balance">
                                    <span>
                                        Saldo pendiente <small>USD</small>
                                        {error && ' · Sin actualizar'}
                                    </span>
                                    <strong>{money(data.summary.balance)}</strong>
                                </div>
                            )}
                        </section>
                    )}
                    {result ? (
                        <section className="cxc-payment-success" aria-label="Abono registrado">
                            <h2 ref={successTitle} tabIndex={-1}>
                                Abono registrado
                            </h2>
                            <p role="status">
                                Se registraron {money(result.amount, result.currency)} para{' '}
                                {identity.name || identity.id}.
                            </p>
                            <dl>
                                <div>
                                    <dt>Aplicado a la deuda · USD</dt>
                                    <dd>{money(result.applied)}</dd>
                                </div>
                                <div>
                                    <dt>Saldo pendiente · USD</dt>
                                    <dd>{money(result.balanceAfter)}</dd>
                                </div>
                            </dl>
                            {Number(result.excess) > 0 && (
                                <Alert variant="warning">
                                    Excedente no aplicado: {money(result.excess)}. No genera saldo a favor ni
                                    devolución.
                                </Alert>
                            )}
                            {refreshFailed && (
                                <Alert variant="warning" role="alert">
                                    El abono está guardado. No se pudo actualizar la vista; reintenta la consulta, no el
                                    registro.
                                    <Button variant="link" disabled={refreshing} onClick={refreshViews}>
                                        Reintentar consulta
                                    </Button>
                                </Alert>
                            )}
                            <Button ref={doneButton} disabled={busy || refreshing} onClick={onClose}>
                                Listo
                            </Button>
                        </section>
                    ) : !selected ? (
                        <PaymentClientPicker onSelect={setSelected} />
                    ) : (
                        <>
                            {error && (
                                <Alert variant="danger" role="alert">
                                    {error.message}
                                    {data && <p>Saldos sin actualizar.</p>}
                                    <Button
                                        variant="link"
                                        disabled={busy || account.isValidating}
                                        onClick={() => account.mutate()}
                                    >
                                        Reintentar
                                    </Button>
                                </Alert>
                            )}
                            {!data && !error && (
                                <div className="cxc-loading" role="status">
                                    <Spinner animation="border" size="sm" /> Cargando cuenta…
                                </div>
                            )}
                            {data && (
                                <>
                                    {!data.writesEnabled && (
                                        <Alert variant="warning">
                                            Modo consulta: las escrituras de cuentas por cobrar están deshabilitadas.
                                        </Alert>
                                    )}
                                    {Number(data.summary.balance) <= 0 && (
                                        <Alert variant="info">
                                            El cliente no tiene deuda pendiente para aplicar un abono.
                                        </Alert>
                                    )}
                                    <OperationForm
                                        key={selected.id}
                                        action={{ type: 'payment' }}
                                        client={data.client}
                                        rate={data.rate}
                                        balance={data.summary.balance}
                                        compact
                                        disabled={!allowed || !!discard}
                                        onCancel={() => cancel()}
                                        onSuccess={success}
                                        onBusyChange={setBusy}
                                        onDirtyChange={setDirty}
                                    />
                                </>
                            )}
                        </>
                    )}
                </Offcanvas.Body>
            </div>
            {discard && (
                <div className="cxc-payment-discard-layer">
                    <section className="cxc-payment-discard" role="alert" aria-labelledby="cxc-discard-title">
                        <h2 id="cxc-discard-title">¿Descartar este abono?</h2>
                        <p>Los datos que ingresaste no se guardarán.</p>
                        <div className="cxc-actions">
                            <Button ref={safeChoice} variant="primary" onClick={resume}>
                                Seguir editando
                            </Button>
                            <Button ref={discardChoice} variant="outline-danger" onClick={() => leave(discard)}>
                                Descartar cambios
                            </Button>
                        </div>
                    </section>
                </div>
            )}
        </Offcanvas>
    );
}
