import { useEffect, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import './PrintConfigModal.css';

/**
 * Config dialog shown before every global print in `Table`.
 *
 * Lets the user pick which columns to print (all checked by default), define a
 * multi-column sort for the printed document, and choose the page orientation
 * and the currency for monetary values. On confirm it calls
 * `onPrint({ columns, orientation, currency, sortBy })` where `columns` is the
 * filtered array of column definitions, `currency` is 'USD' | 'Bs' and
 * `sortBy` is `[{ id, desc }]` in priority order (empty = table's current
 * order).
 */
const getColumnKey = (col) => col.accessor ?? col.id ?? col.Header;

const getColumnLabel = (col) => (typeof col.Header === 'string' ? col.Header : String(getColumnKey(col)));

const PrintConfigModal = ({ show, columns = [], initialOrientation = 'portrait', onClose, onPrint }) => {
    const [selectedKeys, setSelectedKeys] = useState(() => new Set(columns.map(getColumnKey)));
    const [orientation, setOrientation] = useState(initialOrientation);
    const [currency, setCurrency] = useState('USD');
    const [sortRules, setSortRules] = useState([]);

    // Every time the modal opens, start with all columns checked, the default
    // orientation and no sort criteria.
    useEffect(() => {
        if (show) {
            setSelectedKeys(new Set(columns.map(getColumnKey)));
            setOrientation(initialOrientation);
            setCurrency('USD');
            setSortRules([]);
        }
    }, [show, columns, initialOrientation]);

    const toggleColumn = (key) => {
        if (selectedKeys.has(key)) {
            setSelectedKeys((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
            // A sort criterion on a hidden column is meaningless — drop it.
            setSortRules((rules) => rules.filter((rule) => rule.key !== key));
        } else {
            setSelectedKeys((prev) => new Set(prev).add(key));
        }
    };

    const allChecked = columns.length > 0 && selectedKeys.size === columns.length;
    const selectedColumns = columns.filter((col) => selectedKeys.has(getColumnKey(col)));

    /* ── Sort criteria ── */
    const sortedKeys = new Set(sortRules.map((rule) => rule.key));
    const availableSortColumns = selectedColumns.filter((col) => !sortedKeys.has(getColumnKey(col)));

    const labelForSortKey = (key) => getColumnLabel(columns.find((col) => getColumnKey(col) === key));

    const addSortRule = (key) => {
        if (!key || !selectedKeys.has(key) || sortedKeys.has(key)) return;
        setSortRules((rules) => [...rules, { key, desc: false }]);
    };

    const toggleSortDirection = (key) => {
        setSortRules((rules) => rules.map((rule) => (rule.key === key ? { ...rule, desc: !rule.desc } : rule)));
    };

    const removeSortRule = (key) => {
        setSortRules((rules) => rules.filter((rule) => rule.key !== key));
    };

    const moveSortRule = (index, delta) => {
        setSortRules((rules) => {
            const target = index + delta;
            if (target < 0 || target >= rules.length) return rules;
            const next = [...rules];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const handlePrint = () => {
        if (selectedColumns.length === 0) return;
        onPrint({
            columns: selectedColumns,
            orientation,
            currency,
            // Only rules on still-selected columns (defensive — the UI already drops them).
            sortBy: sortRules
                .filter((rule) => selectedKeys.has(rule.key))
                .map((rule) => ({ id: rule.key, desc: rule.desc })),
        });
    };

    return (
        <Modal show={show} onHide={onClose} size="lg" className="print-config-modal">
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
                                    onClick={() => {
                                        setSelectedKeys(new Set());
                                        setSortRules([]);
                                    }}
                                >
                                    Ninguna
                                </Button>
                            </div>
                        </div>
                        <div className="column-list rounded p-3" style={{ maxHeight: 260, overflowY: 'auto' }}>
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

                    <Form.Group className="mb-4">
                        <Form.Label className="fw-bold">Ordenar por</Form.Label>
                        <Form.Text className="d-block mb-2">
                            El primer criterio tiene prioridad. Si no agregas criterios, se mantiene el orden actual de
                            la tabla.
                        </Form.Text>
                        {sortRules.length === 0 && <div className="sort-rules-empty">Sin orden personalizado.</div>}
                        {sortRules.length > 0 && (
                            <div className="sort-rules-list">
                                {sortRules.map((rule, index) => (
                                    <div className="sort-rule" key={rule.key}>
                                        <span className="sort-rule-index">{index + 1}</span>
                                        <span className="sort-rule-label" title={labelForSortKey(rule.key)}>
                                            {labelForSortKey(rule.key)}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="outline-light"
                                            onClick={() => toggleSortDirection(rule.key)}
                                        >
                                            {rule.desc ? '↓ Descendente' : '↑ Ascendente'}
                                        </Button>
                                        <div className="d-flex gap-1">
                                            <Button
                                                size="sm"
                                                variant="outline-secondary"
                                                disabled={index === 0}
                                                onClick={() => moveSortRule(index, -1)}
                                                aria-label="Subir prioridad"
                                            >
                                                ↑
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline-secondary"
                                                disabled={index === sortRules.length - 1}
                                                onClick={() => moveSortRule(index, 1)}
                                                aria-label="Bajar prioridad"
                                            >
                                                ↓
                                            </Button>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline-danger"
                                            onClick={() => removeSortRule(rule.key)}
                                            aria-label="Quitar criterio"
                                        >
                                            ×
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {availableSortColumns.length > 0 && (
                            <Form.Select
                                className="print-sort-select mt-2"
                                value=""
                                onChange={(e) => addSortRule(e.target.value)}
                            >
                                <option value="" disabled>
                                    Agregar criterio…
                                </option>
                                {availableSortColumns.map((col) => (
                                    <option key={getColumnKey(col)} value={getColumnKey(col)}>
                                        {getColumnLabel(col)}
                                    </option>
                                ))}
                            </Form.Select>
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

                    <Form.Group className="mt-4">
                        <Form.Label className="fw-bold">Moneda de los valores</Form.Label>
                        <div>
                            <Form.Check
                                inline
                                type="radio"
                                name="print-currency"
                                id="print-currency-usd"
                                label="Dólares (USD)"
                                checked={currency === 'USD'}
                                onChange={() => setCurrency('USD')}
                            />
                            <Form.Check
                                inline
                                type="radio"
                                name="print-currency"
                                id="print-currency-bs"
                                label="Bolívares (Bs)"
                                checked={currency === 'Bs'}
                                onChange={() => setCurrency('Bs')}
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
