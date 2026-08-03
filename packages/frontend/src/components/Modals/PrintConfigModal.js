import { useEffect, useState } from 'react';
import { Button, Modal, ToggleButton, ToggleButtonGroup } from 'react-bootstrap';
import Select from 'react-select';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
    arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { darkSelectStyles } from 'components/selectStyles';
import './PrintConfigModal.css';

/**
 * Config dialog shown before every global print in `Table`.
 *
 * Lets the user pick which columns to print (all checked by default), define a
 * multi-column sort for the printed rows (drag to reorder priority, toggle
 * asc/desc per criterion), and choose the page orientation and the currency
 * for monetary values. On confirm it calls
 * `onPrint({ columns, orientation, currency, sortBy })` where `columns` is the
 * filtered array of column definitions, `currency` is 'USD' | 'Bs' and
 * `sortBy` is `[{ id, desc }]` in priority order (empty = table's current
 * order).
 */
const getColumnKey = (col) => col.accessor ?? col.id ?? col.Header;

const getColumnLabel = (col) => (typeof col.Header === 'string' ? col.Header : String(getColumnKey(col)));

/* ── Inline icons (feather-style, currentColor) ── */
const GripIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="9" cy="5" r="2" />
        <circle cx="15" cy="5" r="2" />
        <circle cx="9" cy="12" r="2" />
        <circle cx="15" cy="12" r="2" />
        <circle cx="9" cy="19" r="2" />
        <circle cx="15" cy="19" r="2" />
    </svg>
);

const ArrowUpIcon = () => (
    <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <line x1="12" y1="19" x2="12" y2="5" />
        <polyline points="5 12 12 5 19 12" />
    </svg>
);

const ArrowDownIcon = () => (
    <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <line x1="12" y1="5" x2="12" y2="19" />
        <polyline points="19 12 12 19 5 12" />
    </svg>
);

const CloseIcon = () => (
    <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden="true"
    >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

const PortraitIcon = () => (
    <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
    >
        <rect x="6" y="3" width="12" height="18" rx="2" />
    </svg>
);

const LandscapeIcon = () => (
    <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
    >
        <rect x="3" y="6" width="18" height="12" rx="2" />
    </svg>
);

const CheckIcon = () => (
    <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const SearchIcon = () => (
    <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
    >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
);

/* ── One sortable sort-criterion row ── */
const SortRuleItem = ({ rule, label, onToggleDirection, onRemove }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rule.key });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} className={`sort-rule${isDragging ? ' dragging' : ''}`}>
            <button
                type="button"
                className="sort-rule-handle"
                aria-label={`Arrastrar para cambiar prioridad de ${label}`}
                {...attributes}
                {...listeners}
            >
                <GripIcon />
            </button>
            <span className="sort-rule-label" title={label}>
                {label}
            </span>
            <div className="sort-rule-direction" role="group" aria-label="Dirección del orden">
                <button
                    type="button"
                    className={!rule.desc ? 'active' : ''}
                    title="Ascendente"
                    aria-label={`${label}: ascendente`}
                    aria-pressed={!rule.desc}
                    onClick={() => rule.desc && onToggleDirection(rule.key)}
                >
                    <ArrowUpIcon />
                </button>
                <button
                    type="button"
                    className={rule.desc ? 'active' : ''}
                    title="Descendente"
                    aria-label={`${label}: descendente`}
                    aria-pressed={rule.desc}
                    onClick={() => !rule.desc && onToggleDirection(rule.key)}
                >
                    <ArrowDownIcon />
                </button>
            </div>
            <button
                type="button"
                className="sort-rule-remove"
                aria-label={`Quitar criterio ${label}`}
                onClick={() => onRemove(rule.key)}
            >
                <CloseIcon />
            </button>
        </div>
    );
};

