import { darkSelectStyles } from 'components/selectStyles';
import { useClientRoutes } from 'hooks/useClients';
import { useMemo } from 'react';
import Select from 'react-select';

export default function RouteFilter({
    value = null,
    onChange,
    inputId,
    placeholder = 'Todas las rutas',
    showNoe = false,
    enabled = true,
}) {
    const { data, error, isLoading } = useClientRoutes(showNoe, enabled);
    const options = useMemo(
        () =>
            (Array.isArray(data) ? data : []).map((route) => ({
                value: route.Id_Ruta,
                label:
                    route.Nombre && route.Nombre !== route.Id_Ruta
                        ? `${route.Nombre} (${route.Id_Ruta})`
                        : route.Id_Ruta,
            })),
        [data],
    );
    return (
        <Select
            inputId={inputId}
            aria-label="Ruta"
            options={options}
            value={options.find((option) => option.value === value?.value) || value}
            onChange={onChange}
            placeholder={placeholder}
            isClearable
            isLoading={isLoading}
            styles={darkSelectStyles}
            classNamePrefix="search-select"
            menuPortalTarget={document.body}
            menuPlacement="auto"
            loadingMessage={() => 'Cargando rutas…'}
            noOptionsMessage={() => (error || data?.error ? 'No se pudieron cargar las rutas' : 'Sin rutas')}
        />
    );
}
