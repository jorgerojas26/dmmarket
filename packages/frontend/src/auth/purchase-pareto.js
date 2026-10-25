import { ResponsiveBar } from '@nivo/bar';
import ChartTooltip from 'components/ChartTooltip';
import KpiCard from 'components/Dashboard/KpiCard';
import { useState } from 'react';
import { formatCurrency, formatPercent } from 'utils/format';

function CumulativeLine({ xScale, innerHeight, innerWidth, rows }) {
    const y = (value) => innerHeight * (1 - value / 100);
    const path = rows
        .map(
            (row, index) =>
                `${index ? 'L' : 'M'} ${xScale(row.productId) + xScale.bandwidth() / 2} ${y(row.cumulativePercent)}`,
        )
        .join(' ');
    return (
        <g pointerEvents="none">
            {[0, 80, 95, 100].map((value) => (
                <text key={value} x={innerWidth + 5} y={y(value) + 4} fill="#e4e6ea" fontSize={10}>
                    {value}%
                </text>
            ))}
            {[80, 95].map((value) => (
                <line
                    key={value}
                    x1={0}
                    x2={innerWidth}
                    y1={y(value)}
                    y2={y(value)}
                    stroke="#f59e0b"
                    strokeDasharray="5 4"
                />
            ))}
            <path d={path} fill="none" stroke="#60a5fa" strokeWidth={2.5} />
        </g>
    );
}

export default function PurchasePareto({ data }) {
    const [abc, setAbc] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const rows = data.products.filter(
        (row) =>
            (!abc || (abc === 'none' ? row.abcClass === null : row.abcClass === abc)) &&
            row.product.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    );
    const chart = data.products.slice(0, 40);
    const valid =
        data.products.length > 0 &&
        data.products.every(
            (row) =>
                row.cumulativePercent !== null &&
                row.totalPurchased !== null &&
                Number.isFinite(row.totalPurchased) &&
                row.totalPurchased >= 0,
        );
    const unclassified =
        data.summary.totalProducts -
        ['A', 'B', 'C'].reduce((total, name) => total + data.summary[`class${name}`].count, 0);
    return (
        <>
            <p>Productos analizados en compras: {data.summary.totalProducts}</p>
            <div className="dashboard-kpi-grid my-3">
                {['A', 'B', 'C'].map((name) => {
                    const group = data.summary[`class${name}`];
                    return (
                        <fieldset aria-label={`Clase ${name} de compras`} className="border-0 p-0 m-0" key={name}>
                            <KpiCard
                                label={`Clase ${name}`}
                                value={`${group.count} productos`}
                                accent={name === 'A' ? 'green' : name === 'B' ? 'amber' : 'pink'}
                            />
                            <p>
                                Participación:{' '}
                                {group.purchasedPercent === null
                                    ? 'No disponible'
                                    : formatPercent(group.purchasedPercent)}
                            </p>
                        </fieldset>
                    );
                })}
            </div>
            {unclassified > 0 && <p>Productos sin clasificación válida: {unclassified}</p>}
            {valid ? (
                <>
                    <p>
                        Gráfico de los primeros {chart.length} productos. La clasificación y el acumulado se calculan
                        sobre los {data.summary.totalProducts} productos, no sólo los dibujados. La línea azul muestra
                        el acumulado; las guías indican 80% y 95%.
                    </p>
                    <div role="img" aria-label="Gráfico ABC autorizado de compras" style={{ height: 350, minWidth: 0 }}>
                        <ResponsiveBar
                            data={chart}
                            keys={['totalPurchased']}
                            indexBy="productId"
                            margin={{ top: 15, right: 45, bottom: 85, left: 65 }}
                            padding={0.2}
                            animate={false}
                            enableLabel={false}
                            colors={({ data: row }) =>
                                row.abcClass === 'A' ? '#22c55e' : row.abcClass === 'B' ? '#f59e0b' : '#ef4444'
                            }
                            axisBottom={{
                                tickRotation: -45,
                                format: (id) => chart.find((row) => row.productId === id)?.product.slice(0, 16),
                            }}
                            axisLeft={{ format: (value) => formatCurrency(value) }}
                            theme={{ textColor: '#e4e6ea', axis: { ticks: { text: { fill: '#e4e6ea' } } } }}
                            layers={['grid', 'axes', 'bars', (props) => <CumulativeLine {...props} rows={chart} />]}
                            tooltip={({ data: row }) => (
                                <ChartTooltip title={row.product}>
                                    <span>Total Compras autorizado</span>
                                    <strong>{formatCurrency(row.totalPurchased)}</strong>
                                    <span>Acumulado</span>
                                    <strong>{formatPercent(row.cumulativePercent)}</strong>
                                </ChartTooltip>
                            )}
                        />
                    </div>
                </>
            ) : (
                <p>No se dibuja el Pareto sin una base completa, no negativa y mayor que cero.</p>
            )}
            <label htmlFor="purchase-abc">Clase del Pareto de compras</label>
            <select
                id="purchase-abc"
                className="form-select"
                value={abc}
                onChange={(event) => {
                    setAbc(event.target.value);
                    setPage(1);
                }}
            >
                <option value="">Todas las clases</option>
                {['A', 'B', 'C'].map((name) => (
                    <option key={name} value={name}>
                        Clase {name}
                    </option>
                ))}
                <option value="none">Sin clasificación</option>
            </select>
            <label htmlFor="purchase-pareto-search">Buscar producto en el Pareto de compras</label>
            <input
                id="purchase-pareto-search"
                className="form-control"
                value={search}
                onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                }}
                maxLength={128}
            />
            <div className="table-responsive">
                <table aria-label="Clasificación autorizada de compras" className="table table-dark">
                    <thead>
                        <tr>
                            <th>Rango canónico</th>
                            <th>Producto</th>
                            <th>Unidades</th>
                            <th>Total Compras autorizado</th>
                            <th>Acumulado (%)</th>
                            <th>Clase ABC</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.slice((page - 1) * 20, page * 20).map((row) => (
                            <tr key={row.productId}>
                                <td>{row.rank}</td>
                                <td>{row.product}</td>
                                <td>{row.quantity ?? 'No disponible'}</td>
                                <td>{row.totalPurchased ?? 'No disponible'}</td>
                                <td>{row.cumulativePercent ?? 'Sin base válida'}</td>
                                <td>{row.abcClass ?? 'Sin clasificación válida'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p role="status">
                Productos del filtro del Pareto: {rows.length}. Página {page}.
            </p>
            <button
                type="button"
                className="btn btn-outline-light"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
            >
                Pareto de compras: página anterior
            </button>
            <button
                type="button"
                className="btn btn-outline-light"
                disabled={page * 20 >= rows.length}
                onClick={() => setPage(page + 1)}
            >
                Pareto de compras: página siguiente
            </button>
        </>
    );
}
