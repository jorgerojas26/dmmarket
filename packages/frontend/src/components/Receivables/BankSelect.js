import { useReceivableBanks } from 'hooks/useReceivables';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';

export default function BankSelect({ value, onChange }) {
    const { data, error, mutate, isValidating } = useReceivableBanks();
    return (
        <>
            <Form.Select value={value} onChange={(event) => onChange(event.target.value)} disabled={!data || !!error}>
                <option value="">
                    {error ? 'Bancos no disponibles' : !data ? 'Cargando bancos…' : 'Seleccionar banco'}
                </option>
                {(data || []).map((bank) => (
                    <option key={bank.id} value={bank.name}>
                        {bank.name}
                    </option>
                ))}
            </Form.Select>
            {error && (
                <div className="cxc-bank-error" role="alert">
                    No se pudo cargar el catálogo de bancos.
                    <Button variant="link" size="sm" disabled={isValidating} onClick={() => mutate()}>
                        Reintentar bancos
                    </Button>
                </div>
            )}
            {data?.length === 0 && !error && <p className="cxc-muted">No hay bancos configurados.</p>}
        </>
    );
}
