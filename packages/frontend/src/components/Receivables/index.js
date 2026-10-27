import { fetchReceivableExport } from 'api/receivables';
import { useAuth } from 'auth/context';
import RouteFilter from 'components/RouteFilter';
import { darkSelectStyles } from 'components/selectStyles';
import Table from 'components/Table';
import { CurrencyRateContext } from 'context/currency_rate';
import { useReceivables } from 'hooks/useReceivables';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Select from 'react-select';
import { formatMoney } from 'utils/format';
import { sortRows } from 'utils/sortRows';
import { useReceivablesAccess } from './access';
import ClientModal from './ClientModal';
import { dateLabel, money } from './format';
import PaymentAvailability from './PaymentAvailability';
import PaymentDrawer from './PaymentDrawer';
import Summary from './Summary';
import './styles.css';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const dueOptions = [
    { value: 'all', label: 'Todos los vencimientos' },
    { value: 'overdue', label: 'Con deuda vencida' },
    { value: 'upcoming', label: 'Sin deuda vencida' },
];

const stateOptions = [
    { value: 'all', label: 'Todos los estados' },
    { value: 'debt', label: 'Con deuda' },
    { value: 'settled', label: 'Sin deuda pendiente' },
];

const accountState = (client) => (Number(client.balance) > 0 ? 'Con deuda' : 'Sin deuda pendiente');

