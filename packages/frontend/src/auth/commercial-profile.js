import SearchInput from 'components/SearchInput';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { useAuth } from './context';
import { authRequest } from './transport';

export function SellerSelect({
    inputId,
    value,
    onChange,
    userId,
    compact = false,
    placeholder = 'Sin perfil comercial',
    disabled = false,
}) {
    const [error, setError] = useState('');
    const loadOptions = useCallback(
        async (input) => {
            try {
                const owner = userId ? `&userId=${encodeURIComponent(userId)}` : '';
                const result = await fetcher(`/api/auth/seller-options?search=${encodeURIComponent(input)}${owner}`);
                return result.data.map((seller) => ({ value: seller.id, label: seller.name || seller.id }));
            } catch (failure) {
                setError('No se pudieron cargar los vendedores.');
                throw failure;
            }
        },
        [userId],
    );
    return (
        <>
            <SearchInput
                inputId={inputId}
                variant={compact ? 'compact' : 'form'}
                ariaLabel="Perfil comercial"
                placeholder={placeholder}
                loadOptions={loadOptions}
                defaultOptions
                defaultValue={value}
                onSelect={(option) => {
                    setError('');
                    onChange(option ? { value: option.value, label: option.label } : null);
                }}
                disabled={disabled}
            />
            {error && (
                <p role="alert" className="access-error">
                    {error}
                </p>
            )}
        </>
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
                        <SellerSelect
                            value={currentOption}
                            onChange={setDraft}
                            userId={id}
                            compact
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
