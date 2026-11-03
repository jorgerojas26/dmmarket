import { fetchGroups, fetchSalesByGroup } from 'api/groups';
import { useResource } from 'auth/resources';
import useSWR from 'hooks/swr-wrapper';

export function useGroups({ filter, showNoe }, enabled = true) {
    const resource = useResource();
    const key = enabled ? ['groups', resource, filter, showNoe] : null;
    return useSWR(key, () => fetchGroups({ filter, showNoe, accessResource: resource }));
}

export function useSalesByGroup({ from, to, categoryId, showNoe }, enabled = true) {
    const key = enabled && from && to && categoryId ? ['sales-by-group', from, to, categoryId, showNoe] : null;
    return useSWR(key, () => fetchSalesByGroup({ from, to, categoryId, showNoe }));
}
