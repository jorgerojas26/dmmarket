import { ResponsiveBar } from '@nivo/bar';
import Table from 'components/Table';
import { CurrencyRateContext } from 'context/currency_rate';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useMemo, useState } from 'react';
import { formatCurrency, formatMoney, formatNumber } from 'utils/format';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const CHART_TOP_N = 40;
const PAGE_SIZE = 20;

// ── entity config ──
// Defaults describe the sales/products pareto. The clients dashboard passes a
// `config` override so both share the exact same chart, table and PDF.

const DEFAULT_CONFIG = {
    nameKey: 'product', // field with the entity name
    valueKey: 'netProfit', // field with the monetary value
    quantityKey: 'quantity', // field with units (null hides the column)
    entityLabel: 'Producto', // singular entity label (column header)
    valueLabel: 'Ganancia',
    valueAxisLabel: 'Ganancia Neta',
    axisLegend: 'Productos (ordenados por ganancia neta)',
    summaryValueKey: 'profitPercent',
    summaryPctLabel: 'de ganancia',
    summaryTotalKey: 'totalProducts',
    summaryTotalLabel: 'Total SKUs',
    summaryTotalUnit: 'productos',
    title: 'Análisis Pareto (ABC)',
    subtitle: '80% de la ganancia viene del 20% de productos',
    pdfTitle: 'Análisis Pareto (ABC) de Productos',
    allFilterLabel: 'Todos los productos',
    emptyTableMessage: 'Sin productos en esta clase',
};

// ── table columns ──

const buildColumns = (cfg) => {
    const columns = [
        {
            Header: '#',
            accessor: 'rank',
        },
        {
            Header: cfg.entityLabel,
            accessor: cfg.nameKey,
        },
        {
            Header: cfg.valueLabel,
            accessor: cfg.valueKey,
            Cell: ({ value }) => formatCurrency(value),
        },
    ];

    if (cfg.quantityKey) {
        columns.push({
            Header: 'Unidades',
            accessor: cfg.quantityKey,
            Cell: ({ value }) => formatNumber(value),
        });
    }

    columns.push(
        {
            Header: '% Acum.',
            accessor: 'cumulativePercent',
            Cell: ({ value }) => `${value}%`,
        },
        {
            Header: 'Clase',
            accessor: 'abcClass',
            Cell: ({ value }) => {
                if (!value) return '\u2014';
                const colors = {
                    A: { bg: 'rgba(34,197,94,0.12)', fg: '#22c55e' },
                    B: { bg: 'rgba(245,158,11,0.12)', fg: '#f59e0b' },
                    C: { bg: 'rgba(239,68,68,0.12)', fg: '#ef4444' },
                };
                const c = colors[value] || { bg: 'transparent', fg: '#9ca3af' };
                return (
                    <span
                        style={{
                            display: 'inline-block',
                            padding: '1px 10px',
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 600,
                            background: c.bg,
                            color: c.fg,
                            lineHeight: '20px',
                        }}
                    >
                        {value}
                    </span>
                );
            },
        },
    );
    return columns;
};

// ── pdfmake document ──

