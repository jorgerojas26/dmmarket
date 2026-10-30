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

    const save = async (documentType) => {
        if (!editable || saving || !data || documentType === data.documentType) return;
        const selection = { documentType, revision: data.revision };
        setDraft(selection);
        setSaving(true);
        setMessage('');
        setSaveError('');
        try {
            const result = await runPrivileged(() => updatePreferences(selection));
            await mutate(result, false);
            setMessage('Preferencias guardadas. El cambio se aplica a todos los usuarios.');
            await refreshPreferences();
        } catch (failure) {
            if (failure.name === 'AbortError') return;
            if (failure.status === 409) {
                await mutate();
                setSaveError(
                    'Otro administrador modificó las preferencias. Revisa el valor actual y vuelve a seleccionar la opción.',
                );
            } else {
                setSaveError(failure.message || 'No se pudieron guardar las preferencias.');
            }
        } finally {
            setDraft(null);
            setSaving(false);
        }
    };

    return (
        <section className="report-settings" aria-labelledby="system-preferences-title">
            <header className="report-settings__header">
                <h1 id="system-preferences-title">Preferencias del sistema</h1>
                <p>Ajustes generales para tu negocio.</p>
                {!editable && !can('settings.currency.update') && (
                    <span className="report-settings__badge">Solo lectura</span>
                )}
            </header>
            {can('settings.preferences.read') && (
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
                        <>
                            <div className="report-settings__row">
                                <div>
                                    <h2 id="system-document-label">Tipo de documento</h2>
                                    <p id="system-document-help">
                                        Los documentos que consultas en los reportes de ventas.
                                    </p>
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
                                                onChange={() => save(value)}
                                            />
                                            <span>
                                                <strong>{label}</strong>
                                            </span>
                                        </label>
                                    ))}
                                </fieldset>
                            </div>
                            {(saving || message) && (
                                <p
                                    role="status"
                                    className={saving ? 'report-settings__status' : 'report-settings__success'}
                                >
                                    {saving ? 'Guardando…' : message}
                                </p>
                            )}
                            {saveError && (
                                <p role="alert" className="report-settings__error">
                                    {saveError}
                                </p>
                            )}
                        </>
                    )}
                </section>
            )}
            {can('settings.currency.read') && <ReportCurrencyPanel />}
        </section>
    );
}