const PrintConfigModal = ({ show, columns = [], initialOrientation = 'portrait', onClose, onPrint }) => {
    const [selectedKeys, setSelectedKeys] = useState(() => new Set(columns.map(getColumnKey)));
    const [columnQuery, setColumnQuery] = useState('');
    const [orientation, setOrientation] = useState(initialOrientation);
    const [currency, setCurrency] = useState('USD');
    const [sortRules, setSortRules] = useState([]);

    // 4px of movement required before a drag starts, so handle clicks never
    // turn into accidental drags.
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    // Every time the modal opens, start with all columns checked, the default
    // orientation and no sort criteria.
    useEffect(() => {
        if (show) {
            setSelectedKeys(new Set(columns.map(getColumnKey)));
            setColumnQuery('');
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

    const normalizedQuery = columnQuery.trim().toLowerCase();
    const visibleColumns = normalizedQuery
        ? columns.filter((col) => getColumnLabel(col).toLowerCase().includes(normalizedQuery))
        : columns;

    /* ── Sort criteria ── */
    const sortedKeys = new Set(sortRules.map((rule) => rule.key));
    const availableSortOptions = selectedColumns
        .filter((col) => !sortedKeys.has(getColumnKey(col)))
        .map((col) => ({ value: getColumnKey(col), label: getColumnLabel(col) }));

    const labelForSortKey = (key) => {
        const col = columns.find((c) => getColumnKey(c) === key);
        return col ? getColumnLabel(col) : String(key);
    };

    const addSortRule = (option) => {
        if (!option || !selectedKeys.has(option.value) || sortedKeys.has(option.value)) return;
        setSortRules((rules) => [...rules, { key: option.value, desc: false }]);
    };

    const toggleSortDirection = (key) => {
        setSortRules((rules) => rules.map((rule) => (rule.key === key ? { ...rule, desc: !rule.desc } : rule)));
    };

    const removeSortRule = (key) => {
        setSortRules((rules) => rules.filter((rule) => rule.key !== key));
    };

    const handleDragEnd = ({ active, over }) => {
        if (!over || active.id === over.id) return;
        setSortRules((rules) => {
            const from = rules.findIndex((rule) => rule.key === active.id);
            const to = rules.findIndex((rule) => rule.key === over.id);
            if (from === -1 || to === -1) return rules;
            return arrayMove(rules, from, to);
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
        <Modal show={show} onHide={onClose} size="lg" className="print-config-modal" centered>
            <Modal.Header closeButton>
                <Modal.Title>Configuración de impresión</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <div className="pc-grid">
                    {/* ── Columns ── */}
                    <section className="pc-section">
                        <div className="pc-section-head">
                            <span className="pc-section-title">
                                Columnas
                                <span className="pc-count">
                                    {selectedKeys.size} de {columns.length}
                                </span>
                            </span>
                            <span className="pc-section-actions">
                                <button
                                    type="button"
                                    disabled={allChecked}
                                    onClick={() => setSelectedKeys(new Set(columns.map(getColumnKey)))}
                                >
                                    Todas
                                </button>
                                <button
                                    type="button"
                                    disabled={selectedKeys.size === 0}
                                    onClick={() => {
                                        setSelectedKeys(new Set());
                                        setSortRules([]);
                                    }}
                                >
                                    Ninguna
                                </button>
                            </span>
                        </div>
                        {columns.length > 8 && (
                            <div className="pc-search">
                                <SearchIcon />
                                <input
                                    type="text"
                                    placeholder="Buscar columna…"
                                    value={columnQuery}
                                    onChange={(e) => setColumnQuery(e.target.value)}
                                />
                            </div>
                        )}
                        <div className="column-list">
                            {columns.length === 0 && <p className="pc-empty">No hay columnas disponibles.</p>}
                            {columns.length > 0 && visibleColumns.length === 0 && (
                                <p className="pc-empty">Sin coincidencias para «{columnQuery.trim()}».</p>
                            )}
                            {visibleColumns.map((col) => {
                                const key = getColumnKey(col);
                                const checked = selectedKeys.has(key);
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        role="checkbox"
                                        aria-checked={checked}
                                        className={`column-item${checked ? ' checked' : ''}`}
                                        onClick={() => toggleColumn(key)}
                                    >
                                        <span className="column-item-check">{checked && <CheckIcon />}</span>
                                        <span className="column-item-label">{getColumnLabel(col)}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {selectedColumns.length === 0 && columns.length > 0 && (
                            <p className="pc-error">Selecciona al menos una columna.</p>
                        )}
                    </section>

                    <div className="pc-side">
                        {/* ── Row sorting ── */}
                        <section className="pc-section">
                            <div className="pc-section-head">
                                <span className="pc-section-title">Orden de las filas</span>
                            </div>
                            {sortRules.length > 0 && (
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={handleDragEnd}
                                >
                                    <SortableContext
                                        items={sortRules.map((rule) => rule.key)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <div className="sort-rules-list">
                                            {sortRules.map((rule) => (
                                                <SortRuleItem
                                                    key={rule.key}
                                                    rule={rule}
                                                    label={labelForSortKey(rule.key)}
                                                    onToggleDirection={toggleSortDirection}
                                                    onRemove={removeSortRule}
                                                />
                                            ))}
                                        </div>
                                    </SortableContext>
                                </DndContext>
                            )}
                            {availableSortOptions.length > 0 && (
                                <Select
                                    classNamePrefix="print-sort-select"
                                    styles={darkSelectStyles}
                                    options={availableSortOptions}
                                    value={null}
                                    onChange={addSortRule}
                                    placeholder="Agregar criterio…"
                                    isSearchable={false}
                                    controlShouldRenderValue={false}
                                    menuPortalTarget={document.body}
                                    menuPosition="fixed"
                                    noOptionsMessage={() => 'Sin columnas disponibles'}
                                />
                            )}
                            {sortRules.length === 0 && (
                                <p className="pc-hint">
                                    Sin criterios: se imprime en el orden actual de la tabla. El primer criterio que
                                    agregues tiene mayor prioridad; arrastra para cambiarla.
                                </p>
                            )}
                        </section>

                        {/* ── Page setup ── */}
                        <section className="pc-section">
                            <div className="pc-page-setup">
                                <div>
                                    <span className="pc-section-title">Orientación</span>
                                    <ToggleButtonGroup
                                        type="radio"
                                        name="print-orientation"
                                        value={orientation}
                                        onChange={setOrientation}
                                        className="pc-segmented"
                                    >
                                        <ToggleButton
                                            id="print-ori-portrait"
                                            value="portrait"
                                            variant="outline-secondary"
                                        >
                                            <PortraitIcon /> Vertical
                                        </ToggleButton>
                                        <ToggleButton
                                            id="print-ori-landscape"
                                            value="landscape"
                                            variant="outline-secondary"
                                        >
                                            <LandscapeIcon /> Horizontal
                                        </ToggleButton>
                                    </ToggleButtonGroup>
                                </div>
                                <div>
                                    <span className="pc-section-title">Moneda</span>
                                    <ToggleButtonGroup
                                        type="radio"
                                        name="print-currency"
                                        value={currency}
                                        onChange={setCurrency}
                                        className="pc-segmented"
                                    >
                                        <ToggleButton id="print-currency-usd" value="USD" variant="outline-secondary">
                                            $ USD
                                        </ToggleButton>
                                        <ToggleButton id="print-currency-bs" value="Bs" variant="outline-secondary">
                                            Bs
                                        </ToggleButton>
                                    </ToggleButtonGroup>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
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
