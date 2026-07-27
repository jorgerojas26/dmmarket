import { useEffect, useState } from 'react';
import SaleReportTable from 'components/SaleReportTable';

const SaleReportCard = ({ data = [], onFilter, loading }) => {
  const [sorting, setSorting] = useState('rawProfit');
  const [sortedData, setSortedData] = useState([]);

  useEffect(() => {
    const sorted = [...data].sort((a, b) => b[sorting] - a[sorting]);
    setSortedData(sorted);
  }, [sorting, data]);

  return (
    <div className="dashboard-panel mb-4">
      <div className="dashboard-panel-header">
        <h3>Ventas</h3>
        <div className="d-flex align-items-center gap-2">
          <label className="text-muted small">Ordenar:</label>
          <select onChange={(event) => setSorting(event.target.value)} value={sorting}
            style={{ background: '#2a2d33', color: '#c4cad4', border: '1px solid #3a3d44', borderRadius: 6, padding: '4px 8px', fontSize: '0.82rem' }}>
            <option value='quantity'>Cantidad</option>
            <option value='rawProfit'>Bruto</option>
            <option value='netProfit'>Utilidad</option>
            <option value='averageProfitPercent'>Promedio</option>
          </select>
        </div>
      </div>
      <div style={{ padding: '12px 16px' }}>
        <input
          className='input-filter'
          placeholder='Buscar producto...'
          type='search'
          onChange={(event) => onFilter(event.target.value)}
          style={{
            width: '100%', padding: '8px 12px',
            background: '#1a1d21', color: '#c4cad4',
            border: '1px solid #2d3138', borderRadius: 8,
            fontSize: '0.85rem',
            marginBottom: 8,
          }}
        />
      </div>
      <div className="dashboard-panel-body table-body">
        <SaleReportTable data={sortedData} loading={loading} />
      </div>
    </div>
  );
};

export default SaleReportCard;
