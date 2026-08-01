import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';

const ICONS = {
    money: (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
    ),
    chart: (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
    ),
    percent: (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="19" y1="5" x2="5" y2="19" />
            <circle cx="6.5" cy="6.5" r="2.5" />
            <circle cx="17.5" cy="17.5" r="2.5" />
        </svg>
    ),
    package: (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
    ),
    receipt: (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="15 3 21 3 21 21 15 21" />
            <polyline points="9 3 3 3 3 21 9 21" />
            <line x1="9" y1="3" x2="15" y2="3" />
            <line x1="9" y1="21" x2="15" y2="21" />
            <line x1="7" y1="7" x2="7" y2="7.01" />
            <line x1="7" y1="11" x2="7" y2="11.01" />
            <line x1="7" y1="15" x2="7" y2="15.01" />
        </svg>
    ),
    user: (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    ),
    ticket: (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 1v22" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
    ),
};

const ACCENT_COLORS = {
    blue: { border: '#3b82f6', bg: 'rgba(59,130,246,0.08)', icon: '#60a5fa' },
    green: { border: '#22c55e', bg: 'rgba(34,197,94,0.08)', icon: '#4ade80' },
    purple: { border: '#a855f7', bg: 'rgba(168,85,247,0.08)', icon: '#c084fc' },
    amber: { border: '#f59e0b', bg: 'rgba(245,158,11,0.08)', icon: '#fbbf24' },
    cyan: { border: '#06b6d4', bg: 'rgba(6,182,212,0.08)', icon: '#22d3ee' },
    pink: { border: '#ec4899', bg: 'rgba(236,72,153,0.08)', icon: '#f472b6' },
    orange: { border: '#f97316', bg: 'rgba(249,115,22,0.08)', icon: '#fb923c' },
};

const KpiCard = ({ label, value, comparison, icon, accent, loading, help }) => {
    const palette = ACCENT_COLORS[accent] || ACCENT_COLORS.blue;

    const helpLines = help
        ? [
              { label: 'Qué es', text: help.que },
              { label: 'Cómo leerlo', text: help.leer },
              { label: 'Para qué sirve', text: help.servir },
              { label: 'Acción sugerida', text: help.accion },
          ].filter((line) => line.text)
        : [];

    const helpPopover = help ? (
        <Popover id={`kpi-help-${label.replace(/\W+/g, '-')}`} className="kpi-help-popover">
            <Popover.Body>
                {helpLines.map((line) => (
                    <div key={line.label} className="kpi-help-line">
                        <span className="kpi-help-k">{line.label}: </span>
                        {line.text}
                    </div>
                ))}
            </Popover.Body>
        </Popover>
    ) : null;

    const trendEl = comparison ? (
        <span className={`dashboard-kpi-trend ${comparison.isPositive ? 'trend-up' : 'trend-down'}`}>
            <span className="trend-arrow">{comparison.isPositive ? '\u25B2' : '\u25BC'}</span>
            <span className="trend-pct">{comparison.pct}%</span>
            <span className="trend-label">vs anterior</span>
        </span>
    ) : null;

    if (loading) {
        return (
            <div
                className="dashboard-kpi-card"
                style={{
                    '--kpi-accent': palette.border,
                    '--kpi-accent-bg': palette.bg,
                    '--kpi-icon-color': palette.icon,
                }}
            >
                <div className="dashboard-kpi-card-inner">
                    <div className="dashboard-kpi-icon" style={{ color: palette.icon }}>
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    </div>
                    <div className="dashboard-kpi-body">
                        <span className="dashboard-kpi-label">{label}</span>
                        <span className="dashboard-kpi-value">{'\u2014'}</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="dashboard-kpi-card"
            style={{
                '--kpi-accent': palette.border,
                '--kpi-accent-bg': palette.bg,
                '--kpi-icon-color': palette.icon,
            }}
        >
            {help && (
                <OverlayTrigger trigger="click" rootClose placement="bottom" overlay={helpPopover}>
                    <button
                        type="button"
                        className="kpi-help-btn"
                        aria-label={`Ayuda sobre ${label}`}
                        title={`Ayuda sobre ${label}`}
                    >
                        ?
                    </button>
                </OverlayTrigger>
            )}
            <div className="dashboard-kpi-card-inner">
                <div className="dashboard-kpi-icon" style={{ color: palette.icon }}>
                    {icon ? ICONS[icon] : ICONS.money}
                </div>
                <div className="dashboard-kpi-body">
                    <span className="dashboard-kpi-label">{label}</span>
                    <span className="dashboard-kpi-value">{value}</span>
                    {trendEl}
                </div>
            </div>
        </div>
    );
};

export default KpiCard;
