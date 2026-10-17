import Table from 'components/Table';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { Button, Modal } from 'react-bootstrap';
import './SelectedInvoicesModal.css';

/**
 * Lists the invoices currently selected for dispatch, so the user can review
 * the accumulated selection (across pages, searches and filters) and remove
 * individual invoices from it before printing.
 */
const SelectedInvoicesModal = ({ show, invoices = [], totalSummary = 0, onRemove, onClear, onClose }) => {
    const columns = useMemo(
        () => [
            { Header: 'ID', accessor: 'invoiceId' },
            { Header: 'Cliente', accessor: 'client' },
            { Header: 'RIF', accessor: 'rif' },
            {
                Header: 'Total',
                accessor: 'total',
                Cell: ({ value }) => (value != null ? `$${Number(value).toFixed(2)}` : ''),
            },
            { Header: 'Fecha', accessor: 'createdAt', Cell: ({ value }) => dayjs(value).format('MMM DD, YYYY') },
            {
                Header: '',
                id: 'remove',
                Cell: ({ row }) => (
                    <button
                        type="button"
                        className="si-remove"
                        title="Quitar de la selección"
                        aria-label={`Quitar factura ${row.original.invoiceId} de la selección`}
                        onClick={() => onRemove(row.original.invoiceId)}
                    >
                        <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                ),
            },
        ],
        [onRemove],
    );
    return (
        <Modal show={show} size="lg" onHide={onClose} centered className="selected-invoices-modal">
            <Modal.Header closeButton>
                <Modal.Title>Facturas seleccionadas ({invoices.length})</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Table
                    data={invoices}
                    columns={columns}
                    maxHeight="60vh"
                    emptyMessage="No hay facturas seleccionadas."
                    emptySubtitle=""
                    scrollLabel="Facturas seleccionadas para despacho"
                />
            </Modal.Body>
            <Modal.Footer>
                <span className="si-total">Total: ${totalSummary.toFixed(2)}</span>
                {invoices.length > 0 && (
                    <Button variant="outline-danger" size="sm" onClick={onClear}>
                        Limpiar todo
                    </Button>
                )}
                <Button variant="primary" size="sm" onClick={onClose}>
                    Cerrar
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default SelectedInvoicesModal;
