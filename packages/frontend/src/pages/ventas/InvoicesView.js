import InvoicesTable from 'components/InvoicesTable';
import ProductsTable from 'components/ProductsTable';
import { useInvoiceDispatch } from 'hooks/useInvoiceDispatch';
import { useInvoiceList } from 'hooks/useInvoice';
import { useCallback, useEffect, useState } from 'react';

const LIMIT = 20;

const InvoicesView = ({ dateRange, showNoe, isActive }) => {
    const [selectedRows, setSelectedRows] = useState([]);

    // Pagination / sorting / search state
    const [page, setPage] = useState(1);
    const [sortBy, setSortBy] = useState('createdAt');
    const [sortDir, setSortDir] = useState('desc');
    const [search, setSearch] = useState('');

    const { productsSummary, invoicesTotalSummary } = useInvoiceDispatch(selectedRows);

    // Reset page when date range changes
    useEffect(() => {
        setPage(1);
    }, [dateRange.from, dateRange.to]);

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
        },
        isActive,
    );

    const invoices = invoiceRes?.data || [];
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

    const sortByArr = [{ id: sortBy, desc: sortDir === 'desc' }];
    const totalPages = Math.ceil(total / LIMIT);

    return (
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
    );
};

export default InvoicesView;
