import { fetchPreferences, updatePreferences } from 'api/preferences';
import { useAuth } from 'auth/context';
import { ShowNoeContext } from 'context/show_noe';
import useSWR from 'hooks/swr-wrapper';
import { useContext, useEffect, useState } from 'react';
import './preferences.css';
import ReportCurrencyPanel from './ReportCurrencyPanel';

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
        <section className="report-settings" aria-labelledby="system-preferences-title">
            <header className="report-settings__header">
                <h1 id="system-preferences-title">Preferencias del sistema</h1>
                <p>Ajustes generales para tu negocio.</p>
                {!editable && <span className="report-settings__badge">Solo lectura</span>}
            </header>
            <section className="report-settings__section">
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
                        <div className="report-settings__row">
                            <div>
                                <h2 id="system-document-label">Tipo de documento</h2>
                                <p id="system-document-help">Los documentos que consultas en los reportes de ventas.</p>
                            </div>
                            <fieldset
                                className="report-settings__currencies"
                                disabled={!editable || saving}
                                aria-busy={saving}
                                aria-labelledby="system-document-label"
                                aria-describedby="system-document-help"
                            >
                                {[
                                    ['invoices', 'Facturas'],
                                    ['delivery-notes', 'Notas de entrega'],
                                ].map(([value, label]) => (
                                    <label key={value} className="report-settings__option">
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
                                        <span>
                                            <strong>{label}</strong>
                                        </span>
                                    </label>
                                ))}
                            </fieldset>
                        </div>
                        {editable && (
                            <footer className="report-settings__footer">
                                <button
                                    className="btn btn-primary btn-sm"
                                    type="submit"
                                    disabled={saving || !draft || selected === data.documentType}
                                >
                                    {saving ? 'Guardando…' : 'Guardar cambios'}
                                </button>
                                {draft && selected !== data.documentType && <span>Cambios sin guardar</span>}
                            </footer>
                        )}
                        {message && (
                            <p role="status" className="report-settings__success">
                                {message}
                            </p>
                        )}
                        {saveError && (
                            <p role="alert" className="report-settings__error">
                                {saveError}
                            </p>
                        )}
                    </form>
                )}
            </section>
            <ReportCurrencyPanel />
        </section>
    );
}
