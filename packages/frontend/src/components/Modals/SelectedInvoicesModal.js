import dayjs from 'dayjs';
import { Button, Modal } from 'react-bootstrap';
import './SelectedInvoicesModal.css';

/**
 * Lists the invoices currently selected for dispatch, so the user can review
 * the accumulated selection (across pages, searches and filters) and remove
 * individual invoices from it before printing.
 */
const SelectedInvoicesModal = ({ show, invoices = [], totalSummary = 0, onRemove, onClear, onClose }) => {
    return (
        <Modal show={show} size="lg" onHide={onClose} centered className="selected-invoices-modal">
            <Modal.Header closeButton>
                <Modal.Title>Facturas seleccionadas ({invoices.length})</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {invoices.length === 0 ? (
                    <div className="si-empty">No hay facturas seleccionadas.</div>
                ) : (
                    <div className="si-table-wrap">
                        <table className="si-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Cliente</th>
                                    <th>RIF</th>
                                    <th>TOTAL</th>
                                    <th>Fecha</th>
                                    <th style={{ width: 44 }} />
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.map((inv) => (
                                    <tr key={inv.invoiceId}>
                                        <td>{inv.invoiceId}</td>
                                        <td>{inv.client}</td>
                                        <td>{inv.rif}</td>
                                        <td>${inv.total != null ? inv.total.toFixed(2) : ''}</td>
                                        <td>{dayjs(inv.createdAt).format('MMM DD, YYYY')}</td>
                                        <td className="si-remove-cell">
                                            <button
                                                type="button"
                                                className="si-remove"
                                                title="Quitar de la selección"
                                                onClick={() => onRemove(inv.invoiceId)}
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
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
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
