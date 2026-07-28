import SaleReportTable from "components/SaleReportTable";

const SaleReportCard = ({
    data,
    loading,
    sorting,
    pagination,
    onSort,
    onPageChange,
}) => {
    return (
        <div className="dashboard-panel mb-4">
            <div className="dashboard-panel-header">
                <h3>Ventas</h3>
            </div>
            <div className="dashboard-panel-body">
                <SaleReportTable
                    data={data}
                    loading={loading}
                    maxHeight={620}
                    sorting={{
                        enabled: true,
                        sortBy: sorting,
                        onSort,
                    }}
                    pagination={
                        pagination
                            ? {
                                  enabled: true,
                                  page: pagination.page,
                                  totalPages: pagination.totalPages,
                                  onPageChange,
                              }
                            : undefined
                    }
                />
            </div>
        </div>
    );
};

export default SaleReportCard;
