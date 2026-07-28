import Table from 'components/Table';
import { useMemo } from 'react';
import { Card } from 'react-bootstrap';
import columns from './columns';

const InvoicesTable = ({ data, loading, onRowSelect, selectable, sorting, pagination, search, print, maxHeight }) => {
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
                    selectable={selectable}
                    multiSelect
                    sorting={sorting}
                    pagination={pagination}
                    search={search}
                    print={print}
                    maxHeight={maxHeight}
                />
            </Card.Body>
        </Card>
    );
};

export default InvoicesTable;
