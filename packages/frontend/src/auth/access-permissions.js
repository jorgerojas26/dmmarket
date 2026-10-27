export const permissionGroups = [
    [
        'Ventas',
        [
            ['sales.read', 'Consultar ventas'],
            ['sales.financial', 'Ver costos y utilidad de ventas'],
            ['sales.export', 'Exportar ventas'],
        ],
    ],
    [
        'Clientes',
        [
            ['clients.read', 'Consultar clientes'],
            ['clients.export', 'Exportar clientes'],
            ['clients.personal', 'Ver datos personales de clientes'],
        ],
    ],
    [
        'Vendedores y comisiones',
        [
            ['sellers.read', 'Consultar vendedores'],
            ['sellers.export', 'Exportar vendedores'],
            ['sellers.personal', 'Ver datos personales de vendedores'],
            ['commissions.read', 'Consultar comisiones'],
            ['commissions.update', 'Modificar comisiones'],
        ],
    ],
    [
        'Cuentas por cobrar',
        [
            ['receivables.read', 'Consultar cuentas por cobrar'],
            ['receivables.export', 'Exportar cuentas por cobrar'],
            ['receivables.payment', 'Registrar abonos'],
            ['receivables.void', 'Anular abonos'],
            ['receivables.close', 'Cerrar deuda'],
            ['receivables.reopen', 'Reabrir deuda'],
        ],
    ],
    [
        'Compras y proveedores',
        [
            ['purchases.read', 'Consultar compras'],
            ['purchases.costs', 'Ver costos de compras'],
            ['purchases.export', 'Exportar compras'],
            ['providers.read', 'Consultar proveedores'],
            ['providers.export', 'Exportar proveedores'],
        ],
    ],
    [
        'Inventario',
        [
            ['inventory.read', 'Consultar inventario'],
            ['inventory.costs', 'Ver costos de inventario'],
            ['inventory.export', 'Exportar inventario'],
        ],
    ],
    [
        'Configuración',
        [
            ['rates.read', 'Consultar tasas de cambio'],
            ['rates.sync', 'Sincronizar tasas BCV'],
            ['cache.clear', 'Actualizar caché de reportes'],
            ['backups.read', 'Consultar respaldos'],
            ['backups.create', 'Crear respaldos'],
            ['updates.read', 'Consultar actualizaciones'],
            ['updates.execute', 'Instalar actualizaciones'],
        ],
    ],
    [
        'Acceso y auditoría',
        [
            ['access.users', 'Administrar usuarios'],
            ['access.roles', 'Administrar roles'],
            ['access.links', 'Vincular vendedores'],
            ['access.recover', 'Recuperar credenciales'],
            ['audit.read', 'Consultar auditoría'],
        ],
    ],
];
