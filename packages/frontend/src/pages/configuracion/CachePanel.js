import { useAuth } from 'auth/context';
import { useState } from 'react';
import { fetcher } from 'swr-config';

export default function CachePanel() {
    const { can, runPrivileged } = useAuth();
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const refresh = async () => {
        if (saving) return;
        setSaving(true);
        setMessage('');
        setError('');
        try {
            await runPrivileged(() =>
                fetcher('/api/cache/clear', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ confirmed: true }),
                }),
            );
            setMessage('Los próximos reportes se consultarán de nuevo.');
        } catch (failure) {
            if (failure.name !== 'AbortError') setError(failure.message);
        } finally {
            setSaving(false);
        }
    };
    return (
        <section className="report-settings" aria-labelledby="report-cache-title">
            <header className="report-settings__header">
                <h1 id="report-cache-title">Caché de reportes</h1>
            </header>
            {can('settings.cache.clear') && (
                <button type="button" className="btn btn-primary" disabled={saving} onClick={refresh}>
                    {saving ? 'Actualizando…' : 'Actualizar reportes'}
                </button>
            )}
            {message && (
                <p role="status" className="report-settings__success">
                    {message}
                </p>
            )}
            {error && (
                <p role="alert" className="report-settings__error">
                    {error}
                </p>
            )}
        </section>
    );
}
