import Modal from 'components/Modal';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useAuth } from './context';

export function AccessForm({ title, onSubmit, children, button = 'Continuar' }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const submit = async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        setBusy(true);
        setError('');
        try {
            await onSubmit(values);
        } catch (failure) {
            if (failure.name !== 'AbortError')
                setError(`${failure.message}${failure.retryAfter ? ` Espera ${failure.retryAfter} segundos.` : ''}`);
        } finally {
            for (const input of form.querySelectorAll(
                'input[autocomplete="current-password"], input[autocomplete="new-password"], input[autocomplete="one-time-code"]',
            ))
                input.value = '';
            setBusy(false);
        }
    };
    return (
        <section className="card bg-dark text-light border-secondary p-4 my-3">
            <h2 className="h4">{title}</h2>
            <form method="post" onSubmit={submit}>
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
    name,
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
                name={name}
                className="form-control"
                type={type}
                value={value}
                autoComplete={autoComplete}
                minLength={minLength}
                maxLength={maxLength}
                inputMode={inputMode}
                required={required}
                onChange={onChange ? (event) => onChange(event.target.value) : undefined}
            />
        </div>
    );
}

export function InitialAccountForm() {
    const { action } = useAuth();
    return (
        <AccessForm
            title="Crear primer administrador"
            button="Crear administrador"
            onSubmit={async ({ displayName, username, password, confirmation }) => {
                if (password !== confirmation) throw new Error('Las contraseñas no coinciden.');
                await action('first-user', { displayName, username, password, confirmation });
            }}
        >
            <p>
                Bienvenido a DMMarket. Esta cuenta administrará el acceso. Después de crearla deberás configurar MFA
                antes de continuar.
            </p>
            <Field label="Nombre" name="displayName" maxLength={128} autoComplete="name" />
            <Field label="Usuario" name="username" maxLength={64} autoComplete="username" />
            <Field label="Contraseña" name="password" type="password" minLength={15} autoComplete="new-password" />
            <Field
                label="Confirmar contraseña"
                name="confirmation"
                type="password"
                minLength={15}
                autoComplete="new-password"
            />
            <p>Usa al menos 15 caracteres. No se crean usuarios ni contraseñas predeterminadas.</p>
        </AccessForm>
    );
}

export function LoginForm() {
    const { action } = useAuth();
    return (
        <AccessForm
            title="Iniciar sesión"
            button="Entrar"
            onSubmit={({ username, password }) => action('login', { username, password })}
        >
            <Field label="Usuario" name="username" autoComplete="username" maxLength={64} />
            <Field label="Contraseña" name="password" type="password" autoComplete="current-password" />
        </AccessForm>
    );
}

export function PasswordForm() {
    const { action, session } = useAuth();
    return (
        <AccessForm
            title={session.stage === 'password' ? 'Cambiar contraseña temporal' : 'Cambiar mi contraseña'}
            button="Guardar contraseña"
            onSubmit={async ({ currentPassword, newPassword, confirmation, token = '' }) => {
                if (newPassword !== confirmation) throw new Error('Las contraseñas nuevas no coinciden.');
                await action('password', { currentPassword, newPassword, token });
            }}
        >
            <p>Usa al menos 15 caracteres. No reutilices la contraseña temporal.</p>
            <Field label="Contraseña actual" name="currentPassword" type="password" autoComplete="current-password" />
            <Field
                label="Contraseña nueva"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={15}
            />
            <Field
                label="Confirmar contraseña nueva"
                name="confirmation"
                type="password"
                autoComplete="new-password"
                minLength={15}
            />
            {session.stage === 'ready' && session.mfaEnabled && (
                <Field
                    label="Código MFA para cambiar contraseña"
                    name="token"
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
    return (
        <AccessForm
            title="Verificar segundo factor"
            button="Verificar código"
            onSubmit={({ token }) => action('mfa', { token })}
        >
            <Field label="Código MFA" name="token" maxLength={6} inputMode="numeric" autoComplete="one-time-code" />
        </AccessForm>
    );
}

function ManualMfaConfiguration({ uri }) {
    const [visible, setVisible] = useState(false);
    const [message, setMessage] = useState('');
    const secret = new URL(uri).searchParams.get('secret');
    return (
        <div className="mt-3">
            <label className="form-label" htmlFor="mfa-secret">
                Configuración manual MFA
            </label>
            <p id="mfa-secret-help">
                Si no puedes escanear el QR, añade una clave de configuración en tu autenticador. Usa esta clave con
                códigos basados en tiempo (TOTP), 6 dígitos, intervalo de 30 segundos y algoritmo SHA-1.
            </p>
            <input
                id="mfa-secret"
                autoComplete="off"
                aria-describedby="mfa-secret-help"
                type={visible ? 'text' : 'password'}
                className="form-control"
                value={secret}
                readOnly
                spellCheck={false}
                onFocus={(event) => {
                    if (visible) event.target.select();
                }}
            />
            <div className="d-flex flex-wrap gap-2 mt-2">
                <button
                    type="button"
                    className="btn btn-outline-light"
                    aria-pressed={visible}
                    onClick={() => setVisible(!visible)}
                >
                    {visible ? 'Ocultar clave MFA' : 'Mostrar clave MFA'}
                </button>
                <button
                    type="button"
                    className="btn btn-outline-light"
                    onClick={async () => {
                        try {
                            await navigator.clipboard.writeText(secret);
                            setMessage('Clave copiada. Pégala en tu autenticador.');
                        } catch {
                            setMessage('No se pudo copiar. Pulsa Mostrar clave MFA y cópiala manualmente.');
                        }
                    }}
                >
                    Copiar clave MFA
                </button>
            </div>
            {message && (
                <p role="status" className="mt-2">
                    {message}
                </p>
            )}
        </div>
    );
}

export function EnrollmentForm() {
    const { action } = useAuth();
    const [uri, setUri] = useState('');
    const [qr, setQr] = useState('');
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
                onSubmit={async ({ password }) => {
                    const data = await action('mfa/enrollment', { password });
                    setUri(data.uri);
                }}
            >
                <p>Tu acceso requiere MFA. Confirma tu contraseña para generar una configuración nueva.</p>
                <Field
                    label="Contraseña para configurar MFA"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                />
            </AccessForm>
        );
    return (
        <AccessForm
            title="Confirmar configuración MFA"
            button="Confirmar MFA"
            onSubmit={({ token }) => action('mfa/enrollment/confirm', { token })}
        >
            <p>
                Escanea este código con tu autenticador. La configuración vence en cinco minutos y no se mostrará de
                nuevo.
            </p>
            {qr && <img src={qr} width="240" height="240" alt="Código QR de configuración MFA" />}
            <ManualMfaConfiguration key={uri} uri={uri} />
            <Field
                label="Código de confirmación MFA"
                name="token"
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
    const [confirmed, setConfirmed] = useState(false);
    return (
        <AccessForm
            title={title}
            button="Confirmar identidad"
            onSubmit={async ({ password, token }) => {
                setConfirmed(false);
                await action('reauthenticate', { password, token });
                setConfirmed(true);
                onConfirmed?.();
            }}
        >
            <p>{description}</p>
            <Field
                label="Contraseña de reautenticación"
                name="password"
                type="password"
                autoComplete="current-password"
            />
            <Field
                label="Código MFA de reautenticación"
                name="token"
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
