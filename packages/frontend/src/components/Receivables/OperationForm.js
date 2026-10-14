import { executeReceivableOperation, previewReceivableOperation } from 'api/receivables';
import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Spinner from 'react-bootstrap/Spinner';
import { dateLabel, money, rateLabel, requestId, today } from './format';
import BankSelect from './BankSelect';

const titles = { payment: 'Registrar abono', close: 'Cerrar deuda', reopen: 'Reabrir cierre', void: 'Anular abono' };
const confirmations = {
    payment: 'Confirmar abono',
    close: 'Confirmar cierre',
    reopen: 'Confirmar reapertura',
    void: 'Confirmar anulación',
};
const methods = {
    TRANSFERENCIA: 'Transferencia',
    'PAGO MOVIL': 'Pago móvil',
    EFECTIVO: 'Efectivo',
    TARJETA: 'Tarjeta',
    OTRO: 'Otro',
};

export default function OperationForm({
    action,
    client,
    rate,
    balance,
    onCancel,
    onSuccess,
    onBusyChange,
    onDirtyChange,
    compact = false,
    disabled = false,
}) {
    const [fields, setFields] = useState({
        amount: '',
        currency: 'BsS',
        date: today(),
        method: 'TRANSFERENCIA',
        reference: '',
        bank: '',
        notes: '',
        reason: '',
    });
    const [preview, setPreview] = useState(null);
    const [showNotes, setShowNotes] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const inFlight = useRef(false);
    const mounted = useRef(true);
    const id = useRef(requestId());
    const title = useRef(null);
    const reviewTitle = useRef(null);
    const errorElement = useRef(null);
    const payment = action.type === 'payment';
    const rateAvailable = Number.isFinite(Number(rate)) && Number(rate) > 0;
    const estimate =
        fields.currency === 'USD' || rateAvailable
            ? Number(fields.amount) / (fields.currency === 'USD' ? 1 : Number(rate))
            : null;
    const hasEstimate = fields.amount !== '' && estimate !== null && Number.isFinite(estimate) && estimate > 0;
    const estimatedBalance = hasEstimate ? Math.max(0, Number(balance) - Number(estimate.toFixed(4))) : Number(balance);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    useEffect(() => {
        if (!busy) {
            if (compact && !preview) document.getElementById('cxc-amount')?.focus();
            else (preview ? reviewTitle : title).current?.focus();
        }
    }, [preview, busy]);
    useEffect(() => {
        if (error && !busy) errorElement.current?.focus();
    }, [error, busy]);
    const change = (key, value) => {
        onDirtyChange(true);
        setFields((current) => ({
            ...current,
            [key]: value,
            ...(key === 'method' && value === 'EFECTIVO' ? { reference: '', bank: '' } : {}),
        }));
        setPreview(null);
        setError('');
        id.current = requestId();
    };
    const edit = () => {
        setPreview(null);
        setError('');
        id.current = requestId();
    };
    const payload = payment
        ? { type: action.type, ...fields }
        : { type: action.type, id: action.id, reason: fields.reason };
    const submit = async (event) => {
        event.preventDefault();
        if (inFlight.current || disabled) return;
        inFlight.current = true;
        setBusy(true);
        onBusyChange(true);
        setError('');
        try {
            if (!preview) {
                onDirtyChange(true);
                setPreview(await previewReceivableOperation(client.id, payload));
            } else {
                const result = await executeReceivableOperation(client.id, {
                    ...payload,
                    snapshot: preview.snapshot,
                    requestId: id.current,
                });
                await onSuccess(result);
            }
        } catch (failure) {
            setError(failure.message);
            if (failure.status === 409) {
                setPreview(null);
                id.current = requestId();
            }
        } finally {
            inFlight.current = false;
            if (mounted.current) setBusy(false);
            onBusyChange(false);
        }
    };
    return (
        <section className="cxc-panel cxc-operation" aria-labelledby="cxc-operation-title">
            <div className="cxc-operation-heading">
                <h3 id="cxc-operation-title" ref={title} tabIndex={-1}>
                    {compact ? 'Datos del pago' : titles[action.type]}
                </h3>
                {action.scope && <p className="cxc-muted">{action.scope}</p>}
            </div>
            {!payment && (
                <Alert variant="warning" className="cxc-operation-warning">
                    {action.type === 'close'
                        ? 'El cierre cancela el saldo elegido sin registrar dinero recibido.'
                        : action.type === 'reopen'
                          ? 'Se restituye únicamente el importe del cierre. Los abonos vigentes se conservan.'
                          : 'Se revierte la aplicación del abono. Su registro y los cierres manuales se conservan.'}
                </Alert>
            )}
            <Form onSubmit={submit} aria-label={titles[action.type]}>
                <fieldset disabled={busy || disabled}>
                    {!preview &&
                        (payment ? (
                            <>
                                <div className="cxc-form-grid">
                                    <Form.Group controlId="cxc-amount">
                                        <div className="cxc-field-heading">
                                            <Form.Label>Importe recibido</Form.Label>
                                            {(compact || fields.currency === 'USD') && Number(balance) > 0 && (
                                                <Button
                                                    variant="link"
                                                    className={`cxc-fill-balance${fields.currency !== 'USD' ? ' cxc-payment-inactive' : ''}`}
                                                    disabled={fields.currency !== 'USD'}
                                                    aria-hidden={fields.currency !== 'USD'}
                                                    onClick={() => change('amount', String(balance))}
                                                >
                                                    Usar saldo completo
                                                </Button>
                                            )}
                                        </div>
                                        <InputGroup>
                                            <InputGroup.Text aria-hidden="true">
                                                {fields.currency === 'USD' ? '$' : 'Bs'}
                                            </InputGroup.Text>
                                            <Form.Control
                                                type="number"
                                                inputMode="decimal"
                                                min="0.0001"
                                                step="0.0001"
                                                placeholder="0,00"
                                                required
                                                value={fields.amount}
                                                onChange={(event) => change('amount', event.target.value)}
                                            />
                                        </InputGroup>
                                    </Form.Group>
                                    <Form.Group controlId={compact ? undefined : 'cxc-currency'}>
                                        <Form.Label as={compact ? 'span' : 'label'} id="cxc-currency-label">
                                            Moneda
                                        </Form.Label>
                                        {compact ? (
                                            <fieldset
                                                className="cxc-payment-currencies"
                                                aria-labelledby="cxc-currency-label"
                                            >
                                                <Button
                                                    variant={
                                                        fields.currency === 'BsS' ? 'primary' : 'outline-secondary'
                                                    }
                                                    aria-pressed={fields.currency === 'BsS'}
                                                    onClick={() => change('currency', 'BsS')}
                                                >
                                                    Bolívares
                                                </Button>
                                                <Button
                                                    variant={
                                                        fields.currency === 'USD' ? 'primary' : 'outline-secondary'
                                                    }
                                                    aria-pressed={fields.currency === 'USD'}
                                                    onClick={() => change('currency', 'USD')}
                                                >
                                                    USD
                                                </Button>
                                            </fieldset>
                                        ) : (
                                            <Form.Select
                                                value={fields.currency}
                                                onChange={(event) => change('currency', event.target.value)}
                                            >
                                                <option value="BsS">Bolívares · Bs</option>
                                                <option value="USD">Dólares · USD</option>
                                            </Form.Select>
                                        )}
                                    </Form.Group>
                                </div>
                                {(compact || fields.currency === 'BsS') && (
                                    <div
                                        className={`cxc-rate${!rateAvailable ? ' cxc-rate-unavailable' : ''}${fields.currency !== 'BsS' ? ' cxc-payment-inactive' : ''}`}
                                        role="status"
                                        aria-hidden={fields.currency !== 'BsS'}
                                    >
                                        <strong>
                                            Tasa REF: {rateAvailable ? `${rateLabel(rate)} Bs/USD` : 'No disponible'}
                                        </strong>
                                        {!rateAvailable && <p>Actualiza la tasa o registra el abono en USD.</p>}
                                    </div>
                                )}
                                <div className="cxc-form-grid">
                                    <Form.Group controlId="cxc-payment-date">
                                        <Form.Label>Fecha del pago</Form.Label>
                                        <Form.Control
                                            type="date"
                                            required
                                            max={today()}
                                            value={fields.date}
                                            onChange={(event) => change('date', event.target.value)}
                                        />
                                    </Form.Group>
                                    <Form.Group controlId="cxc-method">
                                        <Form.Label>Método</Form.Label>
                                        <Form.Select
                                            value={fields.method}
                                            onChange={(event) => change('method', event.target.value)}
                                        >
                                            {Object.entries(methods).map(([value, label]) => (
                                                <option key={value} value={value}>
                                                    {label}
                                                </option>
                                            ))}
                                        </Form.Select>
                                    </Form.Group>
                                </div>
                                {fields.method !== 'EFECTIVO' && (
                                    <div className="cxc-form-grid">
                                        <Form.Group controlId="cxc-reference">
                                            <Form.Label>
                                                Referencia{' '}
                                                <span className="cxc-optional" aria-hidden="true">
                                                    opcional
                                                </span>
                                            </Form.Label>
                                            <Form.Control
                                                maxLength={50}
                                                value={fields.reference}
                                                placeholder="N.º de operación"
                                                onChange={(event) => change('reference', event.target.value)}
                                            />
                                        </Form.Group>
                                        <Form.Group controlId="cxc-bank">
                                            <Form.Label>
                                                Banco{' '}
                                                <span className="cxc-optional" aria-hidden="true">
                                                    opcional
                                                </span>
                                            </Form.Label>
                                            <BankSelect
                                                value={fields.bank}
                                                onChange={(value) => change('bank', value)}
                                            />
                                        </Form.Group>
                                    </div>
                                )}
                                {compact && (
                                    <Button
                                        variant="link"
                                        className="cxc-payment-details-toggle"
                                        aria-expanded={showNotes}
                                        aria-controls="cxc-payment-notes"
                                        onClick={() => setShowNotes((value) => !value)}
                                    >
                                        {showNotes ? 'Ocultar observaciones' : '+ Agregar observaciones'}
                                    </Button>
                                )}
                                <div id="cxc-payment-notes" hidden={compact && !showNotes}>
                                    <Form.Group controlId="cxc-notes">
                                        <Form.Label>
                                            Observaciones{' '}
                                            <span className="cxc-optional" aria-hidden="true">
                                                opcional
                                            </span>
                                        </Form.Label>
                                        <Form.Control
                                            as="textarea"
                                            rows={2}
                                            maxLength={250}
                                            value={fields.notes}
                                            placeholder="Información adicional del abono"
                                            onChange={(event) => change('notes', event.target.value)}
                                        />
                                    </Form.Group>
                                </div>
                                {compact && (
                                    <section className="cxc-payment-estimate" aria-label="Estimación del abono">
                                        <h4>Así quedaría la cuenta</h4>
                                        <dl>
                                            <div>
                                                <dt>Equivalente estimado · USD</dt>
                                                <dd>{hasEstimate ? money(estimate.toFixed(4)) : '—'}</dd>
                                            </div>
                                            <div>
                                                <dt>Abono estimado · USD</dt>
                                                <dd>
                                                    {hasEstimate
                                                        ? money(
                                                              Math.min(
                                                                  Number(balance),
                                                                  Number(estimate.toFixed(4)),
                                                              ).toFixed(4),
                                                          )
                                                        : '—'}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt>Saldo después · USD</dt>
                                                <dd>
                                                    {Number.isFinite(estimatedBalance)
                                                        ? money(estimatedBalance.toFixed(4))
                                                        : '—'}
                                                </dd>
                                            </div>
                                        </dl>
                                        {hasEstimate && Number(estimate.toFixed(4)) > Number(balance) && (
                                            <Alert variant="warning">
                                                El importe supera la deuda. El excedente no genera saldo a favor ni
                                                devolución.
                                            </Alert>
                                        )}
                                    </section>
                                )}
                            </>
                        ) : (
                            <Form.Group controlId="cxc-reason">
                                <Form.Label>Motivo</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={3}
                                    maxLength={250}
                                    required
                                    placeholder="Explica por qué realizas esta operación"
                                    value={fields.reason}
                                    onChange={(event) => change('reason', event.target.value)}
                                />
                            </Form.Group>
                        ))}
                    {preview && (
                        <div className="cxc-preview">
                            <h4 ref={reviewTitle} tabIndex={-1}>
                                Revisa antes de confirmar
                            </h4>
                            <dl className="cxc-review-values">
                                {payment ? (
                                    <>
                                        <div className="cxc-review-received">
                                            <dt>Importe recibido</dt>
                                            <dd>
                                                {money(preview.amount, preview.currency)}{' '}
                                                <small>{preview.currency === 'USD' ? 'USD' : 'Bs'}</small>
                                            </dd>
                                        </div>
                                        {preview.currency === 'BsS' && (
                                            <>
                                                <div>
                                                    <dt>Tasa aplicada · Bs/USD</dt>
                                                    <dd>{rateLabel(preview.rate)}</dd>
                                                </div>
                                                <div>
                                                    <dt>Equivalente en USD</dt>
                                                    <dd>{money(preview.base)}</dd>
                                                </div>
                                            </>
                                        )}
                                        <div>
                                            <dt>Aplicado a la deuda</dt>
                                            <dd>{money(preview.applied)}</dd>
                                        </div>
                                    </>
                                ) : (
                                    <div>
                                        <dt>Importe de la acción · USD</dt>
                                        <dd>{money(preview.base)}</dd>
                                    </div>
                                )}
                            </dl>
                            <dl className="cxc-review-meta">
                                {payment ? (
                                    <>
                                        <div>
                                            <dt>Fecha del pago</dt>
                                            <dd>{dateLabel(fields.date)}</dd>
                                        </div>
                                        <div>
                                            <dt>Método</dt>
                                            <dd>{methods[fields.method]}</dd>
                                        </div>
                                        {fields.reference && (
                                            <div>
                                                <dt>Referencia</dt>
                                                <dd>{fields.reference}</dd>
                                            </div>
                                        )}
                                        {fields.bank && (
                                            <div>
                                                <dt>Banco</dt>
                                                <dd>{fields.bank}</dd>
                                            </div>
                                        )}
                                        {fields.notes && (
                                            <div>
                                                <dt>Observaciones</dt>
                                                <dd>{fields.notes}</dd>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div>
                                        <dt>Motivo</dt>
                                        <dd>{fields.reason}</dd>
                                    </div>
                                )}
                            </dl>
                            <h5>{payment ? 'Distribución del abono' : 'Facturas afectadas'}</h5>
                            <ul className="cxc-review-applications" aria-label="Importes por factura">
                                {preview.applications.map((application) => (
                                    <li key={application.id}>
                                        <span>Factura {application.sale}</span>
                                        <strong>{money(application.amount)}</strong>
                                    </li>
                                ))}
                            </ul>
                            <div className="cxc-resulting-balance">
                                <span>
                                    Saldo del cliente después <small>USD</small>
                                </span>
                                <strong>{money(preview.balanceAfter)}</strong>
                            </div>
                            {payment && Number(preview.excess) > 0 && (
                                <Alert variant="warning">
                                    Excedente no aplicado: <strong>{money(preview.excess)}</strong>. Es informativo; no
                                    genera saldo a favor ni devolución.
                                </Alert>
                            )}
                        </div>
                    )}
                </fieldset>
                {error && (
                    <Alert ref={errorElement} tabIndex={-1} variant="danger" role="alert">
                        {error}
                        {preview && (
                            <p className="mt-2 mb-0">
                                Si se interrumpió la respuesta, reintenta la misma confirmación. El reintento mantiene
                                la protección contra duplicados.
                            </p>
                        )}
                    </Alert>
                )}
                <div className="cxc-operation-footer">
                    {preview && (
                        <Button variant="link" className="cxc-edit-operation" disabled={busy} onClick={edit}>
                            Editar datos
                        </Button>
                    )}
                    <div className="cxc-actions">
                        <Button variant="outline-secondary" disabled={busy} onClick={onCancel}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            variant={payment ? 'primary' : 'warning'}
                            disabled={busy || disabled || (payment && fields.currency === 'BsS' && !rateAvailable)}
                        >
                            {busy ? (
                                <>
                                    <Spinner animation="border" size="sm" aria-hidden="true" /> Procesando…
                                </>
                            ) : preview ? (
                                confirmations[action.type]
                            ) : compact ? (
                                'Revisar abono'
                            ) : (
                                'Revisar operación'
                            )}
                        </Button>
                    </div>
                </div>
            </Form>
        </section>
    );
}
