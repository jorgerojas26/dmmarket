import { permissionKey } from '@dmmarket/permissions';
import { createContext, useContext } from 'react';
import { useLocation } from 'react-router-dom';

const ResourceContext = createContext(null);
export function resourceFromLocation(pathname = window.location.pathname, search = window.location.search) {
    const view = new URLSearchParams(search).get('view');
    if (pathname === '/ventas') return `sales.${{ desglose: 'breakdown', despacho: 'dispatch' }[view] || 'dashboard'}`;
    if (pathname === '/compras') return `purchases.${view === 'desglose' ? 'breakdown' : 'dashboard'}`;
    if (pathname === '/clientes')
        return `clients.${{ clients: 'directory', receivables: 'receivables' }[view] || 'dashboard'}`;
    if (pathname === '/vendedores') return `sellers.${view === 'sellers' ? 'directory' : 'dashboard'}`;
    if (pathname === '/proveedores') return 'providers.directory';
    if (pathname === '/inventario') return 'inventory.stock';
    return null;
}
export function ResourceBoundary({ resource, children }) {
    return <ResourceContext.Provider value={resource}>{children}</ResourceContext.Provider>;
}
export function useResource() {
    const inherited = useContext(ResourceContext);
    const { pathname, search } = useLocation();
    return inherited || resourceFromLocation(pathname, search);
}
const operations = {
    'preferences.read': 'settings.preferences.read',
    'preferences.update': 'settings.preferences.update',
    'rates.read': 'settings.rates.read',
    'rates.sync': 'settings.rates.sync',
    'backups.read': 'settings.backups.read',
    'backups.create': 'settings.backups.create',
    'updates.read': 'settings.updates.read',
    'updates.execute': 'settings.updates.execute',
    'cache.clear': 'settings.cache.clear',
    'audit.read': 'audit.events.read',
    'access.users': 'access.users.update',
    'access.roles': 'access.roles.update',
    'access.profile': 'access.profile.update',
    'access.recover': 'access.recovery.execute',
    'commissions.read': 'sellers.commissions.read',
    'commissions.update': 'sellers.commissions.update',
    'receivables.read': 'clients.receivables.read',
    'receivables.export': 'clients.receivables.export',
    'receivables.payment': 'clients.receivables.payment',
    'receivables.void': 'clients.receivables.void',
    'receivables.close': 'clients.receivables.close',
    'receivables.reopen': 'clients.receivables.reopen',
};
export function permissionReference(capability, resource) {
    if (operations[capability]) return permissionKey(operations[capability]);
    if (capability.split('.').length > 2) return permissionKey(capability);
    const action = capability.split('.').at(-1);
    return permissionKey(resource ? `${resource}.${action === 'costs' ? 'amounts' : action}` : capability);
}
