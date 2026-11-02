import { useMemo } from 'react';

/**
 * Shared dark-theme styles for react-select, used by SearchInput and
 * any select-based filter (e.g. route filter in ClientsTable).
 */
const buildDarkSelectStyles = (variant = 'default') => {
    const form = variant !== 'default';
    const compact = variant === 'compact';
    const surface = form ? (compact ? '#191c20' : '#1b1e23') : '#212529';
    const border = form ? '#424954' : '#373b3e';
    const text = form ? '#e4e6ea' : '#e9ecef';
    const muted = form ? '#929ca9' : '#adb5bd';
    return {
        control: (base, state) => ({
            ...base,
            backgroundColor: surface,
            borderColor: state.isFocused ? (form ? '#93c5fd' : '#0d6efd') : border,
            borderWidth: 1,
            borderRadius: form ? (compact ? 7 : 9) : 10,
            minHeight: form ? (compact ? 40 : 48) : 38,
            boxShadow: state.isFocused
                ? form
                    ? '0 0 0 3px rgba(59, 130, 246, 0.15)'
                    : '0 0 0 3px rgba(13, 110, 253, 0.2)'
                : undefined,
            '&:hover': form
                ? { borderColor: state.isFocused ? '#93c5fd' : '#5a6473' }
                : {
                      borderColor: '#0d6efd',
                      boxShadow: '0 0 0 3px rgba(13, 110, 253, 0.15)',
                  },
        }),
        singleValue: (base) => ({
            ...base,
            color: text,
            fontWeight: form ? 400 : 500,
        }),
        placeholder: (base) => ({
            ...base,
            color: muted,
        }),
        input: (base) => ({
            ...base,
            color: text,
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
            color: muted,
            '&:hover': { color: text },
        }),
        clearIndicator: (base) => ({
            ...base,
            color: muted,
            '&:hover': { color: text },
        }),
        indicatorSeparator: (base) => ({
            ...base,
            backgroundColor: form ? 'transparent' : border,
        }),
        menu: (base) => ({
            ...base,
            backgroundColor: surface,
            border: `1px solid ${border}`,
            borderRadius: form ? (compact ? 7 : 9) : 10,
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)',
            marginTop: 4,
        }),
        option: (base, state) => ({
            ...base,
            backgroundColor: state.isSelected
                ? '#0d6efd'
                : state.isFocused
                  ? 'rgba(13, 110, 253, 0.12)'
                  : 'transparent',
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
    };
};

export const useDarkSelectStyles = (variant = 'default') => useMemo(() => buildDarkSelectStyles(variant), [variant]);

export const darkSelectStyles = buildDarkSelectStyles();
