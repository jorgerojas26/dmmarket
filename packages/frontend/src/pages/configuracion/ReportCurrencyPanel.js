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
    const save = async (value) => {
        if (!editable || saving || value === settings.reportCurrency) return;
        setDraft(value);
        setSaving(true);
        setError('');
        setMessage('');
        try {
            const result = await runPrivileged(() =>
                fetcher('/api/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reportCurrency: value }),
                }),
            );
            settings.applySettings(result);
            setMessage('Moneda guardada. No se han convertido los importes.');
        } catch (failure) {
            if (failure.name !== 'AbortError') setError(failure.message || 'No se pudo guardar la moneda.');
        } finally {
            setDraft(null);
            setSaving(false);
        }
    };
    return (
        <section className="report-settings__section" aria-labelledby="report-currency-title">
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
                        {['USD', 'Bs'].map((value) => (
                            <label className="report-settings__option" key={value}>
                                <input
                                    type="radio"
                                    name="report-currency"
                                    value={value}
                                    checked={currency === value}
                                    onChange={() => save(value)}
                                />
                                <span>
                                    <strong>{value}</strong>
                                </span>
                            </label>
                        ))}
                    </fieldset>
                )}
            </div>
            {(saving || message) && (
                <p role="status" className={saving ? 'report-settings__status' : 'report-settings__success'}>
                    {saving ? 'Guardando…' : message}
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
