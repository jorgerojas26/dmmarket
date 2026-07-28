import { getAllEmployees, getEmployeeSales } from 'api/employees';
import CommissionModal from 'employees/Modal/Commission';
import EmployeesTable from 'employees/Table';
import EmployeesSalesTable from 'employees/Table/Sales';
import { useEffect, useState } from 'react';

const EmployeesView = ({ dateRange, showNoe, isActive }) => {
    const [employees, setEmployees] = useState([]);
    const [employeesLoading, setEmployeesLoading] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [employeeSales, setEmployeeSales] = useState([]);
    const [salesLoading, setSalesLoading] = useState(false);
    const [showCommissionModal, setShowCommissionModal] = useState(false);

    useEffect(() => {
        if (!isActive) return;
        setEmployeesLoading(true);
        getAllEmployees()
            .then(setEmployees)
            .catch(console.error)
            .finally(() => setEmployeesLoading(false));
    }, [isActive]);

    useEffect(() => {
        if (!isActive || !selectedEmployee) return;
        setSalesLoading(true);
        getEmployeeSales(selectedEmployee.id, dateRange, showNoe)
            .then(setEmployeeSales)
            .catch(console.error)
            .finally(() => setSalesLoading(false));
    }, [dateRange.from, dateRange.to, selectedEmployee, showNoe, isActive]);

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
