import Table from 'components/Table';
import { DateTime } from 'luxon';
import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from 'components/Modal';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import './styles.css';

const EMPTY_PRODUCTS = [];
const SEARCH_THRESHOLD = 15;
const formatCurrency = (value) => {
    if (value == null) return 'No disponible';
    const amount = Number(value);
    return `$${(Number.isFinite(amount) ? amount : 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
};

const DocumentDetailModal = ({
    show,
    onClose,
    record,
    documentLabel = 'Factura',
    invoiceId,
    subtitle,
    showProfit = false,
    collapseProfit = false,
    error,
    onRetry,
}) => {
    const [search, setSearch] = useState('');
    const [profitExpanded, setProfitExpanded] = useState(false);
    const productsElement = useRef(null);
    const documentId = (error ? null : record?.idFactura) ?? invoiceId;
    const title = documentId != null ? `${documentLabel} #${documentId}` : 'Cargando...';
    const ready = !!record && !error;
    const products = ready && Array.isArray(record.productos) ? record.productos : EMPTY_PRODUCTS;
    const profitAllowed = showProfit && Object.hasOwn(record || {}, 'utilidad');
    const profitVisible = profitAllowed && (!collapseProfit || profitExpanded);
    const monetary = Object.hasOwn(record || {}, 'total');
    const query = search.trim().toLocaleLowerCase('es');
    const filtered = useMemo(
        () =>
            products.filter((product) =>
                String(product.descripcion || '')
                    .toLocaleLowerCase('es')
                    .includes(query),
            ),
        [products, query],
    );
    const columns = useMemo(
        () => [
            { Header: 'Descripción', accessor: 'descripcion' },
            {
                Header: 'Cantidad',
                accessor: 'cantidad',
                Cell: ({ value }) => Number(value).toLocaleString('en-US'),
            },
            ...(monetary ? [{ Header: 'Precio', accessor: 'precio', Cell: ({ value }) => formatCurrency(value) }] : []),
            ...(monetary
                ? [{ Header: 'Subtotal', accessor: 'subtotal', Cell: ({ value }) => formatCurrency(value) }]
                : []),
            ...(profitVisible
                ? [{ Header: 'Utilidad', accessor: 'utilidad', Cell: ({ value }) => formatCurrency(value) }]
                : []),
        ],
        [profitVisible, monetary],
    );
    useEffect(() => {
        setSearch('');
        setProfitExpanded(false);
    }, [show, documentId]);
    useEffect(() => {
        const scroll = productsElement.current?.querySelector('.table-container');
        if (scroll) scroll.scrollTop = 0;
    }, [query, documentId]);
    const countLabel = query
        ? `${filtered.length} de ${products.length} productos`
        : `${products.length} ${products.length === 1 ? 'producto' : 'productos'}`;
    const date = ready && record.fecha ? DateTime.fromISO(record.fecha).toFormat('dd MMM yyyy', { locale: 'es' }) : '';
    return (
        <Modal
            show={show}
            size="xl"
            onHide={onClose}
            backdrop="static"
            centered
            className={`document-detail-modal${products.length >= SEARCH_THRESHOLD ? ' document-detail-long' : ''}`}
            aria-labelledby="document-detail-title"
        >
            <Modal.Header closeButton>
                <div className="document-detail-heading">
                    <Modal.Title id="document-detail-title">{title}</Modal.Title>
                    {ready && (date || subtitle) && (
                        <p className="document-detail-subtitle">{[date, subtitle].filter(Boolean).join(' · ')}</p>
                    )}
                </div>
            </Modal.Header>
            <Modal.Body>
                {error ? (
                    <Alert variant="danger">
                        <div>{error.message || 'No se pudo cargar el detalle.'}</div>
                        {onRetry && (
                            <Button variant="outline-danger" className="mt-2" onClick={onRetry}>
                                Reintentar
                            </Button>
                        )}
                    </Alert>
                ) : !ready ? (
                    <div className="document-detail-empty">
                        <Spinner animation="border" variant="light" role="status" aria-label="Cargando detalle" />
                    </div>
                ) : products.length > 0 ? (
                    <>
                        {products.length >= SEARCH_THRESHOLD && (
                            <div className="document-detail-search">
                                <Form.Control
                                    type="search"
                                    aria-label="Buscar producto"
                                    placeholder="Buscar producto en esta factura…"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                />
                            </div>
                        )}
                        <p className="document-detail-scroll-hint">Desliza la tabla para ver los importes →</p>
                        <div id="document-detail-products" className="document-detail-products" ref={productsElement}>
                            <Table
                                data={filtered}
                                columns={columns}
                                fillHeight
                                scrollLabel={`Productos de la ${documentLabel.toLowerCase()}`}
                                emptyMessage="No se encontraron productos"
                                emptySubtitle="Prueba con otra descripción."
                            />
                        </div>
                    </>
                ) : (
                    <div className="document-detail-empty">Sin productos en esta {documentLabel.toLowerCase()}</div>
                )}
            </Modal.Body>
            <Modal.Footer className="document-detail-footer">
                {ready && (
                    <>
                        <div className="document-detail-meta">
                            <span aria-live="polite">{countLabel}</span>
                            {profitAllowed && collapseProfit && (
                                <Button
                                    variant="link"
                                    aria-expanded={profitExpanded}
                                    aria-controls="document-detail-totals"
                                    onClick={() => setProfitExpanded((value) => !value)}
                                >
                                    {profitExpanded ? 'Ocultar utilidad' : 'Mostrar utilidad'}
                                </Button>
                            )}
                        </div>
                        <dl id="document-detail-totals" className="document-detail-totals">
                            {profitVisible && (
                                <div>
                                    <dt>Utilidad</dt>
                                    <dd>{formatCurrency(record.utilidad)}</dd>
                                </div>
                            )}
                            {monetary && (
                                <div className="document-detail-total">
                                    <dt>Total</dt>
                                    <dd>{formatCurrency(record.total)}</dd>
                                </div>
                            )}
                        </dl>
                    </>
                )}
                <Button variant="outline-secondary" className="document-detail-close" onClick={onClose}>
                    Cerrar
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default DocumentDetailModal;
