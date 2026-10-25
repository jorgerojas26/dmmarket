import { ResponsivePie } from '@nivo/pie';
import PanelHelpTitle from 'components/Dashboard/PanelHelpTitle';
import Modal from 'components/Modal';
import { useState } from 'react';
import { formatCurrency, formatPercent } from 'utils/format';

const LEADING_COLORS = ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24'];
const OTHER_COLOR = '#596474';
const LEADING_SLICES = 4;

const DonutOverview = ({
    data = [],
    title,
    help,
    ariaLabel,
    centerLabel = 'categorías',
    remainingLabel = (count) => `Otras ${count} categorías`,
    detailsLabel = (count) => `Ver las ${count} categorías`,
    detailsId,
    detailsTitle,
    detailsSubtitle,
    tooltip,
    onSliceClick,
    emptyMessage = 'Sin datos para el periodo seleccionado',
}) => {
    const [showDetails, setShowDetails] = useState(false);

    const sorted = [...data].sort((a, b) => Number(b.value) - Number(a.value));
    const slices = sorted.map((item, index) => ({ ...item, color: LEADING_COLORS[index] || OTHER_COLOR }));
    const total = slices.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const share = (value) => formatPercent(total > 0 ? (Number(value) / total) * 100 : 0);
    const remaining = slices.slice(LEADING_SLICES);
    const legend = remaining.length
        ? [
              ...slices.slice(0, LEADING_SLICES),
              {
                  id: '__remaining',
                  label: remainingLabel(remaining.length),
                  value: remaining.reduce((sum, item) => sum + Number(item.value || 0), 0),
                  color: OTHER_COLOR,
              },
          ]
        : slices;

    return (
        <>
            <div className="donut-overview-header">
                <PanelHelpTitle title={title} help={help} />
                {remaining.length > 0 && (
                    <button className="donut-overview-details" type="button" onClick={() => setShowDetails(true)}>
                        {detailsLabel(slices.length)} <span aria-hidden="true">↗</span>
                    </button>
                )}
            </div>
            {data.length === 0 ? (
                <div className="donut-overview-empty text-muted small">{emptyMessage}</div>
            ) : (
                <div className="donut-overview">
                    <div className="donut-overview-chart">
                        <ResponsivePie
                            data={slices}
                            colors={(datum) => datum.data.color}
                            margin={{ top: 6, right: 6, bottom: 6, left: 6 }}
                            animate={false}
                            innerRadius={0.7}
                            padAngle={0.4}
                            cornerRadius={2}
                            activeOuterRadiusOffset={4}
                            enableArcLabels={false}
                            enableArcLinkLabels={false}
                            borderWidth={1}
                            tooltip={tooltip}
                            onClick={onSliceClick}
                        />
                        <div className="donut-overview-center" aria-hidden="true">
                            <strong>{slices.length}</strong>
                            <span>{centerLabel}</span>
                        </div>
                    </div>
                    <ul className="donut-overview-legend" aria-label={ariaLabel}>
                        {legend.map((item) => (
                            <li key={item.id} title={`${item.label}: ${formatCurrency(item.value)}`}>
                                <span className="donut-overview-swatch" style={{ background: item.color }} />
                                <span className="donut-overview-label">{item.label}</span>
                                <strong>{share(item.value)}</strong>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <Modal
                show={showDetails}
                onHide={() => setShowDetails(false)}
                centered
                scrollable
                contentClassName="bg-dark text-light"
                aria-labelledby={detailsId}
            >
                <Modal.Header closeButton closeVariant="white" className="border-secondary">
                    <Modal.Title id={detailsId}>{detailsTitle}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="text-muted small">{detailsSubtitle}</p>
                    <ul className="donut-overview-details-list">
                        {slices.map((item) => (
                            <li key={item.id}>
                                <span className="donut-overview-swatch" style={{ background: item.color }} />
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

export default DonutOverview;
