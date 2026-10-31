import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { LoadState, ManagementForm, Pagination } from './access-ui';
import { useAuth } from './context';
import { Field } from './forms';
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

export function CommercialProfileForm({ id, initial, onDirtyChange, onBusyChange, onSaved }) {
    const { check } = useAuth();
    const [selected, setSelected] = useState(initial?.sellerId || '');
    const [saved, setSaved] = useState(initial?.sellerId || '');
    const [reason, setReason] = useState('');
    const [message, setMessage] = useState('');
    const changed = selected !== saved;
    useEffect(() => {
        if (!changed && !reason) {
            setSelected(initial?.sellerId || '');
            setSaved(initial?.sellerId || '');
        }
    }, [initial, changed, reason]);
    useEffect(() => {
        onDirtyChange(changed || Boolean(reason));
    }, [changed, reason, onDirtyChange]);
    return (
        <section className="access-assignment" aria-label="Identidad comercial de la cuenta">
            <h3>Perfil comercial</h3>
            <ManagementForm
                button="Guardar perfil comercial"
                disabled={!changed}
                onBusyChange={onBusyChange}
                onSubmit={async () => {
                    const profile = await authRequest(
                        `users/${id}/commercial-profile`,
                        { sellerId: selected || null, reason },
                        'PUT',
                    );
                    await onSaved(profile);
                    setSaved(selected);
                    setReason('');
                    setMessage('Perfil comercial guardado. Se cerraron las sesiones de la cuenta.');
                    await check(false);
                }}
            >
                <CommercialIdentityField value={selected} onChange={setSelected} userId={id} />
                <Field
                    label="Motivo del cambio de identidad"
                    value={reason}
                    onChange={setReason}
                    minLength={5}
                    maxLength={64}
                />
                {message && (
                    <p role="status" className="access-success">
                        {message}
                    </p>
                )}
            </ManagementForm>
        </section>
    );
}
