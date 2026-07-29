import { getAllEmployees, getComisionInfo, updateComisionInfo, getEmployeeSales } from 'api/employees';
import useSWR from 'hooks/swr-wrapper';

export function useEmployees(enabled = true) {
    const key = enabled ? 'employees' : null;
    return useSWR(key, getAllEmployees);
}

export function useComisionInfo(employeeId, enabled = true) {
    const key = enabled && employeeId ? ['comision-info', employeeId] : null;
    return useSWR(key, () => getComisionInfo(employeeId));
}

export function useEmployeeSales(employeeId, dateRange, showNoe, enabled = true) {
    const key =
        enabled && employeeId && dateRange?.from && dateRange?.to
            ? ['employee-sales', employeeId, dateRange.from, dateRange.to, showNoe]
            : null;
    return useSWR(key, () => getEmployeeSales(employeeId, dateRange, showNoe));
}

// Mutation is imperative — export the raw function
export { updateComisionInfo };
