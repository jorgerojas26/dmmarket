import { useMemo } from 'react';

/**
 * Shared dark-theme styles for react-select, used by SearchInput and
 * any select-based filter (e.g. route filter in ClientsTable).
 */
const buildDarkSelectStyles = () => ({
    control: (base, state) => ({
        ...base,
        backgroundColor: '#212529',
        borderColor: state.isFocused ? '#0d6efd' : '#373b3e',
        borderWidth: 1,
        borderRadius: 10,
        minHeight: 38,
        boxShadow: state.isFocused ? '0 0 0 3px rgba(13, 110, 253, 0.2)' : undefined,
        '&:hover': {
            borderColor: '#0d6efd',
            boxShadow: '0 0 0 3px rgba(13, 110, 253, 0.15)',
        },
    }),
    singleValue: (base) => ({
        ...base,
        color: '#e9ecef',
        fontWeight: 500,
    }),
    placeholder: (base) => ({
        ...base,
        color: '#adb5bd',
    }),
    input: (base) => ({
        ...base,
        color: '#e9ecef',
    }),
    // El value-container hace flex-wrap por defecto: un placeholder largo se
    // parte en dos líneas y el control crece de alto (layout shift al cargar).
    // Forzamos una sola línea; el ellipsis lo aplica el CSS de .search-select__*.
    valueContainer: (base) => ({
        ...base,
        flexWrap: 'nowrap',
        overflow: 'hidden',
    }),
    dropdownIndicator: (base) => ({
        ...base,
        color: '#adb5bd',
        '&:hover': { color: '#e9ecef' },
    }),
    clearIndicator: (base) => ({
        ...base,
        color: '#adb5bd',
        '&:hover': { color: '#e9ecef' },
    }),
    indicatorSeparator: (base) => ({
        ...base,
        backgroundColor: '#373b3e',
    }),
    menu: (base) => ({
        ...base,
        backgroundColor: '#212529',
        border: '1px solid #373b3e',
        borderRadius: 10,
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)',
        marginTop: 4,
    }),
    option: (base, state) => ({
        ...base,
        backgroundColor: state.isSelected ? '#0d6efd' : state.isFocused ? 'rgba(13, 110, 253, 0.12)' : 'transparent',
        color: state.isSelected ? '#fff' : state.isFocused ? '#e4e6ea' : '#c4cad4',
        cursor: 'pointer',
        '&:active': {
            backgroundColor: 'rgba(13, 110, 253, 0.2)',
        },
    }),
    noOptionsMessage: (base) => ({
        ...base,
        color: '#6b7280',
    }),
    loadingMessage: (base) => ({
        ...base,
        color: '#6b7280',
    }),
    menuPortal: (base) => ({
        ...base,
        zIndex: 9999,
    }),
    multiValue: (base) => ({
        ...base,
        backgroundColor: '#2d3138',
        borderRadius: 4,
    }),
    multiValueLabel: (base) => ({
        ...base,
        color: '#e4e6ea',
    }),
    multiValueRemove: (base) => ({
        ...base,
        color: '#6b7280',
        '&:hover': {
            backgroundColor: '#c0392b',
            color: '#e4e6ea',
        },
    }),
});

export const useDarkSelectStyles = () => useMemo(buildDarkSelectStyles, []);

export const darkSelectStyles = buildDarkSelectStyles();
