import { useReportSettings } from 'context/report_settings';
import { useState } from 'react';
import { Button } from 'react-bootstrap';
import { fetcher } from 'swr-config';

const PreferencesPanel = () => {
    const settings = useReportSettings();
    const [currency, setCurrency] = useState(settings.reportCurrency);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const changed = currency !== settings.reportCurrency;

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        try {
            await fetcher('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reportCurrency: currency }),
            });
            window.location.reload();
        } catch {
            setError('No se pudo guardar la moneda. Intenta nuevamente.');
            setSaving(false);
        }
    };

    return (
        <section className="report-settings" aria-labelledby="preferences-title">
            <header className="report-settings__header">
                <h1 id="preferences-title">Preferencias</h1>
                <p>Ajustes generales para tu negocio.</p>
            </header>
            <form onSubmit={save}>
                <div className="report-settings__row">
                    <div>
                        <h2 id="report-currency-label">Moneda del negocio</h2>
                        <p id="report-currency-help">La moneda en la que registras precios y costos.</p>
                    </div>
                    <fieldset
                        className="report-settings__currencies"
                        aria-labelledby="report-currency-label"
                        aria-describedby="report-currency-help"
                    >
                        {[
                            { value: 'USD', label: 'Dólares' },
                            { value: 'Bs', label: 'Bolívares' },
                        ].map((option) => (
                            <label className="report-settings__option" key={option.value}>
                                <input
                                    type="radio"
                                    name="report-currency"
                                    value={option.value}
                                    checked={currency === option.value}
                                    onChange={() => setCurrency(option.value)}
                                    disabled={saving}
                                />
                                <span>
                                    <strong>{option.value}</strong>
                                    <small>{option.label}</small>
                                </span>
                            </label>
                        ))}
                    </fieldset>
                </div>
                <div className="report-settings__preview" aria-live="polite">
                    <span>Así se verán los importes</span>
                    <strong>{currency} 1.234,56</strong>
                </div>
                <p className="report-settings__note">
                    Se aplica a pantallas y exportaciones. No convierte importes ni modifica los datos originales o la
                    cobranza.
                </p>
                {error && (
                    <p className="report-settings__error" role="alert">
                        {error}
                    </p>
                )}
                <footer className="report-settings__footer">
                    <Button type="submit" size="sm" disabled={saving || !changed}>
                        {saving ? 'Guardando…' : 'Guardar cambios'}
                    </Button>
                    {changed && <span>Cambios sin guardar</span>}
                </footer>
            </form>
        </section>
    );
};

export default PreferencesPanel;
