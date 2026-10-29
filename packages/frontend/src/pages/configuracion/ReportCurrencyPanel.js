import { useAuth } from 'auth/context';
import { useReportSettings } from 'context/report_settings';
import { useState } from 'react';
import { fetcher } from 'swr-config';

export default function ReportCurrencyPanel() {
    const { can, runPrivileged } = useAuth();
    const settings = useReportSettings();
    const editable = can('preferences.read') && can('preferences.update');
    const [draft, setDraft] = useState(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const currency = draft || settings.reportCurrency;
    const changed = currency !== settings.reportCurrency;
    const save = async (event) => {
        event.preventDefault();
        if (!editable || saving || !draft) return;
        setSaving(true);
        setError('');
        setMessage('');
        try {
            const result = await runPrivileged(() =>
                fetcher('/api/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reportCurrency: currency }),
                }),
            );
            settings.applySettings(result);
            setDraft(null);
            setMessage('Moneda guardada. No se han convertido los importes.');
        } catch (failure) {
            if (failure.name !== 'AbortError') setError(failure.message || 'No se pudo guardar la moneda.');
        } finally {
            setSaving(false);
        }
    };
    return (
        <section className="report-settings__section" aria-labelledby="report-currency-title">
            <form onSubmit={save}>
                <div className="report-settings__row">
                    <div>
                        <h2 id="report-currency-title">Moneda del negocio</h2>
                        <p id="report-currency-help">La moneda en la que registras precios y costos.</p>
                    </div>
                    {settings.error ? (
                        <div role="alert">
                            <p>No se pudo cargar la moneda.</p>
                            <button
                                type="button"
                                className="btn btn-outline-light btn-sm"
                                onClick={settings.refreshSettings}
                            >
                                Reintentar
                            </button>
                        </div>
                    ) : settings.loading ? (
                        <p role="status">Cargando moneda…</p>
                    ) : (
                        <fieldset
                            className="report-settings__currencies"
                            disabled={!editable || saving}
                            aria-busy={saving}
                            aria-labelledby="report-currency-title"
                            aria-describedby="report-currency-help"
                        >
                            {[
                                ['USD', 'Dólares'],
                                ['Bs', 'Bolívares'],
                            ].map(([value, label]) => (
                                <label className="report-settings__option" key={value}>
                                    <input
                                        type="radio"
                                        name="report-currency"
                                        value={value}
                                        checked={currency === value}
                                        onChange={() => {
                                            setDraft(value);
                                            setMessage('');
                                            setError('');
                                        }}
                                    />
                                    <span>
                                        <strong>{value}</strong>
                                        <small>{label}</small>
                                    </span>
                                </label>
                            ))}
                        </fieldset>
                    )}
                </div>
                {!settings.error && !settings.loading && editable && (
                            <footer className="report-settings__footer">
                                <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !changed}>
                                    {saving ? 'Guardando…' : 'Guardar moneda'}
                                </button>
                                {changed && <span>Cambios sin guardar</span>}
                            </footer>
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
            </form>
        </section>
    );
}
