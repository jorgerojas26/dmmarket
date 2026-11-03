export function RoleModules({ modules, catalog, grants, selected, onSelect, busy }) {
    const count = catalog.filter(({ capability }) => grants[capability]).length;
    return (
        <nav className="access-role-modules" aria-label="Módulos de permisos">
            <div className="access-role-modules-title">
                <strong>Módulos</strong>
                <span>
                    {count} de {catalog.length} permisos
                </span>
            </div>
            <div className="access-role-module-list">
                {modules.map((module) => {
                    const entries = catalog.filter((entry) => entry.module === module.key);
                    const enabled = entries.filter(({ capability }) => grants[capability]).length;
                    return (
                        <button
                            type="button"
                            key={module.key}
                            aria-label={module.label}
                            aria-current={selected === module.key ? 'true' : undefined}
                            disabled={busy}
                            onClick={() => onSelect(module.key)}
                        >
                            <span>{module.label}</span>
                            <span className="access-role-module-count" aria-hidden="true">
                                {enabled}/{entries.length}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}

function PermissionControl({ entry, module, resource, grants, inherited, sources, showSources, setGrants }) {
    const fromRole = Boolean(inherited[entry.capability]);
    const direct = Boolean(grants[entry.capability]);
    const names = sources[entry.capability] || [];
    const origin = names.length ? `Por ${names.join(', ')}` : 'Concedido por rol';
    return (
        <div className="access-permission-control">
            <label className="access-permission-checkbox">
                <input
                    type="checkbox"
                    aria-label={`${entry.label} · ${module.label} / ${resource.label}`}
                    checked={direct || fromRole}
                    disabled={fromRole && !direct}
                    title={
                        fromRole
                            ? direct
                                ? `${origin} y adicional. Desmarcar retira solo el adicional.`
                                : `${origin}. Para retirarlo, quita el rol correspondiente.`
                            : undefined
                    }
                    onChange={(event) => {
                        const enabled = event.target.checked;
                        setGrants((previous) => ({ ...previous, [entry.capability]: enabled }));
                    }}
                />
            </label>
            {(fromRole || (showSources && direct)) && (
                <span
                    className="access-permission-source"
                    title={fromRole ? origin : 'Concedido directamente al usuario'}
                >
                    {fromRole
                        ? direct
                            ? 'Rol + adicional'
                            : names.length === 1
                              ? `Por ${names[0]}`
                              : names.length > 1
                                ? `${names.length} roles`
                                : 'Rol'
                        : 'Adicional'}
                </span>
            )}
        </div>
    );
}

export function RolePermissionMatrix({
    module,
    catalog,
    grants,
    setGrants,
    inherited = {},
    sources = {},
    showSources = false,
}) {
    const entries = catalog.filter((entry) => entry.module === module.key);
    const labels = {
        read: 'Consulta',
        financial: 'Rentabilidad',
        amounts: 'Importes comerciales',
        personal: 'Datos personales',
        inventory: 'Valoración de inventario',
    };
    const actions = [...new Set(entries.map((entry) => entry.action))];
    const groups = [
        { key: 'access', label: 'Acceso', actions: ['read'] },
        { key: 'commercial', label: 'Información comercial', actions: ['financial', 'amounts', 'inventory'] },
        { key: 'personal', label: 'Identificación', actions: ['personal'] },
        {
            key: 'actions',
            label: 'Acciones',
            actions: actions.filter(
                (action) => !['read', 'financial', 'amounts', 'inventory', 'personal'].includes(action),
            ),
        },
    ]
        .map((group) => ({
            ...group,
            columns: group.actions
                .filter((action) => actions.includes(action))
                .map((action) => ({
                    action,
                    group: group.key,
                    label: labels[action] || entries.find((entry) => entry.action === action).label,
                })),
        }))
        .filter((group) => group.columns.length);
    const columns = groups.flatMap((group) => group.columns);
    const compact = actions.length === 1 && actions[0] === 'read';
    return (
        <section className="access-permission-panel" aria-label={`Permisos de ${module.label}`}>
            <header className="access-permission-panel-header">
                <h3>{module.label}</h3>
            </header>
            <section className="access-permission-table-scroll" aria-label={`Tabla de permisos de ${module.label}`}>
                <table
                    className={`access-permission-table${compact ? ' access-permission-table-compact' : ''}`}
                    aria-label={`Permisos de ${module.label}`}
                >
                    <thead>
                        {!compact && (
                            <tr className="access-permission-groups">
                                <th scope="col" rowSpan={2}>
                                    Vista o función
                                </th>
                                {groups.map((group) => (
                                    <th
                                        scope="colgroup"
                                        colSpan={group.columns.length}
                                        key={group.key}
                                        data-group={group.key}
                                    >
                                        {group.label}
                                    </th>
                                ))}
                            </tr>
                        )}
                        <tr>
                            {compact && <th scope="col">Vista o función</th>}
                            {columns.map((column) => (
                                <th scope="col" key={column.action} data-group={column.group}>
                                    {column.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {module.resources.map((resource) => {
                            const capabilities = entries.filter((entry) => entry.resource === resource.resource);
                            if (!capabilities.length) return null;
                            return (
                                <tr key={resource.resource}>
                                    <th scope="row">{resource.label}</th>
                                    {columns.map((column) => {
                                        const entry = capabilities.find((entry) => entry.action === column.action);
                                        return (
                                            <td key={column.action} data-group={column.group}>
                                                {entry ? (
                                                    <PermissionControl
                                                        entry={entry}
                                                        module={module}
                                                        resource={resource}
                                                        grants={grants}
                                                        inherited={inherited}
                                                        sources={sources}
                                                        showSources={showSources}
                                                        setGrants={setGrants}
                                                    />
                                                ) : (
                                                    <span className="access-permission-unavailable">
                                                        <span aria-hidden="true">—</span>
                                                        <span className="visually-hidden">No aplica</span>
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </section>
        </section>
    );
}
