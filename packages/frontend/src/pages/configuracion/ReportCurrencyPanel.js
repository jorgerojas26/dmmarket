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
        <section className="dashboard-panel system-preferences mt-4" aria-labelledby="report-currency-title">
            <header className="dashboard-panel-header">
                <h3 id="report-currency-title">Moneda del negocio</h3>
                {!editable && <span className="system-preferences-badge">Solo lectura</span>}
            </header>
            <div className="dashboard-panel-body system-preferences-body">
                {settings.error ? (
                    <div role="alert">
                        <p>No se pudo cargar la moneda.</p>
                        <button type="button" className="btn btn-outline-light" onClick={settings.refreshSettings}>
                            Reintentar
                        </button>
                    </div>
                ) : settings.loading ? (
                    <p role="status">Cargando moneda…</p>
                ) : (
                    <form onSubmit={save}>
                        <fieldset disabled={!editable || saving}>
                            <legend className="visually-hidden">Moneda del negocio</legend>
                            <div className="system-document-options">
                                {[
                                    ['USD', 'Dólares'],
                                    ['Bs', 'Bolívares'],
                                ].map(([value, label]) => (
                                    <label
                                        key={value}
                                        className={`system-document-option${currency === value ? ' is-selected' : ''}`}
                                    >
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
                                            {value} {label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                            <p className="system-preferences-description mt-3">
                                Define la moneda de los importes originales. No modifica datos ni la cobranza; la
                                conversión al imprimir es opcional.
                            </p>
                        </fieldset>
                        {editable && (
                            <div className="system-preferences-actions">
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={saving || !draft || draft === settings.reportCurrency}
                                >
                                    {saving ? 'Guardando…' : 'Guardar moneda'}
                                </button>
                            </div>
                        )}
                    </form>
                )}
                {message && (
                    <p role="status" className="system-preferences-success">
                        {message}
                    </p>
                )}
                {error && (
                    <p role="alert" className="system-preferences-error">
                        {error}
                    </p>
                )}
            </div>
        </section>
    );
}
