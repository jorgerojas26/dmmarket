const BASE_URL = '/api/products';

export const fetchProducts = async ({
    search,
    categoryId,
    proveedorId,
    stockOnly,
    page,
    limit,
    sortBy,
    sortDir,
} = {}) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (categoryId) params.set('categoryId', categoryId);
    if (proveedorId) params.set('proveedorId', proveedorId);
    if (stockOnly) params.set('stockOnly', 'true');
    if (page != null) params.set('page', page);
    if (limit != null) params.set('limit', limit);
    if (sortBy) params.set('sortBy', sortBy);
    if (sortDir) params.set('sortDir', sortDir);
    const qs = params.toString();
    const response = await fetch(BASE_URL + (qs ? `?${qs}` : ''));
    return response.json();
};
