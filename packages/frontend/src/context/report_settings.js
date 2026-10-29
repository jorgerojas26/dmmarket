import { createContext, Fragment, useContext, useEffect, useState } from 'react';
import { fetcher } from 'swr-config';
import { setReportCurrency } from 'utils/format';

const ReportSettingsContext = createContext({ loading: true });

export function ReportSettingsProvider({ children, enabled = true }) {
    const [settings, setSettings] = useState(null);
    const [error, setError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let cancelled = false;
        if (enabled) {
            fetcher('/api/settings')
                .then((result) => {
                    if (cancelled) return;
                    if (!['USD', 'Bs'].includes(result?.reportCurrency)) throw new Error('La moneda no es válida.');
                    setReportCurrency(result.reportCurrency);
                    setSettings(result);
                    setError(null);
                })
                .catch((failure) => {
                    if (!cancelled) setError(failure);
                });
        }
        return () => {
            cancelled = true;
        };
    }, [enabled, attempt]);
    useEffect(() => () => setReportCurrency('USD'), []);
    const value = {
        ...settings,
        error,
        loading: !settings && !error,
        refreshSettings: () => {
            setError(null);
            setAttempt((current) => current + 1);
        },
        applySettings: (result) => {
            setReportCurrency(result.reportCurrency);
            setSettings(result);
            setError(null);
        },
    };
    return <ReportSettingsContext.Provider value={value}>{children}</ReportSettingsContext.Provider>;
}

export const useReportSettings = () => useContext(ReportSettingsContext);

export function ReportCurrencyGate({ children }) {
    const { reportCurrency, error, loading, refreshSettings } = useReportSettings();
    if (error)
        return (
            <section className="preferences-recovery" role="alert">
                <h2 className="h4">Moneda no disponible</h2>
                <p>No se pudo cargar la moneda del negocio.</p>
                <button type="button" className="btn btn-outline-light" onClick={refreshSettings}>
                    Reintentar
                </button>
            </section>
        );
    if (loading)
        return (
            <p role="status" className="p-4">
                Cargando moneda…
            </p>
        );
    return <Fragment key={reportCurrency}>{children}</Fragment>;
}
