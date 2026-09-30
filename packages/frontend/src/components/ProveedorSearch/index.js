import { fetchProviderOptions } from 'api/providers';
import SearchInput from 'components/SearchInput';
import { useCallback } from 'react';

const ProveedorSearch = ({ onSelect, defaultValue }) => {
    const loadProveedores = useCallback(async (inputValue) => {
        const proveedores = await fetchProviderOptions(inputValue);
        return proveedores.map((record) => ({
            key: record.IdProveedor,
            label: record.Empresa,
            value: record,
        }));
    }, []);

    const handleSelect = (option, { action }) => {
        if (action === 'select-option') {
            onSelect(option.value, action);
        } else if (action === 'clear') {
            onSelect(null, action);
        }
    };

    return (
        <div style={{ width: '100%' }}>
            <SearchInput
                loadOptions={loadProveedores}
                debounceMs={250}
                placeholder="Buscar proveedor..."
                onSelect={handleSelect}
                defaultValue={defaultValue}
            />
        </div>
    );
};

export default ProveedorSearch;
