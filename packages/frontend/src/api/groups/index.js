const BASE_URL = '/api/groups';

export const fetchGroups = async ({ filter } = {}) => {
    const response = await fetch(BASE_URL);
    if (!response.ok) throw new Error('No se pudieron cargar las categorías autorizadas.');
    const groups = await response.json();
    const term = String(filter || '').toLocaleLowerCase('es');
    return groups.filter((group) => String(group.name).toLocaleLowerCase('es').includes(term));
};

export const fetchSalesByGroup = async ({ from, to, categoryId, showNoe }) => {
    const response = await fetch(`${BASE_URL}/sales/${categoryId}?from=${from}&to=${to}&showNoe=${showNoe}`);
    const report = await response.json();
    console.log('From fetchSalesByCategory', report);
    return report;
};
