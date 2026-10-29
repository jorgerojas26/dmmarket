export const auditActivities = [
    {
        label: 'Sesiones y seguridad',
        actions: {
            'auth.login_succeeded': 'Inicio de sesión',
            'auth.login_failed': 'Intento de acceso fallido',
            'auth.session_revoked': 'Sesión cerrada o revocada',
            'auth.password_changed': 'Contraseña actualizada',
            'auth.password_change_failed': 'Cambio de contraseña rechazado',
            'auth.enrollment_started': 'Configuración de MFA iniciada',
            'auth.enrollment_failed': 'Configuración de MFA rechazada',
            'auth.mfa_disabled': 'MFA desactivado',
            'auth.mfa_disable_failed': 'Intento fallido de desactivar MFA',
            'auth.mfa_enrolled': 'MFA activado',
            'auth.mfa_verified': 'Código MFA verificado',
            'auth.mfa_failed': 'Código MFA rechazado',
            'auth.reauthenticated': 'Identidad confirmada',
            'auth.reauthentication_failed': 'Confirmación de identidad rechazada',
            'auth.attempts_limited': 'Límite de intentos alcanzado',
        },
    },
    {
        label: 'Usuarios y roles',
        actions: {
            'auth.initial_administrator_created': 'Superusuario creado',
            'auth.user_created': 'Usuario creado',
            'auth.user_enabled': 'Usuario habilitado',
            'auth.user_disabled': 'Usuario deshabilitado',
            'auth.credentials_reset': 'Acceso recuperado',
            'auth.credentials_mfa_reset': 'Acceso y MFA recuperados',
            'auth.local_recovery': 'Recuperación desde el servidor',
            'auth.local_bootstrap': 'Cuenta preparada desde el servidor',
            'auth.role_created': 'Rol creado',
            'auth.role_changed': 'Rol actualizado',
            'auth.role_renamed': 'Rol renombrado',
            'auth.user_roles_changed': 'Roles del usuario actualizados',
            'auth.user_sellers_changed': 'Vendedores vinculados actualizados',
        },
    },
    {
        label: 'Operación del sistema',
        actions: {
            'preferences.updated': 'Preferencias del sistema actualizadas',
            'preferences.currency_changed': 'Moneda del negocio actualizada',
            'rates.sync_requested': 'Consulta BCV solicitada',
            'rates.sync_completed': 'Consulta BCV finalizada',
            'rates.sync_failed': 'Consulta BCV fallida',
            'backups.create_requested': 'Respaldo solicitado',
            'backups.create_completed': 'Respaldo finalizado',
            'backups.create_failed': 'Respaldo fallido',
            'cache.clear_requested': 'Limpieza de caché solicitada',
            'cache.clear_completed': 'Caché limpiada',
            'updates.download_requested': 'Descarga de actualización solicitada',
            'updates.download_completed': 'Descarga de actualización finalizada',
            'updates.apply_requested': 'Instalación de actualización solicitada',
            'updates.apply_completed': 'Instalación de actualización finalizada',
            'reports.export_prepared': 'Exportación preparada',
        },
    },
    {
        label: 'Comisiones y cobranza',
        actions: {
            'commissions.updated': 'Comisiones actualizadas',
            'receivables.payment': 'Abono registrado',
            'receivables.void': 'Abono anulado',
            'receivables.close': 'Deuda cerrada',
            'receivables.reopen': 'Deuda reabierta',
        },
    },
];

const labels = new Map(auditActivities.flatMap((group) => Object.entries(group.actions)));

export function auditActivity(action) {
    return labels.get(action) || 'Evento del sistema';
}

export function auditDate(timestamp, time = false) {
    return new Intl.DateTimeFormat('es-VE', {
        timeZone: 'UTC',
        ...(time ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false } : { dateStyle: 'medium' }),
    }).format(new Date(Number(timestamp)));
}
