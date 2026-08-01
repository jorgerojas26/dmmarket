import Table from 'components/Table';
import { useMemo } from 'react';
import { Card } from 'react-bootstrap';
import columns from './columns';

const InvoicesTable = ({
    data,
    loading,
    onRowSelect,
    sorting,
    pagination,
    search,
    print,
    maxHeight,
    clearSelectionSignal,
}) => {
    const memoizedColumns = useMemo(() => columns, []);

    return (
        <Card className="noselect">
            <Card.Header>
                <h3>Facturas</h3>
            </Card.Header>
            <Card.Body>
                <Table
                    data={data}
                    columns={memoizedColumns}
                    loading={loading}
                    onRowSelect={onRowSelect}
                    multiSelect
                    getRowId={(row) => row.invoiceId}
                    preserveSelection
                    sorting={sorting}
                    pagination={pagination}
                    search={search}
                    print={print}
                    maxHeight={maxHeight}
                    clearSelectionSignal={clearSelectionSignal}
                />
            </Card.Body>
        </Card>
    );
};

export default InvoicesTable;
