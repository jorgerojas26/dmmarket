const barColors = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b',
  '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316',
];

const RankedList = ({ data = [], valueKey, valueFormat, nameKey, secondary, loading, emptyMessage = 'Sin datos' }) => {
  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 120 }}>
        <span className="spinner-border spinner-border-sm" role="status" />
      </div>
    );
  }

  if (!data.length) {
    return <div className="ranked-empty">{emptyMessage}</div>;
  }

  const maxVal = Math.max(...data.map(d => d[valueKey] || 0), 1);

  return (
    <div className="ranked-list">
      {data.map((item, i) => {
        const val = item[valueKey] || 0;
        const pct = (val / maxVal) * 100;
        const secondaryText = secondary ? secondary.render(item) : null;
        const color = barColors[i % barColors.length];

        return (
          <div key={i} className="ranked-row">
            <div className="ranked-top">
              <span className="ranked-pos" style={{ color }}>{i + 1}</span>
              <span className="ranked-name">{item[nameKey]}</span>
            </div>
            {secondaryText && (
              <div className="ranked-meta">{secondaryText}</div>
            )}
            <div className="ranked-bar-wrap">
              <div className="ranked-bar">
                <div className="ranked-bar-fill" style={{ width: `${pct}%`, background: color }} />
              </div>
              <span className="ranked-value">{valueFormat(val)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default RankedList;
