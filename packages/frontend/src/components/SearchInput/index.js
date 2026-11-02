import { useDarkSelectStyles } from 'components/selectStyles';
import debounce from 'debounce-promise';
import { useMemo } from 'react';
import AsyncSelect from 'react-select/async';

const SearchInput = ({
    placeholder,
    loadOptions,
    defaultOptions = true,
    cacheOptions = true,
    onSelect,
    defaultValue,
    debounceMs = 700,
    ariaLabel,
    inputId,
    variant,
    disabled = false,
}) => {
    const customStyles = useDarkSelectStyles(variant);
    const debouncedLoadOptions = useMemo(
        () => debounce((inputValue, callback) => loadOptions(inputValue, callback), debounceMs),
        [loadOptions, debounceMs],
    );

    return (
        <AsyncSelect
            loadOptions={debouncedLoadOptions}
            cacheOptions={cacheOptions}
            defaultOptions={defaultOptions}
            placeholder={placeholder}
            onChange={onSelect ? onSelect : null}
            value={defaultValue}
            loadingMessage={() => 'Cargando...'}
            noOptionsMessage={() => 'Sin resultados'}
            isClearable
            isDisabled={disabled}
            aria-label={ariaLabel}
            inputId={inputId}
            classNamePrefix="search-select"
            styles={customStyles}
            menuPortalTarget={document.body}
            menuPlacement="auto"
        />
    );
};

export default SearchInput;
