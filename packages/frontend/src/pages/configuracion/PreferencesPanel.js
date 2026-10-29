import { fetchPreferences, updatePreferences } from 'api/preferences';
import { useAuth } from 'auth/context';
import { ShowNoeContext } from 'context/show_noe';
import useSWR from 'hooks/swr-wrapper';
import { useContext, useEffect, useState } from 'react';
import './preferences.css';

export default function PreferencesPanel() {
    const { can, runPrivileged } = useAuth();
    const editable = can('preferences.read') && can('preferences.update');
    const { preferences: effective, refreshPreferences } = useContext(ShowNoeContext);
    const { data, error, mutate } = useSWR(can('preferences.read') ? '/api/preferences' : null, fetchPreferences);
    const [draft, setDraft] = useState(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [saveError, setSaveError] = useState('');
    const selected = draft?.documentType || data?.documentType;

    useEffect(() => {
        if (data && effective && data.revision !== effective.revision) void mutate();
    }, [data?.revision, effective?.revision, mutate]);

    const save = async (event) => {
        event.preventDefault();
        if (!editable || !draft || saving) return;
        setSaving(true);
        setMessage('');
        setSaveError('');
        try {
            const result = await runPrivileged(() => updatePreferences(draft));
            await mutate(result, false);
            setDraft(null);
            setMessage('Preferencias guardadas. El cambio se aplica a todos los usuarios.');
            await refreshPreferences();
        } catch (failure) {
            if (failure.name === 'AbortError') return;
            if (failure.status === 409) {
                setDraft(null);
                await mutate();
                setSaveError(
                    'Otro administrador modificó las preferencias. Revisa el valor actual antes de volver a guardar.',
                );
            } else {
                setSaveError(failure.message || 'No se pudieron guardar las preferencias.');
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="dashboard-panel system-preferences" aria-labelledby="system-preferences-title">
            <header className="dashboard-panel-header">
                <h3 id="system-preferences-title">Preferencias del sistema</h3>
                {!editable && <span className="system-preferences-badge">Solo lectura</span>}
            </header>
            <div className="dashboard-panel-body system-preferences-body">
                <p className="system-preferences-intro">Configuración compartida por todos los usuarios de DMMarket.</p>
                {error ? (
                    <div role="alert">
                        <p>No se pudieron cargar las preferencias del sistema.</p>
                        <button type="button" className="btn btn-outline-light btn-sm" onClick={() => mutate()}>
                            Reintentar
                        </button>
                    </div>
                ) : !data ? (
                    <p role="status">Cargando preferencias…</p>
                ) : (
                    <form onSubmit={save}>
                        <fieldset disabled={!editable || saving}>
                            <legend>Tipo de documento</legend>
                            <p id="system-document-help" className="system-preferences-description">
                                Define qué documentos consulta el sistema en los reportes de ventas y sus vistas
                                relacionadas. Este cambio afecta a todos los usuarios.
                            </p>
                            <div
                                className="system-document-options"
                                role="radiogroup"
                                aria-label="Tipo de documento"
                                aria-describedby="system-document-help"
                            >
                                {[
                                    ['invoices', 'Facturas'],
                                    ['delivery-notes', 'Notas de entrega'],
                                ].map(([value, label]) => (
                                    <label
                                        key={value}
                                        className={`system-document-option${selected === value ? ' is-selected' : ''}`}
                                    >
                                        <input
                                            type="radio"
                                            name="documentType"
                                            value={value}
                                            checked={selected === value}
                                            onChange={() => {
                                                setDraft({ documentType: value, revision: data.revision });
                                                setMessage('');
                                                setSaveError('');
                                            }}
                                        />
                                        <span>{label}</span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                        {editable && (
                            <div className="system-preferences-actions">
                                <button
                                    className="btn btn-primary"
                                    type="submit"
                                    disabled={saving || !draft || selected === data.documentType}
                                >
                                    {saving ? 'Guardando…' : 'Guardar cambios'}
                                </button>
                                <span>Los cambios se aplican al guardar.</span>
                            </div>
                        )}
                        {message && (
                            <p role="status" className="system-preferences-success">
                                {message}
                            </p>
                        )}
                        {saveError && (
                            <p role="alert" className="system-preferences-error">
                                {saveError}
                            </p>
                        )}
                    </form>
                )}
            </div>
        </section>
    );
}
