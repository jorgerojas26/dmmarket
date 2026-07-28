import debounce from 'debounce-promise';
import AsyncSelect from 'react-select/async';

const SearchInput = ({
    placeholder,
    loadOptions,
    defaultOptions = true,
    cacheOptions = true,
    onSelect,
    defaultValue,
}) => {
    return (
        <AsyncSelect
            loadOptions={debounce((inputValue, callback) => loadOptions(inputValue, callback), 700)}
            cacheOptions={cacheOptions}
            defaultOptions={defaultOptions}
            placeholder={placeholder}
            onChange={onSelect ? onSelect : null}
            value={defaultValue}
            loadingMessage={() => 'Cargando...'}
            noOptionsMessage={() => 'Sin resultados'}
            isClearable
            classNamePrefix="search-select"
            menuPortalTarget={document.body}
            menuPlacement="auto"
        />
    );
};

export default SearchInput;
