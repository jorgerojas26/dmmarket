import Table from 'components/Table';
import { useMemo } from 'react';
import { Card } from 'react-bootstrap';
import columns from './columns';

const InvoicesTable = ({
    data,
    loading,
    onRowSelect,
    selectedRows,
    onSelectAll,
    onDeselectAll,
    sorting,
    pagination,
    search,
    print,
    clearSelectionSignal,
    deselectSignal,
}) => {
    const memoizedColumns = useMemo(() => columns, []);

    return (
        <Card className="h-100 mb-0 noselect">
            <Card.Header>
                <h3>Facturas</h3>
            </Card.Header>
            <Card.Body style={{ minHeight: 0 }}>
                <Table
                    data={data}
                    columns={memoizedColumns}
                    loading={loading}
                    onRowSelect={onRowSelect}
                    selectedRows={selectedRows}
                    onSelectAll={onSelectAll}
                    onDeselectAll={onDeselectAll}
                    multiSelect
                    getRowId={(row) => row.invoiceId}
                    preserveSelection
                    fillHeight
                    sorting={sorting}
                    pagination={pagination}
                    search={search}
                    print={print}
                    clearSelectionSignal={clearSelectionSignal}
                    deselectSignal={deselectSignal}
                />
            </Card.Body>
        </Card>
    );
};

export default InvoicesTable;
