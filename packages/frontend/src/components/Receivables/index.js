import { darkSelectStyles } from 'components/selectStyles';
import Table from 'components/Table';
import RouteFilter from 'components/RouteFilter';
import { useReceivables } from 'hooks/useReceivables';
import { CurrencyRateContext } from 'context/currency_rate';
import { fetchReceivables } from 'api/receivables';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Select from 'react-select';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import ClientModal from './ClientModal';
import { dateLabel, money } from './format';
import { formatMoney } from 'utils/format';
import { sortRows } from 'utils/sortRows';
import PaymentDrawer from './PaymentDrawer';
import Summary from './Summary';
import './styles.css';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const dueOptions = [
    { value: 'all', label: 'Todos los vencimientos' },
    { value: 'overdue', label: 'Con deuda vencida' },
    { value: 'upcoming', label: 'Sin deuda vencida' },
];

export default function Receivables() {
    const [search, setSearch] = useState('');
    const [payment, setPayment] = useState(null);
    const [ruta, setRuta] = useState('');
    const [due, setDue] = useState('all');
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState({ sortBy: 'overdue', sortDir: 'desc' });
    const [selected, setSelected] = useState(null);
    const [lastSummary, setLastSummary] = useState(null);
    const pageElement = useRef(null);
    const paymentTrigger = useRef(null);
    const paymentOrigin = useRef(null);
    const currencyRate = useContext(CurrencyRateContext)?.currencyRate;
    const { data, error, isValidating, mutate } = useReceivables({ search, ruta, state: 'debt', due, page, ...sort });
    useEffect(() => {
        if (data?.summary && !error) setLastSummary(data.summary);
    }, [data?.summary, error]);
    const summary = error ? null : data?.summary || lastSummary;
    const summaryLoading = !error && (!data || isValidating);
    const handleSearch = useCallback((term) => {
        setSearch(term);
        setPage(1);
    }, []);
    const openAccount = useCallback((client) => {
        setSelected(client);
    }, []);
    const openPayment = useCallback((client, trigger) => {
        paymentOrigin.current = trigger;
        setPayment({ client });
    }, []);
    const columns = useMemo(
        () => [
            {
                Header: 'Cliente',
                accessor: 'name',
                Cell: ({ row }) => (
                    <Button
                        variant="link"
                        className="cxc-client-link"
                        id={`cxc-client-${encodeURIComponent(row.original.id)}`}
                        title={row.original.name || row.original.id}
                        onClick={(event) => {
                            event.stopPropagation();
                            openAccount(row.original);
                        }}
                    >
                        {row.original.name || row.original.id}
                    </Button>
                ),
            },
            {
                Header: 'Saldo pendiente',
                accessor: 'balance',
                Cell: ({ value }) => money(value),
            },
            {
                Header: 'Vencido',
                accessor: 'overdue',
                Cell: ({ value }) => <span className={Number(value) > 0 ? 'cxc-overdue' : ''}>{money(value)}</span>,
            },
            { Header: 'Facturas pendientes', accessor: 'pendingCount' },
            { Header: 'Último abono', accessor: 'lastPayment', Cell: ({ value }) => dateLabel(value) },
            {
                Header: 'Acciones',
                id: 'actions',
                disableSortBy: true,
                Cell: ({ row }) => (
                    <Button
                        size="sm"
                        variant="outline-primary"
                        id={`cxc-pay-${encodeURIComponent(row.original.id)}`}
                        aria-label={`Abonar a ${row.original.name || row.original.id}`}
                        disabled={!data?.writesEnabled || !!error || isValidating || Number(row.original.balance) <= 0}
                        onClick={(event) => {
                            event.stopPropagation();
                            openPayment(row.original, event.currentTarget.id);
                        }}
                    >
                        Abonar
                    </Button>
                ),
            },
        ],
        [openAccount, openPayment, data?.writesEnabled, error, isValidating],
    );
    const handlePrint = useCallback(
        async (config) => {
            try {
                const filters = {
                    search,
                    ruta,
                    state: 'debt',
                    due,
                    sortBy: sort.sortBy,
                    sortDir: sort.sortDir,
                    limit: 100,
                };
                const firstPage = await fetchReceivables({ ...filters, page: 1 });
                const rows = [...(firstPage.data || [])];
                for (let currentPage = 2; rows.length < firstPage.total; currentPage += 1) {
                    const result = await fetchReceivables({ ...filters, page: currentPage });
                    if (!result.data?.length) break;
                    rows.push(...result.data);
                }
                const columnsByAccessor = {
                    name: { width: '*', render: (row) => row.name || row.id },
                    balance: {
                        width: 100,
                        render: (row) => formatMoney(row.balance, config.currency, currencyRate?.Cambio),
                    },
                    overdue: {
                        width: 100,
                        render: (row) => formatMoney(row.overdue, config.currency, currencyRate?.Cambio),
                    },
                    pendingCount: { width: 90, render: (row) => row.pendingCount },
                    lastPayment: { width: 90, render: (row) => dateLabel(row.lastPayment) },
                };
                const selectedColumns = config.columns.map((column) => columnsByAccessor[column.accessor]);
                const orderedRows = sortRows(rows, config.sortBy).map((row) =>
                    selectedColumns.map((column) => column.render(row)),
                );
                const filtersLabel = [
                    search && `Búsqueda: ${search}`,
                    ruta && `Ruta: ${ruta}`,
                    due !== 'all' && `Vencimiento: ${due === 'overdue' ? 'Vencido' : 'Por vencer'}`,
                ]
                    .filter(Boolean)
                    .join(' · ');
                const docDef = {
                    content: [
                        { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                        { text: 'Cuentas por cobrar', style: 'title' },
                        ...(filtersLabel ? [{ text: filtersLabel, style: 'subtitle' }] : []),
                        {
                            text: `Saldo pendiente: ${formatMoney(firstPage.summary.balance, config.currency, currencyRate?.Cambio)}  |  Saldo vencido: ${formatMoney(firstPage.summary.overdue, config.currency, currencyRate?.Cambio)}  |  Clientes: ${firstPage.total}`,
                            style: 'summary',
                        },
                        {
                            style: 'table',
                            table: {
                                headerRows: 1,
                                widths: selectedColumns.map((column) => column.width),
                                body: [config.columns.map((column) => column.Header), ...orderedRows],
                            },
                            layout: 'lightHorizontalLines',
                        },
                    ],
                    styles: {
                        header: { alignment: 'center', fontSize: 9 },
                        title: { alignment: 'center', fontSize: 14, bold: true, margin: [0, 5, 0, 3] },
                        subtitle: { alignment: 'center', fontSize: 8, margin: [0, 0, 0, 8] },
                        summary: { fontSize: 9, bold: true, margin: [0, 4, 0, 8] },
                        table: { fontSize: 8 },
                    },
                    pageMargins: 30,
                    pageSize: 'LETTER',
                    pageOrientation: config.orientation || 'landscape',
                };
                pdfMake.createPdf(docDef).open();
            } catch (printError) {
                console.error('No se pudo imprimir la cartera de cuentas por cobrar:', printError);
            }
        },
        [search, ruta, due, sort, currencyRate],
    );
    const changeFilter = (setter, fallback) => (option) => {
        setter(option?.value ?? fallback);
        setPage(1);
    };
    const hasFilters = !!ruta || due !== 'all';
    return (
        <section className="cxc-page" ref={pageElement}>
            <header className="clients-content-wrapper report-page-header">
                <div>
                    <h4 className="m-0 text-light">Cuentas por cobrar</h4>
                </div>
                <Button
                    ref={paymentTrigger}
                    disabled={!data?.writesEnabled || !!error}
                    onClick={() => openPayment(null, null)}
                >
                    Registrar abono
                </Button>
            </header>
            {error && (
                <Alert variant="danger" role="alert">
                    {error.message}
                    <Button variant="link" onClick={() => mutate()}>
                        Reintentar
                    </Button>
                </Alert>
            )}
            {data && !data.writesEnabled && (
                <Alert variant="warning">
                    Modo consulta: las escrituras de cuentas por cobrar están deshabilitadas. No se pueden registrar
                    abonos ni modificar deudas. Antes de habilitar cobros, valida y concilia la cartera operativa.
                </Alert>
            )}
            <div>
                <Summary summary={summary} portfolio loading={summaryLoading} />
            </div>
            <div className="cxc-filters clients-content-wrapper">
                <Form.Group className="cxc-filter cxc-route-filter">
                    <Form.Label htmlFor="cxc-route">Ruta</Form.Label>
                    <RouteFilter
                        inputId="cxc-route"
                        value={ruta ? { value: ruta, label: ruta } : null}
                        onChange={changeFilter(setRuta, '')}
                    />
                </Form.Group>
                <Form.Group className="cxc-filter">
                    <Form.Label htmlFor="cxc-due">Vencimiento</Form.Label>
                    <Select
                        inputId="cxc-due"
                        options={dueOptions}
                        value={dueOptions.find((option) => option.value === due)}
                        onChange={changeFilter(setDue, 'all')}
                        isSearchable={false}
                        styles={darkSelectStyles}
                        classNamePrefix="search-select"
                        menuPortalTarget={document.body}
                        menuPlacement="auto"
                    />
                </Form.Group>
                {hasFilters && (
                    <Button
                        variant="link"
                        className="cxc-reset-filters"
                        onClick={() => {
                            setRuta('');
                            setDue('all');
                            setPage(1);
                            document.getElementById('cxc-route')?.focus();
                        }}
                    >
                        Restablecer filtros
                    </Button>
                )}
            </div>
            <div className="clients-content-wrapper">
                <Table
                    data={error ? [] : data?.data || []}
                    columns={columns}
                    loading={!error && (!data || isValidating)}
                    onRowClick={openAccount}
                    maxHeight={520}
                    search={{
                        enabled: true,
                        placeholder: 'Buscar por nombre, identificación o RIF…',
                        ariaLabel: 'Buscar cliente',
                        onSearch: handleSearch,
                    }}
                    emptyMessage={
                        error
                            ? 'No se pudo consultar la cartera'
                            : !search && !ruta && due === 'all'
                              ? 'No hay clientes con deuda en esta cartera'
                              : 'No hay clientes para estos filtros'
                    }
                    emptySubtitle={
                        error
                            ? 'Reintenta la consulta para ver los saldos.'
                            : 'Solo se muestran clientes con deuda. Prueba otra búsqueda o restablece los filtros.'
                    }
                    sorting={{
                        enabled: true,
                        sortBy: [{ id: sort.sortBy, desc: sort.sortDir === 'desc' }],
                        resetOnDataChange: false,
                        onSort: (value) => {
                            if (value[0]) {
                                setSort({ sortBy: value[0].id, sortDir: value[0].desc ? 'desc' : 'asc' });
                                setPage(1);
                            }
                        },
                    }}
                    print={{
                        enabled: true,
                        onGlobalPrint: handlePrint,
                        columns: columns.filter((column) => column.id !== 'actions'),
                        storageKey: 'cuentas-por-cobrar',
                        defaultOrientation: 'landscape',
                    }}
                    pagination={{
                        enabled: true,
                        page,
                        totalPages: Math.ceil((data?.total || 0) / 20),
                        totalRows: data?.total || 0,
                        pageSize: 20,
                        onPageChange: setPage,
                    }}
                />
            </div>
            {payment && (
                <PaymentDrawer
                    client={payment.client}
                    onClose={() => {
                        setPayment(null);
                        setTimeout(() => {
                            const trigger = paymentOrigin.current
                                ? document.getElementById(paymentOrigin.current)
                                : paymentTrigger.current;
                            (trigger || pageElement.current?.querySelector('.table-search-input'))?.focus();
                        }, 0);
                    }}
                    onChanged={() => mutate()}
                />
            )}
            {selected && (
                <ClientModal
                    key={selected.id}
                    client={selected}
                    onClose={() => {
                        const id = selected.id;
                        setSelected(null);
                        setTimeout(() => {
                            const trigger = document.getElementById(`cxc-client-${encodeURIComponent(id)}`);
                            (trigger || pageElement.current?.querySelector('.table-search-input'))?.focus();
                        }, 0);
                    }}
                    onChanged={() => mutate()}
                />
            )}
        </section>
    );
}
