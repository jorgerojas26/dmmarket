import Table from 'components/Table';
import columns from './columns';

const PurchasesReportTable = ({
    data,
    loading,
    sorting,
    pagination,
    search,
    maxHeight,
    fillHeight,
    columns: customColumns,
    print,
    summaries,
}) => {
    const memoizedColumns = customColumns || columns;

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
            print={print}
            summaries={summaries}
        />
    );
};

export default PurchasesReportTable;
