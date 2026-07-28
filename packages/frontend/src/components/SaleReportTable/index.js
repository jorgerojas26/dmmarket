import { useMemo } from 'react';
import Table from 'components/Table';
import columns from './columns';

const SaleReportTable = ({ data, loading, sorting, pagination, maxHeight }) => {
    const memoizedColumns = useMemo(() => columns, []);

    return (
        <Table
            data={data}
            loading={loading}
            columns={memoizedColumns}
            showFooter
            maxHeight={maxHeight != null ? maxHeight : null}
            sorting={sorting}
            pagination={pagination}
        />
    );
};

export default SaleReportTable;
