import InvoicesTable from 'components/InvoicesTable';
import SelectedInvoicesModal from 'components/Modals/SelectedInvoicesModal';
import ProductsTable from 'components/ProductsTable';
import { darkSelectStyles } from 'components/selectStyles';
import { useClientRoutes } from 'hooks/useClients';
import { useInvoiceList } from 'hooks/useInvoice';
import { useInvoiceDispatch } from 'hooks/useInvoiceDispatch';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';
import Select from 'react-select';

const LIMIT = 20;
const EMPTY_INVOICES = [];

// Fixed vertical space above the tables: navbar (56) + content padding top
// (24) + heading block (65) + toolbar (38 + 16 margin) + content padding
// bottom (24). Tables get exactly the remaining viewport height, so the
// page never shows a vertical scrollbar.
const ABOVE_TABLES_OFFSET = 224;

const DespachoView = ({ dateRange, showNoe, isActive }) => {
    // Independent selection state: accumulates invoices across pages, searches
    // and filter changes. Only explicit user actions ("Limpiar selección" or
    // removing one invoice from the modal) modify it.
    const [selectedRows, setSelectedRows] = useState([]);

    // Pagination / sorting / search state
    const [page, setPage] = useState(1);
    const [sortBy, setSortBy] = useState('createdAt');
    const [sortDir, setSortDir] = useState('desc');
    const [search, setSearch] = useState('');
    const [selectedRuta, setSelectedRuta] = useState(null);
    const [clearSelectionSignal, setClearSelectionSignal] = useState(0);
    const [showSelectionModal, setShowSelectionModal] = useState(false);
    const [deselectSignal, setDeselectSignal] = useState({ key: 0, ids: [] });

    const { productsSummary, invoicesTotalSummary } = useInvoiceDispatch(selectedRows);

    // Reset page when date range or route changes. Selection is NOT cleared:
    // it is independent state that survives pagination, search and filters.
    useEffect(() => {
        setPage(1);
    }, [dateRange.from, dateRange.to, selectedRuta]);

    const { data: routes = [], isLoading: routesLoading } = useClientRoutes(showNoe, isActive);

    const routeOptions = useMemo(
        () =>
            routes.map((route) => ({
                value: route.Id_Ruta,
                label:
                    route.Nombre && route.Nombre !== route.Id_Ruta
                        ? `${route.Nombre} (${route.Id_Ruta})`
                        : route.Id_Ruta,
            })),
        [routes],
    );

    // ── SWR hook ──
    const { data: invoiceRes, isLoading } = useInvoiceList(
        {
            from: dateRange.from,
            to: dateRange.to,
            showNoe,
            page,
            limit: LIMIT,
            sortBy,
            sortDir,
            search: search || undefined,
            ruta: selectedRuta?.value,
        },
        isActive,
    );

    const invoices = invoiceRes?.data || EMPTY_INVOICES;
    const total = invoiceRes?.pagination?.total || 0;

    // Handlers
    const handlePageChange = useCallback((newPage) => {
        setPage(newPage);
    }, []);

    const handleSort = useCallback((sortByArr) => {
        if (sortByArr && sortByArr.length > 0) {
            setSortBy(sortByArr[0].id);
            setSortDir(sortByArr[0].desc ? 'desc' : 'asc');
            setPage(1);
        }
    }, []);

    const handleSearch = useCallback((value) => {
        setSearch(value || '');
        setPage(1);
    }, []);

    const handleClearSelection = useCallback(() => {
        setClearSelectionSignal((key) => key + 1);
    }, []);

    const handleRemoveSelectedInvoice = useCallback((invoiceId) => {
        setDeselectSignal((prev) => ({ key: prev.key + 1, ids: [invoiceId] }));
    }, []);

    const handleClearAll = useCallback(() => {
        handleClearSelection();
        setShowSelectionModal(false);
    }, [handleClearSelection]);

    const sortByArr = [{ id: sortBy, desc: sortDir === 'desc' }];
    const totalPages = Math.ceil(total / LIMIT);

    return (
        <>
            <div>
                <div className="d-flex flex-wrap gap-3 mb-3">
                    <div style={{ minWidth: '220px' }}>
                        <Select
                            options={routeOptions}
                            value={selectedRuta}
                            onChange={setSelectedRuta}
                            placeholder="Todas las rutas"
                            isClearable
                            isLoading={routesLoading}
                            styles={darkSelectStyles}
                            classNamePrefix="search-select"
                            menuPortalTarget={document.body}
                            menuPlacement="auto"
                            loadingMessage={() => 'Cargando...'}
                            noOptionsMessage={() => 'Sin resultados'}
                        />
                    </div>
                    {selectedRows.length > 0 && (
                        <>
                            <Button
                                variant="outline-primary"
                                size="sm"
                                className="ms-auto align-self-center"
                                onClick={() => setShowSelectionModal(true)}
                            >
                                Ver selección ({selectedRows.length})
                            </Button>
                            <Button
                                variant="outline-danger"
                                size="sm"
                                className="align-self-center"
                                onClick={handleClearSelection}
                            >
                                Limpiar selección
                            </Button>
                        </>
                    )}
                </div>
                {/* The row AND the cols need this same definite height: with
                    flex-wrap the row's flex line grows to the tallest content, so
                    the tables must be pinned to the available height from inside. */}
                <div className="row g-3" style={{ height: `calc(100vh - ${ABOVE_TABLES_OFFSET}px)` }}>
                    <div className="col-12 col-xl-6" style={{ height: `calc(100vh - ${ABOVE_TABLES_OFFSET}px)` }}>
                        <InvoicesTable
                            data={invoices}
                            loading={isLoading}
                            onRowSelect={setSelectedRows}
                            sorting={{
                                enabled: true,
                                sortBy: sortByArr,
                                onSort: handleSort,
                            }}
                            pagination={{
                                enabled: true,
                                page,
                                totalPages,
                                totalRows: total,
                                pageSize: LIMIT,
                                onPageChange: handlePageChange,
                            }}
                            search={{
                                enabled: true,
                                placeholder: 'Buscar por cliente o factura...',
                                onSearch: handleSearch,
                            }}
                            clearSelectionSignal={clearSelectionSignal}
                            deselectSignal={deselectSignal}
                        />
                    </div>
                    <div className="col-12 col-xl-6" style={{ height: `calc(100vh - ${ABOVE_TABLES_OFFSET}px)` }}>
                        <ProductsTable data={productsSummary} totalSummary={invoicesTotalSummary} />
                    </div>
                </div>
            </div>
            <SelectedInvoicesModal
                show={showSelectionModal}
                invoices={selectedRows}
                totalSummary={invoicesTotalSummary}
                onRemove={handleRemoveSelectedInvoice}
                onClear={handleClearAll}
                onClose={() => setShowSelectionModal(false)}
            />
        </>
    );
};

export default DespachoView;
