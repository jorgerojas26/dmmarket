import { fetchReceivables } from 'api/receivables';
import { darkSelectStyles } from 'components/selectStyles';
import { useCallback, useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import AsyncSelect from 'react-select/async';

export default function PaymentClientPicker({ onSelect }) {
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);
    const query = useRef(0);
    useEffect(
        () => () => {
            query.current += 1;
        },
        [],
    );
    const loadOptions = useCallback(async (search) => {
        const current = ++query.current;
        try {
            const result = await fetchReceivables({ search, state: 'debt', page: 1, limit: 20 });
            if (current !== query.current) return [];
            if (!result.writesEnabled) {
                setError('Las escrituras de cuentas por cobrar están deshabilitadas.');
                return [];
            }
            setError('');
            return result.data
                .filter((client) => Number(client.balance) > 0)
                .map((client) => ({ value: client.id, label: `${client.name || client.id} · ${client.id}`, client }));
        } catch (failure) {
            if (current !== query.current) return [];
            setError(failure.message);
            return [];
        }
    }, []);
    return (
        <section className="cxc-payment-picker" aria-label="Seleccionar cliente">
            <label className="form-label" htmlFor="cxc-payment-client">
                Cliente
            </label>
            <AsyncSelect
                key={attempt}
                inputId="cxc-payment-client"
                autoFocus
                defaultOptions
                loadOptions={loadOptions}
                onChange={(option) => {
                    if (option && !error) onSelect(option.client);
                }}
                styles={darkSelectStyles}
                classNamePrefix="search-select"
                placeholder="Buscar por nombre, identificación o RIF…"
                loadingMessage={() => 'Buscando clientes…'}
                noOptionsMessage={() => 'Sin clientes con deuda. Prueba otro nombre o identificación.'}
                menuPlacement="auto"
            />
            <p className="cxc-muted">Busca en todas las rutas, independientemente de los filtros de la cartera.</p>
            {error && (
                <Alert variant="danger" role="alert">
                    {error}
                    <Button
                        variant="link"
                        onClick={() => {
                            setError('');
                            setAttempt((value) => value + 1);
                        }}
                    >
                        Reintentar búsqueda
                    </Button>
                </Alert>
            )}
        </section>
    );
}
