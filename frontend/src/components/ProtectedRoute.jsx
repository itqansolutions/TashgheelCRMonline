import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useModule } from '../hooks/useModule';
import { safeArray } from '../utils/dataUtils';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const { can } = useModule();
  const location = useLocation();

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--primary)' }}>
      Verifying Access...
    </div>
  );

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const currentPath = location.pathname;
  const checkPath = currentPath === '/' ? '/dashboard' : currentPath;

  // Optional Module Entitlement Enforcement
  if (checkPath.startsWith('/inventory') || checkPath.startsWith('/products')) {
    if (!can('inventory')) {
      return <Navigate to="/dashboard" replace />;
    }
  }
  if (checkPath.startsWith('/purchases')) {
    if (!can('purchasing') && !can('inventory')) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  // Template Boundary Enforcement (Direct URL Access Isolation for Core Template Features)
  const template = user?.template_name;
  if (template === 'real_estate') {
    const isGeneralSalesOnly = [
      '/sales/orders', '/sales/documents',
      '/sales/price-tiers',
      '/erp/sales'
    ].some(prefix => checkPath.startsWith(prefix));

    if (isGeneralSalesOnly) {
      return <Navigate to="/dashboard" replace />;
    }
  } else if (template === 'general') {
    const isReOnly = [
      '/units-registry'
    ].some(prefix => checkPath.startsWith(prefix));

    if (isReOnly) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  // Admin always has access to everything within their template & enabled modules
  if (user?.role === 'admin') return children;
  // Route alias & canonical mapping for permission evaluation
  const ROUTE_ALIASES = {
    '/my-attendance': '/hr/my-attendance',
    '/my-requests': '/hr/my-requests',
    '/approvals': '/hr/approvals',
    '/my-payroll': '/hr/payroll',
    '/activity-balance': '/hr/activity-balance',
    '/my-deals': '/deals',
    '/my-tasks': '/tasks',
    '/my-customers': '/customers',
    '/my-units': '/units-registry',
  };

  const canonicalPath = ROUTE_ALIASES[checkPath] || checkPath;

  // If user has explicit screen permission in allowedPages, allow access immediately
  if (allowed.length > 0 && (allowed.includes(checkPath) || allowed.includes(canonicalPath))) {
    return children;
  }

  // If user has allowedPages configured and current path is not included, redirect
  if (allowed.length > 0 && !allowed.includes(checkPath)) {
    if (checkPath !== '/dashboard' && allowed.includes('/dashboard')) {
      return <Navigate to="/dashboard" replace />;
    }
    const fallback = allowed[0] || '/my-profile';
    if (checkPath !== fallback) {
      return <Navigate to={fallback} replace />;
    }
  }

  // RBAC Fallback: only check role if allowedPages is not configured
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default ProtectedRoute;
