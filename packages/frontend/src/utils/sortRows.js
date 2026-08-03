/**
 * Multi-column sorter for plain data rows, used by the print config dialog
 * (PDF export) to reorder fetched data before rendering.
 *
 * `sortBy` follows react-table's shape: `[{ id, desc }]`, ordered by priority
 * (first entry is the primary criterion). Null/empty values sort last.
 * Numeric-looking values compare numerically; everything else (text, ISO
 * dates) compares with a Spanish-aware locale comparison.
 *
 * Returns a new array — the input is never mutated.
 */
const isEmpty = (value) => value == null || value === '';

const compareValues = (a, b) => {
    if (a === b) return 0;
    const aEmpty = isEmpty(a);
    const bEmpty = isEmpty(b);
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;

    const aNum = Number(a);
    const bNum = Number(b);
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;

    return String(a).localeCompare(String(b), 'es', { sensitivity: 'base', ignorePunctuation: true });
};

/**
 * @param {Array}  rows      Data rows (plain objects).
 * @param {Array}  sortBy    `[{ id, desc }]` in priority order.
 * @param {Object} [getValue] Optional accessor overrides `{ [id]: (row) => value }`
 *                            for ids that don't map to a row key directly.
 * @returns {Array} Newly sorted array.
 */
export const sortRows = (rows = [], sortBy = [], getValue = {}) => {
    if (!sortBy.length || rows.length < 2) return rows;

    const get = (id) => getValue[id] || ((row) => row?.[id]);

    const sorted = [...rows];
    sorted.sort((a, b) => {
        for (const rule of sortBy) {
            const cmp = compareValues(get(rule.id)(a), get(rule.id)(b));
            if (cmp !== 0) return rule.desc ? -cmp : cmp;
        }
        return 0;
    });
    return sorted;
};

export default sortRows;
