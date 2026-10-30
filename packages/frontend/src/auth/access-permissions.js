import { CAPABILITIES, MODULES } from '@dmmarket/permissions';

export const permissionGroups = MODULES.map((module) => [
    module.label,
    Object.entries(CAPABILITIES)
        .filter(([, definition]) => definition.module === module.key)
        .map(([key, definition]) => [key, `${definition.submoduleLabel} · ${definition.label}`]),
]);
