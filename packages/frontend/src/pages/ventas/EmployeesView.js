import CommissionModal from 'employees/Modal/Commission';
import EmployeesTable from 'employees/Table';
import EmployeesSalesTable from 'employees/Table/Sales';
import { useEmployeeSales, useEmployees } from 'hooks/useEmployees';
import { useState } from 'react';

const EmployeesView = ({ dateRange, showNoe, isActive }) => {
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [showCommissionModal, setShowCommissionModal] = useState(false);

    const { data: employees = [], isLoading: employeesLoading } = useEmployees(isActive);
    const { data: employeeSales = [], isLoading: salesLoading } = useEmployeeSales(
        selectedEmployee?.id,
        dateRange,
        showNoe,
        isActive && !!selectedEmployee,
    );

    const handleRowSelect = (employee) => setSelectedEmployee(employee);
    const handleSaleClick = () => setShowCommissionModal(true);

    return (
        <div className="row g-3">
            <div className="col-12">
                <EmployeesTable
                    data={employees}
                    loading={employeesLoading}
                    selectedEmployee={selectedEmployee}
                    onRowSelect={handleRowSelect}
                />
            </div>
            {selectedEmployee && (
                <div className="col-12">
                    <EmployeesSalesTable data={employeeSales} loading={salesLoading} onRowSelect={handleSaleClick} />
                </div>
            )}
            {showCommissionModal && selectedEmployee && (
                <CommissionModal
                    show={showCommissionModal}
                    onClose={() => setShowCommissionModal(false)}
                    employee={selectedEmployee}
                />
            )}
        </div>
    );
};

export default EmployeesView;
