import Table from 'components/Table';
import { DateTime } from 'luxon';
import { Alert, Button, Modal, Spinner } from 'react-bootstrap';
import './styles.css';

const formatCurrency = (value) => {
    const num = Number(value);
    if (Number.isNaN(num)) return '$0.00';
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const SaleDetailModal = ({ show, onClose, sale, documentLabel = 'Venta', invoiceId, error, onRetry }) => {
    const loading = !sale;
    const documentId = (error ? null : sale?.idFactura) ?? invoiceId;
    const title = documentId != null ? `${documentLabel} #${documentId}` : 'Cargando...';
    const emptyMessage = `Sin productos en esta ${documentLabel.toLowerCase()}`;

    return (
        <Modal
            show={show}
            size="md"
            onHide={onClose}
            backdrop="static"
            centered
            className="provider-dashboard-modal purchase-detail-modal"
            aria-labelledby="sale-detail-modal-title"
        >
            <Modal.Header closeButton>
                <div className="d-flex align-items-center gap-3">
                    <div className="provider-avatar">{documentLabel.charAt(0)}</div>
                    <div>
                        <Modal.Title id="sale-detail-modal-title">{title}</Modal.Title>
                        <div className="provider-modal-subtitle">
                            {sale && !error
                                ? `${DateTime.fromISO(sale.fecha).toFormat('dd MMM yyyy', { locale: 'es' })} — ${sale.vendedor || ''}`
                                : ''}
                        </div>
                    </div>
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
                ) : loading ? (
                    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 150 }}>
                        <Spinner animation="border" variant="light" role="status" aria-label="Cargando detalle" />
                    </div>
                ) : Array.isArray(sale.productos) && sale.productos.length > 0 ? (
                    <>
                        <div className="provider-table-container">
                            <Table
                                data={sale.productos}
                                columns={[
                                    { Header: 'Descripción', accessor: 'descripcion' },
                                    {
                                        Header: 'Cantidad',
                                        accessor: 'cantidad',
                                        Cell: ({ value }) => Number(value).toLocaleString('en-US'),
                                    },
                                    {
                                        Header: 'Precio',
                                        accessor: 'precio',
                                        Cell: ({ value }) => formatCurrency(value),
                                    },
                                    {
                                        Header: 'Subtotal',
                                        accessor: 'subtotal',
                                        Cell: ({ value }) => formatCurrency(value),
                                    },
                                    {
                                        Header: 'Utilidad',
                                        accessor: 'utilidad',
                                        Cell: ({ value }) => formatCurrency(value),
                                    },
                                ]}
                                className="provider-table"
                                maxHeight={null}
                                emptyMessage={emptyMessage}
                            />
                        </div>
                        <div className="purchase-total-row">
                            <span>Total</span>
                            <span className="purchase-total-amount">{formatCurrency(sale.total)}</span>
                        </div>
                        <div className="purchase-total-row">
                            <span>Utilidad</span>
                            <span className="purchase-total-amount">{formatCurrency(sale.utilidad)}</span>
                        </div>
                    </>
                ) : (
                    <div className="provider-empty-state">
                        <span>{emptyMessage}</span>
                    </div>
                )}
            </Modal.Body>
        </Modal>
    );
};

export default SaleDetailModal;
