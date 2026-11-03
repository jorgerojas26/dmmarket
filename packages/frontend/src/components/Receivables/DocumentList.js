import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import { dateLabel, money, today } from './format';

export default function DocumentList({
    documents,
    allowed,
    locked,
    onInvoice,
    onAction,
    canOperate,
    closeDocumentId,
    closeForm,
    closedIds = [],
    asOf = today(),
}) {
    const [expanded, setExpanded] = useState(null);
    return (
        <ul className="cxc-document-list">
            {documents.map((document) => {
                const open = expanded === document.id;
                const triggerId = `cxc-document-detail-${document.id}`;
                const detailId = `${triggerId}-content`;
                const pending = document.status === 'Pendiente';
                const due = document.due ? String(document.due).slice(0, 10) : null;
                const tone = pending
                    ? due && due < asOf
                        ? 'overdue'
                        : 'pending'
                    : document.status === 'Saldada'
                      ? 'settled'
                      : document.status === 'Cerrada manualmente'
                        ? 'closed'
                        : 'neutral';
                return (
                    <li key={document.id}>
                        <div className="cxc-document-summary">
                            <Button
                                id={triggerId}
                                variant="link"
                                className="cxc-detail-toggle"
                                disabled={locked}
                                aria-expanded={open}
                                aria-controls={detailId}
                                aria-label={`${open ? 'Ocultar' : 'Ver'} desglose de factura ${document.sale}`}
                                onClick={() => setExpanded(open ? null : document.id)}
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    aria-hidden="true"
                                >
                                    <path d="m9 5 7 7-7 7" />
                                </svg>
                            </Button>
                            <Button
                                id={`cxc-document-${document.id}`}
                                variant="link"
                                className="cxc-invoice-link"
                                disabled={locked || !document.canReadSale}
                                onClick={() => onInvoice(document.sale, `cxc-document-${document.id}`)}
                                aria-label={`Ver factura ${document.sale}`}
                            >
                                {document.sale}
                            </Button>
                            <strong className="cxc-document-balance">
                                {document.eligible ? money(document.balance) : 'No cobrable'}
                            </strong>
                            <span className="cxc-document-meta">
                                <span className={`cxc-status-chip cxc-status-${tone}`}>
                                    {pending ? (due ? `Vence ${dateLabel(due)}` : 'Sin vencimiento') : document.status}
                                </span>
                            </span>
                        </div>
                        {open && (
                            <div className="cxc-document-detail" id={detailId}>
                                <dl className="cxc-detail-values">
                                    <div>
                                        <dt>Original</dt>
                                        <dd>{money(document.original)}</dd>
                                    </div>
                                    <div>
                                        <dt>Abonado</dt>
                                        <dd>{money(document.applied)}</dd>
                                    </div>
                                    {Number(document.closed) > 0 && (
                                        <div>
                                            <dt>Cierre manual</dt>
                                            <dd>{money(document.closed)}</dd>
                                        </div>
                                    )}
                                    <div>
                                        <dt>Emisión</dt>
                                        <dd>{dateLabel(document.issued)}</dd>
                                    </div>
                                </dl>
                                {document.id === closeDocumentId ? (
                                    closeForm
                                ) : (
                                    <div className="cxc-document-actions">
                                        {closedIds.includes(document.id) && Number(document.balance) > 0 && (
                                            <span className="cxc-close-saved" role="status">
                                                Cierre guardado
                                            </span>
                                        )}
                                        {document.eligible &&
                                            Number(document.balance) > 0 &&
                                            !closedIds.includes(document.id) && (
                                                <Button
                                                    variant="link"
                                                    disabled={!allowed || locked || !canOperate('close')}
                                                    id={`cxc-close-${document.id}`}
                                                    onClick={(event) =>
                                                        onAction(
                                                            {
                                                                type: 'close',
                                                                id: document.id,
                                                                scope: `Factura ${document.sale}`,
                                                            },
                                                            event.currentTarget,
                                                        )
                                                    }
                                                    aria-label={`Cerrar deuda de factura ${document.sale}`}
                                                >
                                                    Cerrar deuda
                                                </Button>
                                            )}
                                        {document.eligible && Number(document.closed) > 0 && (
                                            <Button
                                                variant="link"
                                                disabled={
                                                    !allowed ||
                                                    locked ||
                                                    !canOperate('reopen') ||
                                                    closedIds.includes(document.id)
                                                }
                                                id={`cxc-reopen-${document.id}`}
                                                onClick={(event) =>
                                                    onAction(
                                                        {
                                                            type: 'reopen',
                                                            id: document.id,
                                                            scope: `Factura ${document.sale}`,
                                                        },
                                                        event.currentTarget,
                                                    )
                                                }
                                                aria-label={`Reabrir cierre de factura ${document.sale}`}
                                            >
                                                Reabrir cierre
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
