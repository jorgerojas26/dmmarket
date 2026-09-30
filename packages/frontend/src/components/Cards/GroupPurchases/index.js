import { ResponsivePie } from '@nivo/pie';
import ChartTooltip from 'components/ChartTooltip';
import { useState } from 'react';
import Modal from 'react-bootstrap/Modal';
import { formatCurrency, formatPercent } from 'utils/format';

const CATEGORY_COLORS = ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24'];
const OTHER_COLOR = '#596474';

const GroupPurchases = ({ chartData = [], compact = false }) => {
    const [showDetails, setShowDetails] = useState(false);
    if (chartData.length === 0) {
        return compact ? (
            <div className="group-purchases-empty text-muted small">Sin datos para el periodo seleccionado</div>
        ) : (
            <div className="d-flex align-items-center justify-content-center h-100 text-muted small">
                Sin datos para el periodo seleccionado
            </div>
        );
    }

    const data = compact
        ? [...chartData]
              .sort((a, b) => Number(b.value) - Number(a.value))
              .map((item, index) => ({
                  ...item,
                  color: CATEGORY_COLORS[index] || OTHER_COLOR,
              }))
        : chartData;
    const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const share = (value) => formatPercent(total > 0 ? (Number(value) / total) * 100 : 0);
    const leading = data.slice(0, 4);
    const remaining = data.slice(4);
    const legend = remaining.length
        ? [
              ...leading,
              {
                  id: '__remaining',
                  label: `Otras ${remaining.length} categorías`,
                  value: remaining.reduce((sum, item) => sum + Number(item.value || 0), 0),
                  color: OTHER_COLOR,
              },
          ]
        : leading;

    const pie = (
        <ResponsivePie
            data={data}
            colors={compact ? (datum) => datum.data.color : { scheme: 'nivo' }}
            margin={compact ? { top: 6, right: 6, bottom: 6, left: 6 } : { top: 30, right: 20, bottom: 20, left: 20 }}
            animate={!compact}
            innerRadius={compact ? 0.7 : 0.5}
            padAngle={compact ? 0.4 : 0.7}
            cornerRadius={compact ? 2 : 3}
            activeOuterRadiusOffset={compact ? 4 : 8}
            arcLabel={(e) => `${e.value}`}
            enableArcLabels={!compact}
            enableArcLinkLabels={!compact}
            borderWidth={1}
            arcLinkLabelsSkipAngle={10}
            arcLinkLabelsTextColor="#9ca3af"
            arcLinkLabelsThickness={2}
            arcLinkLabelsColor={{ from: 'color' }}
            arcLabelsSkipAngle={10}
            arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
            tooltip={({ datum }) => (
                <ChartTooltip title={datum.label} color={datum.color}>
                    <span>Monto Comprado</span>
                    <strong>{formatCurrency(datum.value)}</strong>
                </ChartTooltip>
            )}
        />
    );

    if (!compact) return <div style={{ width: '100%', height: '100%', position: 'relative' }}>{pie}</div>;

    return (
        <>
            <div className="group-purchases-overview">
                <div className="group-purchases-overview-chart">
                    {pie}
                    <div className="group-purchases-overview-center" aria-hidden="true">
                        <strong>{data.length}</strong>
                        <span>categorías</span>
                    </div>
                </div>
                <ul className="group-purchases-overview-legend" aria-label="Categorías de compras">
                    {legend.map((item) => (
                        <li key={item.id} title={`${item.label}: ${formatCurrency(item.value)}`}>
                            <span className="group-purchases-swatch" style={{ background: item.color }} />
                            <span className="group-purchases-label">{item.label}</span>
                            <strong>{share(item.value)}</strong>
                        </li>
                    ))}
                </ul>
            </div>
            {remaining.length > 0 && (
                <button className="group-purchases-details" type="button" onClick={() => setShowDetails(true)}>
                    Ver las {data.length} categorías <span aria-hidden="true">↗</span>
                </button>
            )}
            <Modal
                show={showDetails}
                onHide={() => setShowDetails(false)}
                centered
                scrollable
                contentClassName="bg-dark text-light"
                aria-labelledby="purchases-categories-title"
            >
                <Modal.Header closeButton closeVariant="white" className="border-secondary">
                    <Modal.Title id="purchases-categories-title">Compras por categoría</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="text-muted small">Participación sobre el monto comprado del periodo.</p>
                    <ul className="group-purchases-category-details" aria-label="Todas las categorías de compras">
                        {data.map((item) => (
                            <li key={item.id}>
                                <span className="group-purchases-swatch" style={{ background: item.color }} />
                                <span>{item.label}</span>
                                <strong>{formatCurrency(item.value)}</strong>
                                <span className="text-muted">{share(item.value)}</span>
                            </li>
                        ))}
                    </ul>
                </Modal.Body>
            </Modal>
        </>
    );
};

export default GroupPurchases;
