import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useModule } from '../hooks/useModule';
import { safeArray } from '../utils/dataUtils';

const WorkspaceContext = createContext(null);

const STORAGE_KEY = 'tashgheel_active_workspace';

export const WORKSPACE_DEFINITIONS = [
  {
    id: 'sales',
    labelKey: 'sidebar.sales',
    iconName: 'ShoppingBag',
    defaultPath: '/deals',
    module: 'sales',
    checkModule: (can) => can('sales') !== false && (can('sales') === true || can('crm') === true),
    routePrefixes: ['/deals', '/tasks', '/customers', '/sales', '/commissions', '/handover', '/quotations']
  },
  {
    id: 'contacts',
    labelKey: 'sidebar.contacts',
    iconName: 'Users',
    defaultPath: '/customers',
    module: 'crm',
    checkModule: (can, user) => can('crm') === true || can('purchasing') === true || user?.role === 'admin' || user?.role === 'super_admin',
    routePrefixes: ['/contacts']
  },
  {
    id: 'real_estate',
    labelKey: 'sidebar.realEstate',
    iconName: 'Building2',
    defaultPath: '/units-registry',
    module: 'real_estate',
    checkModule: (can, user) => can('real_estate') !== false && (user?.template_name === 'real_estate' || can('real_estate') === true),
    routePrefixes: ['/units-registry', '/re-units', '/reservations', '/contracts', '/installments', '/integrations/property-finder']
  },
  {
    id: 'finance',
    labelKey: 'sidebar.finance',
    iconName: 'Wallet',
    defaultPath: '/finance?tab=Overview',
    module: 'finance',
    checkModule: (can) => can('finance') === true,
    routePrefixes: ['/finance', '/erp']
  },
  {
    id: 'inventory',
    labelKey: 'sidebar.warehouse',
    iconName: 'Package',
    defaultPath: '/products',
    module: 'inventory',
    checkModule: (can) => can('inventory') === true || can('purchasing') === true,
    routePrefixes: ['/products', '/inventory', '/purchases']
  },
  {
    id: 'hr',
    labelKey: 'sidebar.hr',
    iconName: 'UserCheck',
    defaultPath: '/contacts/employees',
    module: 'hr',
    checkModule: (can, user) => can('hr') === true || user?.role === 'admin' || user?.role === 'super_admin',
    routePrefixes: ['/hr', '/contacts/employees']
  },
  {
    id: 'marketing',
    labelKey: 'sidebar.marketing',
    iconName: 'Share2',
    defaultPath: '/marketing/whatsapp-campaigns',
    module: 'marketing',
    checkModule: (can) => can('marketing') !== false && (can('marketing') === true || can('crm') === true),
    routePrefixes: ['/marketing', '/integrations/meta-forms', '/integrations/whatsapp', '/whatsapp-chat']
  },
  {
    id: 'reports',
    labelKey: 'sidebar.reports',
    iconName: 'BarChart3',
    defaultPath: '/reports',
    module: 'reports',
    checkModule: (can) => can('reports') !== false,
    routePrefixes: ['/reports']
  },
  {
    id: 'admin',
    labelKey: 'sidebar.admin',
    iconName: 'Settings',
    defaultPath: '/settings',
    module: null,
    // Files is also available to non-admin users with that existing screen grant.
    // Item-level role and page filters still decide which administration links render.
    checkModule: (_can, user) => user?.role === 'admin' || user?.role === 'super_admin'
      || safeArray(user?.allowedPages).includes('/files'),
    routePrefixes: ['/settings', '/files', '/logs', '/billing']
  }
];

