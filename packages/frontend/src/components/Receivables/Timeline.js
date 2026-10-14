import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import { dateLabel, money, rateLabel } from './format';

const titles = { payment: 'Abono', ANULACION: 'Anulación', CIERRE: 'Cierre manual', REAPERTURA: 'Reapertura' };
const methods = {
    TRANSFERENCIA: 'Transferencia',
    'PAGO MOVIL': 'Pago móvil',
    EFECTIVO: 'Efectivo',
    TARJETA: 'Tarjeta',
    OTRO: 'Otro',
};
const parseNotes = (value) => {
    const notes = String(value || '');
    return {
        retentions: /cobro con retenciones aplicadas/i.test(notes),
        notes: notes.replace(/cobro con (?:cero )?retenciones aplicadas\.?/gi, '').trim(),
    };
};

export default function Timeline({
    events,
    allowed,
    onInvoice,
    onVoid,
    expandedId,
    onExpandedChange,
    locked = false,
    voidEventId,
    voidForm,
}) {
    const [localExpanded, setLocalExpanded] = useState(null);
    const expanded = expandedId === undefined ? localExpanded : expandedId;
    const setExpanded = onExpandedChange || setLocalExpanded;
    if (!events.length) return null;
    return (
        <ol className="cxc-timeline cxc-activity" aria-label="Movimientos de cobranza">
            {events.map((event) => {
                const payment = event.type === 'payment';
                const converted = payment && event.currency !== 'USD';
                const open = expanded === event.eventId;
                const { notes, retentions } = parseNotes(event.notes);
                const method = payment ? methods[event.method] || event.method : null;
                const reason = event.voidReason || event.reason;
                const registeredLater =
                    payment &&
                    event.registeredAt &&
                    String(event.registeredAt).slice(0, 10) !== String(event.date).slice(0, 10);
                const title = `${titles[event.type] || event.type}${event.voidReason ? ' · Anulado' : ''}`;
                const triggerId = `cxc-movement-${encodeURIComponent(event.eventId)}`;
                const detailId = `${triggerId}-detail`;
                return (
                    <li
                        key={event.eventId}
                        className={`cxc-activity-item cxc-event-${event.type.toLowerCase()}${event.voidReason ? ' cxc-event-void' : ''}`}
                    >
                        <Button
                            id={triggerId}
                            variant="link"
                            className="cxc-movement-summary"
                            aria-expanded={open}
                            aria-controls={detailId}
                            disabled={locked}
                            aria-label={`${open ? 'Ocultar' : 'Ver'} detalles: ${title}, ${payment ? money(event.amount, event.currency) : money(event.data?.base)}${converted ? `, equivalente ${money(event.base)} USD` : ''}, del ${dateLabel(event.date)}${method ? `, ${method}` : ''}${event.reference ? `, referencia ${event.reference}` : ''}`}
                            onClick={() => setExpanded(open ? null : event.eventId)}
                        >
                            <span className="cxc-event-kind">{title}</span>
                            <span className="cxc-event-amounts">
                                <span className="cxc-event-amount">
                                    {payment ? money(event.amount, event.currency) : money(event.data?.base)}
                                </span>
                                {converted && (
                                    <>
                                        <svg
                                            className="cxc-conversion-arrow"
                                            width="12"
                                            height="12"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.75"
                                            aria-hidden="true"
                                        >
                                            <path d="M4 12h16m-6-6 6 6-6 6" />
                                        </svg>
                                        <span className="cxc-event-conversion">{money(event.base)}</span>
                                    </>
                                )}
                            </span>
                            <span className="cxc-event-meta">
                                <time dateTime={String(event.date).slice(0, 10)}>{dateLabel(event.date)}</time>
                                {!open && method && <span className="cxc-event-method"> · {method}</span>}
                            </span>
                            <svg
                                className="cxc-event-chevron"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                aria-hidden="true"
                            >
                                <path d="m9 5 7 7-7 7" />
                            </svg>
                        </Button>
                        {open && (
                            <div className="cxc-activity-detail" id={detailId}>
                                {(method || event.reference || retentions) && (
                                    <div className="cxc-payment-meta">
                                        <div className="cxc-payment-identification">
                                            {method && <span>{method}</span>}
                                            {event.reference && (
                                                <span className="cxc-payment-reference">
                                                    {method && <span aria-hidden="true">·</span>}{' '}
                                                    <span className="cxc-reference-label">Ref.</span>{' '}
                                                    <span>{event.reference}</span>
                                                </span>
                                            )}
                                        </div>
                                        {retentions && <span className="cxc-retention-badge">Con retenciones</span>}
                                    </div>
                                )}
                                <dl className="cxc-detail-values">
                                    {converted && (
                                        <div>
                                            <dt>Tasa Bs/USD</dt>
                                            <dd>{rateLabel(event.rate)}</dd>
                                        </div>
                                    )}
                                    {event.bank && (
                                        <div>
                                            <dt>Banco</dt>
                                            <dd>{event.bank}</dd>
                                        </div>
                                    )}
                                    {registeredLater && (
                                        <div>
                                            <dt>Registrado</dt>
                                            <dd>{dateLabel(event.registeredAt)}</dd>
                                        </div>
                                    )}
                                    {Number(event.excess) > 0 && (
                                        <div>
                                            <dt>Excedente no aplicado</dt>
                                            <dd>{money(event.excess)}</dd>
                                        </div>
                                    )}
                                    {reason && (
                                        <div>
                                            <dt>Motivo</dt>
                                            <dd>{reason}</dd>
                                        </div>
                                    )}
                                </dl>
                                {event.applications.length > 0 && (
                                    <div className="cxc-allocations-section">
                                        <span className="cxc-allocation-label">Aplicado a</span>
                                        <ul className="cxc-allocation-list" aria-label="Facturas aplicadas">
                                            {event.applications.map((application) => {
                                                const invoiceTrigger = `cxc-invoice-${encodeURIComponent(event.eventId)}-${application.id}`;
                                                return (
                                                    <li key={application.id}>
                                                        <span className="cxc-applied-invoice">
                                                            <svg
                                                                className="cxc-allocation-icon"
                                                                width="14"
                                                                height="14"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="1.75"
                                                                aria-hidden="true"
                                                            >
                                                                <path d="M14 2H5v20h14V7zM14 2v5h5M8 12h8M8 16h6" />
                                                            </svg>
                                                            <Button
                                                                id={invoiceTrigger}
                                                                variant="link"
                                                                className="cxc-invoice-link"
                                                                disabled={locked}
                                                                onClick={() =>
                                                                    onInvoice(application.sale, invoiceTrigger)
                                                                }
                                                                aria-label={`Ver factura ${application.sale}`}
                                                            >
                                                                {application.sale}
                                                            </Button>
                                                        </span>
                                                        <strong>{money(application.amount)}</strong>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}
                                {notes && <p className="cxc-movement-notes">{notes}</p>}
                                {event.eventId === voidEventId
                                    ? voidForm
                                    : payment &&
                                      !event.voidReason && (
                                          <Button
                                              size="sm"
                                              variant="outline-secondary"
                                              className="cxc-void-action"
                                              disabled={!allowed || locked}
                                              onClick={() => onVoid(event, document.getElementById(triggerId))}
                                          >
                                              <svg
                                                  width="14"
                                                  height="14"
                                                  viewBox="0 0 24 24"
                                                  fill="none"
                                                  stroke="currentColor"
                                                  strokeWidth="1.75"
                                                  aria-hidden="true"
                                              >
                                                  <circle cx="12" cy="12" r="9" />
                                                  <path d="m6 6 12 12" />
                                              </svg>
                                              Anular abono
                                          </Button>
                                      )}
                            </div>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
