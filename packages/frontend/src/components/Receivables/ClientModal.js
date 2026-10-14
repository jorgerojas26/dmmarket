import { fetchReceivableClient } from 'api/receivables';
import { useReceivableClient } from 'hooks/useReceivables';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Dropdown from 'react-bootstrap/Dropdown';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';
import DocumentList from './DocumentList';
import { dateLabel, money } from './format';
import InlineOperationForm from './InlineOperationForm';
import InvoiceDetailModal from './InvoiceDetailModal';
import OperationForm from './OperationForm';
import Pager from './Pager';
import PaymentDrawer from './PaymentDrawer';
import Summary from './Summary';
import Timeline from './Timeline';
import 'components/ClientDashboardModal/styles.css';
import 'components/ProvidersTable/styles.css';
import './styles.css';
import './ClientModal.css';

const DOCUMENTS_PAGE_SIZE = 20;
pdfMake.vfs = pdfFonts.pdfMake.vfs;

export default function ClientModal({ client, onClose, onChanged, initialAction = null }) {
    const [page, setPage] = useState(1);
    const [timelinePage, setTimelinePage] = useState(1);
    const [documents, setDocuments] = useState('pending');
    const [action, setAction] = useState(null);
    const [busy, setBusy] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [discard, setDiscard] = useState(null);
    const [notice, setNotice] = useState(null);
    const [invoice, setInvoice] = useState(null);
    const [expandedMovement, setExpandedMovement] = useState(null);
    const [voidReasons, setVoidReasons] = useState({});
    const [closedIds, setClosedIds] = useState([]);
    const primary = useRef(null);
    const title = useRef(null);
    const moreActions = useRef(null);
    const actionTrigger = useRef(null);
    const pendingInlineFocus = useRef(false);
    const continueEditing = useRef(null);
    const noticeElement = useRef(null);
    const initialFocusSet = useRef(false);
    const pendingInitialAction = useRef(initialAction === 'payment' || initialAction?.type === 'payment');
    const { data, error, isValidating, mutate } = useReceivableClient(client.id, { page, timelinePage, documents });
    const allowed = !!data?.writesEnabled && !error && !busy && !isValidating;
    const hasDebt = Number(data?.summary.balance) > 0;
    const canPay = allowed && hasDebt;
    const navigationLocked = busy || isValidating || !!action;
    const rowClosure = action?.type === 'close' && !!action.id;
    const operationOpen = !!action && action.type !== 'void' && !rowClosure;
    const openInvoice = useCallback((id, triggerId) => {
        initialFocusSet.current = true;
        setInvoice({ id, triggerId });
    }, []);
    const closeInvoice = () => {
        const triggerId = invoice.triggerId;
        setInvoice(null);
        setTimeout(() => document.getElementById(triggerId)?.focus(), 0);
    };
    const restoreActionFocus = () => {
        const previous = actionTrigger.current;
        const trigger = previous?.id ? document.getElementById(previous.id) : previous;
        if (trigger?.isConnected && !trigger.disabled) {
            trigger.focus();
            trigger.scrollIntoView?.({ block: 'nearest' });
        } else if (previous?.id?.startsWith('cxc-document-detail-'))
            document.getElementById('cxc-documents-title')?.focus();
        else if (primary.current && !primary.current.disabled) primary.current.focus();
        else title.current?.focus();
    };
    useEffect(() => {
        if (pendingInlineFocus.current && !action && data && !isValidating && !busy) {
            pendingInlineFocus.current = false;
            setTimeout(restoreActionFocus, 0);
        }
    }, [action, data, isValidating, busy]);
    const start = useCallback(
        (next, trigger) => {
            if (!allowed) return;
            initialFocusSet.current = true;
            actionTrigger.current = trigger || primary.current;
            setNotice(null);
            setDirty(false);
            setAction(next);
        },
        [allowed],
    );
    useEffect(() => {
        if (!pendingInitialAction.current || !data || error || isValidating) return;
        pendingInitialAction.current = false;
        if (canPay) start({ type: 'payment' });
    }, [data, error, isValidating, canPay, start]);
    useEffect(() => {
        if (discard) continueEditing.current?.focus();
    }, [discard]);
    useEffect(() => {
        if (notice) noticeElement.current?.focus();
    }, [notice]);
    const cancel = (destination = 'form') => {
        if (busy) return;
        if (action && dirty) {
            setDiscard(destination);
            return;
        }
        if (destination === 'modal') onClose();
        else {
            setAction(null);
            setTimeout(restoreActionFocus, 0);
        }
    };
    const confirmDiscard = () => {
        const destination = discard;
        setDiscard(null);
        setDirty(false);
        setAction(null);
        if (destination === 'modal') onClose();
        else setTimeout(restoreActionFocus, 0);
    };
    const success = async () => {
        if (action?.type === 'reopen') setClosedIds((current) => current.filter((id) => id !== action.id));
        setAction(null);
        setDirty(false);
        setNotice({ variant: 'success', message: 'Operación registrada.' });
        setPage(1);
        setTimelinePage(1);
        const refreshes = await Promise.allSettled([mutate(), onChanged()]);
        const failed = refreshes.some((result) => result.status === 'rejected');
        setNotice({
            variant: failed ? 'warning' : 'success',
            message: failed
                ? 'Operación registrada. No se pudo actualizar la vista; reintenta la consulta, no el registro.'
                : 'Operación registrada.',
        });
    };
    const refreshInlineAccount = async (saved, selection) => {
        const refreshed = await Promise.allSettled([mutate(), onChanged()]);
        const updated = refreshed[0].status === 'fulfilled' ? refreshed[0].value : null;
        const closing = selection.type === 'close';
        if (updated && closing) {
            setClosedIds((current) => current.filter((id) => id !== selection.id));
            setPage((current) =>
                Math.min(current, Math.max(1, Math.ceil(updated.documents.total / DOCUMENTS_PAGE_SIZE))),
            );
        } else if (updated && !updated.timeline.data.some((event) => event.eventId === selection.event.eventId)) {
            const added = Math.max(0, updated.timeline.total - selection.timelineTotal);
            const targetPage = Math.floor((selection.position + added) / DOCUMENTS_PAGE_SIZE) + 1;
            setTimelinePage(targetPage);
        }
        const failed = refreshed.some((entry) => entry.status === 'rejected');
        const message = closing
            ? `Deuda de factura ${selection.document.sale} cerrada. Saldo cliente: ${money(saved.balanceAfter)} USD.`
            : `Abono de ${money(selection.event.amount, selection.event.currency)} anulado. Nuevo saldo: ${money(saved.balanceAfter)} USD.`;
        setNotice({
            variant: failed ? 'warning' : 'success',
            message: `${message}${failed ? ' No se pudo actualizar la vista.' : ''}`,
            saved: failed ? saved : null,
            selection,
        });
    };
    const inlineSuccess = async (saved) => {
        const selection = action;
        if (selection.type === 'close') setClosedIds((current) => [...current, selection.id]);
        else setVoidReasons((current) => ({ ...current, [selection.event.eventId]: saved.reason }));
        setAction(null);
        setDirty(false);
        pendingInlineFocus.current = true;
        await refreshInlineAccount(saved, selection);
    };
    const cancelInline = () => {
        if (busy) return;
        setAction(null);
        setDirty(false);
        pendingInlineFocus.current = true;
    };
    const clientName = data?.client.name || client.name || client.id;
    const handlePrint = async () => {
        if (!data || printing) return;
        setPrinting(true);
        try {
            const filters = { page: 1, timelinePage: 1, documents };
            const firstPage = await fetchReceivableClient(client.id, filters);
            const allDocuments = [...firstPage.documents.data];
            for (let currentPage = 2; allDocuments.length < firstPage.documents.total; currentPage += 1) {
                const result = await fetchReceivableClient(client.id, { ...filters, page: currentPage });
                if (!result.documents.data.length) break;
                allDocuments.push(...result.documents.data);
            }
            const allEvents = [...firstPage.timeline.data];
            for (let currentPage = 2; allEvents.length < firstPage.timeline.total; currentPage += 1) {
                const result = await fetchReceivableClient(client.id, {
                    ...filters,
                    page: 1,
                    timelinePage: currentPage,
                });
                if (!result.timeline.data.length) break;
                allEvents.push(...result.timeline.data);
            }
            const eventTitles = {
                payment: 'Abono',
                ANULACION: 'Anulación',
                CIERRE: 'Cierre manual',
                REAPERTURA: 'Reapertura',
            };
            const eventRows = allEvents.map((event) => {
                const payment = event.type === 'payment';
                const details = [
                    payment && event.method,
                    event.reference && `Ref. ${event.reference}`,
                    event.bank && `Banco ${event.bank}`,
                    event.registeredAt && String(event.registeredAt).slice(0, 10) !== String(event.date).slice(0, 10)
                        ? `Registrado ${dateLabel(event.registeredAt)}`
                        : null,
                ]
                    .filter(Boolean)
                    .join(' · ');
                return [
                    dateLabel(event.date),
                    `${eventTitles[event.type] || event.type}${event.voidReason ? ' · Anulado' : ''}`,
                    payment ? money(event.amount, event.currency) : money(event.data?.base),
                    payment ? money(event.base) : '—',
                    details || '—',
                ];
            });
            const paymentTotals = {};
            let equivalentTotal = 0;
            allEvents.forEach((event) => {
                if (event.type !== 'payment' || event.voidReason) return;
                const currency = event.currency || 'USD';
                paymentTotals[currency] = (paymentTotals[currency] || 0) + Number(event.amount || 0);
                equivalentTotal += Number(event.base || 0);
            });
            const totalAmount =
                Object.entries(paymentTotals)
                    .sort(([currencyA], [currencyB]) => currencyA.localeCompare(currencyB))
                    .map(([currency, amount]) => money(amount.toFixed(4), currency))
                    .join(' · ') || money(0);
            const historyTotal = [
                '',
                { text: 'Total de abonos', bold: true },
                { text: totalAmount, bold: true },
                { text: money(equivalentTotal.toFixed(4)), bold: true },
                '',
            ];
            const rows = allDocuments.map((document) => [
                String(document.sale),
                dateLabel(document.issued),
                dateLabel(document.due),
                money(document.original),
                money(document.applied),
                money(document.closed),
                money(document.balance),
                document.status,
            ]);
            const docDef = {
                content: [
                    { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                    { text: 'Estado de cuenta por cobrar', style: 'title' },
                    { text: firstPage.client.name || firstPage.client.id, style: 'client' },
                    {
                        text: `Cliente ${firstPage.client.id}  |  RIF: ${firstPage.client.rif || 'Sin RIF'}  |  Ruta: ${firstPage.client.ruta || '—'}`,
                        style: 'subtitle',
                    },
                    { text: `Emitido: ${dateLabel(firstPage.today)}`, style: 'subtitle' },
                    {
                        text: `Saldo pendiente: ${money(firstPage.summary.balance)}  |  Saldo vencido: ${money(firstPage.summary.overdue)}  |  Facturas pendientes: ${firstPage.summary.pendingCount}`,
                        style: 'summary',
                    },
                    {
                        text: documents === 'pending' ? 'Facturas pendientes' : 'Todas las facturas',
                        style: 'section',
                    },
                    {
                        style: 'table',
                        table: {
                            headerRows: 1,
                            widths: ['*', 62, 62, 73, 73, 73, 73, 85],
                            body: [
                                [
                                    'Factura',
                                    'Emisión',
                                    'Vencimiento',
                                    'Original',
                                    'Abonado',
                                    'Cierre manual',
                                    'Saldo',
                                    'Estado',
                                ],
                                ...rows,
                            ],
                        },
                        layout: 'lightHorizontalLines',
                    },
                    {
                        text: `Historial de abonos y movimientos (${firstPage.timeline.total})`,
                        style: 'section',
                        pageBreak: 'before',
                    },
                    {
                        style: 'table',
                        table: {
                            headerRows: 1,
                            widths: [65, 78, 82, 78, '*'],
                            body: [
                                ['Fecha', 'Movimiento', 'Importe', 'Equiv. USD', 'Forma / referencia'],
                                ...eventRows,
                                historyTotal,
                            ],
                        },
                        layout: 'lightHorizontalLines',
                    },
                ],
                styles: {
                    header: { alignment: 'center', fontSize: 9 },
                    title: { alignment: 'center', fontSize: 14, bold: true, margin: [0, 5, 0, 8] },
                    client: { alignment: 'center', fontSize: 12, bold: true },
                    subtitle: { alignment: 'center', fontSize: 8, margin: [0, 2, 0, 2] },
                    summary: { fontSize: 9, bold: true, margin: [0, 12, 0, 8] },
                    section: { fontSize: 10, bold: true, margin: [0, 8, 0, 4] },
                    table: { fontSize: 7 },
                },
                pageMargins: 30,
                pageSize: 'LETTER',
                pageOrientation: 'landscape',
            };
            pdfMake.createPdf(docDef).open();
        } catch (printError) {
            console.error('No se pudo imprimir el estado de cuenta:', printError);
            setNotice({ variant: 'danger', message: 'No se pudo generar el estado de cuenta. Vuelve a intentarlo.' });
        } finally {
            setPrinting(false);
        }
    };
    if (invoice) return <InvoiceDetailModal invoiceId={invoice.id} onClose={closeInvoice} />;
    if (action?.type === 'payment') {
        return (
            <PaymentDrawer
                client={client}
                onClose={() => {
                    setAction(null);
                    setTimeout(restoreActionFocus, 0);
                }}
                onChanged={() => {
                    setPage(1);
                    setTimelinePage(1);
                    return onChanged();
                }}
            />
        );
    }
    return (
        <Modal
            show
            onHide={() => cancel('modal')}
            onEntered={() => {
                if (!initialFocusSet.current && !action) title.current?.focus();
                initialFocusSet.current = true;
            }}
            size="xl"
            fullscreen="md-down"
            scrollable
            backdrop="static"
            className="cxc-modal cxc-account client-dashboard-modal"
            aria-labelledby="cxc-client-title"
        >
            <Modal.Header closeButton={!busy} closeLabel="Cerrar cuenta">
                <div className="cxc-account-header">
                    <div className="cxc-account-identity">
                        <div className="cxc-account-name">
                            <Modal.Title id="cxc-client-title" ref={title} tabIndex={-1}>
                                {clientName}
                            </Modal.Title>
                            <p className="modal-subtitle">
                                <span>Cliente {client.id}</span>
                                <span>{data?.client.rif || client.rif || 'Sin RIF'}</span>
                                <span>Ruta {data?.client.ruta || client.ruta || '—'}</span>
                            </p>
                        </div>
                    </div>
                    <div className="cxc-account-header-actions">
                        <Button
                            ref={primary}
                            className="cxc-payment-cta"
                            disabled={!canPay || !!action}
                            onClick={() => start({ type: 'payment' })}
                        >
                            <span aria-hidden="true">＋</span> Registrar abono
                        </Button>
                        <Dropdown align="end">
                            <Dropdown.Toggle
                                ref={moreActions}
                                id="cxc-account-actions"
                                variant="outline-secondary"
                                disabled={!data || busy || isValidating || !!action || printing}
                            >
                                <svg
                                    className="cxc-action-icon"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    aria-hidden="true"
                                >
                                    <circle cx="5" cy="12" r="1.5" />
                                    <circle cx="12" cy="12" r="1.5" />
                                    <circle cx="19" cy="12" r="1.5" />
                                </svg>
                                Más acciones
                            </Dropdown.Toggle>
                            <Dropdown.Menu variant="dark">
                                <Dropdown.Item
                                    as="button"
                                    disabled={!data || !!error || isValidating || busy || !!action || printing}
                                    onClick={handlePrint}
                                >
                                    <svg
                                        className="cxc-action-icon"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.75"
                                        aria-hidden="true"
                                    >
                                        <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                                        <path d="M6 14h12v7H6z" />
                                    </svg>
                                    {printing ? 'Generando PDF…' : 'Imprimir PDF'}
                                </Dropdown.Item>
                                <Dropdown.Item
                                    as="button"
                                    disabled={!canPay || !!action}
                                    onClick={() =>
                                        start(
                                            { type: 'close', scope: 'Todos los documentos pendientes del cliente' },
                                            moreActions.current,
                                        )
                                    }
                                >
                                    <svg
                                        className="cxc-action-icon"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.75"
                                        aria-hidden="true"
                                    >
                                        <rect x="3" y="3" width="18" height="4" rx="1" />
                                        <path d="M5 7v13h14V7M9 11h6" />
                                    </svg>
                                    Cerrar deuda del cliente
                                </Dropdown.Item>
                            </Dropdown.Menu>
                        </Dropdown>
                    </div>
                </div>
            </Modal.Header>
            <Modal.Body>
                {notice && (
                    <Alert
                        ref={noticeElement}
                        tabIndex={-1}
                        variant={notice.variant}
                        role="status"
                        className={notice.selection ? 'cxc-inline-notice' : undefined}
                    >
                        {notice.message}
                        {notice.saved && (
                            <Button
                                variant="link"
                                size="sm"
                                disabled={busy || isValidating}
                                onClick={async () => {
                                    setBusy(true);
                                    try {
                                        await refreshInlineAccount(notice.saved, notice.selection);
                                    } finally {
                                        setBusy(false);
                                    }
                                }}
                            >
                                Reintentar consulta
                            </Button>
                        )}
                    </Alert>
                )}
                {discard && (
                    <Alert variant="warning" role="alert" className="cxc-discard">
                        <strong>¿Descartar cambios sin guardar?</strong>
                        <div className="cxc-actions">
                            <Button
                                ref={continueEditing}
                                variant="outline-light"
                                onClick={() => {
                                    const operationTitle = document.getElementById(
                                        !operationOpen ? 'cxc-inline-reason' : 'cxc-operation-title',
                                    );
                                    setDiscard(null);
                                    setTimeout(() => operationTitle?.focus(), 0);
                                }}
                            >
                                Seguir editando
                            </Button>
                            <Button variant="warning" onClick={confirmDiscard}>
                                Descartar cambios
                            </Button>
                        </div>
                    </Alert>
                )}
                {error && (
                    <Alert variant="danger" role="alert">
                        <strong>{error.message}</strong>
                        {data && <p>Saldos sin actualizar.</p>}
                        <Button
                            variant="outline-light"
                            size="sm"
                            disabled={busy || isValidating}
                            onClick={() => mutate()}
                        >
                            Reintentar
                        </Button>
                    </Alert>
                )}
                {!data ? (
                    !error && (
                        <div className="cxc-loading" role="status">
                            <Spinner animation="border" size="sm" /> Cargando cuenta…
                        </div>
                    )
                ) : (
                    <>
                        {!data.writesEnabled && (
                            <Alert variant="warning">
                                Modo consulta: las escrituras de cuentas por cobrar están deshabilitadas.
                            </Alert>
                        )}
                        <section className="cxc-account-overview" aria-label="Resumen de la cuenta">
                            <Summary summary={data.summary} />
                        </section>
                        <div className={`cxc-detail-grid${operationOpen ? ' cxc-detail-grid-operating' : ''}`}>
                            <section
                                className="cxc-documents-card"
                                aria-labelledby="cxc-documents-title"
                                hidden={operationOpen}
                                aria-busy={isValidating}
                            >
                                <div className="cxc-section-heading">
                                    <div>
                                        <h3 id="cxc-documents-title" tabIndex={-1}>
                                            Facturas
                                        </h3>
                                    </div>
                                    <fieldset className="cxc-document-filter" aria-label="Facturas de la cuenta">
                                        {[
                                            ['pending', 'Pendientes'],
                                            ['all', 'Todas'],
                                        ].map(([value, label]) => (
                                            <Button
                                                key={value}
                                                variant="link"
                                                aria-pressed={documents === value}
                                                disabled={navigationLocked}
                                                onClick={() => {
                                                    setDocuments(value);
                                                    setPage(1);
                                                }}
                                            >
                                                {label}
                                            </Button>
                                        ))}
                                    </fieldset>
                                </div>
                                {data.documents.data.length ? (
                                    <DocumentList
                                        documents={data.documents.data}
                                        asOf={data.today}
                                        allowed={allowed}
                                        locked={navigationLocked}
                                        onInvoice={openInvoice}
                                        closedIds={closedIds}
                                        closeDocumentId={rowClosure ? action.id : null}
                                        closeForm={
                                            rowClosure ? (
                                                <InlineOperationForm
                                                    key={`close-${action.id}`}
                                                    client={data.client}
                                                    action={action}
                                                    disabled={!allowed}
                                                    discarding={!!discard}
                                                    onCancel={cancelInline}
                                                    onSuccess={inlineSuccess}
                                                    onBusyChange={setBusy}
                                                    onDirtyChange={setDirty}
                                                />
                                            ) : null
                                        }
                                        onAction={(next, trigger) => {
                                            if (next.type === 'close' && next.id) {
                                                start(
                                                    {
                                                        ...next,
                                                        document: data.documents.data.find(
                                                            (document) => document.id === next.id,
                                                        ),
                                                    },
                                                    document.getElementById(`cxc-document-detail-${next.id}`),
                                                );
                                            } else start(next, trigger);
                                        }}
                                    />
                                ) : (
                                    <p className="cxc-empty">
                                        {documents === 'pending'
                                            ? 'No hay facturas pendientes'
                                            : 'No hay facturas en esta cuenta'}
                                    </p>
                                )}
                                {(data.documents.total > DOCUMENTS_PAGE_SIZE || page > 1) && (
                                    <Pager
                                        page={page}
                                        total={data.documents.total}
                                        onChange={setPage}
                                        busy={navigationLocked}
                                        label="Facturas"
                                    />
                                )}
                            </section>
                            {operationOpen ? (
                                <div className="cxc-operation-container">
                                    <fieldset
                                        disabled={!data.writesEnabled || !!error || isValidating || !!discard}
                                        onSubmitCapture={(event) => {
                                            if (!allowed || discard) {
                                                event.preventDefault();
                                                event.stopPropagation();
                                            }
                                        }}
                                    >
                                        <OperationForm
                                            key={`${action.type}-${action.id || 'all'}`}
                                            action={action}
                                            client={data.client}
                                            rate={data.rate}
                                            balance={data.summary.balance}
                                            onCancel={() => cancel()}
                                            onSuccess={success}
                                            onBusyChange={setBusy}
                                            onDirtyChange={setDirty}
                                        />
                                    </fieldset>
                                    {(!data.writesEnabled || error || isValidating) && (
                                        <Button
                                            variant="outline-secondary"
                                            className="mt-2"
                                            disabled={busy}
                                            onClick={() => cancel()}
                                        >
                                            Volver al historial
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <section className="cxc-history-card" aria-labelledby="cxc-history-title">
                                    <div className="cxc-section-heading">
                                        <div>
                                            <h3 id="cxc-history-title">Historial de cobranza</h3>
                                        </div>
                                        <span className="cxc-count">{data.timeline.total}</span>
                                    </div>
                                    <div className="cxc-history-body">
                                        {!data.timeline.data.length && (
                                            <p className="cxc-empty">Sin movimientos registrados</p>
                                        )}
                                        <Timeline
                                            events={data.timeline.data.map((event) =>
                                                voidReasons[event.eventId]
                                                    ? { ...event, voidReason: voidReasons[event.eventId] }
                                                    : event,
                                            )}
                                            expandedId={expandedMovement}
                                            locked={navigationLocked}
                                            voidEventId={action?.type === 'void' ? action.event.eventId : null}
                                            voidForm={
                                                action?.type === 'void' ? (
                                                    <InlineOperationForm
                                                        key={action.event.eventId}
                                                        client={data.client}
                                                        action={{ type: 'void', id: action.event.movementId }}
                                                        disabled={!allowed}
                                                        discarding={!!discard}
                                                        onCancel={cancelInline}
                                                        onSuccess={inlineSuccess}
                                                        onBusyChange={setBusy}
                                                        onDirtyChange={setDirty}
                                                    />
                                                ) : null
                                            }
                                            onExpandedChange={setExpandedMovement}
                                            allowed={allowed}
                                            onInvoice={openInvoice}
                                            onVoid={(event, trigger) =>
                                                start(
                                                    {
                                                        type: 'void',
                                                        event,
                                                        timelineTotal: data.timeline.total,
                                                        position:
                                                            (timelinePage - 1) * DOCUMENTS_PAGE_SIZE +
                                                            data.timeline.data.findIndex(
                                                                (movement) => movement.eventId === event.eventId,
                                                            ),
                                                    },
                                                    trigger,
                                                )
                                            }
                                        />
                                    </div>
                                    {(data.timeline.total > DOCUMENTS_PAGE_SIZE || timelinePage > 1) && (
                                        <Pager
                                            page={timelinePage}
                                            total={data.timeline.total}
                                            onChange={setTimelinePage}
                                            busy={navigationLocked}
                                            label="Historial"
                                        />
                                    )}
                                </section>
                            )}
                        </div>
                    </>
                )}
            </Modal.Body>
        </Modal>
    );
}
