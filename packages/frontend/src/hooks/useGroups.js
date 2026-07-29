import { fetchGroups, fetchSalesByGroup } from 'api/groups';
import useSWR from 'hooks/swr-wrapper';

export function useGroups({ filter, showNoe }, enabled = true) {
    const key = enabled ? ['groups', filter, showNoe] : null;
    return useSWR(key, () => fetchGroups({ filter, showNoe }));
}

export function useSalesByGroup({ from, to, categoryId, showNoe }, enabled = true) {
    const key = enabled && from && to && categoryId ? ['sales-by-group', from, to, categoryId, showNoe] : null;
    return useSWR(key, () => fetchSalesByGroup({ from, to, categoryId, showNoe }));
}
