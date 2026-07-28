import { fetchClients } from 'api/clients';
import SearchInput from 'components/SearchInput';

const ClientSearch = ({ onSelect, defaultValue }) => {
    const loadClients = async (inputValue) => {
        const clients = await fetchClients({ filter: inputValue });

        if (clients && clients.length > 0) {
            const records = clients.map((record) => {
                const client = {
                    key: record.IdCliente,
                    label: record.name,
                    value: record,
                };
                return client;
            });

            return records;
        }
    };

    const handleSelect = (option, { action }) => {
        if (action === 'select-option') {
            onSelect?.(option.value, action);
        } else if (action === 'clear') {
            onSelect?.(null, action);
        }
    };

    return (
        <SearchInput
            loadOptions={loadClients}
            defaultOptions={false}
            placeholder="Buscar cliente..."
            onSelect={handleSelect}
            defaultValue={defaultValue}
        />
    );
};

export default ClientSearch;
