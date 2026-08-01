import InvoicesTable from 'components/InvoicesTable';
import ProductsTable from 'components/ProductsTable';
import { darkSelectStyles } from 'components/selectStyles';
import { useClientRoutes } from 'hooks/useClients';
import { useInvoiceDispatch } from 'hooks/useInvoiceDispatch';
import { useInvoiceList } from 'hooks/useInvoice';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';
import Select from 'react-select';

const LIMIT = 20;
const EMPTY_INVOICES = [];

const DespachoView = ({ dateRange, showNoe, isActive }) => {
    const [selectedRows, setSelectedRows] = useState([]);

    // Pagination / sorting / search state
    const [page, setPage] = useState(1);
    const [sortBy, setSortBy] = useState('createdAt');
    const [sortDir, setSortDir] = useState('desc');
    const [search, setSearch] = useState('');
    const [selectedRuta, setSelectedRuta] = useState(null);
    const [clearSelectionSignal, setClearSelectionSignal] = useState(0);

    const { productsSummary, invoicesTotalSummary } = useInvoiceDispatch(selectedRows);

    // Reset page and selection when date range or route changes
    useEffect(() => {
        setPage(1);
        setSelectedRows([]);
        setClearSelectionSignal((key) => key + 1);
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

    const sortByArr = [{ id: sortBy, desc: sortDir === 'desc' }];
    const totalPages = Math.ceil(total / LIMIT);

    return (
        <>
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
                    <Button
                        variant="outline-danger"
                        size="sm"
                        className="ms-auto align-self-center"
                        onClick={handleClearSelection}
                    >
                        Limpiar selección ({selectedRows.length})
                    </Button>
                )}
            </div>
            <div className="row g-3">
                <div className="col-12 col-xl-6">
                    <InvoicesTable
                        data={invoices}
                        loading={isLoading}
                        onRowSelect={setSelectedRows}
                        maxHeight="calc(100vh - 360px)"
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
                    />
                </div>
                <div className="col-12 col-xl-6">
                    <ProductsTable
                        data={productsSummary}
                        totalSummary={invoicesTotalSummary}
                        maxHeight="calc(100vh - 280px)"
                    />
                </div>
            </div>
        </>
    );
};

export default DespachoView;