export const WorkspaceProvider = ({ children }) => {
  const { user } = useAuth();
  const { can } = useModule();

  // ROUTE_ALIASES and canonical matching helper
  const ROUTE_ALIASES = useMemo(() => ({
    '/my-attendance': '/hr/my-attendance',
    '/my-requests': '/hr/my-requests',
    '/approvals': '/hr/approvals',
    '/my-deals': '/deals',
    '/my-tasks': '/tasks',
    '/my-customers': '/customers',
    '/my-units': '/units-registry',
    '/sales/orders': '/sales',
    '/sales/documents': '/sales',
    '/sales/price-tiers': '/sales',
    '/inventory/warehouses': '/inventory',
    '/inventory/movements': '/inventory',
    '/inventory/keepers': '/inventory',
    '/inventory/balances': '/inventory',
    '/inventory/transaction-impact': '/inventory',
    '/inventory/item-card': '/inventory',
  }), []);

  const SELF_SERVICE = useMemo(() => ['/my-profile', '/my-payroll', '/activity-balance'], []);

  const isPathAllowed = useCallback((path) => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'super_admin') return true;
    const basePath = path.split('?')[0];
    if (SELF_SERVICE.includes(basePath)) return true;
    const canonicalPath = ROUTE_ALIASES[basePath] || basePath;
    const allowed = safeArray(user?.allowedPages);
    return allowed.includes(path) || allowed.includes(basePath) || allowed.includes(canonicalPath);
  }, [user, ROUTE_ALIASES, SELF_SERVICE]);

  // Determine accessible workspaces based on user entitlements & permissions
  const accessibleWorkspaces = useMemo(() => {
    if (!user) return [];

    return WORKSPACE_DEFINITIONS.filter(ws => {
      // 1. Check module entitlement
      if (ws.checkModule && !ws.checkModule(can, user)) {
        return false;
      }
      // 2. Admins have access to all module-entitled workspaces
      if (user.role === 'admin' || user.role === 'super_admin') {
        return true;
      }
      // A category is visible when an already-authorized child page belongs to it.
      // This does not grant the category prefix or any sibling page permission.
      return ws.routePrefixes.some(pathPrefix => isPathAllowed(pathPrefix))
        || safeArray(user.allowedPages).some(path => {
          if (typeof path !== 'string' || !isPathAllowed(path)) return false;
          const basePath = path.split('?')[0];
          const canonicalPath = ROUTE_ALIASES[basePath] || basePath;
          return ws.routePrefixes.some(prefix => canonicalPath === prefix
            || canonicalPath.startsWith(prefix + '/'));
        });
    });
  }, [user, can, isPathAllowed, ROUTE_ALIASES]);

  // Compute default workspace based on role and accessible workspaces
  const computeDefaultWorkspace = useCallback(() => {
    if (!accessibleWorkspaces.length) return null;

    const role = (user?.role || '').toLowerCase();
    const jobTitle = (user?.job_title || user?.jobTitle || '').toLowerCase();
    const accessibleIds = accessibleWorkspaces.map(w => w.id);

    // System administrator -> Administration
    if ((role === 'admin' || role === 'super_admin') && accessibleIds.includes('admin')) {
      return 'admin';
    }

    // Accountant -> Finance
    if ((role.includes('account') || jobTitle.includes('account') || jobTitle.includes('finance')) && accessibleIds.includes('finance')) {
      return 'finance';
    }

    // Sales representative or Sales manager -> Sales
    if (accessibleIds.includes('sales')) {
      return 'sales';
    }

    // Fallback: first accessible workspace
    return accessibleWorkspaces[0].id;
  }, [user, accessibleWorkspaces]);

  // A stale/other-user selection must not render an inaccessible primary group.
  const [requestedWorkspace, setActiveWorkspaceState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  });
  const activeWorkspace = accessibleWorkspaces.some(ws => ws.id === requestedWorkspace)
    ? requestedWorkspace
    : computeDefaultWorkspace();

  useEffect(() => {
    if (requestedWorkspace !== activeWorkspace) {
      setActiveWorkspaceState(activeWorkspace);
    }
    if (!activeWorkspace) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) !== activeWorkspace) {
        localStorage.setItem(STORAGE_KEY, activeWorkspace);
      }
    } catch { /* Navigation remains usable when browser storage is unavailable. */ }
  }, [requestedWorkspace, activeWorkspace]);

  // Explicit switch handler (frontend-only, preserves tenant/branch/permissions)
  const switchWorkspace = useCallback((workspaceId) => {
    const isAccessible = accessibleWorkspaces.some(w => w.id === workspaceId);
    if (!isAccessible) {
      console.warn(`[WorkspaceContext] Unauthorized or unknown workspace: ${workspaceId}`);
      return;
    }
    setActiveWorkspaceState(workspaceId);
    try { localStorage.setItem(STORAGE_KEY, workspaceId); } catch { /* Optional preference only. */ }
  }, [accessibleWorkspaces]);

  // Helper to find which workspace a route pathname belongs to
  const getWorkspaceForPath = useCallback((pathname) => {
    if (!pathname) return null;
    for (const ws of WORKSPACE_DEFINITIONS) {
      if (ws.routePrefixes.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/') || pathname.startsWith(prefix + '?'))) {
        return ws.id;
      }
    }
    return null;
  }, []);

  const value = useMemo(() => ({
    activeWorkspace,
    setActiveWorkspace: switchWorkspace,
    accessibleWorkspaces,
    allWorkspaces: WORKSPACE_DEFINITIONS,
    getWorkspaceForPath,
    isPathAllowed
  }), [activeWorkspace, switchWorkspace, accessibleWorkspaces, getWorkspaceForPath, isPathAllowed]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};

export default WorkspaceContext;
