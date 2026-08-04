import Table from 'components/Table';
import columns from './columns';

const PurchasesReportTable = ({
    data,
    loading,
    sorting,
    pagination,
    search,
    maxHeight,
    columns: customColumns,
    print,
}) => {
    const memoizedColumns = customColumns || columns;

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
            print={print}
        />
    );
};

export default PurchasesReportTable;
