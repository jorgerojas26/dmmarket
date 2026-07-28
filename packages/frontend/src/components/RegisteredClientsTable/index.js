import Table from 'components/Table';
import { useMemo } from 'react';
import columns from './columns';

const ClientReportTable = ({ data }) => {
    const memoizedColumns = useMemo(() => columns, []);

    return <Table data={data} columns={memoizedColumns} showFooter />;
};

export default ClientReportTable;
