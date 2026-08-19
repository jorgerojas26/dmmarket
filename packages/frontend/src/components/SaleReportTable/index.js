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
    fillHeight,
    columns: customColumns,
    print,
    summaries,
}) => {
    const defaultColumns = useMemo(() => columns, []);
    const memoizedColumns = customColumns || defaultColumns;

    return (
        <Table
            data={data}
            loading={loading}
            columns={memoizedColumns}
            showFooter
            fillHeight={fillHeight}
            maxHeight={maxHeight != null ? maxHeight : null}
            sorting={sorting}
            pagination={pagination}
            search={search}
            onRowClick={onRowClick}
            print={print}
            summaries={summaries}
        />
    );
};

export default SaleReportTable;