export default function Receivables() {
    const { can } = useAuth();
    const { canOperate, canExport } = useReceivablesAccess();
    const [view, setView] = useState('debt');
    const [state, setState] = useState('all');
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
    const isHistory = view === 'history';
    const activeState = isHistory ? state : 'debt';
    const activeDue = isHistory ? 'all' : due;
    const { data, error, isValidating, mutate } = useReceivables({
        search,
        ruta,
        state: activeState,
        due: activeDue,
        page,
        ...sort,
    });
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
            ...(isHistory
                ? [
                      {
                          Header: 'Estado',
                          accessor: 'accountState',
                          disableSortBy: true,
                          Cell: ({ row }) => (
                              <span
                                  className={`cxc-badge${Number(row.original.balance) > 0 ? ' cxc-badge-pending' : ''}`}
                              >
                                  {accountState(row.original)}
                              </span>
                          ),
                      },
                  ]
                : []),
            {
                Header: isHistory ? 'Saldo actual' : 'Saldo pendiente',
                accessor: 'balance',
                Cell: ({ value }) => money(value),
            },
            ...(!isHistory
                ? [
                      {
                          Header: 'Vencido',
                          accessor: 'overdue',
                          Cell: ({ value }) => (
                              <span className={Number(value) > 0 ? 'cxc-overdue' : ''}>{money(value)}</span>
                          ),
                      },
                      { Header: 'Facturas pendientes', accessor: 'pendingCount' },
                  ]
                : []),
            { Header: 'Último abono', accessor: 'lastPayment', Cell: ({ value }) => dateLabel(value) },
            {
                Header: 'Acciones',
                id: 'actions',
                disableSortBy: true,
                Cell: ({ row }) =>
                    isHistory ? (
                        <Button
                            size="sm"
                            variant="outline-secondary"
                            aria-label={`Ver historial de ${row.original.name || row.original.id}`}
                            onClick={(event) => {
                                event.stopPropagation();
                                openAccount(row.original);
                            }}
                        >
                            Ver historial
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="outline-primary"
                            id={`cxc-pay-${encodeURIComponent(row.original.id)}`}
                            aria-label={`Abonar a ${row.original.name || row.original.id}`}
                            disabled={
                                !canOperate('payment') ||
                                !data ||
                                !!error ||
                                isValidating ||
                                Number(row.original.balance) <= 0
                            }
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
        [isHistory, openAccount, openPayment, data, error, isValidating, canOperate],
    );
    const handlePrint = useCallback(
        async (config) => {
            try {
                const filters = {
                    search,
                    ruta,
                    state: activeState,
                    due: activeDue,
                    sortBy: sort.sortBy,
                    sortDir: sort.sortDir,
                    limit: 100,
                };
                delete filters.limit;
                filters.search = config.search ?? search;
                const report = await fetchReceivableExport(filters);
                const rows = report.data;
                const columnsByAccessor = {
                    name: { width: '*', render: (row) => row.name || row.id },
                    accountState: { width: 110, render: accountState },
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
                const orderedRows = sortRows(rows, config.sortBy, { accountState }).map((row) =>
                    selectedColumns.map((column) => column.render(row)),
                );
                const filtersLabel = [
                    search && `Búsqueda: ${search}`,
                    ruta && `Ruta: ${ruta}`,
                    isHistory && `Estado: ${stateOptions.find((option) => option.value === activeState).label}`,
                    activeDue !== 'all' && `Vencimiento: ${activeDue === 'overdue' ? 'Vencido' : 'Por vencer'}`,
                ]
                    .filter(Boolean)
                    .join(' · ');
                const docDef = {
                    content: [
                        { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                        {
                            text: isHistory ? 'Historial de clientes · Cuentas por cobrar' : 'Cuentas por cobrar',
                            style: 'title',
                        },
                        ...(filtersLabel ? [{ text: filtersLabel, style: 'subtitle' }] : []),
                        {
                            text: `Resumen de cartera${ruta ? ` · Ruta: ${ruta}` : ''}: Saldo pendiente: ${formatMoney(firstPage.summary.balance, config.currency, currencyRate?.Cambio)}  |  Saldo vencido: ${formatMoney(firstPage.summary.overdue, config.currency, currencyRate?.Cambio)}`,
                            style: 'summary',
                        },
                        { text: `Clientes en la consulta: ${firstPage.total}`, style: 'summary' },
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
        [search, ruta, activeState, activeDue, isHistory, sort, currencyRate],
    );
    const changeFilter = (setter, fallback) => (option) => {
        setter(option?.value ?? fallback);
        setPage(1);
    };
    const hasFilters = !!ruta || (isHistory ? state !== 'all' : due !== 'all');
    const changeView = (next) => {
        if (!next || next === view) return;
        setView(next);
        setPage(1);
        setSort(next === 'history' ? { sortBy: 'name', sortDir: 'asc' } : { sortBy: 'overdue', sortDir: 'desc' });
    };
    return (
        <section className="cxc-page" ref={pageElement}>
            <header className="clients-content-wrapper report-page-header">
                <div>
                    <h4 className="m-0 text-light">Cuentas por cobrar</h4>
                </div>
                <div className="cxc-payment-actions">
                    <PaymentAvailability />
                    <Button
                        ref={paymentTrigger}
                        disabled={!canOperate('payment') || !data || !!error}
                        onClick={() => openPayment(null, null)}
                    >
                        Registrar abono
                    </Button>
                </div>
            </header>
            {error && (
                <Alert variant="danger" role="alert">
                    {error.message}
                    <Button variant="link" onClick={() => mutate()}>
                        Reintentar
                    </Button>
                </Alert>
            )}
            <div>
                <Summary summary={summary} portfolio loading={summaryLoading} />
            </div>
            <div className="cxc-filters clients-content-wrapper">
                <Form.Group className="cxc-filter cxc-route-filter">
                    <RouteFilter
                        enabled={can('clients.read')}
                        inputId="cxc-route"
                        value={ruta ? { value: ruta, label: ruta } : null}
                        onChange={changeFilter(setRuta, '')}
                    />
                </Form.Group>
                <Form.Group className="cxc-filter">
                    <Select
                        inputId={isHistory ? 'cxc-state' : 'cxc-due'}
                        aria-label={isHistory ? 'Estado' : 'Vencimiento'}
                        options={isHistory ? stateOptions : dueOptions}
                        value={
                            isHistory
                                ? stateOptions.find((option) => option.value === state)
                                : dueOptions.find((option) => option.value === due)
                        }
                        onChange={changeFilter(isHistory ? setState : setDue, 'all')}
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
                            setState('all');
                            setPage(1);
                            document.getElementById('cxc-route')?.focus();
                        }}
                    >
                        Restablecer filtros
                    </Button>
                )}
            </div>
            <div className="report-tabs">
                <div className="report-tab-nav" role="tablist" aria-label="Vistas de cuentas por cobrar">
                    {[
                        ['debt', 'Con deuda actual'],
                        ['history', 'Historial de clientes'],
                    ].map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            id={`cxc-view-${key}`}
                            aria-selected={view === key}
                            aria-controls="cxc-portfolio-panel"
                            tabIndex={view === key ? 0 : -1}
                            className={`report-tab-button${view === key ? ' active' : ''}`}
                            onClick={() => changeView(key)}
                            onKeyDown={(event) => {
                                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                                event.preventDefault();
                                const next =
                                    event.key === 'Home'
                                        ? 'debt'
                                        : event.key === 'End'
                                          ? 'history'
                                          : view === 'debt'
                                            ? 'history'
                                            : 'debt';
                                changeView(next);
                                document.getElementById(`cxc-view-${next}`)?.focus();
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div
                    className="report-tab-content"
                    id="cxc-portfolio-panel"
                    role="tabpanel"
                    aria-labelledby={`cxc-view-${view}`}
                >
                    <Table
                        key={view}
                        data={error ? [] : data?.data || []}
                        columns={columns}
                        loading={!error && (!data || isValidating)}
                        onRowClick={openAccount}
                        maxHeight={520}
                        search={{
                            enabled: true,
                            placeholder: 'Buscar por nombre, identificación o RIF…',
                            ariaLabel: 'Buscar cliente',
                            initialValue: search,
                            onSearch: handleSearch,
                        }}
                        emptyMessage={
                            error
                                ? 'No se pudo consultar la cartera'
                                : !search && !hasFilters
                                  ? isHistory
                                      ? 'No hay clientes con historial de deuda en esta cartera'
                                      : 'No hay clientes con deuda en esta cartera'
                                  : 'No hay clientes para estos filtros'
                        }
                        emptySubtitle={
                            error
                                ? 'Reintenta la consulta para ver los saldos.'
                                : isHistory
                                  ? 'Solo se incluyen clientes con documentos por cobrar registrados. Prueba otra búsqueda o restablece los filtros.'
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
                            enabled: canExport && Boolean(data) && !error,
                            onGlobalPrint: handlePrint,
                            columns: columns.filter((column) => column.id !== 'actions'),
                            storageKey: isHistory ? 'cuentas-por-cobrar-historial' : 'cuentas-por-cobrar',
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
                    initialDocuments={isHistory ? 'all' : 'pending'}
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
