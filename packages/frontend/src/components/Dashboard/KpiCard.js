const KpiCard = ({ label, value, comparison, loading }) => {
  let comparisonEl = null;
  if (comparison && comparison.previous > 0) {
    const pct = ((comparison.current - comparison.previous) / comparison.previous) * 100;
    const isPositive = pct >= 0;
    comparisonEl = (
      <div className={`small ${isPositive ? 'text-success' : 'text-danger'}`}>
        {isPositive ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% vs anterior
      </div>
    );
  }

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
