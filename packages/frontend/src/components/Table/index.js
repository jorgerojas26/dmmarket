import PrintConfigModal from 'components/Modals/PrintConfigModal';
import debounce from 'lodash.debounce';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { actions, useRowSelect, useSortBy, useTable } from 'react-table';
import './styles.css';

/**
 * Shared Table component with opt‑in server‑side features.
 *
 * @param {object} props
 *
 * @param {Array}          [props.data=[]]                            - Row data array.
 * @param {boolean}        [props.loading]                            - Show spinner overlay.
 * @param {Array}          [props.columns=[]]                         - Column definitions.
 * @param {string}         [props.emptyMessage='Sin datos']           - Empty‑state message.
 * @param {string}         [props.className]                          - CSS class on `<table>`.
 * @param {number|null}    [props.maxHeight=350]                      - Scroll max‑height (`null` disables).
 *
 * @param {string}         [props.filterPlaceholder]                  - Client‑side filter placeholder.
 * @param {Function}       [props.onFilter]                           - Client‑side filter callback `(term)`.
 *
 * @param {boolean}        [props.showFooter=false]                   - Show footer row.
 * @param {Object<string, (string|number)>} [props.summaries]         - Pre‑computed summary values keyed by column `accessor`.
 *
 * @param {Function}       [props.onRowSelect]                        - Row‑select callback `(rowData)`. Enables clickable rows; with `multiSelect` enables checkbox multi‑select (callback receives the array of selected rows — all pages when `preserveSelection` is on).
 * @param {boolean}        [props.multiSelect=false]                  - Enable checkbox column + multi‑select mode (requires `onRowSelect`). Supports Ctrl / Shift.
 * @param {Function}       [props.onRowClick]                         - Row‑click callback `(rowData)`.
 *
 * @param {object}         [props.sorting]                            - Sorting config. Server‑side when `onSort` is provided; client‑side (react‑table) otherwise.
 * @param {boolean}         props.sorting.enabled
 * @param {Array<{id: string, desc: boolean}>} [props.sorting.sortBy] - Initial sort state.
 * @param {Function}        props.sorting.onSort                      - Callback `(sortBy)` on header click (server‑side).
 * @param {boolean}        [props.sorting.resetOnDataChange=true]     - Reset sort when `data` changes (react‑table default). Set `false` to keep the user's sort across data updates.
 *
 * @param {object}         [props.pagination]                         - Server‑side pagination config.
 * @param {boolean}         props.pagination.enabled
 * @param {number}          props.pagination.page                     - Current page (1‑based).
 * @param {number}          props.pagination.totalPages               - Total page count.
 * @param {Function}        props.pagination.onPageChange             - Callback `(page)` on page change.
 * @param {number}         [props.pagination.totalRows]               - Total row count across all pages (enables "Showing X‑Y of Z" label).
 * @param {number}         [props.pagination.pageSize]                - Rows per page (for "Showing X‑Y of Z"; defaults to data.length).
 *
 * @param {object}         [props.search]                             - Server‑side search config.
 * @param {boolean}         props.search.enabled
 * @param {string}         [props.search.placeholder='Buscar...']     - Search input placeholder.
 * @param {Function}        props.search.onSearch                     - Debounced callback `(term)`.
 *
 * @param {object}         [props.print]                              - Print config.
 * @param {boolean}         props.print.enabled
 * @param {Function}       [props.print.onGlobalPrint]                - Global‑print callback. Runs after the config dialog; receives `{ columns, orientation }` (columns = the selected column definitions).
 * @param {string}         [props.print.defaultOrientation='portrait'] - Page orientation preselected in the config dialog.
 * @param {string}         [props.print.globalPrintLabel='Imprimir']  - Global‑print button label.
 * @param {boolean}        [props.print.perRowPrint=false]            - Show per‑row print button.
 * @param {Function}       [props.print.onRowPrint]                   - Per‑row print callback `(rowData)`.
 */
/**
 * Build a page-number array with ellipsis for large page counts.
 * Examples for totalPages=20:
 *   current=1  => [1, 2, 3, 4, 5, '...', 20]
 *   current=6  => [1, '...', 5, 6, 7, '...', 20]
 *   current=18 => [1, '...', 16, 17, 18, 19, 20]
 */
