import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useModule } from '../hooks/useModule';
import { useLanguage } from '../context/LanguageContext';
import { safeArray } from '../utils/dataUtils';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const { can } = useModule();
  const { t } = useLanguage();
  const location = useLocation();

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--primary)' }}>
      {t('common.verifyingAccess')}
    </div>
  );

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const currentPath = location.pathname;
  const checkPath = currentPath === '/' ? '/dashboard' : currentPath;
  const allowed = safeArray(user?.allowedPages);
  const safeFallback = (allowed.includes('/dashboard')) ? '/dashboard' : '/my-profile';

  // Module Entitlement Enforcement (applies to ALL roles including tenant admin)
  if (checkPath.startsWith('/inventory') || checkPath.startsWith('/products')) {
    if (can('inventory') === false || (!can('inventory') && !can('purchasing'))) {
      return <Navigate to={safeFallback} replace />;
    }
  }
  if (checkPath.startsWith('/purchases') || checkPath.startsWith('/contacts/vendors')) {
    if (can('purchasing') === false || (!can('purchasing') && !can('inventory'))) {
      return <Navigate to={safeFallback} replace />;
    }
  }
  if (
    checkPath.startsWith('/hr') ||
    ['/my-attendance', '/my-requests', '/approvals', '/my-payroll', '/activity-balance'].includes(checkPath)
  ) {
    if (!can('hr')) {
      return <Navigate to={safeFallback} replace />;
    }
  }
  if (checkPath.startsWith('/finance')) {
    const tabParam = new URLSearchParams(location.search).get('tab');
    const isQuotationTab = tabParam && tabParam.toLowerCase() === 'quotations';
    if (!isQuotationTab && !can('finance')) {
      return <Navigate to={safeFallback} replace />;
    }
  }
  if (checkPath.startsWith('/automation')) {
    if (!can('automation')) {
      return <Navigate to={safeFallback} replace />;
    }
  }
  if (checkPath.startsWith('/reports')) {
    if (can('reports') === false) {
      return <Navigate to={safeFallback} replace />;
    }
  }
  if (['/deals', '/my-deals', '/tasks', '/my-tasks', '/customers', '/my-customers'].some(prefix => checkPath.startsWith(prefix))) {
    if (can('crm') === false) {
      return <Navigate to={safeFallback} replace />;
    }
  }
  if (checkPath.startsWith('/sales') || checkPath.startsWith('/erp/sales')) {
    const hasSales = can('sales') !== false && (can('sales') === true || can('crm') === true);
    if (!hasSales) {
      return <Navigate to={safeFallback} replace />;
    }
  }
  if (checkPath.startsWith('/marketing') || checkPath.startsWith('/whatsapp-chat') || checkPath.startsWith('/integrations/meta-forms') || checkPath.startsWith('/integrations/whatsapp')) {
    const hasMarketing = can('marketing') !== false && (can('marketing') === true || can('crm') === true);
    if (!hasMarketing) {
      return <Navigate to={safeFallback} replace />;
    }
  }

  // Template & Module Boundary Enforcement for Real Estate
  const template = user?.template_name;
  const hasRealEstate = can('real_estate') !== false && (template === 'real_estate' || can('real_estate') === true);

  if (template === 'real_estate' && !can('sales')) {
    const isGeneralSalesOnly = [
      '/sales/orders', '/sales/documents',
      '/sales/price-tiers',
      '/erp/sales'
    ].some(prefix => checkPath.startsWith(prefix));

    if (isGeneralSalesOnly) {
      return <Navigate to={safeFallback} replace />;
    }
  }

  // Real Estate-only workspaces
  const isReOnly = [
    '/units-registry', '/my-units',
    '/reservations', '/contracts', '/installments', '/commissions', '/handover',
    '/integrations/property-finder'
  ].some(prefix => checkPath.startsWith(prefix));

  if (isReOnly && !hasRealEstate) {
    return <Navigate to={safeFallback} replace />;
  }

  // Admin always has access to everything within their template & enabled modules
  if (user?.role === 'admin') return children;

  // Personal self-service pages: data is scoped to the authenticated user server-side
  // (GET /hr/payroll/my, GET /hr/activity-balances/my), so no admin screen permission is required.
  const SELF_SERVICE = ['/my-profile', '/my-payroll', '/activity-balance'];
  if (SELF_SERVICE.includes(checkPath)) return children;

  // Route alias & canonical mapping for permission evaluation (only for actual aliases, not RE workspaces that now have independent permissions)
  const ROUTE_ALIASES = {
    '/my-attendance': '/hr/my-attendance',
    '/my-requests': '/hr/my-requests',
    '/approvals': '/hr/approvals',
    '/my-deals': '/deals',
    '/my-tasks': '/tasks',
    '/my-customers': '/customers',
    '/my-units': '/units-registry',
  };

  const canonicalPath = ROUTE_ALIASES[checkPath] || checkPath;
  const basePath = '/' + checkPath.split('/').filter(Boolean)[0];

  // If user has explicit screen permission in allowedPages, allow access immediately
  if (allowed.length > 0 && (
    allowed.includes(checkPath) || 
    allowed.includes(canonicalPath) || 
    allowed.includes(basePath)
  )) {
    return children;
  }

  // If user has allowedPages configured and current path is not included, redirect to safe fallback
  if (allowed.length > 0 && !allowed.includes(checkPath) && !allowed.includes(basePath)) {
    if (checkPath !== safeFallback) {
      return <Navigate to={safeFallback} replace />;
    }
  }

  // RBAC Fallback: only check role if allowedPages is not configured
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to={safeFallback} replace />;
  }

  return children;
};

export default ProtectedRoute;
