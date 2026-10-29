import Modal from 'components/Modal';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useAuth } from './context';
import { AuthIcon } from './presentation';

export function AccessForm({
    title,
    onSubmit,
    children,
    button = 'Continuar',
    pendingButton = 'Procesando…',
    embedded = false,
}) {
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
        <section className={embedded ? 'access-embedded-form' : 'card bg-dark text-light border-secondary p-4 my-3'}>
            {!embedded && <h2 className="h4">{title}</h2>}
            <form method="post" onSubmit={submit}>
                <fieldset disabled={busy}>
                    {children}
                    {error && (
                        <p role="alert" className="text-warning mt-3">
                            {error}
                        </p>
                    )}
                    <button className="btn btn-primary mt-3" type="submit">
                        {busy ? pendingButton : button}
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
    placeholder,
    pattern,
    autoCapitalize,
    spellCheck,
    className = 'my-3',
    describedBy,
    required = true,
}) {
    const id = `auth-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    return (
        <div className={className}>
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
                placeholder={placeholder}
                pattern={pattern}
                autoCapitalize={autoCapitalize}
                spellCheck={spellCheck}
                aria-describedby={describedBy}
                required={required}
                onChange={onChange ? (event) => onChange(event.target.value) : undefined}
            />
        </div>
    );
}

export function InitialAccountForm() {
    const { action } = useAuth();
    const [visible, setVisible] = useState({});
    return (
        <div className="auth-initial-form">
            <span className="auth-initial-eyebrow">Configuración inicial</span>
            <h1>Crear administrador</h1>
            <AccessForm
                embedded
                button="Crear administrador"
                pendingButton="Creando cuenta…"
                onSubmit={async ({ displayName, username, password, confirmation }) => {
                    setVisible({});
                    if (password !== confirmation) throw new Error('Las contraseñas no coinciden.');
                    await action('first-user', { displayName, username, password, confirmation });
                }}
            >
                <Field
                    label="Nombre"
                    name="displayName"
                    className="auth-initial-field"
                    maxLength={128}
                    autoComplete="name"
                    placeholder="Jorge Rojas"
                />
                <Field
                    label="Username"
                    name="username"
                    className="auth-initial-field"
                    maxLength={64}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    pattern={'[a-zA-Z0-9._\\-]+'}
                    placeholder="jorgerojas26"
                />
                {[
                    ['password', 'Contraseña', 'contraseña'],
                    ['confirmation', 'Confirmar contraseña', 'confirmación'],
                ].map(([name, label, toggleLabel]) => (
                    <div key={name} className="auth-initial-field">
                        <div className="auth-initial-password">
                            <Field
                                label={label}
                                name={name}
                                className="auth-initial-password-field"
                                type={visible[name] ? 'text' : 'password'}
                                minLength={15}
                                autoComplete="new-password"
                                describedBy={name === 'password' ? 'initial-password-help' : undefined}
                            />
                            <button
                                type="button"
                                className="auth-entry-password-toggle"
                                aria-label={`${visible[name] ? 'Ocultar' : 'Mostrar'} ${toggleLabel}`}
                                aria-pressed={Boolean(visible[name])}
                                onClick={() => setVisible((current) => ({ ...current, [name]: !current[name] }))}
                            >
                                <AuthIcon kind="eye" />
                            </button>
                        </div>
                        {name === 'password' && (
                            <p id="initial-password-help" className="auth-initial-hint">
                                Mínimo 15 caracteres.
                            </p>
                        )}
                    </div>
                ))}
            </AccessForm>
        </div>
    );
}

export function LoginForm() {
    const { action } = useAuth();
    const [visible, setVisible] = useState(false);
    return (
        <div className="auth-entry-form">
            <div className="auth-entry-form-icon">
                <AuthIcon />
            </div>
            <h2>Iniciar sesión</h2>
            <p className="auth-entry-description">Introduce tus credenciales para acceder a DMMarket.</p>
            <AccessForm
                embedded
                button={
                    <>
                        Entrar <AuthIcon kind="arrow" />
                    </>
                }
                onSubmit={({ username, password }) => {
                    setVisible(false);
                    return action('login', { username, password });
                }}
            >
                <Field label="Usuario" name="username" autoComplete="username" maxLength={64} />
                <div className="auth-entry-password">
                    <Field
                        label="Contraseña"
                        name="password"
                        type={visible ? 'text' : 'password'}
                        autoComplete="current-password"
                    />
                    <button
                        type="button"
                        className="auth-entry-password-toggle"
                        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        aria-pressed={visible}
                        onClick={() => setVisible(!visible)}
                    >
                        <AuthIcon kind="eye" />
                    </button>
                </div>
                <p className="auth-entry-help">Usa las credenciales que te proporcionó tu administrador.</p>
            </AccessForm>
        </div>
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
        <div className="auth-entry-form">
            <div className="auth-entry-form-icon">
                <AuthIcon kind="code" />
            </div>
            <h2>Verificar segundo factor</h2>
            <AccessForm
                embedded
                button={
                    <>
                        Verificar código <AuthIcon kind="arrow" />
                    </>
                }
                onSubmit={({ token }) => action('mfa', { token })}
            >
                <div className="auth-entry-code-field">
                    <label className="form-label" htmlFor="auth-mfa-code">
                        Código MFA
                    </label>
                    <input
                        id="auth-mfa-code"
                        className="form-control"
                        name="token"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        minLength={6}
                        maxLength={6}
                        placeholder="000000"
                        aria-describedby="auth-mfa-help"
                        autoFocus
                        required
                    />
                </div>
                <p id="auth-mfa-help" className="auth-entry-help">
                    Introduce los 6 dígitos. También puedes pegar el código.
                </p>
            </AccessForm>
        </div>
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
    const { action, session } = useAuth();
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
                <p>
                    {session.mfaRequired
                        ? 'Tu cuenta requiere MFA.'
                        : 'Activa un segundo factor para proteger tu cuenta.'}{' '}
                    Confirma tu contraseña.
                </p>
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

export function DisableMfaForm() {
    const { action } = useAuth();
    return (
        <AccessForm
            title="Desactivar MFA"
            button="Confirmar desactivación"
            onSubmit={({ password, token }) => action('mfa/disable', { password, token })}
        >
            <Field
                label="Contraseña para desactivar MFA"
                name="password"
                type="password"
                autoComplete="current-password"
            />
            <Field
                label="Código MFA para desactivar"
                name="token"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
            />
        </AccessForm>
    );
}

export function ReauthenticationForm({
    title = 'Confirmar identidad para administrar acceso',
    onConfirmed,
    embedded = false,
    description = 'Confirma tu identidad para continuar.',
} = {}) {
    const { action, session } = useAuth();
    const [confirmed, setConfirmed] = useState(false);
    return (
        <AccessForm
            title={title}
            embedded={embedded}
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
            {session.mfaEnabled && (
                <Field
                    label="Código MFA de reautenticación"
                    name="token"
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                />
            )}
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
            className="access-surface access-verification"
        >
            <Modal.Header closeButton closeLabel="Cerrar">
                <Modal.Title id="auth-reauthentication-title">Confirmar identidad</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <ReauthenticationForm
                    embedded
                    title="Verificar contraseña y MFA"
                    description="Para continuar esta operación, confirma de nuevo tu identidad."
                    onConfirmed={finishReauthentication}
                />
            </Modal.Body>
        </Modal>
    );
}
