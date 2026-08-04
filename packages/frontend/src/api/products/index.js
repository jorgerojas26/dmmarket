const BASE_URL = '/api/products';

export const fetchProducts = async ({ filter }) => {
    const filterParam = filter ? `?filter=${filter}` : '';
    const response = await fetch(BASE_URL + filterParam);
    const products = await response.json();
    return products;
};