const buildParetoPdf = (products, filterLabel, cfg, config = {}, rate) => {
    const hasQuantity = Boolean(cfg.quantityKey);
    const total = products.reduce((s, p) => s + Number(p[cfg.valueKey] || 0), 0);
    const currency = config?.currency;
    // Column metadata for the PDF, keyed by accessor (order defines layout).
    const pdfColumns = [
        { accessor: 'rank', Header: '#', width: 30, render: (p) => String(p.rank) },
        { accessor: cfg.nameKey, Header: cfg.entityLabel, width: '*', render: (p) => p[cfg.nameKey] },
        {
            accessor: cfg.valueKey,
            Header: cfg.valueLabel,
            width: 'auto',
            render: (p) => formatMoney(p[cfg.valueKey], currency, rate),
        },
        ...(hasQuantity
            ? [
                  {
                      accessor: cfg.quantityKey,
                      Header: 'Unidades',
                      width: 'auto',
                      render: (p) => formatNumber(p[cfg.quantityKey]),
                  },
              ]
            : []),
        {
            accessor: 'cumulativePercent',
            Header: '% Acum.',
            width: 'auto',
            render: (p) => `${p.cumulativePercent}%`,
        },
        { accessor: 'abcClass', Header: 'Clase', width: 'auto', render: (p) => p.abcClass },
    ];
    const selectedAccessors = new Set((config?.columns || []).map((col) => col.accessor));
    const selected =
        selectedAccessors.size > 0 ? pdfColumns.filter((col) => selectedAccessors.has(col.accessor)) : pdfColumns;
    const allColumnsSelected = selected.length === pdfColumns.length;
    const body = [
        selected.map((col) => ({ text: col.Header, style: 'th' })),
        ...products.map((p) => selected.map((col) => col.render(p))),
    ];
    if (allColumnsSelected) {
        body.push([
            { text: '', colSpan: hasQuantity ? 4 : 3, border: [false, true, false, false] },
            ...(hasQuantity ? [{}, {}, {}] : [{}, {}]),
            {
                text: `Total: ${formatMoney(total, currency, rate)}`,
                style: 'total',
            },
            {},
        ]);
    }

    return {
        content: [
            {
                text: 'ALIMENTOS DM MARKET, C.A.',
                style: 'header',
            },
            {
                text: cfg.pdfTitle,
                style: 'subheader',
            },
            {
                text: filterLabel,
                style: 'filterLabel',
                margin: [0, 0, 0, 12],
            },
            {
                style: 'table',
                table: {
                    widths: selected.map((col) => col.width),
                    body,
                },
            },
        ],
        styles: {
            header: { alignment: 'center', fontSize: 10, bold: true },
            subheader: {
                alignment: 'center',
                fontSize: 9,
                margin: [0, 4, 0, 2],
            },
            filterLabel: {
                alignment: 'center',
                fontSize: 8,
                italics: true,
                color: '#666',
            },
            th: { bold: true, fontSize: 8, fillColor: '#f3f4f6' },
            total: { bold: true, fontSize: 8 },
            table: { margin: [0, 10, 0, 0], fontSize: 7 },
        },
        pageMargins: 30,
        pageSize: 'LETTER',
        pageOrientation: config?.orientation || 'portrait',
    };
};

// ── custom layer: cumulative line + 80% threshold + right axis ──

const CumulativeLine = ({ bars, xScale, innerHeight, innerWidth, data }) => {
    if (!bars.length) return null;

    const yPct = (v) => innerHeight - (v / 100) * innerHeight;

    const points = data.map((d) => ({
        x: xScale(d.product) + xScale.bandwidth() / 2,
        y: yPct(d.cumulativePercent),
        cp: d.cumulativePercent,
    }));

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    const thresholdY = yPct(80);
    const leftX = points[0]?.x ?? 0;
    const rightX = points[points.length - 1]?.x ?? innerWidth;

    const step = Math.max(1, Math.floor(points.length / 8));
    const dots = points.filter((_, i) => i % step === 0 || i === points.length - 1);

    const pctTicks = [0, 20, 40, 60, 80, 100];

    return (
        <g>
            {pctTicks.map((pct) => (
                <text
                    key={`ra-${pct}`}
                    x={innerWidth + 6}
                    y={yPct(pct) + 4}
                    fill="#e4e6ea"
                    fontSize={10}
                    textAnchor="start"
                >
                    {pct}%
                </text>
            ))}
            <line
                x1={leftX}
                x2={rightX}
                y1={thresholdY}
                y2={thresholdY}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                opacity={0.6}
            />
            <text x={leftX} y={thresholdY - 5} fill="#ef4444" fontSize={11} fontWeight="700">
                80%
            </text>
            <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth={2.5} opacity={0.85} />
            {dots.map((d, i) => (
                <circle key={i} cx={d.x} cy={d.y} r={3.5} fill="#3b82f6" />
            ))}
        </g>
    );
};

// ── component ──

