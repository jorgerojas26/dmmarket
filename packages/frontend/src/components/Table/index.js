import { useEffect } from 'react';
import React from 'react';
import { useTable, useRowSelect } from 'react-table';

import debounce from 'lodash.debounce';

const Table = ({
    data = [],
    loading,
    columns = [],
    filterPlaceholder,
    onFilter,
    maxHeight = 350,
    showFooter = false,
    onRowSelect,
    multiSelect = false,
    emptyMessage = 'Sin datos',
    className,
    onRowClick,
}) => {
    const { getTableProps, getTableBodyProps, headerGroups, footerGroups, rows, prepareRow, state } = useTable(
        {
            columns,
            data,
        },
        useRowSelect
    );

    const onFilterDebounced = debounce((value) => {
        onFilter(value);
    }, 500);

    useEffect(() => {
        if (!onRowSelect) return;
        if (multiSelect) {
            const selectedRows = rows.filter((row) => row.isSelected);
            onRowSelect(selectedRows.map((row) => row.original));
        } else {
            const selected = rows.find((row) => row.isSelected);
            if (selected) {
                onRowSelect(selected.original);
            }
        }
    }, [state, multiSelect, onRowSelect]);

    const MemoizedSelectRow = React.memo(
        ({ row }) => {
            return (
                <tr
                    {...row.getRowProps({
                        onClick: (e) => {
                            const lastSelectedRowIndex = Object.keys(state.selectedRowIds)[
                                Object.keys(state.selectedRowIds).length - 1
                            ];
                            const newSelectedRowIndex = row.index;

                            if (e.ctrlKey && !e.shiftKey) {
                                row.toggleRowSelected();
                            } else if (e.shiftKey && !e.ctrlKey) {
                                if (multiSelect) {
                                    if (newSelectedRowIndex >= lastSelectedRowIndex) {
                                        for (let i = lastSelectedRowIndex; i <= newSelectedRowIndex; i++) {
                                            if (i !== lastSelectedRowIndex) {
                                                rows[i].toggleRowSelected();
                                            }
                                        }
                                    } else {
                                        for (let i = lastSelectedRowIndex; i >= newSelectedRowIndex; i--) {
                                            if (i !== lastSelectedRowIndex) {
                                                rows[i].toggleRowSelected();
                                            }
                                        }
                                    }
                                }
                            } else {
                                if (row.isSelected) {
                                    row.toggleRowSelected();
                                } else {
                                    state.selectedRowIds = {};
                                    row.toggleRowSelected();
                                }
                            }
                        },
                    })}
                    {...row.getToggleRowSelectedProps({})}
                >
                    {row.cells.map((cell) => {
                        return (
                            <td
                                title={cell.value}
                                {...cell.getCellProps()}
                                style={{
                                    background: row.isSelected ? '#2d3748' : 'transparent',
                                    color: row.isSelected ? '#e4e6ea' : '#c4cad4',
                                }}
                            >
                                {cell.render('Cell')}
                            </td>
                        );
                    })}
                </tr>
            );
        },
        [data]
    );

    const ClickableRow = React.memo(
        ({ row, onClick }) => {
            return (
                <tr onClick={() => onClick(row.original)} style={{ cursor: 'pointer' }}>
                    {row.cells.map((cell) => (
                        <td {...cell.getCellProps()}>{cell.render('Cell')}</td>
                    ))}
                </tr>
            );
        },
        [data]
    );

    const StaticRow = React.memo(
        ({ row }) => {
            return (
                <tr>
                    {row.cells.map((cell) => (
                        <td {...cell.getCellProps()}>{cell.render('Cell')}</td>
                    ))}
                </tr>
            );
        },
        [data]
    );

    const renderRow = (row) => {
        prepareRow(row);
        if (onRowSelect) return <MemoizedSelectRow row={row} />;
        if (onRowClick) return <ClickableRow row={row} onClick={onRowClick} />;
        return <StaticRow row={row} />;
    };

    const spinner = loading && (
        <div className='position-absolute top-50 start-50 translate-middle' style={{ zIndex: 1 }}>
            <span className='spinner-border spinner-border-md' role='status' aria-hidden='true' />
        </div>
    );

    const thead = (
        <thead>
            {headerGroups.map((headerGroup) => (
                <tr {...headerGroup.getHeaderGroupProps()}>
                    {headerGroup.headers.map((column) => (
                        <th {...column.getHeaderProps()}>{column.render('Header')}</th>
                    ))}
                </tr>
            ))}
        </thead>
    );

    const tbody = (
        <tbody {...getTableBodyProps()}>
            {rows.length > 0 ? (
                rows.map((row) => renderRow(row))
            ) : (
                !loading && (
                    <tr>
                        <td
                            colSpan={columns.length}
                            style={{
                                textAlign: 'center',
                                padding: '2.5rem',
                                color: '#94a3b8',
                            }}
                        >
                            {emptyMessage}
                        </td>
                    </tr>
                )
            )}
        </tbody>
    );

    const tfoot = showFooter && data.length > 0 && (
        <tfoot>
            {footerGroups.map((group) => (
                <tr {...group.getFooterGroupProps()}>
                    {group.headers.map((column) => (
                        <td {...column.getFooterProps()}>{column.render('Footer')}</td>
                    ))}
                </tr>
            ))}
        </tfoot>
    );

    const tableElement = (
        <table {...getTableProps()} className={className}>
            {thead}
            {tbody}
            {tfoot}
        </table>
    );

    return (
        <div>
            {onFilter && (
                <div className='table-filter-container'>
                    <input
                        className='table-filter-input'
                        onChange={(event) => onFilterDebounced(event.target.value)}
                        placeholder={filterPlaceholder}
                        autoFocus
                    />
                </div>
            )}
            {maxHeight != null ? (
                <div className='table-container' style={{ maxHeight, position: 'relative' }}>
                    {tableElement}
                    {spinner}
                </div>
            ) : (
                <div style={{ position: 'relative' }}>
                    {tableElement}
                    {spinner}
                </div>
            )}
        </div>
    );
};

export default Table;
