import { useEffect, useState } from 'react';
import { Prompt } from 'react-router-dom';
import { fetcher } from 'swr-config';
import { AccessForm, Field, ReauthenticationForm } from './forms';

export default function CommissionEditor({ employeeId, groups, onSaved }) {
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!busy) return undefined;
        const prevent = (event) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', prevent);
        return () => window.removeEventListener('beforeunload', prevent);
    }, [busy]);
    const [groupId, setGroup] = useState('');
    const [rate, setRate] = useState('');
    const [reason, setReason] = useState('');
    const [preview, setPreview] = useState(null);
    const [requestId, setRequestId] = useState(() => crypto.randomUUID());
    const [receipt, setReceipt] = useState(null);
    const body = { commissionInfo: { [groupId]: rate }, reason };
    return (
        <section aria-label="Edición autorizada de comisiones" className="my-3">
            <Prompt
                when={busy}
                message="Hay un cambio de porcentaje en curso. Espera su confirmación y revisa el porcentaje actual antes de repetirlo."
            />
            <ReauthenticationForm />
            <AccessForm
                title="Editar porcentaje actual"
                button={preview ? 'Confirmar porcentaje' : 'Previsualizar porcentaje'}
                onSubmit={async () => {
                    setBusy(true);
                    try {
                        if (!preview)
                            setPreview(
                                await fetcher(
                                    `/api/employees/commissionInfo/${encodeURIComponent(employeeId)}/preview`,
                                    {
                                        method: 'POST',
                                        headers: { 'content-type': 'application/json' },
                                        body: JSON.stringify(body),
                                    },
                                ),
                            );
                        else {
                            const result = await fetcher(
                                `/api/employees/commissionInfo/${encodeURIComponent(employeeId)}`,
                                {
                                    method: 'PUT',
                                    headers: { 'content-type': 'application/json' },
                                    body: JSON.stringify({ ...body, requestId, snapshot: preview.snapshot }),
                                },
                            );
                            await onSaved();
                            setReceipt(result);
                            setPreview(null);
                            setRequestId(crypto.randomUUID());
                        }
                    } catch (error) {
                        if (error.status === 409) {
                            setPreview(null);
                            setRequestId(crypto.randomUUID());
                        }
                        throw error;
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                <fieldset disabled={Boolean(preview)}>
                    <label htmlFor="commission-edit-group">Grupo del porcentaje</label>
                    <select
                        id="commission-edit-group"
                        className="form-select"
                        value={groupId}
                        onChange={(event) => {
                            const id = event.target.value;
                            setGroup(id);
                            setRate(String(groups.find((group) => group.groupId === id)?.commission ?? ''));
                        }}
                        required
                    >
                        <option value="">Seleccionar grupo</option>
                        {groups.map((group) => (
                            <option key={group.groupId} value={group.groupId}>
                                {group.group}
                            </option>
                        ))}
                    </select>
                    <Field
                        label="Nuevo porcentaje de comisión"
                        value={rate}
                        onChange={setRate}
                        inputMode="decimal"
                        maxLength={8}
                    />
                    <Field
                        label="Motivo del cambio de porcentaje"
                        value={reason}
                        onChange={setReason}
                        minLength={5}
                        maxLength={250}
                    />
                </fieldset>
                {preview && (
                    <section aria-label="Previsualización del porcentaje">
                        <table className="table table-dark">
                            <thead>
                                <tr>
                                    <th>Grupo</th>
                                    <th>Anterior</th>
                                    <th>Nuevo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {preview.changes.map((row) => (
                                    <tr key={row.groupId}>
                                        <td>{row.groupId}</td>
                                        <td>{row.before ?? 'Sin configuración anterior'}</td>
                                        <td>{row.after}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <button type="button" className="btn btn-outline-light" onClick={() => setPreview(null)}>
                            Editar cambio de porcentaje
                        </button>
                    </section>
                )}
            </AccessForm>
            <p>
                Los cambios afectan porcentajes actuales para futuras capturas. No se modifican los porcentajes
                históricos ya capturados.
            </p>
            {receipt && (
                <p role="status">
                    Porcentaje registrado: {receipt.operationId}; usuario responsable: {receipt.actorId}
                </p>
            )}
        </section>
    );
}