const ParetoChart = ({ products = [], summary = null, loading = false, config = {} }) => {
    const cfg = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);
    const { currencyRate } = useContext(CurrencyRateContext);
    const [abcFilter, setAbcFilter] = useState('all');
    const [tablePage, setTablePage] = useState(1);

    /* ---- chart data: top N + "Resto" bar ---- */
    const chartData = useMemo(() => {
        if (!products.length) return [];
        const topN = products.slice(0, CHART_TOP_N);
        const rest = products.slice(CHART_TOP_N);
        const restProfit = rest.reduce((s, p) => s + Number(p[cfg.valueKey] || 0), 0);

        const rows = topN.map((p) => ({
            product: p[cfg.nameKey],
            netProfit: Number(p[cfg.valueKey] || 0),
            cumulativePercent: p.cumulativePercent,
        }));

        if (rest.length > 0) {
            rows.push({
                product: `+ ${rest.length} más`,
                netProfit: Math.round(restProfit * 100) / 100,
                cumulativePercent: 100,
            });
        }
        return rows;
    }, [products]);

    /* ---- filtered + paginated table data ---- */
    const filteredProducts = useMemo(() => {
        if (abcFilter === 'all') return products;
        return products.filter((p) => p.abcClass === abcFilter);
    }, [products, abcFilter]);

    const pageCount = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
    const tableData = useMemo(
        () => filteredProducts.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE),
        [filteredProducts, tablePage],
    );

    // Reset page on filter change
    const handleFilter = (key) => {
        setAbcFilter(key);
        setTablePage(1);
    };

    const handlePageChange = useCallback((page) => {
        setTablePage(page);
    }, []);

    /* ---- print handler ---- */
    const handlePrint = useCallback(
        (config) => {
            const labels = {
                all: cfg.allFilterLabel,
                A: 'Clase A (0–80% acumulado)',
                B: 'Clase B (80–95% acumulado)',
                C: 'Clase C (95–100% acumulado)',
            };
            const docDef = buildParetoPdf(
                filteredProducts,
                labels[abcFilter] || cfg.allFilterLabel,
                cfg,
                config,
                currencyRate?.Cambio,
            );
            pdfMake.createPdf(docDef).open();
        },
        [filteredProducts, abcFilter, cfg, currencyRate?.Cambio],
    );

    // ── loading / empty ──
    if (loading) {
        return (
            <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                <div className="text-muted small">Cargando análisis Pareto…</div>
            </div>
        );
    }

    if (!products.length) {
        return (
            <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                <div className="dashboard-inline-title">Análisis Pareto (ABC)</div>
                <div className="ranked-empty">Sin datos para el periodo seleccionado</div>
            </div>
        );
    }

    /* ---- ABC summary cards ---- */
    const summaryCards = summary
        ? [
              {
                  label: 'Clase A',
                  count: summary.classA.count,
                  pct: summary.classA[cfg.summaryValueKey],
                  accent: '#22c55e',
              },
              {
                  label: 'Clase B',
                  count: summary.classB.count,
                  pct: summary.classB[cfg.summaryValueKey],
                  accent: '#f59e0b',
              },
              {
                  label: 'Clase C',
                  count: summary.classC.count,
                  pct: summary.classC[cfg.summaryValueKey],
                  accent: '#ef4444',
              },
          ]
        : [];

    const FILTER_TABS = [
        { key: 'all', label: 'Todos', color: '#9ca3af' },
        { key: 'A', label: 'Clase A', color: '#22c55e' },
        { key: 'B', label: 'Clase B', color: '#f59e0b' },
        { key: 'C', label: 'Clase C', color: '#ef4444' },
    ];

    return (
        <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
            {/* ── Title ── */}
            <div className="dashboard-inline-title" style={{ marginBottom: 16 }}>
                {cfg.title} &mdash; <span style={{ fontWeight: 400, color: '#9ca3af' }}>{cfg.subtitle}</span>
            </div>

            {/* ── ABC KPI cards ── */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: 12,
                    marginBottom: 20,
                }}
            >
                {summaryCards.map((card) => (
                    <div
                        key={card.label}
                        style={{
                            borderLeft: `3px solid ${card.accent}`,
                            background: 'rgba(33,37,41,0.5)',
                            borderRadius: 6,
                            padding: '10px 14px',
                        }}
                    >
                        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{card.label}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#e4e6ea' }}>{card.count}</div>
                        <div style={{ fontSize: 12, color: card.accent }}>
                            {card.pct}% {cfg.summaryPctLabel}
                        </div>
                    </div>
                ))}
                <div
                    style={{
                        borderLeft: '3px solid #6366f1',
                        background: 'rgba(33,37,41,0.5)',
                        borderRadius: 6,
                        padding: '10px 14px',
                    }}
                >
                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{cfg.summaryTotalLabel}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#e4e6ea' }}>
                        {summary?.[cfg.summaryTotalKey] ?? products.length}
                    </div>
                    <div style={{ fontSize: 12, color: '#6366f1' }}>{cfg.summaryTotalUnit}</div>
                </div>
            </div>

            {/* ── Pareto Chart ── */}
            <div style={{ height: 380, marginBottom: 12 }}>
                <ResponsiveBar
                    data={chartData}
                    keys={['netProfit']}
                    indexBy="product"
                    margin={{ top: 10, right: 52, bottom: 90, left: 70 }}
                    padding={0.15}
                    valueScale={{ type: 'linear' }}
                    colors={({ index }) => {
                        const cp = chartData[index]?.cumulativePercent ?? 100;
                        return cp <= 80 ? '#22c55e' : cp <= 95 ? '#f59e0b' : '#ef4444';
                    }}
                    borderRadius={2}
                    axisBottom={{
                        tickSize: 0,
                        tickPadding: 6,
                        tickRotation: -50,
                        format: (v) => (v.length > 16 ? `${v.slice(0, 15)}…` : v),
                        legend: cfg.axisLegend,
                        legendPosition: 'middle',
                        legendOffset: 78,
                    }}
                    axisLeft={{
                        tickSize: 0,
                        tickPadding: 8,
                        format: (v) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`),
                        legend: cfg.valueAxisLabel,
                        legendPosition: 'middle',
                        legendOffset: -55,
                    }}
                    enableGridY={true}
                    gridYValues={5}
                    labelSkipWidth={20}
                    labelSkipHeight={20}
                    layers={[
                        'grid',
                        'axes',
                        'bars',
                        (layerProps) => <CumulativeLine {...layerProps} data={chartData} />,
                        'markers',
                        'legends',
                    ]}
                    tooltip={({ indexValue, value }) => {
                        const item = chartData.find((c) => c.product === indexValue);
                        return (
                            <div className="tooltip-container" style={{ minWidth: 200 }}>
                                <strong style={{ display: 'block', marginBottom: 6 }}>{indexValue}</strong>
                                <div>
                                    {cfg.valueLabel}: {formatCurrency(value)}
                                </div>
                                {item && <div>% Acumulado: {item.cumulativePercent}%</div>}
                            </div>
                        );
                    }}
                    theme={{
                        text: { fill: '#e4e6ea', fontSize: 11 },
                        axis: {
                            legend: {
                                text: { fill: '#e4e6ea', fontSize: 12 },
                            },
                        },
                        grid: { line: { stroke: 'rgba(255,255,255,0.06)' } },
                    }}
                />
            </div>

            {/* ── Legend ── */}
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 18,
                    marginBottom: 20,
                    fontSize: 11,
                    color: '#9ca3af',
                }}
            >
                {[
                    { color: '#22c55e', label: 'Clase A (≤80%)' },
                    { color: '#f59e0b', label: 'Clase B (80-95%)' },
                    { color: '#ef4444', label: 'Clase C (>95%)' },
                ].map((l) => (
                    <span key={l.label}>
                        <span
                            style={{
                                display: 'inline-block',
                                width: 12,
                                height: 12,
                                background: l.color,
                                borderRadius: 2,
                                marginRight: 5,
                                verticalAlign: 'middle',
                            }}
                        />
                        {l.label}
                    </span>
                ))}
                <span>
                    <span
                        style={{
                            display: 'inline-block',
                            width: 14,
                            height: 0,
                            borderTop: '2px dashed #ef4444',
                            marginRight: 5,
                            verticalAlign: 'middle',
                        }}
                    />
                    Umbral 80%
                </span>
                <span>
                    <span
                        style={{
                            display: 'inline-block',
                            width: 14,
                            height: 0,
                            borderTop: '2.5px solid #3b82f6',
                            marginRight: 5,
                            verticalAlign: 'middle',
                        }}
                    />
                    % Acumulado
                </span>
            </div>

            {/* ── Filter tabs + Table ── */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {FILTER_TABS.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => handleFilter(tab.key)}
                        style={{
                            padding: '6px 16px',
                            borderRadius: 6,
                            border:
                                abcFilter === tab.key ? `1.5px solid ${tab.color}` : '1px solid rgba(255,255,255,0.1)',
                            background: abcFilter === tab.key ? `${tab.color}18` : 'transparent',
                            color: abcFilter === tab.key ? tab.color : '#9ca3af',
                            fontSize: 12,
                            fontWeight: abcFilter === tab.key ? 600 : 400,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <Table
                data={tableData}
                columns={buildColumns(cfg)}
                emptyMessage={cfg.emptyTableMessage}
                maxHeight={null}
                pagination={{
                    enabled: true,
                    page: tablePage,
                    totalPages: pageCount,
                    totalRows: filteredProducts.length,
                    pageSize: PAGE_SIZE,
                    onPageChange: handlePageChange,
                }}
                print={{
                    enabled: true,
                    onGlobalPrint: handlePrint,
                    globalPrintLabel: 'Imprimir',
                }}
            />
        </div>
    );
};

export default ParetoChart;
