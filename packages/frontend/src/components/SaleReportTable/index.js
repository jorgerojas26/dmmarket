import { useMemo } from 'react';
import Table from 'components/Table';
import columns from './columns';

const SaleReportTable = ({ data, loading, sorting, pagination, search, onRowClick, maxHeight, columns: customColumns }) => {
    const defaultColumns = useMemo(() => columns, []);
    const memoizedColumns = customColumns || defaultColumns;

    return (
        <Table
            data={data}
            loading={loading}
            columns={memoizedColumns}
            showFooter
            maxHeight={maxHeight != null ? maxHeight : null}
            sorting={sorting}
            pagination={pagination}
            search={search}
            onRowClick={onRowClick}
        />
    );
};

export default SaleReportTable;
