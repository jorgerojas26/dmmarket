import { getAllEmployees } from 'api/employees';
import SearchInput from 'components/SearchInput';

const EmployeeSearch = ({ onSelect, defaultValue }) => {
    const loadEmployees = async (inputValue) => {
        const employees = await getAllEmployees({ filter: inputValue });

        if (employees && employees.length > 0) {
            const records = employees.map((record) => {
                const employee = {
                    key: record.id,
                    label: record.name,
                    value: record,
                };
                return employee;
            });

            return records;
        }
    };

    const handleSelect = (option, { action }) => {
        if (action === 'select-option') {
            onSelect?.(option.value, action);
        } else if (action === 'clear') {
            onSelect?.(null, action);
        }
    };

    return (
        <SearchInput
            loadOptions={loadEmployees}
            placeholder="Buscar vendedor..."
            onSelect={handleSelect}
            defaultValue={defaultValue}
        />
    );
};

export default EmployeeSearch;
