import { executeReceivableOperation, previewReceivableOperation } from 'api/receivables';
import { useAuth } from 'auth/context';
import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import { useReceivablesAccess } from './access';
import { money, requestId } from './format';
import './InlineOperationForm.css';

export default function InlineOperationForm({
    client,
    action,
    disabled: parentDisabled,
    discarding = false,
    onCancel,
    onSuccess,
    onBusyChange,
    onDirtyChange,
}) {
    const { runPrivileged } = useAuth();
    const { canOperate } = useReceivablesAccess();
    const disabled = parentDisabled || !canOperate(action.type);
    const closing = action.type === 'close';
    const labels = closing
        ? {
              form: 'Cierre de deuda',
              reason: 'Motivo del cierre',
              placeholder: 'Ej. Redondeo acordado',
              review: 'Revisar cierre',
              confirm: 'Confirmar cierre',
          }
        : {
              form: 'Anulación de abono',
              reason: 'Motivo de anulación',
              placeholder: 'Ej. Abono duplicado',
              review: 'Revisar anulación',
              confirm: 'Confirmar anulación',
          };
    const [reason, setReason] = useState('');
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const inFlight = useRef(false);
    const mounted = useRef(true);
    const id = useRef(requestId());
    const reasonInput = useRef(null);
    const confirmButton = useRef(null);
    const errorElement = useRef(null);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    useEffect(() => {
        if (busy || disabled || discarding) return;
        if (error) errorElement.current?.focus();
        else if (preview) confirmButton.current?.focus();
        else reasonInput.current?.focus();
    }, [busy, disabled, discarding, error, preview]);
    const submit = async (submitEvent) => {
        submitEvent.preventDefault();
        if (inFlight.current || disabled || discarding || !reason.trim()) return;
        inFlight.current = true;
        setBusy(true);
        onBusyChange(true);
        setError('');
        const payload = { type: action.type, id: action.id, reason: reason.trim() };
        try {
            if (!preview) {
                const reviewed = await previewReceivableOperation(client.id, payload);
                if (mounted.current) setPreview(reviewed);
            } else {
                const saved = await runPrivileged(() =>
                    executeReceivableOperation(client.id, {
                        ...payload,
                        snapshot: preview.snapshot,
                        requestId: id.current,
                    }),
                );
                onDirtyChange(false);
                await onSuccess(saved);
            }
        } catch (failure) {
            if (mounted.current) {
                setError(failure.message);
                if (failure.status === 409) {
                    setPreview(null);
                    id.current = requestId();
                }
            }
        } finally {
            inFlight.current = false;
            if (mounted.current) setBusy(false);
            onBusyChange(false);
        }
    };
    return (
        <Form className="cxc-inline-operation" aria-label={labels.form} onSubmit={submit}>
            <Form.Group controlId="cxc-inline-reason">
                <Form.Label>{labels.reason}</Form.Label>
                <Form.Control
                    ref={reasonInput}
                    size="sm"
                    required
                    maxLength={250}
                    placeholder={labels.placeholder}
                    value={reason}
                    disabled={busy || disabled || discarding}
                    onChange={(changeEvent) => {
                        const value = changeEvent.target.value;
                        setReason(value);
                        onDirtyChange(value !== '');
                        setPreview(null);
                        setError('');
                        id.current = requestId();
                    }}
                />
            </Form.Group>
            {preview && (
                <div
                    className="cxc-inline-impact"
                    role="status"
                    aria-label={closing ? 'Impacto del cierre' : 'Impacto de la anulación'}
                >
                    {closing && (
                        <span>
                            Cerrar <strong>{money(preview.base)} USD</strong> sin recibir dinero.
                        </span>
                    )}
                    <span>
                        {closing ? 'Saldo cliente USD' : 'Saldo USD'}: <strong>{money(preview.balanceBefore)}</strong> →{' '}
                        <strong>{money(preview.balanceAfter)}</strong>
                    </span>
                    {!closing && (
                        <>
                            <span>+{money(preview.restored)} pendiente</span>
                            {preview.base !== preview.restored && <small>El excedente no aumenta la deuda.</small>}
                            {Number(preview.restored) === 0 && <small>Sin aplicaciones: el saldo no cambia.</small>}
                        </>
                    )}
                </div>
            )}
            {error && (
                <Alert ref={errorElement} tabIndex={-1} variant="danger" role="alert">
                    {error}
                    {preview && <span> Reintenta esta confirmación; no se duplicará.</span>}
                </Alert>
            )}
            <div className="cxc-inline-actions">
                <Button size="sm" variant="link" disabled={busy || discarding} onClick={onCancel}>
                    Cancelar
                </Button>
                <Button
                    ref={confirmButton}
                    size="sm"
                    type="submit"
                    variant={preview ? (closing ? 'warning' : 'danger') : 'outline-secondary'}
                    disabled={busy || disabled || discarding || !reason.trim()}
                >
                    {busy ? (
                        <>
                            <Spinner animation="border" size="sm" aria-hidden="true" /> Procesando…
                        </>
                    ) : preview ? (
                        labels.confirm
                    ) : (
                        labels.review
                    )}
                </Button>
            </div>
        </Form>
    );
}
