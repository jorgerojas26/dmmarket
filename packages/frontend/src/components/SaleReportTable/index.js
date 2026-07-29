import Table from 'components/Table';
import { useMemo } from 'react';
import columns from './columns';

const SaleReportTable = ({
    data,
    loading,
    sorting,
    pagination,
    search,
    onRowClick,
    maxHeight,
    columns: customColumns,
    print,
}) => {
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
            print={print}
        />
    );
};

export default SaleReportTable;
