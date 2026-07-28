import { fetchProducts } from 'api/products';
import SearchInput from 'components/SearchInput';

const ProductSearch = ({ onSelect }) => {
    const loadProductVariants = async (inputValue) => {
        const products = await fetchProducts({ filter: inputValue });

        if (products && products.length > 0) {
            const records = products.map((record) => {
                const product_name = record.Descripcion;

                const product = {
                    key: record.id,
                    label: product_name,
                    value: record,
                };
                return product;
            });

            return records;
        }
    };

    const handleSelect = (option, { action }) => {
        if (action === 'select-option') {
            onSelect(option.value, action);
        } else if (action === 'clear') {
            onSelect(null, action);
        }
    };

    return (
        <SearchInput
            loadOptions={loadProductVariants}
            defaultOptions={false}
            placeholder="Buscar producto..."
            onSelect={handleSelect}
        />
    );
};

export default ProductSearch;
