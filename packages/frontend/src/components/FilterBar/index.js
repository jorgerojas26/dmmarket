import { useEffect, useState } from 'react';
import './styles.css';

// Iconos de las opciones del menú (SVG inline, mismo estilo que los del sidebar).
// Decorativos: acompañan al texto de la opción, por eso aria-hidden.
const makeIcon = (children) => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        {children}
    </svg>
);

const FILTER_ICONS = {
    ruta: makeIcon(
        <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />,
    ),
    client: makeIcon(
        <>
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </>,
    ),
    group: makeIcon(
        <>
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.83z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
        </>,
    ),
    employee: makeIcon(
        <>
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
        </>,
    ),
    proveedor: makeIcon(
        <>
            <path d="M1 3h15v13H1z" />
            <path d="M16 8h4l3 3v5h-7V8z" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
        </>,
    ),
};

const FALLBACK_ICON = makeIcon(
    <>
        <line x1="4" y1="21" x2="4" y2="14" />
        <line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" />
        <line x1="20" y1="12" x2="20" y2="3" />
        <line x1="1" y1="14" x2="7" y2="14" />
        <line x1="9" y1="8" x2="15" y2="8" />
        <line x1="17" y1="16" x2="23" y2="16" />
    </>,
);

/**
 * Chip de un filtro añadido.
 *
 * Sin valor → muestra el selector para elegir (expandido).
 * Con valor → se contrae a un tag "Label: valor"; un click lo expande para
 * editar. El ✕ limpia el valor y quita el filtro por completo.
 */
const FilterChip = ({ filter, onClear }) => {
    const { key, label, value, valueLabel, render } = filter;
    const [editing, setEditing] = useState(!value);

    // Al recibir un valor, contraer el selector (mostrar el tag compacto).
    useEffect(() => {
        if (value) setEditing(false);
    }, [value]);

    const showSelector = !value || editing;

    return (
        <div className={`filter-chip${showSelector ? ' expanded' : ''}`}>
            {showSelector ? (
                <div className="filter-chip-selector">
                    <span className="filter-chip-name">{label}</span>
                    <div className="filter-chip-select-input">{render()}</div>
                </div>
            ) : (
                <button
                    type="button"
                    className="filter-chip-tag"
                    onClick={() => setEditing(true)}
                    title={`Editar filtro ${label}`}
                >
                    <span className="filter-chip-name">{label}</span>
                    <span className="filter-chip-value">{valueLabel}</span>
                </button>
            )}
            <button
                type="button"
                className="filter-chip-clear"
                onClick={() => onClear(key)}
                aria-label={`Quitar filtro ${label}`}
            >
                ✕
            </button>
        </div>
    );
};

/**
 * Barra de filtros con revelación progresiva: solo se muestran los filtros que
 * el usuario añade explícitamente con "+ Filtro". Cada filtro añadido es un
 * chip con su selector y se puede quitar con ✕.
 */
const FilterBar = ({ filters, onAdd, onClear, onClearAll }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const available = filters.filter((f) => !f.added);
    const active = filters.filter((f) => f.added);

    // Cerrar el menú al hacer click en cualquier lugar fuera del botón/panel.
    useEffect(() => {
        if (!menuOpen) return undefined;
        const onOutsideClick = (e) => {
            if (!e.target.closest('.filter-bar-add-wrap')) setMenuOpen(false);
        };
        document.addEventListener('mousedown', onOutsideClick);
        return () => document.removeEventListener('mousedown', onOutsideClick);
    }, [menuOpen]);

    return (
        <div className="filter-bar">
            <div className="filter-bar-add-wrap">
                <button
                    type="button"
                    className="filter-bar-add"
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-expanded={menuOpen}
                >
                    + Filtro
                </button>
                {menuOpen && (
                    <div className="filter-bar-menu">
                        {available.length === 0 ? (
                            <span className="filter-bar-menu-empty">Todos los filtros aplicados</span>
                        ) : (
                            available.map((f) => (
                                <button
                                    key={f.key}
                                    type="button"
                                    className="filter-bar-menu-item"
                                    onClick={() => {
                                        onAdd(f.key);
                                        setMenuOpen(false);
                                    }}
                                >
                                    <span className="filter-bar-menu-icon">{FILTER_ICONS[f.key] || FALLBACK_ICON}</span>
                                    {f.label}
                                </button>
                            ))
                        )}
                    </div>
                )}
            </div>
            <div className="filter-bar-chips">
                {active.map((f) => (
                    <FilterChip key={f.key} filter={f} onClear={onClear} />
                ))}
            </div>
            {active.length >= 2 && (
                <button type="button" className="filter-bar-clear-all" onClick={onClearAll}>
                    Limpiar todos
                </button>
            )}
        </div>
    );
};

export default FilterBar;
