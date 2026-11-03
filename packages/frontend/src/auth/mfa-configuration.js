import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import { AccessDialog, ManagementForm } from './access-ui';
import { useAuth } from './context';
import { authRequest } from './transport';

const STATE_SWITCH_ID = 'user-mfa-required';

function stateOf(enrolled, required) {
    if (enrolled) return { label: 'Protegido', className: 'is-enabled' };
    if (required) return { label: 'Pendiente de configurar', className: 'is-pending' };
    return { label: 'Sin MFA', className: '' };
}

function policyHint(required, enrolled) {
    if (!required)
        return enrolled
            ? 'MFA es opcional: la persona puede desactivarlo desde Mi cuenta.'
            : 'La cuenta ingresa solo con contraseña.';
    if (enrolled) return 'La cuenta pedirá un código temporal cada vez que ingrese.';
    return 'Pedirá un código temporal al ingresar y configurará el autenticador en ese momento.';
}

function ResetAuthenticator({ user, onClose, onDone }) {
    const [busy, setBusy] = useState(false);
    const required = Boolean(user.mfa_required);
    return (
        <AccessDialog
            title={required ? 'Restablecer autenticador MFA' : 'Desactivar MFA'}
            onClose={onClose}
            busy={busy}
        >
            <p>
                <strong>{user.display_name}</strong> <span className="access-muted">@{user.username}</span>
            </p>
            <p className="access-notice">
                {required
                    ? 'Se eliminará el autenticador actual y se cerrarán las sesiones de la cuenta. La persona deberá configurar uno nuevo en su siguiente ingreso.'
                    : 'Se eliminará el autenticador y se cerrarán las sesiones de la cuenta. La persona podrá activarlo de nuevo desde Mi cuenta.'}
            </p>
            <ManagementForm
                button={required ? 'Restablecer autenticador' : 'Desactivar MFA'}
                onCancel={onClose}
                onBusyChange={setBusy}
                onSubmit={async () => {
                    await authRequest(`users/${user.id}/mfa/reset`, {});
                    await onDone();
                }}
            />
        </AccessDialog>
    );
}

