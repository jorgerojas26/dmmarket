import { fetchProvidersList } from 'api/providers';
import SearchInput from 'components/SearchInput';
import { ShowNoeContext } from 'context/show_noe';
import { useContext } from 'react';

const ProveedorSearch = ({ onSelect, defaultValue }) => {
    const { showNoe } = useContext(ShowNoeContext);

    const loadProveedores = async (inputValue) => {
        const result = await fetchProvidersList({
            search: inputValue || undefined,
            page: 1,
            limit: 20,
            sortBy: 'Empresa',
            sortDir: 'asc',
            showNoe,
        });

        const proveedores = result?.data || [];

        if (proveedores.length > 0) {
            return proveedores.map((record) => ({
                key: record.IdProveedor,
                label: record.Empresa,
                value: record,
            }));
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
        <div style={{ width: '100%' }}>
            <SearchInput
                loadOptions={loadProveedores}
                placeholder="Buscar proveedor..."
                onSelect={handleSelect}
                defaultValue={defaultValue}
            />
        </div>
    );
};

export default ProveedorSearch;