const getPageNumbers = (current, totalPages, windowSize = 5) => {
    if (totalPages <= windowSize + 4) {
        // Small set — show all
        const pages = [];
        for (let i = 1; i <= totalPages; i++) pages.push(i);
        return pages;
    }

    const pages = [];
    const leftBound = Math.max(2, current - Math.floor((windowSize - 1) / 2));
    const rightBound = Math.min(totalPages - 1, leftBound + windowSize - 1);

    // Always include first page
    pages.push(1);

    // Left ellipsis?
    if (leftBound > 2) pages.push('...');
    else if (leftBound === 2) pages.push(2);

    // Middle window
    for (let i = Math.max(leftBound, 3); i <= rightBound; i++) {
        pages.push(i);
    }

    // Right ellipsis?
    if (rightBound < totalPages - 1) pages.push('...');
    else if (rightBound === totalPages - 1) pages.push(totalPages - 1);

    // Always include last page
    pages.push(totalPages);

    return pages;
};

const Table = ({
    // ── core ──
    data = [],
    loading,
    columns = [],
    emptyMessage = 'Sin datos',
    className,
    maxHeight = 350,

    // ── filter ──
    filterPlaceholder,
    onFilter,

    // ── footer / summaries ──
    showFooter = false,
    /** { columnAccessor: value } — auto‑rendered in the footer row */
    summaries,

    // ── row modes ──
    onRowSelect,
    multiSelect = false,
    onRowClick,

    // ── server‑side sorting ──
    sorting,

    // ── server‑side pagination ──
    pagination,

    // ── server‑side search ──
    search,

    // ── print ──
    print,

    // ── selection reset ──
    /** Changing this value clears all selected rows */
    clearSelectionSignal,
    /** Stable row id accessor `(row) => id`. Required for selection to survive `data` changes (pagination, search, sort). */
    getRowId,
    /** Keep selection when `data` changes (react-table resets it by default). Enables cross-page multi-select. */
    preserveSelection = false,

    // ── layout ──
    /** Fill the parent's height (flex column): the table body stretches and scrolls internally. */
    fillHeight = false,

    // ── sorted rows ──
    /** Called with the displayed rows' originals (`Array`) whenever the sorted/filtered data changes. */
    onSortedRowsChange,
}) => {
    /* ── Plugins ── */
    const plugins = useMemo(() => {
        const list = [];
        if (sorting?.enabled) list.push(useSortBy);
        if (onRowSelect && multiSelect) list.push(useRowSelect);
        return list;
    }, [sorting?.enabled, multiSelect, !!onRowSelect]);

    /* ── Table options ── */
    const tableOptions = useMemo(() => {
        const opts = { columns, data };

        if (getRowId) opts.getRowId = getRowId;
        if (preserveSelection) opts.autoResetSelectedRows = false;

        if (sorting?.enabled) {
            opts.manualSortBy = !!sorting.onSort;
            opts.disableMultiSort = true;
            if (sorting.resetOnDataChange === false) opts.autoResetSortBy = false;
            if (sorting.sortBy?.length) {
                opts.initialState = { sortBy: sorting.sortBy };
            }
        }

        return opts;
        // sorting.sortBy intentionally omitted — initial value only.
    }, [sorting?.enabled, sorting?.resetOnDataChange, columns, data, getRowId, preserveSelection]);

    const { getTableProps, getTableBodyProps, headerGroups, footerGroups, rows, prepareRow, state, dispatch } =
        useTable(tableOptions, ...plugins);

    /* ── Sync selection state → parent callback ── */
    // Cache selected row objects by stable row id so the callback can report
    // selections accumulated across pages (see `preserveSelection`).
    const selectedRowsCacheRef = useRef({});
    const lastSelectionRef = useRef(null);

    useEffect(() => {
        if (onRowSelect && multiSelect) {
            const cache = selectedRowsCacheRef.current;
            rows.forEach((r) => {
                if (r.isSelected) cache[r.id] = r.original;
                else delete cache[r.id];
            });
            const allSelected = Object.keys(state.selectedRowIds)
                .map((id) => cache[id])
                .filter(Boolean);
            const prev = lastSelectionRef.current;
            const changed =
                prev === null || prev.length !== allSelected.length || prev.some((row, i) => row !== allSelected[i]);
            if (changed) {
                lastSelectionRef.current = allSelected;
                onRowSelect(allSelected);
            }
        }
    }, [state.selectedRowIds]);

    /* ── Global selection clear (signal from parent) ── */
    useEffect(() => {
        if (clearSelectionSignal && dispatch) {
            dispatch({ type: actions.resetSelectedRows });
        }
    }, [clearSelectionSignal, dispatch]);

    /* ── Notify sorted/filtered rows (for external consumers like PDF export) ── */
    useEffect(() => {
        if (onSortedRowsChange) {
            onSortedRowsChange(rows.map((r) => r.original));
        }
    }, [rows, onSortedRowsChange]);

    /* ── Server‑side sort notifier ── */
    const prevSortByRef = useRef(null);

    useEffect(() => {
        if (!sorting?.enabled || !sorting?.onSort) return;
        const curr = JSON.stringify(state.sortBy);
        const prev = JSON.stringify(prevSortByRef.current);
        if (curr !== prev) {
            prevSortByRef.current = state.sortBy;
            sorting.onSort(state.sortBy);
        }
    }, [state.sortBy, sorting?.enabled, sorting?.onSort]);

    /* ── Debounced filter ── */
    const onFilterDebounced = useCallback(
        debounce((value) => {
            if (onFilter) onFilter(value);
        }, 500),
        [onFilter],
    );

    /* ── Server‑side search ── */
    const [searchTerm, setSearchTerm] = useState('');

    const onSearchDebounced = useCallback(
        debounce((value) => {
            if (search?.onSearch) search.onSearch(value);
        }, 500),
        [search?.onSearch],
    );

    useEffect(() => {
        return () => onSearchDebounced.cancel();
    }, [onSearchDebounced]);

    const handleSearchChange = useCallback(
        (e) => {
            const value = e.target.value;
            setSearchTerm(value);
            onSearchDebounced(value);
        },
        [onSearchDebounced],
    );

    /* ── Per‑row print helpers ── */
    const hasPerRowPrint = print?.enabled && print?.perRowPrint && print?.onRowPrint;
    const hasSelectCol = onRowSelect && multiSelect;
    const totalColSpan = columns.length + (hasPerRowPrint ? 1 : 0) + (hasSelectCol ? 1 : 0);

    /* ── Global print (config dialog runs first) ── */
    const [showPrintConfig, setShowPrintConfig] = useState(false);

    const handlePrintButtonClick = useCallback(() => {
        setShowPrintConfig(true);
    }, []);

    const handlePrintConfirm = useCallback(
        (config) => {
            setShowPrintConfig(false);
            print?.onGlobalPrint?.(config);
        },
        [print?.onGlobalPrint],
    );

    /* ── Select-all handler ── */
    const handleToggleAll = useCallback(() => {
        const allChecked = rows.length > 0 && rows.every((r) => r.isSelected);
        if (allChecked) {
            rows.forEach((r) => {
                if (r.isSelected) r.toggleRowSelected();
            });
        } else {
            rows.forEach((r) => {
                if (!r.isSelected) r.toggleRowSelected();
            });
        }
    }, [rows]);

    /* ── Row renderers ── */

    const SelectRow = ({ row, multiSelect: multi }) => {
        const handleClick = (e) => {
            const lastIdx = Object.keys(state.selectedRowIds).pop();
            const newIdx = row.index;

            if (e.ctrlKey && !e.shiftKey) {
                row.toggleRowSelected();
            } else if (e.shiftKey && !e.ctrlKey) {
                if (multi && lastIdx != null) {
                    const last = Number(lastIdx);
                    const [from, to] = last < newIdx ? [last, newIdx] : [newIdx, last];
                    for (let i = from; i <= to; i++) {
                        if (i !== last) rows[i].toggleRowSelected();
                    }
                }
            } else {
                state.selectedRowIds = {};
                row.toggleRowSelected();
            }
        };

        return (
            <tr
                {...row.getRowProps({ onClick: handleClick })}
                className={row.isSelected ? 'row-selected' : ''}
                style={{
                    background: row.isSelected ? '#2d3748' : 'transparent',
                    color: row.isSelected ? '#e4e6ea' : '#c4cad4',
                    cursor: 'pointer',
                }}
            >
                {hasSelectCol && (
                    <td
                        style={{
                            width: 40,
                            textAlign: 'center',
                            background: row.isSelected ? '#2d3748' : 'transparent',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <input
                            type="checkbox"
                            checked={row.isSelected}
                            readOnly
                            style={{ cursor: 'pointer', pointerEvents: 'none' }}
                        />
                    </td>
                )}
                {row.cells.map((cell) => (
                    <td
                        key={cell.column.id}
                        title={cell.value}
                        {...cell.getCellProps()}
                        style={{
                            background: row.isSelected ? '#2d3748' : 'transparent',
                            color: row.isSelected ? '#e4e6ea' : '#c4cad4',
                        }}
                    >
                        {cell.render('Cell')}
                    </td>
                ))}
                {hasPerRowPrint && (
                    <RowActionCell onPrint={print.onRowPrint} rowData={row.original} isSelected={row.isSelected} />
                )}
            </tr>
        );
    };

    const ClickableRow = React.memo(({ row, onClick }) => {
        return (
            <tr onClick={() => onClick(row.original)} className="table-row-clickable" style={{ cursor: 'pointer' }}>
                {row.cells.map((cell) => (
                    <td key={cell.column.id} {...cell.getCellProps()}>
                        {cell.render('Cell')}
                    </td>
                ))}
                {hasPerRowPrint && <RowActionCell onPrint={print.onRowPrint} rowData={row.original} />}
            </tr>
        );
    });

    const StaticRow = React.memo(({ row }) => {
        return (
            <tr>
                {row.cells.map((cell) => (
                    <td key={cell.column.id} {...cell.getCellProps()}>
                        {cell.render('Cell')}
                    </td>
                ))}
                {hasPerRowPrint && <RowActionCell onPrint={print.onRowPrint} rowData={row.original} />}
            </tr>
        );
    });

    const renderRow = useCallback(
        (row) => {
            prepareRow(row);
            if (onRowSelect && multiSelect) return <SelectRow row={row} multiSelect={multiSelect} />;
            if (onRowSelect || onRowClick) return <ClickableRow row={row} onClick={onRowSelect || onRowClick} />;
            return <StaticRow row={row} />;
        },
        [onRowSelect, multiSelect, onRowClick, prepareRow],
    );

    /* ── Loading spinner ── */
    const spinner = loading && (
        <div
            className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
            style={{
                zIndex: 2,
                background: 'rgba(30, 33, 38, 0.6)',
                backdropFilter: 'blur(1px)',
            }}
        >
            <span
                className="spinner-border"
                role="status"
                aria-hidden="true"
                style={{ width: '2.5rem', height: '2.5rem', color: '#e4e6ea' }}
            />
        </div>
    );

    /* ── Sort chevron ── */
    const renderSortChevron = (column) => {
        if (!sorting?.enabled || !column.canSort) return null;
        const active = column.isSorted;

        return (
            <span className={`sort-chevron ${active ? 'active' : ''}`}>
                <span
                    style={{
                        color: active && !column.isSortedDesc ? '#3b82f6' : undefined,
                    }}
                >
                    <ChevronUp />
                </span>
                <span
                    style={{
                        color: active && column.isSortedDesc ? '#3b82f6' : undefined,
                    }}
                >
                    <ChevronDown />
                </span>
            </span>
        );
    };

    /* ── Table head ── */
    const thead = (() => {
        const allChecked = rows.length > 0 && rows.every((r) => r.isSelected);
        const someChecked = rows.some((r) => r.isSelected) && !allChecked;

        return (
            <thead>
                {headerGroups.map((hg) => (
                    <tr {...hg.getHeaderGroupProps()} key={hg.id}>
                        {hasSelectCol && (
                            <th
                                style={{
                                    width: 40,
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={allChecked}
                                    ref={(el) => {
                                        if (el) el.indeterminate = someChecked;
                                    }}
                                    onChange={handleToggleAll}
                                    style={{ cursor: 'pointer' }}
                                />
                            </th>
                        )}
                        {hg.headers.map((column) => {
                            const headerProps = sorting?.enabled
                                ? column.getHeaderProps(column.getSortByToggleProps())
                                : column.getHeaderProps();

                            const sortCls = sorting?.enabled && column.canSort ? ' sortable-header' : '';

                            return (
                                <th
                                    key={column.id}
                                    {...headerProps}
                                    className={(headerProps.className || '') + sortCls}
                                >
                                    <span className="sort-header-content">
                                        {column.render('Header')}
                                        {renderSortChevron(column)}
                                    </span>
                                </th>
                            );
                        })}
                        {hasPerRowPrint && <th style={{ width: 40 }} />}
                    </tr>
                ))}
            </thead>
        );
    })();

    /* ── Table body ── */
    const tbody = (
        <tbody {...getTableBodyProps()}>
            {rows.length > 0
                ? rows.map((row) => renderRow(row))
                : !loading && (
                      <tr>
                          <td
                              colSpan={totalColSpan}
                              style={{
                                  textAlign: 'center',
                                  padding: '2.5rem',
                                  color: '#94a3b8',
                              }}
                          >
                              {emptyMessage}
                          </td>
                      </tr>
                  )}
        </tbody>
    );

    /* ── Table foot ──
       Two modes:
       1. summaries prop provided → render custom footer row from that map
          (columns with an existing Footer fn take precedence)
       2. summaries NOT provided → use react‑table's footerGroups (backward compat) */

    const tfoot =
        showFooter &&
        data.length > 0 &&
        (() => {
            if (summaries) {
                // Custom footer using the summaries map
                return (
                    <tfoot>
                        <tr>
                            {hasSelectCol && <td />}
                            {columns.map((col, idx) => {
                                const summaryVal =
                                    typeof col.accessor === 'string' ? summaries[col.accessor] : undefined;

                                if (col.Footer && typeof col.Footer === 'function') {
                                    // Existing Footer renderer (receives { column, data, rows })
                                    return (
                                        <td key={col.accessor || idx}>
                                            {col.Footer({
                                                column: col,
                                                data,
                                                rows,
                                            })}
                                        </td>
                                    );
                                }

                                if (summaryVal !== undefined && summaryVal !== null) {
                                    return (
                                        <td key={col.accessor || idx}>
                                            <span className="summary-value">{summaryVal}</span>
                                        </td>
                                    );
                                }

                                return <td key={col.accessor || idx} />;
                            })}
                            {hasPerRowPrint && <td />}
                        </tr>
                    </tfoot>
                );
            }

            // Backward‑compatible: use react‑table footer groups
            return (
                <tfoot>
                    {footerGroups.map((group) => (
                        <tr {...group.getFooterGroupProps()} key={group.id}>
                            {hasSelectCol && <td />}
                            {group.headers.map((column) => (
                                <td {...column.getFooterProps()} key={column.id}>
                                    {column.render('Footer')}
                                </td>
                            ))}
                            {hasPerRowPrint && <td />}
                        </tr>
                    ))}
                </tfoot>
            );
        })();

    /* ── Toolbar (search + print) ── */
    const hasSearchBar = search?.enabled && search?.onSearch;
    const hasPrintBtn = print?.enabled && print?.onGlobalPrint;

    const tableToolbar = (hasSearchBar || hasPrintBtn) && (
        <div className="table-toolbar">
            {hasSearchBar ? (
                <div className="table-search-bar">
                    <svg
                        className="table-search-icon"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                    </svg>
                    <input
                        className="table-search-input"
                        placeholder={search.placeholder || 'Buscar...'}
                        type="search"
                        value={searchTerm}
                        onChange={handleSearchChange}
                    />
                </div>
            ) : (
                <span />
            )}
            {hasPrintBtn && (
                <div className="table-toolbar-right">
                    <button className="table-toolbar-btn" onClick={handlePrintButtonClick}>
                        {print.globalPrintLabel || 'Imprimir'}
                    </button>
                </div>
            )}
        </div>
    );

    /* ── Pagination bar ── */
    const paginationBar =
        pagination?.enabled &&
        (pagination.totalPages > 1 || pagination.totalRows != null) &&
        (() => {
            const pg = pagination;
            const pageSize = pg.pageSize ?? data.length;
            const totalRows = pg.totalRows;
            const totalPages = pg.totalPages || 1;
            const page = pg.page || 1;

            // Row-info label
            const showRowInfo = totalRows != null && totalRows > 0;
            let rowInfoLabel = '';
            if (showRowInfo) {
                const from = (page - 1) * pageSize + 1;
                const to = Math.min(page * pageSize, totalRows);
                rowInfoLabel = `Mostrando ${from}–${to} de ${totalRows} ${totalRows === 1 ? 'resultado' : 'resultados'}`;
            }

            const pageNumbers = getPageNumbers(page, totalPages, 5);

            return (
                <div className="table-pagination">
                    {/* ── Row info ── */}
                    {showRowInfo && <span className="table-pagination-rowinfo">{rowInfoLabel}</span>}

                    {/* ── Page controls ── */}
                    {totalPages > 1 && (
                        <div className="table-pagination-controls">
                            {/* Prev */}
                            <button
                                className="table-pagination-btn"
                                disabled={page <= 1}
                                onClick={() => pg.onPageChange(page - 1)}
                                aria-label="Página anterior"
                                title="Anterior"
                            >
                                <ChevronLeft />
                            </button>

                            {/* Page numbers */}
                            {pageNumbers.map((p, idx) =>
                                p === '...' ? (
                                    <span key={`ellipsis-${idx}`} className="table-pagination-ellipsis">
                                        …
                                    </span>
                                ) : (
                                    <button
                                        key={p}
                                        className={`table-pagination-btn table-pagination-num${p === page ? ' active' : ''}`}
                                        onClick={() => pg.onPageChange(p)}
                                        aria-label={`Ir a página ${p}`}
                                        aria-current={p === page ? 'page' : undefined}
                                    >
                                        {p}
                                    </button>
                                ),
                            )}

                            {/* Next */}
                            <button
                                className="table-pagination-btn"
                                disabled={page >= totalPages}
                                onClick={() => pg.onPageChange(page + 1)}
                                aria-label="Página siguiente"
                                title="Siguiente"
                            >
                                <ChevronRight />
                            </button>
                        </div>
                    )}
                </div>
            );
        })();

    /* ── Table element ── */
    const tableElement = (
        <table {...getTableProps()} className={className}>
            {thead}
            {tbody}
            {tfoot}
        </table>
    );

    /* ── Render ── */
    const tableContainerStyle = fillHeight
        ? { flex: '1 1 auto', minHeight: 0, position: 'relative' }
        : maxHeight != null
          ? { maxHeight, position: 'relative' }
          : { position: 'relative' };

    return (
        <div
            style={fillHeight ? { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } : undefined}
        >
            {onFilter && (
                <div className="table-filter-container">
                    <input
                        className="table-filter-input"
                        onChange={(e) => onFilterDebounced(e.target.value)}
                        placeholder={filterPlaceholder}
                    />
                </div>
            )}
            {tableToolbar}
            <div className="table-container" style={tableContainerStyle}>
                {tableElement}
                {spinner}
            </div>
            {paginationBar}
            {hasPrintBtn && (
                <PrintConfigModal
                    show={showPrintConfig}
                    columns={columns}
                    initialOrientation={print?.defaultOrientation}
                    onClose={() => setShowPrintConfig(false)}
                    onPrint={handlePrintConfirm}
                />
            )}
        </div>
    );
};

const ChevronLeft = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
        <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </svg>
);

const ChevronRight = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
    </svg>
);

const ChevronUp = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
        <path d="M12 8l-8 8h16z" />
    </svg>
);

const ChevronDown = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
        <path d="M12 16l8-8H4z" />
    </svg>
);

const PrintIcon = () => (
    <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 12H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2" />
        <rect x="6" y="14" width="12" height="8" />
    </svg>
);

const RowActionCell = React.memo(({ onPrint, rowData, isSelected }) => {
    const handleClick = (e) => {
        e.stopPropagation();
        onPrint(rowData);
    };

    return (
        <td
            onClick={handleClick}
            style={{
                background: isSelected ? '#2d3748' : 'transparent',
                textAlign: 'center',
                width: 40,
                cursor: 'pointer',
            }}
        >
            <span className="table-row-action" title="Imprimir">
                <PrintIcon />
            </span>
        </td>
    );
});

export default Table;
