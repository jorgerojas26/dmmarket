import { useEffect, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';

/**
 * Config dialog shown before every global print in `Table`.
 *
 * Lets the user pick which columns to print (all checked by default) and the page
 * orientation. On confirm it calls `onPrint({ columns, orientation })` where `columns`
 * is the filtered array of column definitions.
 */
const getColumnKey = (col) => col.accessor ?? col.id ?? col.Header;

const getColumnLabel = (col) => (typeof col.Header === 'string' ? col.Header : String(getColumnKey(col)));

const PrintConfigModal = ({ show, columns = [], initialOrientation = 'portrait', onClose, onPrint }) => {
    const [selectedKeys, setSelectedKeys] = useState(() => new Set(columns.map(getColumnKey)));
    const [orientation, setOrientation] = useState(initialOrientation);

    // Every time the modal opens, start with all columns checked and the default orientation.
    useEffect(() => {
        if (show) {
            setSelectedKeys(new Set(columns.map(getColumnKey)));
            setOrientation(initialOrientation);
        }
    }, [show, columns, initialOrientation]);

    const toggleColumn = (key) => {
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const allChecked = columns.length > 0 && selectedKeys.size === columns.length;
    const selectedColumns = columns.filter((col) => selectedKeys.has(getColumnKey(col)));

    const handlePrint = () => {
        if (selectedColumns.length === 0) return;
        onPrint({ columns: selectedColumns, orientation });
    };

    return (
        <Modal show={show} onHide={onClose} size="lg">
            <Modal.Header closeButton>
                <Modal.Title>Configuración de impresión</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form>
                    <Form.Group className="mb-4">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <Form.Label className="fw-bold mb-0">Columnas a imprimir</Form.Label>
                            <div className="d-flex gap-2">
                                <Button
                                    size="sm"
                                    variant="outline-primary"
                                    disabled={allChecked}
                                    onClick={() => setSelectedKeys(new Set(columns.map(getColumnKey)))}
                                >
                                    Seleccionar todo
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline-secondary"
                                    disabled={selectedKeys.size === 0}
                                    onClick={() => setSelectedKeys(new Set())}
                                >
                                    Ninguna
                                </Button>
                            </div>
                        </div>
                        <div className="border rounded p-3" style={{ maxHeight: 260, overflowY: 'auto' }}>
                            {columns.length === 0 && <Form.Text>No hay columnas disponibles.</Form.Text>}
                            {columns.map((col) => {
                                const key = getColumnKey(col);
                                return (
                                    <Form.Check
                                        key={key}
                                        type="checkbox"
                                        id={`print-col-${key}`}
                                        label={getColumnLabel(col)}
                                        checked={selectedKeys.has(key)}
                                        onChange={() => toggleColumn(key)}
                                    />
                                );
                            })}
                        </div>
                        {selectedColumns.length === 0 && (
                            <Form.Text className="text-danger">Selecciona al menos una columna.</Form.Text>
                        )}
                    </Form.Group>

                    <Form.Group>
                        <Form.Label className="fw-bold">Orientación de la página</Form.Label>
                        <div>
                            <Form.Check
                                inline
                                type="radio"
                                name="print-orientation"
                                id="print-ori-landscape"
                                label="Horizontal"
                                checked={orientation === 'landscape'}
                                onChange={() => setOrientation('landscape')}
                            />
                            <Form.Check
                                inline
                                type="radio"
                                name="print-orientation"
                                id="print-ori-portrait"
                                label="Vertical"
                                checked={orientation === 'portrait'}
                                onChange={() => setOrientation('portrait')}
                            />
                        </div>
                    </Form.Group>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onClose}>
                    Cancelar
                </Button>
                <Button variant="primary" onClick={handlePrint} disabled={selectedColumns.length === 0}>
                    Imprimir
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default PrintConfigModal;
