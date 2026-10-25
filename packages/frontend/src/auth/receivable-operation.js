import { executeReceivableOperation, previewReceivableOperation } from 'api/receivables';
import { today } from 'components/Receivables/format';
import { useEffect, useRef, useState } from 'react';
import { Prompt } from 'react-router-dom';
import { AccessForm, Field } from './forms';

const labels = { payment: 'abono', void: 'anulación', close: 'cierre', reopen: 'reapertura' };

export default function ReceivableOperation({ clientId, operation, onClose, onSaved, onBusyChange }) {
    const [busy, setBusy] = useState(false);
    const mounted = useRef(true);
    useEffect(
        () => () => {
            mounted.current = false;
        },
        [],
    );
    useEffect(() => {
        if (!busy) return undefined;
        const prevent = (event) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', prevent);
        return () => window.removeEventListener('beforeunload', prevent);
    }, [busy]);
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState('USD');
    const [date, setDate] = useState(today());
    const [rate, setRate] = useState('');
    const [method, setMethod] = useState('EFECTIVO');
    const [reference, setReference] = useState('');
    const [bank, setBank] = useState('');
    const [notes, setNotes] = useState('');
    const [reason, setReason] = useState('');
    const [preview, setPreview] = useState(null);
    const [requestId, setRequestId] = useState(() => crypto.randomUUID());
    const payload =
        operation.type === 'payment'
            ? {
                  type: 'payment',
                  amount,
                  currency,
                  date,
                  method,
                  reference,
                  bank,
                  notes,
                  ...(currency === 'BsS' && rate ? { rate } : {}),
              }
            : { type: operation.type, ...(operation.id ? { id: operation.id } : {}), reason };
    const label = labels[operation.type];
    return (
        <section aria-label="Operación autorizada de cobranza" className="card bg-dark border-secondary p-3 my-3">
            <Prompt
                when={busy}
                message="Hay una operación en curso. Espera la confirmación; si sales, revisa el historial antes de volver a registrar el cobro."
            />
            <AccessForm
                title={`Revisar ${label}`}
                button={preview ? `Confirmar ${label}` : `Previsualizar ${label}`}
                onSubmit={async () => {
                    setBusy(true);
                    onBusyChange(true);
                    try {
                        if (!preview) setPreview(await previewReceivableOperation(clientId, payload));
                        else
                            await onSaved(
                                await executeReceivableOperation(clientId, {
                                    ...payload,
                                    requestId,
                                    snapshot: preview.snapshot,
                                }),
                            );
                    } catch (error) {
                        if (error.status === 409) {
                            setPreview(null);
                            setRequestId(crypto.randomUUID());
                        }
                        throw error;
                    } finally {
                        if (mounted.current) setBusy(false);
                        onBusyChange(false);
                    }
                }}
            >
                <fieldset disabled={Boolean(preview)}>
                    {operation.type === 'payment' ? (
                        <>
                            <Field
                                label="Importe del abono"
                                value={amount}
                                onChange={setAmount}
                                inputMode="decimal"
                                maxLength={19}
                            />
                            <label htmlFor="receivable-payment-currency">Moneda del abono</label>
                            <select
                                id="receivable-payment-currency"
                                className="form-select"
                                value={currency}
                                onChange={(event) => setCurrency(event.target.value)}
                            >
                                <option value="USD">USD</option>
                                <option value="BsS">Bolívares</option>
                            </select>
                            <Field label="Fecha del abono" type="date" value={date} onChange={setDate} />
                            {currency === 'BsS' && (
                                <Field
                                    label="Tasa aplicada al abono"
                                    value={rate}
                                    onChange={setRate}
                                    required={date !== today()}
                                    inputMode="decimal"
                                    maxLength={19}
                                />
                            )}
                            <label htmlFor="receivable-payment-method">Método del abono</label>
                            <select
                                id="receivable-payment-method"
                                className="form-select"
                                value={method}
                                onChange={(event) => setMethod(event.target.value)}
                            >
                                {['EFECTIVO', 'TRANSFERENCIA', 'PAGO MOVIL', 'TARJETA', 'OTRO'].map((value) => (
                                    <option key={value} value={value}>
                                        {value}
                                    </option>
                                ))}
                            </select>
                            <Field
                                label="Referencia del abono"
                                value={reference}
                                onChange={setReference}
                                required={false}
                                maxLength={50}
                            />
                            <Field
                                label="Banco del abono"
                                value={bank}
                                onChange={setBank}
                                required={false}
                                maxLength={50}
                            />
                            <Field
                                label="Observaciones del abono"
                                value={notes}
                                onChange={setNotes}
                                required={false}
                                maxLength={250}
                            />
                        </>
                    ) : (
                        <Field
                            label="Motivo de la operación de cobranza"
                            value={reason}
                            onChange={setReason}
                            maxLength={250}
                        />
                    )}
                </fieldset>
                {preview && (
                    <section aria-label="Previsualización de cobranza">
                        <p>Saldo después de confirmar (USD): {preview.balanceAfter}</p>
                        {Object.hasOwn(preview, 'excess') && <p>Excedente no aplicado (USD): {preview.excess}</p>}
                        {preview.rate && <p>Tasa aplicada: {preview.rate}</p>}
                        <table className="table table-dark">
                            <thead>
                                <tr>
                                    <th>Venta</th>
                                    <th>Aplicación USD</th>
                                </tr>
                            </thead>
                            <tbody>
                                {preview.applications.map((row) => (
                                    <tr key={row.id}>
                                        <td>{row.sale}</td>
                                        <td>{row.amount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <button type="button" className="btn btn-outline-light" onClick={() => setPreview(null)}>
                            Editar previsualización
                        </button>
                    </section>
                )}
            </AccessForm>
            <button type="button" className="btn btn-outline-light" onClick={onClose} disabled={busy}>
                Cancelar operación de cobranza
            </button>
        </section>
    );
}
