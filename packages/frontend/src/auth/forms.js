import Modal from 'components/Modal';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useAuth } from './context';

export function AccessForm({ title, onSubmit, children, button = 'Continuar' }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const submit = async (event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            await onSubmit();
        } catch (failure) {
            if (failure.name !== 'AbortError')
                setError(`${failure.message}${failure.retryAfter ? ` Espera ${failure.retryAfter} segundos.` : ''}`);
        } finally {
            setBusy(false);
        }
    };
    return (
        <section className="card bg-dark text-light border-secondary p-4 my-3">
            <h2 className="h4">{title}</h2>
            <form onSubmit={submit}>
                <fieldset disabled={busy}>
                    {children}
                    {error && (
                        <p role="alert" className="text-warning mt-3">
                            {error}
                        </p>
                    )}
                    <button className="btn btn-primary mt-3" type="submit">
                        {busy ? 'Procesando…' : button}
                    </button>
                </fieldset>
            </form>
        </section>
    );
}

export function Field({
    label,
    value,
    onChange,
    type = 'text',
    autoComplete,
    minLength,
    maxLength,
    inputMode,
    required = true,
}) {
    const id = `auth-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    return (
        <div className="my-3">
            <label className="form-label" htmlFor={id}>
                {label}
            </label>
            <input
                id={id}
                className="form-control"
                type={type}
                value={value}
                autoComplete={autoComplete}
                minLength={minLength}
                maxLength={maxLength}
                inputMode={inputMode}
                required={required}
                onChange={(event) => onChange(event.target.value)}
            />
        </div>
    );
}

export function LoginForm() {
    const { action } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    return (
        <AccessForm
            title="Iniciar sesión"
            button="Entrar"
            onSubmit={async () => {
                try {
                    await action('login', { username, password });
                } finally {
                    setPassword('');
                }
            }}
        >
            <Field label="Usuario" value={username} onChange={setUsername} autoComplete="username" maxLength={64} />
            <Field
                label="Contraseña"
                value={password}
                onChange={setPassword}
                type="password"
                autoComplete="current-password"
            />
        </AccessForm>
    );
}

export function PasswordForm() {
    const { action, session } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [token, setToken] = useState('');
    return (
        <AccessForm
            title={session.stage === 'password' ? 'Cambiar contraseña temporal' : 'Cambiar mi contraseña'}
            button="Guardar contraseña"
            onSubmit={async () => {
                try {
                    if (newPassword !== confirmation) throw new Error('Las contraseñas nuevas no coinciden.');
                    await action('password', { currentPassword, newPassword, token });
                } finally {
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmation('');
                    setToken('');
                }
            }}
        >
            <p>Usa al menos 15 caracteres. No reutilices la contraseña temporal.</p>
            <Field
                label="Contraseña actual"
                value={currentPassword}
                onChange={setCurrentPassword}
                type="password"
                autoComplete="current-password"
            />
            <Field
                label="Contraseña nueva"
                value={newPassword}
                onChange={setNewPassword}
                type="password"
                autoComplete="new-password"
                minLength={15}
            />
            <Field
                label="Confirmar contraseña nueva"
                value={confirmation}
                onChange={setConfirmation}
                type="password"
                autoComplete="new-password"
                minLength={15}
            />
            {session.stage === 'ready' && session.mfaEnabled && (
                <Field
                    label="Código MFA para cambiar contraseña"
                    value={token}
                    onChange={setToken}
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                />
            )}
        </AccessForm>
    );
}

export function MfaForm() {
    const { action } = useAuth();
    const [token, setToken] = useState('');
    return (
        <AccessForm
            title="Verificar segundo factor"
            button="Verificar código"
            onSubmit={async () => {
                try {
                    await action('mfa', { token });
                } finally {
                    setToken('');
                }
            }}
        >
            <Field
                label="Código MFA"
                value={token}
                onChange={setToken}
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
            />
        </AccessForm>
    );
}

export function EnrollmentForm() {
    const { action } = useAuth();
    const [password, setPassword] = useState('');
    const [uri, setUri] = useState('');
    const [qr, setQr] = useState('');
    const [token, setToken] = useState('');
    useEffect(() => {
        let active = true;
        if (uri)
            QRCode.toDataURL(uri, { width: 240 })
                .then((value) => {
                    if (active) setQr(value);
                })
                .catch(() => {});
        return () => {
            active = false;
        };
    }, [uri]);
    if (!uri)
        return (
            <AccessForm
                title="Configurar segundo factor"
                button="Generar configuración MFA"
                onSubmit={async () => {
                    try {
                        const data = await action('mfa/enrollment', { password });
                        setUri(data.uri);
                    } finally {
                        setPassword('');
                    }
                }}
            >
                <p>Tu acceso requiere MFA. Confirma tu contraseña para generar una configuración nueva.</p>
                <Field
                    label="Contraseña para configurar MFA"
                    value={password}
                    onChange={setPassword}
                    type="password"
                    autoComplete="current-password"
                />
            </AccessForm>
        );
    return (
        <AccessForm
            title="Confirmar configuración MFA"
            button="Confirmar MFA"
            onSubmit={async () => {
                try {
                    await action('mfa/enrollment/confirm', { token });
                } finally {
                    setToken('');
                }
            }}
        >
            <p>
                Escanea este código con tu autenticador. La configuración vence en cinco minutos y no se mostrará de
                nuevo.
            </p>
            {qr && <img src={qr} width="240" height="240" alt="Código QR de configuración MFA" />}
            <label className="form-label d-block mt-3" htmlFor="mfa-uri">
                Configuración manual MFA
            </label>
            <input
                id="mfa-uri"
                autoComplete="off"
                aria-label="Configuración manual MFA"
                type="password"
                className="form-control"
                value={uri}
                readOnly
            />
            <Field
                label="Código de confirmación MFA"
                value={token}
                onChange={setToken}
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
            />
            <button
                type="button"
                className="btn btn-outline-light mt-2"
                onClick={() => {
                    setUri('');
                    setQr('');
                }}
            >
                Generar otra configuración
            </button>
        </AccessForm>
    );
}

export function ReauthenticationForm({
    title = 'Confirmar identidad para administrar acceso',
    onConfirmed,
    description = 'Las acciones de acceso exigen contraseña y MFA comprobados en los últimos cinco minutos.',
} = {}) {
    const { action } = useAuth();
    const [password, setPassword] = useState('');
    const [token, setToken] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    return (
        <AccessForm
            title={title}
            button="Confirmar identidad"
            onSubmit={async () => {
                setConfirmed(false);
                try {
                    await action('reauthenticate', { password, token });
                    setConfirmed(true);
                    onConfirmed?.();
                } finally {
                    setPassword('');
                    setToken('');
                }
            }}
        >
            <p>{description}</p>
            <Field
                label="Contraseña de reautenticación"
                value={password}
                onChange={setPassword}
                type="password"
                autoComplete="current-password"
            />
            <Field
                label="Código MFA de reautenticación"
                value={token}
                onChange={setToken}
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
            />
            {confirmed && <p role="status">Identidad confirmada.</p>}
        </AccessForm>
    );
}

export function ReauthenticationDialog() {
    const { reauthenticationRequired, finishReauthentication, cancelReauthentication } = useAuth();
    return (
        <Modal
            show={reauthenticationRequired}
            onHide={cancelReauthentication}
            centered
            backdrop="static"
            aria-labelledby="auth-reauthentication-title"
        >
            <Modal.Header closeButton>
                <Modal.Title id="auth-reauthentication-title">Confirmar identidad</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <ReauthenticationForm
                    title="Verificar contraseña y MFA"
                    description="Para continuar esta operación, confirma de nuevo tu identidad."
                    onConfirmed={finishReauthentication}
                />
            </Modal.Body>
        </Modal>
    );
}