export default function MfaConfiguration({ user, disabled = false, onDirtyChange }) {
    const { session, can, runPrivileged } = useAuth();
    const { mutate } = useSWR(`/api/auth/users/${encodeURIComponent(user.id)}`);
    const [required, setRequired] = useState(Boolean(user.mfa_required));
    const [busy, setBusy] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [message, setMessage] = useState('');
    const [failure, setFailure] = useState('');
    const self = user.id === session.user.id;
    const enrolled = Boolean(user.mfa_enabled);
    const requiredNow = Boolean(user.mfa_required);
    const canUpdate = can('access.users') && !self;
    const canReset = can('access.recover') && !self && enrolled;
    const changed = canUpdate && required !== requiredNow;
    const state = stateOf(enrolled, requiredNow);
    useEffect(() => {
        setRequired(requiredNow);
    }, [requiredNow]);
    useEffect(() => {
        onDirtyChange(changed);
        return () => onDirtyChange(false);
    }, [changed, onDirtyChange]);
    const save = async (event) => {
        event.preventDefault();
        setFailure('');
        setMessage('');
        setBusy(true);
        try {
            await runPrivileged(async () => {
                await authRequest(`users/${user.id}/mfa`, { required }, 'PUT');
                await mutate().catch(() => undefined);
            });
            setMessage(
                required
                    ? 'La cuenta exigirá MFA. Se cerraron sus sesiones activas.'
                    : 'La cuenta ya no exige MFA. Se cerraron sus sesiones activas.',
            );
        } catch (error) {
            if (error.name !== 'AbortError')
                setFailure(`${error.message}${error.retryAfter ? ` Espera ${error.retryAfter} segundos.` : ''}`);
        } finally {
            setBusy(false);
        }
    };
    return (
        <section className="access-assignment access-user-mfa" aria-label="Segundo factor (MFA)">
            <header className="access-section-head">
                <div>
                    <h3>Segundo factor (MFA)</h3>
                    <p>Protege el ingreso de esta cuenta con un código temporal.</p>
                </div>
                <span className={`access-status ${state.className}`.trim()}>{state.label}</span>
            </header>
            {self ? (
                <p className="access-user-mfa-note access-muted">
                    Tu propia configuración MFA se administra desde <Link to="/cuenta">Mi cuenta</Link>.
                </p>
            ) : (
                <form className="access-user-mfa-form" onSubmit={save}>
                    <div className="access-user-mfa-panel">
                        <div className={`access-user-mfa-row${canUpdate ? '' : ' is-readonly'}`}>
                            <div className="access-user-mfa-copy">
                                <label className="access-user-mfa-label" htmlFor={STATE_SWITCH_ID}>
                                    Exigir MFA
                                </label>
                                <p>{policyHint(required, enrolled)}</p>
                            </div>
                            <label className="access-user-mfa-switch">
                                <input
                                    id={STATE_SWITCH_ID}
                                    type="checkbox"
                                    aria-label="Exigir MFA a esta cuenta"
                                    checked={required}
                                    disabled={disabled || busy || !canUpdate}
                                    onChange={(event) => {
                                        setMessage('');
                                        setFailure('');
                                        setRequired(event.target.checked);
                                    }}
                                />
                                <span className="access-user-mfa-toggle" aria-hidden="true" />
                                <span className="access-user-mfa-switch-label" aria-hidden="true">
                                    {required ? 'Exigido' : 'Opcional'}
                                </span>
                            </label>
                        </div>
                        <div className="access-user-mfa-row">
                            <div className="access-user-mfa-copy">
                                <span className="access-user-mfa-label">Autenticador</span>
                                <p>
                                    {enrolled
                                        ? 'Configurado en la app de autenticación de la persona.'
                                        : 'Sin configurar.'}
                                </p>
                            </div>
                            {canReset && (
                                <button
                                    type="button"
                                    className={`btn ${requiredNow ? 'btn-outline-light' : 'btn-outline-danger'}`}
                                    disabled={busy || disabled}
                                    onClick={() => {
                                        setMessage('');
                                        setFailure('');
                                        setResetting(true);
                                    }}
                                >
                                    {requiredNow ? 'Restablecer autenticador' : 'Desactivar MFA'}
                                </button>
                            )}
                        </div>
                    </div>
                    {failure && (
                        <p role="alert" className="access-error">
                            {failure}
                        </p>
                    )}
                    {message && (
                        <p role="status" className="access-success">
                            {message}
                        </p>
                    )}
                    {canUpdate && changed && (
                        <div className="access-user-mfa-footer">
                            <span className="access-save-state">Cambios sin guardar</span>
                            <button
                                type="button"
                                className="btn btn-outline-light"
                                disabled={busy}
                                onClick={() => {
                                    setRequired(requiredNow);
                                    setMessage('');
                                    setFailure('');
                                }}
                            >
                                Descartar
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={busy}>
                                {busy ? 'Guardando…' : 'Guardar MFA'}
                            </button>
                        </div>
                    )}
                    {!canUpdate && !canReset && (
                        <p className="access-user-mfa-readonly access-muted">
                            No tienes permiso para modificar la configuración MFA de esta cuenta.
                        </p>
                    )}
                </form>
            )}
            {resetting && (
                <ResetAuthenticator
                    user={user}
                    onClose={() => setResetting(false)}
                    onDone={async () => {
                        await mutate().catch(() => undefined);
                        setResetting(false);
                        setMessage(
                            requiredNow
                                ? 'Autenticador restablecido. La cuenta deberá configurar uno nuevo en su próximo ingreso.'
                                : 'MFA desactivado. Se cerraron las sesiones de la cuenta.',
                        );
                    }}
                />
            )}
        </section>
    );
}
