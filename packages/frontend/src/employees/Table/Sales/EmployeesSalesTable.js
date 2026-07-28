import Table from 'components/Table';
import { useMemo } from 'react';
import columns from './columns';

const EmployeeSalesTable = ({ data, loading, onRowSelect }) => {
    const memoizedColumns = useMemo(() => columns, []);

    return (
        <div className="card">
            <div className="card-header">
                <h2>Reporte de ventas</h2>
            </div>
            <div className="card-body">
                <Table
                    data={data}
                    columns={memoizedColumns}
                    loading={loading}
                    onRowSelect={onRowSelect}
                    showFooter
                    maxHeight={400}
                />
            </div>
        </div>
    );
};

export default EmployeeSalesTable;
