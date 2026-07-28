import Table from 'components/Table';
import { useMemo } from 'react';
import columns from './columns';

const EmployeeSales = ({ data, loading, onRowSelect }) => {
    const memoizedColumns = useMemo(() => columns, []);

    return (
        <div className="card">
            <div className="card-header">
                <h2>Vendedores</h2>
            </div>
            <div className="card-body">
                <Table data={data} columns={memoizedColumns} loading={loading} onRowSelect={onRowSelect} />
            </div>
        </div>
    );
};

export default EmployeeSales;
