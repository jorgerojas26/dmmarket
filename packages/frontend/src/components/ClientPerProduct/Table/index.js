import Table from 'components/Table';
import { useMemo } from 'react';
import columns from './columns';

const ClientPerProductTable = ({ data, loading }) => {
    const memoizedColumns = useMemo(() => columns, []);

    return <Table data={data} columns={memoizedColumns} loading={loading} />;
};

export default ClientPerProductTable;
