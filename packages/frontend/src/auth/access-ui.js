import Modal from 'components/Modal';
import { useEffect, useState } from 'react';
import { useAuth } from './context';

export function useDiscardChanges(dirty) {
    const [pending, setPending] = useState(null);
    useEffect(() => {
        if (!dirty) return undefined;
        const prevent = (event) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', prevent);
        return () => window.removeEventListener('beforeunload', prevent);
    }, [dirty]);
    return {
        requestClose: (close) => {
            if (dirty) setPending(() => close);
            else close();
        },
        confirmation: (
            <Modal
                show={Boolean(pending)}
                onHide={() => setPending(null)}
                centered
                className="access-surface"
                aria-labelledby="discard-access-title"
            >
                <Modal.Header closeButton closeLabel="Cerrar">
                    <Modal.Title id="discard-access-title">¿Descartar los cambios?</Modal.Title>
                </Modal.Header>
                <Modal.Body>Los cambios que no has guardado se perderán.</Modal.Body>
                <Modal.Footer>
                    <button type="button" className="btn btn-outline-light" onClick={() => setPending(null)}>
                        Seguir editando
                    </button>
                    <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => {
                            const close = pending;
                            setPending(null);
                            close();
                        }}
                    >
                        Descartar cambios
                    </button>
                </Modal.Footer>
            </Modal>
        ),
    };
}

let dialogSequence = 0;

export function AccessDialog({ title, children, onClose, dirty = false, busy = false, panel = false }) {
    const [titleId] = useState(() => `access-dialog-${++dialogSequence}`);
    const { requestClose, confirmation } = useDiscardChanges(dirty);
    const close = () => {
        if (!busy) requestClose(onClose);
    };
    return (
        <>
            <Modal
                show
                onHide={close}
                backdrop="static"
                centered={!panel}
                className={`access-surface${panel ? ' access-panel' : ''}`}
                aria-labelledby={titleId}
            >
                <Modal.Header closeButton={!busy} closeLabel="Cerrar">
                    <Modal.Title id={titleId}>{title}</Modal.Title>
                </Modal.Header>
                <Modal.Body>{children}</Modal.Body>
            </Modal>
            {confirmation}
        </>
    );
}

export function ManagementForm({ children, onSubmit, button, disabled = false, onCancel, onBusyChange }) {
    const { runPrivileged } = useAuth();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const submit = async (event) => {
        event.preventDefault();
        setError('');
        setBusy(true);
        onBusyChange?.(true);
        try {
            await runPrivileged(onSubmit);
        } catch (failure) {
            if (failure.name !== 'AbortError')
                setError(`${failure.message}${failure.retryAfter ? ` Espera ${failure.retryAfter} segundos.` : ''}`);
        } finally {
            setBusy(false);
            onBusyChange?.(false);
        }
    };
    return (
        <form onSubmit={submit} method="post">
            <fieldset disabled={busy}>
                {children}
                {error && (
                    <p role="alert" className="access-error">
                        {error}
                    </p>
                )}
                <div className="access-form-actions">
                    {onCancel && (
                        <button type="button" className="btn btn-outline-light" onClick={onCancel}>
                            Cancelar
                        </button>
                    )}
                    <button type="submit" className="btn btn-primary" disabled={disabled}>
                        {busy ? 'Guardando…' : button}
                    </button>
                </div>
            </fieldset>
        </form>
    );
}

export function LoadState({ error, loading, onRetry, children }) {
    if (error)
        return (
            <div role="alert" className="access-empty access-error">
                <p>No se pudo cargar la información.</p>
                <button type="button" className="btn btn-outline-light" onClick={() => onRetry()}>
                    Reintentar
                </button>
            </div>
        );
    if (loading)
        return (
            <p role="status" className="access-empty">
                Cargando…
            </p>
        );
    return children;
}

export function Pagination({ page, total, onChange, limit = 100 }) {
    return (
        <div className="access-pagination">
            <span>
                {total ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} de ${total}` : '0 resultados'}
            </span>
            <div>
                <button
                    type="button"
                    className="btn btn-outline-light"
                    aria-label="Página anterior"
                    disabled={page === 1}
                    onClick={() => onChange(page - 1)}
                >
                    ‹
                </button>
                <button
                    type="button"
                    className="btn btn-outline-light"
                    aria-label="Página siguiente"
                    disabled={page * limit >= total}
                    onClick={() => onChange(page + 1)}
                >
                    ›
                </button>
            </div>
        </div>
    );
}
