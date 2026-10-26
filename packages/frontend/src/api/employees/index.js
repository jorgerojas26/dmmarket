const BASE_URL = '/api/employees';

export const getAllEmployees = async () => {
    const response = await fetch(`${BASE_URL}`);
    const employees = await response.json();
    return employees;
};
