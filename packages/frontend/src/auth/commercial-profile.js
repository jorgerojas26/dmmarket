import SearchInput from 'components/SearchInput';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { LoadState, Pagination } from './access-ui';
import { useAuth } from './context';
import { authRequest } from './transport';

export function CommercialIdentityField({ value, onChange, userId, required = false }) {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const owner = userId ? `&userId=${encodeURIComponent(userId)}` : '';
    const options = useSWR(
        `/api/auth/seller-options?search=${encodeURIComponent(search)}&page=${page}${owner}`,
        fetcher,
    );
    const selected = useSWR(
        value ? `/api/auth/seller-options?ids=${encodeURIComponent(value)}${owner}` : null,
        fetcher,
    );
    return (
        <div className="access-commercial-identity">
            <label className="form-label" htmlFor="commercial-seller">
                Perfil comercial
            </label>
            <input
                type="search"
                className="form-control mb-2"
                aria-label="Buscar identidad comercial"
                placeholder="Buscar por nombre o código…"
                value={search}
                onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                }}
            />
            <select
                id="commercial-seller"
                className="form-select"
                name="sellerId"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                required={required}
            >
                <option value="">{required ? 'Selecciona un vendedor' : 'Sin perfil comercial'}</option>
                {value && !options.data?.data.some((seller) => seller.id === value) && (
                    <option value={value}>
                        {selected.data?.data[0]?.name || value} · {value}
                    </option>
                )}
                {options.data?.data.map((seller) => (
                    <option key={seller.id} value={seller.id}>
                        {seller.name || 'Sin nombre'} · {seller.id}
                    </option>
                ))}
            </select>
            <LoadState error={options.error} loading={!options.data} onRetry={options.mutate}>
                {options.data?.total > 100 && <Pagination page={page} total={options.data.total} onChange={setPage} />}
            </LoadState>
        </div>
    );
}

export function CommercialIdentity({ id, disabled = false, onDirtyChange, onBusyChange }) {
    const { can, check, runPrivileged } = useAuth();
    const { data, error, mutate } = useSWR(
        can('access.profile.read') ? `/api/auth/users/${id}/commercial-profile` : null,
        fetcher,
    );
    const [draft, setDraft] = useState(undefined);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [failure, setFailure] = useState('');
    const savedOption = data?.sellerId ? { value: data.sellerId, label: data.name || data.sellerId } : null;
    const currentOption = draft === undefined ? savedOption : draft;
    const current = currentOption?.value ?? null;
    const changed = current !== (savedOption?.value ?? null);
    const loadOptions = useCallback(
        async (input) => {
            const result = await fetcher(
                `/api/auth/seller-options?search=${encodeURIComponent(input)}&userId=${encodeURIComponent(id)}`,
            );
            return result.data.map((seller) => ({ value: seller.id, label: seller.name || seller.id }));
        },
        [id],
    );
    useEffect(() => {
        onDirtyChange(changed);
    }, [changed, onDirtyChange]);
    const discard = () => {
        setDraft(undefined);
        setFailure('');
        setMessage('');
    };
    const submit = async (event) => {
        event.preventDefault();
        setFailure('');
        setMessage('');
        setBusy(true);
        onBusyChange(true);
        try {
            const profile = await runPrivileged(() =>
                authRequest(`users/${id}/commercial-profile`, { sellerId: current }, 'PUT'),
            );
            await mutate(profile, false);
            setDraft(undefined);
            setMessage('Perfil comercial guardado. Se cerraron las sesiones de la cuenta.');
            await check(false);
        } catch (error) {
            if (error.name !== 'AbortError')
                setFailure(`${error.message}${error.retryAfter ? ` Espera ${error.retryAfter} segundos.` : ''}`);
        } finally {
            setBusy(false);
            onBusyChange(false);
        }
    };
    if (error)
        return (
            <section className="access-commercial" aria-label="Identidad comercial de la cuenta">
                <span className="access-commercial-label">Identidad comercial</span>
                <button type="button" className="btn btn-outline-light btn-sm" onClick={() => mutate()}>
                    Reintentar
                </button>
            </section>
        );
    return (
        <section className="access-commercial" aria-label="Identidad comercial de la cuenta">
            <span className="access-commercial-label">Identidad comercial</span>
            {can('access.profile.update') ? (
                <form className="access-commercial-form" onSubmit={submit}>
                    <div className="access-commercial-select">
                        <SearchInput
                            ariaLabel="Perfil comercial"
                            placeholder="Sin perfil comercial"
                            loadOptions={loadOptions}
                            defaultOptions
                            defaultValue={currentOption}
                            onSelect={(option) =>
                                setDraft(option ? { value: option.value, label: option.label } : null)
                            }
                            disabled={disabled || busy}
                        />
                    </div>
                    {changed && (
                        <div className="access-commercial-actions">
                            <button type="button" className="btn btn-outline-light btn-sm" onClick={discard}>
                                Descartar
                            </button>
                            <button type="submit" className="btn btn-primary btn-sm" disabled={disabled || busy}>
                                {busy ? 'Guardando…' : 'Guardar'}
                            </button>
                        </div>
                    )}
                </form>
            ) : (
                <span className="access-commercial-value">{data?.name || 'Sin perfil comercial'}</span>
            )}
            {failure && (
                <p role="alert" className="access-error">
                    {failure}
                </p>
            )}
            {message && (
                <p role="status" className="access-success">
                    {message}
                </p>
            )}
        </section>
    );
}
