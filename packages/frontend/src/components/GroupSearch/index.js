import { fetchGroups } from 'api/groups';
import SearchInput from 'components/SearchInput';
import { ShowNoeContext } from 'context/show_noe';
import { useContext } from 'react';

const GroupSearch = ({ onSelect, defaultValue }) => {
    const { showNoe } = useContext(ShowNoeContext);

    const loadGroups = async (inputValue) => {
        const groups = await fetchGroups({ filter: inputValue, showNoe });

        if (groups && groups.length > 0) {
            const records = groups.map((record) => {
                const group = {
                    key: record.groupId,
                    label: record.name,
                    value: record,
                };
                return group;
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
        <div style={{ width: '100%' }}>
            <SearchInput
                loadOptions={loadGroups}
                placeholder="Buscar categoría..."
                onSelect={handleSelect}
                isSearchable={false}
                defaultValue={defaultValue}
            />
        </div>
    );
};

export default GroupSearch;
