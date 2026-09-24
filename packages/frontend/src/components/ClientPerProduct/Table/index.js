import Table from 'components/Table';
import { useMemo } from 'react';
import { formatCurrency } from 'utils/format';
import columns from './columns';

const ClientPerProductTable = ({ data = [], loading }) => {
    const memoizedColumns = useMemo(() => columns, []);
    const summaries = useMemo(
        () => ({ utilidad: formatCurrency(data.reduce((sum, row) => sum + Number(row.utilidad || 0), 0)) }),
        [data],
    );

    return <Table data={data} columns={memoizedColumns} loading={loading} showFooter summaries={summaries} />;
};

export default ClientPerProductTable;
