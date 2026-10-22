import { executeReceivableOperation, previewReceivableOperation } from 'api/receivables';
import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Spinner from 'react-bootstrap/Spinner';
import BankSelect from './BankSelect';
import { dateLabel, money, rateLabel, requestId, today } from './format';

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
        rate: '',
        date: today(),
        method: 'TRANSFERENCIA',
        reference: '',
        bank: '',
        notes: '',
        reason: '',
    });
    const [preview, setPreview] = useState(null);
    const [showNotes, setShowNotes] = useState(false);
    const [rateOpen, setRateOpen] = useState(false);
    const [rateDraft, setRateDraft] = useState('');
    const [rateError, setRateError] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const inFlight = useRef(false);
    const mounted = useRef(true);
    const id = useRef(requestId());
    const title = useRef(null);
    const reviewTitle = useRef(null);
    const confirmButton = useRef(null);
    const amountInput = useRef(null);
    const reasonInput = useRef(null);
    const errorElement = useRef(null);
    const rateEdit = useRef(null);
    const ratePanel = useRef(null);
    const payment = action.type === 'payment';
    const clientClosure = action.type === 'close' && !action.id;
    const rateAvailable = Number.isFinite(Number(rate)) && Number(rate) > 0;
    const sameDay = fields.date === today();
    const rateText = fields.rate !== '' ? fields.rate : sameDay && rateAvailable ? String(rate) : '';
    const appliedRate = Number(rateText);
    const rateReady = fields.currency === 'USD' || (rateText !== '' && Number.isFinite(appliedRate) && appliedRate > 0);
    const estimate = rateReady ? Number(fields.amount) / (fields.currency === 'USD' ? 1 : appliedRate) : null;
    const hasEstimate = fields.amount !== '' && estimate !== null && Number.isFinite(estimate) && estimate > 0;
    const estimatedBalance = hasEstimate ? Math.max(0, Number(balance) - Number(estimate.toFixed(4))) : Number(balance);
    const rateDrift =
        preview &&
        preview.currency === 'BsS' &&
        preview.rateSource === 'MANUAL' &&
        rateAvailable &&
        Number(preview.rate) > 0
            ? Math.abs(Number(preview.rate) / Number(rate) - 1)
            : 0;
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    useEffect(() => {
        if (!busy && !disabled) {
            if (preview && (payment || clientClosure)) confirmButton.current?.focus();
            else if (clientClosure) reasonInput.current?.focus();
            else if (compact && !preview) amountInput.current?.focus();
            else (preview ? reviewTitle : title).current?.focus();
        }
    }, [preview, busy, compact, payment, clientClosure, disabled]);
    useEffect(() => {
        if (error && !busy && !disabled) errorElement.current?.focus();
    }, [error, busy, disabled]);
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
    const openRate = () => {
        if (busy || disabled) return;
        if (rateOpen) {
            closeRate();
            return;
        }
        setRateDraft(rateText);
        setRateError('');
        setRateOpen(true);
    };
    const closeRate = () => {
        setRateOpen(false);
        setRateError('');
        rateEdit.current?.focus();
    };
    const applyRate = () => {
        const value = rateDraft.trim();
        if (value === '' || !Number.isFinite(Number(value)) || Number(value) <= 0) {
            setRateError('Indica una tasa mayor que cero.');
            return;
        }
        change('rate', value);
        setRateOpen(false);
        setRateError('');
        rateEdit.current?.focus();
    };
    useEffect(() => {
        if (!rateOpen) return undefined;
        const dismiss = () => {
            setRateOpen(false);
            setRateError('');
            rateEdit.current?.focus();
        };
        const onPointer = (pointerEvent) => {
            if (ratePanel.current?.contains(pointerEvent.target) || rateEdit.current?.contains(pointerEvent.target))
                return;
            dismiss();
        };
        const onKey = (keyEvent) => {
            if (keyEvent.key !== 'Escape') return;
            keyEvent.preventDefault();
            keyEvent.stopPropagation();
            dismiss();
        };
        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [rateOpen]);
    const payload = payment
        ? {
              type: action.type,
              ...fields,
              rate: fields.currency === 'BsS' && fields.rate !== '' ? fields.rate : undefined,
          }
        : { type: action.type, id: action.id, reason: clientClosure ? fields.reason.trim() : fields.reason };
    const submit = async (event) => {
        event.preventDefault();
        if (inFlight.current || disabled || (clientClosure && !fields.reason.trim())) return;
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
    const rateInfo = (
        <div
            className={`cxc-rate${fields.rate === '' && (!sameDay || !rateAvailable) ? ' cxc-rate-unavailable' : ''}`}
            role="status"
        >
            <span>
                {fields.rate !== ''
                    ? `Tasa aplicada: ${rateLabel(fields.rate)} Bs/USD`
                    : sameDay
                      ? `Tasa REF: ${rateAvailable ? `${rateLabel(rate)} Bs/USD` : 'No disponible'}`
                      : 'Tasa del pago pendiente'}
            </span>
            <Button
                ref={rateEdit}
                variant="link"
                className="cxc-rate-edit"
                title="Editar la tasa"
                aria-label="Editar la tasa del pago"
                aria-expanded={rateOpen}
                disabled={busy || disabled || fields.currency !== 'BsS'}
                onClick={openRate}
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
            </Button>
            {rateOpen && (
                <div
                    ref={ratePanel}
                    className="cxc-rate-popover"
                    role="dialog"
                    aria-label="Editar la tasa del pago"
                    onKeyDown={(keyEvent) => {
                        if (keyEvent.key !== 'Enter') return;
                        keyEvent.preventDefault();
                        applyRate();
                    }}
                >
                    <Form.Group controlId="cxc-rate-input" className="mb-0">
                        <Form.Label>Bolívares por dólar</Form.Label>
                        <Form.Control
                            autoFocus
                            type="number"
                            inputMode="decimal"
                            min="0.000001"
                            step="0.000001"
                            placeholder="0,00"
                            value={rateDraft}
                            isInvalid={!!rateError}
                            onChange={(changeEvent) => {
                                setRateDraft(changeEvent.target.value);
                                setRateError('');
                            }}
                        />
                        <Form.Control.Feedback type="invalid">{rateError}</Form.Control.Feedback>
                        <Form.Text>
                            {rateAvailable ? `REF de hoy: ${rateLabel(rate)} Bs/USD. ` : 'La REF no está disponible. '}
                            Usa la tasa del día del pago.
                        </Form.Text>
                    </Form.Group>
                    <div className="cxc-rate-actions">
                        <Button size="sm" variant="outline-secondary" onClick={closeRate}>
                            Cancelar
                        </Button>
                        <Button size="sm" variant="primary" onClick={applyRate}>
                            Aplicar
                        </Button>
                    </div>
                </div>
            )}
            {fields.rate === '' && sameDay && !rateAvailable && (
                <p>Actualiza la tasa o registra el abono en USD. También puedes indicar la tasa del día del pago.</p>
            )}
            {fields.rate === '' && !sameDay && <p>Indica la tasa del {dateLabel(fields.date)}.</p>}
        </div>
    );
    const dateField = (
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
    );
    const methodField = (
        <Form.Group controlId="cxc-method">
            <Form.Label>Método</Form.Label>
            <Form.Select value={fields.method} onChange={(event) => change('method', event.target.value)}>
                {Object.entries(methods).map(([value, label]) => (
                    <option key={value} value={value}>
                        {label}
                    </option>
                ))}
            </Form.Select>
        </Form.Group>
    );
    const referenceField = (
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
    );
    const bankField = (
        <Form.Group controlId="cxc-bank">
            <Form.Label>
                Banco{' '}
                <span className="cxc-optional" aria-hidden="true">
                    opcional
                </span>
            </Form.Label>
            <BankSelect value={fields.bank} onChange={(value) => change('bank', value)} />
        </Form.Group>
    );
    return (
        <section className="cxc-panel cxc-operation" aria-labelledby="cxc-operation-title">
            <div className={`cxc-operation-heading${compact || clientClosure ? ' visually-hidden' : ''}`}>
                <h3 id="cxc-operation-title" ref={title} tabIndex={-1}>
                    {compact ? 'Datos del pago' : titles[action.type]}
                </h3>
                {action.scope && <p className={clientClosure ? 'visually-hidden' : 'cxc-muted'}>{action.scope}</p>}
            </div>
            {clientClosure && <p className="cxc-closure-warning">Cancela el saldo sin registrar dinero recibido.</p>}
            {!payment && !clientClosure && (
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
                    {(!preview || clientClosure) &&
                        (payment ? (
                            <>
                                <div className="cxc-payment-amount">
                                    <div className="cxc-form-grid">
                                        <Form.Group controlId="cxc-amount">
                                            <div className="cxc-field-heading">
                                                <Form.Label>Importe recibido</Form.Label>
                                                {!compact && fields.currency === 'USD' && Number(balance) > 0 && (
                                                    <Button
                                                        variant="link"
                                                        className="cxc-fill-balance"
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
                                                    ref={amountInput}
                                                    autoFocus={compact && !disabled}
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
                                    {compact && (
                                        <div className="cxc-payment-helper">
                                            <div
                                                className={
                                                    fields.currency !== 'BsS' ? 'cxc-payment-helper-inactive' : ''
                                                }
                                                aria-hidden={fields.currency !== 'BsS'}
                                            >
                                                {rateInfo}
                                            </div>
                                            {Number(balance) > 0 && (
                                                <div
                                                    className={
                                                        fields.currency !== 'USD' ? 'cxc-payment-helper-inactive' : ''
                                                    }
                                                    aria-hidden={fields.currency !== 'USD'}
                                                >
                                                    <Button
                                                        variant="link"
                                                        className="cxc-fill-balance"
                                                        disabled={fields.currency !== 'USD'}
                                                        onClick={() => change('amount', String(balance))}
                                                    >
                                                        Usar saldo completo
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {!compact && fields.currency === 'BsS' && rateInfo}
                                {compact ? (
                                    <div
                                        className="cxc-form-grid cxc-payment-fields"
                                        role="group"
                                        aria-label="Datos del pago"
                                    >
                                        {methodField}
                                        {fields.method !== 'EFECTIVO' && (
                                            <>
                                                {bankField}
                                                {referenceField}
                                            </>
                                        )}
                                        {dateField}
                                    </div>
                                ) : (
                                    <>
                                        <div className="cxc-form-grid">
                                            {dateField}
                                            {methodField}
                                        </div>
                                        {fields.method !== 'EFECTIVO' && (
                                            <div className="cxc-form-grid">
                                                {referenceField}
                                                {bankField}
                                            </div>
                                        )}
                                    </>
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
                                {compact && hasEstimate && (
                                    <section className="cxc-payment-estimate" aria-label="Estimación del abono">
                                        <p role="status">
                                            {fields.currency === 'BsS' ? 'Equivale a' : 'Abono de'}{' '}
                                            <strong>{money(estimate.toFixed(4))} USD</strong> · Quedarían{' '}
                                            <strong>
                                                {Number.isFinite(estimatedBalance)
                                                    ? money(estimatedBalance.toFixed(4))
                                                    : '—'}{' '}
                                                USD
                                            </strong>
                                        </p>
                                        {Number(estimate.toFixed(4)) > Number(balance) && (
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
                                    ref={reasonInput}
                                    rows={clientClosure ? 2 : 3}
                                    maxLength={250}
                                    required
                                    placeholder={
                                        clientClosure
                                            ? '¿Por qué se cierra esta deuda?'
                                            : 'Explica por qué realizas esta operación'
                                    }
                                    value={fields.reason}
                                    onChange={(event) => change('reason', event.target.value)}
                                />
                            </Form.Group>
                        ))}
                    {clientClosure && (
                        <div className="cxc-closure-impact" role="status" aria-label="Impacto del cierre">
                            <div className="cxc-closure-amount">
                                <span>{preview ? 'Importe a cerrar' : 'Saldo a cerrar'}</span>
                                <strong>
                                    {money(preview ? preview.base : balance)} <small>USD</small>
                                </strong>
                            </div>
                            {preview && (
                                <>
                                    <p>
                                        Saldo cliente USD: {money(preview.balanceBefore)} →{' '}
                                        {money(preview.balanceAfter)}
                                    </p>
                                    <details className="cxc-closure-documents">
                                        <summary>Facturas afectadas ({preview.applications.length})</summary>
                                        <ul className="cxc-review-applications" aria-label="Importes por factura">
                                            {preview.applications.map((application) => (
                                                <li key={application.id}>
                                                    <span>Factura {application.sale}</span>
                                                    <strong>{money(application.amount)} USD</strong>
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                </>
                            )}
                        </div>
                    )}
                    {preview && !clientClosure && (
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
                                                    <dd>
                                                        {rateLabel(preview.rate)}
                                                        {preview.rateSource === 'MANUAL' && <small> · indicada</small>}
                                                    </dd>
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
                            {rateDrift > 0.25 && (
                                <p className="cxc-muted">
                                    La tasa indicada difiere de la REF actual ({rateLabel(rate)} Bs/USD). Verifica la
                                    fecha del pago.
                                </p>
                            )}
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
                    {preview && !clientClosure && (
                        <Button variant="link" className="cxc-edit-operation" disabled={busy} onClick={edit}>
                            Editar datos
                        </Button>
                    )}
                    <div className="cxc-actions">
                        <Button variant="outline-secondary" disabled={busy} onClick={onCancel}>
                            Cancelar
                        </Button>
                        <Button
                            ref={confirmButton}
                            type="submit"
                            variant={payment ? 'primary' : 'warning'}
                            disabled={
                                busy ||
                                disabled ||
                                (clientClosure && !fields.reason.trim()) ||
                                (payment && fields.currency === 'BsS' && !rateReady)
                            }
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
