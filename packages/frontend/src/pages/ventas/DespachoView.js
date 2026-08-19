import InvoicesTable from 'components/InvoicesTable';
import SelectedInvoicesModal from 'components/Modals/SelectedInvoicesModal';
import ProductsTable from 'components/ProductsTable';
import { darkSelectStyles } from 'components/selectStyles';
import { fetchInvoiceList } from 'api/invoice';
import { useClientRoutes } from 'hooks/useClients';
import { useInvoiceList } from 'hooks/useInvoice';
import { useInvoiceDispatch } from 'hooks/useInvoiceDispatch';
import useMediaQuery from 'hooks/useMediaQuery';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';
import Select from 'react-select';

const LIMIT = 20;
const EMPTY_INVOICES = [];

// "Select all" suma (unión) las filas del filtro actual a la selección acumulada:
// nunca sobreescribe el historial previo (p.ej. select-all sin ruta → filtro de
// ruta → select-all de nuevo debe volver al total original).
export const unionSelection = (prev, incoming, idOf) => {
    const prevIds = new Set(prev.map(idOf));
    return [...prev, ...incoming.filter((row) => !prevIds.has(idOf(row)))];
};

// "Deselect all" resta del historial acumulado TODAS las filas del filtro actual
// (todas las páginas), conservando la selección de otros filtros.
export const diffSelection = (prev, incoming, idOf) => {
    const incomingIds = new Set(incoming.map(idOf));
    return prev.filter((row) => !incomingIds.has(idOf(row)));
};

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
    const [showSelectionModal, setShowSelectionModal] = useState(false);
    const [selectAllLoading, setSelectAllLoading] = useState(false);

    // ── Responsive: en pantallas <1400px las dos tablas van en tabs (default
    //    Facturas, la tabla principal del despacho); en pantallas extra grandes
    //    (≥1400px) van lado a lado. ──
    const isWide = useMediaQuery('(min-width: 1400px)');
    const [activeTab, setActiveTab] = useState('facturas');

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
        setSelectedRows([]);
    }, []);

    // "Seleccionar todo" del header: trae TODAS las facturas que matchean los
    // filtros actuales (rango, ruta, búsqueda) y las SUMA a la selección
    // existente (unión) — no reemplaza el historial acumulado.
    const handleSelectAll = useCallback(async () => {
        if (total === 0 || selectAllLoading) return;
        setSelectAllLoading(true);
        try {
            const res = await fetchInvoiceList({
                from: dateRange.from,
                to: dateRange.to,
                showNoe,
                page: 1,
                limit: total,
                sortBy,
                sortDir,
                search: search || undefined,
                ruta: selectedRuta?.value,
            });
            const rows = res.data || [];
            setSelectedRows((prev) => unionSelection(prev, rows, (inv) => inv.invoiceId));
        } catch (error) {
            console.error('Error al seleccionar todas las facturas:', error);
        } finally {
            setSelectAllLoading(false);
        }
    }, [dateRange.from, dateRange.to, showNoe, total, sortBy, sortDir, search, selectedRuta, selectAllLoading]);

    // "Deseleccionar todo": resta TODAS las facturas del filtro actual (todas las
    // páginas) de la selección acumulada; conserva las de otros filtros.
    const handleDeselectAll = useCallback(async () => {
        if (total === 0 || selectAllLoading) return;
        setSelectAllLoading(true);
        try {
            const res = await fetchInvoiceList({
                from: dateRange.from,
                to: dateRange.to,
                showNoe,
                page: 1,
                limit: total,
                sortBy,
                sortDir,
                search: search || undefined,
                ruta: selectedRuta?.value,
            });
            const rows = res.data || [];
            setSelectedRows((prev) => diffSelection(prev, rows, (inv) => inv.invoiceId));
        } catch (error) {
            console.error('Error al deseleccionar las facturas:', error);
        } finally {
            setSelectAllLoading(false);
        }
    }, [dateRange.from, dateRange.to, showNoe, total, sortBy, sortDir, search, selectedRuta, selectAllLoading]);

    const handleRemoveSelectedInvoice = useCallback((invoiceId) => {
        setSelectedRows((prev) => prev.filter((inv) => inv.invoiceId !== invoiceId));
    }, []);

    const handleClearAll = useCallback(() => {
        handleClearSelection();
        setShowSelectionModal(false);
    }, [handleClearSelection]);

    const sortByArr = [{ id: sortBy, desc: sortDir === 'desc' }];
    const totalPages = Math.ceil(total / LIMIT);

    // Tabla de facturas y de productos: se reutilizan en el layout lado a lado
    // (pantallas ≥1400px) y en el layout con tabs (pantallas de laptop).
    const invoicesTable = (
        <InvoicesTable
            data={invoices}
            loading={isLoading || selectAllLoading}
            onRowSelect={setSelectedRows}
            selectedRows={selectedRows}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
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
        />
    );

    const productsTable = (
        <ProductsTable
            data={productsSummary}
            totalSummary={invoicesTotalSummary}
            printStorageKey="despacho-productos"
        />
    );

    const reportTabs = [
        { key: 'facturas', label: 'Facturas' },
        { key: 'productos', label: 'Productos' },
    ];

    return (
        <div className="report-page">
            <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
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
                {/* Tables: lado a lado en pantallas ≥1400px; en laptops, una sola
                    tabla con tabs (Facturas / Productos, default Facturas). */}
                {isWide ? (
                    <div className="report-row-xl">
                        <div className="report-col">{invoicesTable}</div>
                        <div className="report-col">{productsTable}</div>
                    </div>
                ) : (
                    <div className="report-tabs">
                        <div className="report-tab-nav">
                            {reportTabs.map((t) => (
                                <button
                                    key={t.key}
                                    type="button"
                                    className={`report-tab-button${activeTab === t.key ? ' active' : ''}`}
                                    onClick={() => setActiveTab(t.key)}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <div className="report-tab-content">
                            {activeTab === 'facturas' ? invoicesTable : productsTable}
                        </div>
                    </div>
                )}
            </div>
            <SelectedInvoicesModal
                show={showSelectionModal}
                invoices={selectedRows}
                totalSummary={invoicesTotalSummary}
                onRemove={handleRemoveSelectedInvoice}
                onClear={handleClearAll}
                onClose={() => setShowSelectionModal(false)}
            />
        </div>
    );
};

export default DespachoView;
