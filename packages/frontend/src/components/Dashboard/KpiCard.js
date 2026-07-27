const KpiCard = ({ label, value, comparison, loading }) => {
  const comparisonEl = comparison ? (
    <div className={`small ${comparison.isPositive ? 'text-success' : 'text-danger'}`}>
      {comparison.isPositive ? '▲' : '▼'} {comparison.pct}% vs anterior
    </div>
  ) : null;

  return (
    <div className="card h-100">
      <div className="card-body text-center">
        <div className="text-muted small text-uppercase">{label}</div>
        <div className="h4 mb-1">{value}</div>
        {comparisonEl}
        {loading && <span className="spinner-border spinner-border-sm mt-1" role="status" />}
      </div>
    </div>
  );
};

export default KpiCard;
