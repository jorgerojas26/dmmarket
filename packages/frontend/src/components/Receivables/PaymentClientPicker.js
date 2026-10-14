import { fetchReceivables } from 'api/receivables';
import { darkSelectStyles } from 'components/selectStyles';
import { useCallback, useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import AsyncSelect from 'react-select/async';
import { money } from './format';
import 'components/ClientDashboardModal/styles.css';

export default function PaymentClientPicker({ onClose, onSelect }) {
    const [selected, setSelected] = useState(null);
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
                setSelected(null);
                return [];
            }
            setError('');
            return result.data
                .filter((client) => Number(client.balance) > 0)
                .map((client) => ({ value: client.id, label: `${client.name || client.id} · ${client.id}`, client }));
        } catch (failure) {
            if (current !== query.current) return [];
            setError(failure.message);
            setSelected(null);
            return [];
        }
    }, []);
    return (
        <Modal
            show
            onHide={onClose}
            centered
            className="cxc-modal cxc-picker client-dashboard-modal"
            aria-labelledby="cxc-picker-title"
        >
            <Modal.Header closeButton closeLabel="Cerrar selección de cliente">
                <Modal.Title id="cxc-picker-title">Registrar abono</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <p className="cxc-muted mb-0">
                    Selecciona un cliente con saldo pendiente. La búsqueda incluye todas las rutas, no solo la tabla
                    actual.
                </p>
                <label className="text-light" htmlFor="cxc-payment-client">
                    Cliente
                </label>
                <AsyncSelect
                    key={attempt}
                    inputId="cxc-payment-client"
                    autoFocus
                    defaultOptions
                    loadOptions={loadOptions}
                    value={selected}
                    onChange={setSelected}
                    isClearable
                    styles={darkSelectStyles}
                    classNamePrefix="search-select"
                    placeholder="Buscar por nombre, identificación o RIF…"
                    loadingMessage={() => 'Buscando clientes…'}
                    noOptionsMessage={() => 'Sin clientes con deuda. Prueba otro nombre o identificación.'}
                    menuPortalTarget={document.body}
                    menuPlacement="auto"
                />
                {selected && (
                    <p className="cxc-muted mb-0">
                        Saldo pendiente: {money(selected.client.balance)} · Ruta {selected.client.ruta || '—'}
                    </p>
                )}
                {error && (
                    <Alert variant="danger" role="alert">
                        {error}
                        <Button
                            variant="link"
                            onClick={() => {
                                setError('');
                                setSelected(null);
                                setAttempt((value) => value + 1);
                            }}
                        >
                            Reintentar búsqueda
                        </Button>
                    </Alert>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button variant="outline-secondary" onClick={onClose}>
                    Cancelar
                </Button>
                <Button disabled={!selected || !!error} onClick={() => onSelect(selected.client)}>
                    Continuar
                </Button>
            </Modal.Footer>
        </Modal>
    );
}
