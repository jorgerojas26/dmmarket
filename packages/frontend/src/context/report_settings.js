import { createContext, useContext, useEffect, useState } from 'react';
import { Alert, Button, Spinner } from 'react-bootstrap';
import { fetcher } from 'swr-config';
import { setReportCurrency } from 'utils/format';

const ReportSettingsContext = createContext();

export const ReportSettingsProvider = ({ children }) => {
    const [settings, setSettings] = useState(null);
    const [error, setError] = useState(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let cancelled = false;
        fetcher('/api/settings')
            .then((result) => {
                if (cancelled) return;
                setReportCurrency(result.reportCurrency);
                setSettings(result);
                setError(null);
            })
            .catch(() => {
                if (!cancelled) setError('No se pudo cargar la moneda de los reportes.');
            });
        return () => {
            cancelled = true;
        };
    }, [attempt]);

    if (error) {
        return (
            <Alert variant="danger" className="m-4">
                {error}{' '}
                <Button
                    onClick={() => {
                        setError(null);
                        setAttempt((value) => value + 1);
                    }}
                >
                    Reintentar
                </Button>
            </Alert>
        );
    }
    if (!settings) return <Spinner animation="border" role="status" aria-label="Cargando configuración" />;
    return <ReportSettingsContext.Provider value={settings}>{children}</ReportSettingsContext.Provider>;
};

export const useReportSettings = () => useContext(ReportSettingsContext);
