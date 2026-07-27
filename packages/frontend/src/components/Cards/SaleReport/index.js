import { useEffect, useState } from 'react';
import SaleReportTable from 'components/SaleReportTable';

const SaleReportCard = ({ data = [] }) => {
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
      <div className="dashboard-panel-body table-body">
        <SaleReportTable data={sortedData} />
      </div>
    </div>
  );
};

export default SaleReportCard;
