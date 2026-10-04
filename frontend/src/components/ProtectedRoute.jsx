import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

import { safeArray } from '../utils/dataUtils';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, loading } = useAuth();
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

  // Template Boundary Enforcement (Direct URL Access Isolation)
  const template = user?.template_name;
  if (template === 'real_estate') {
    const isGeneralOnly = [
      '/inventory', '/purchases', '/sales/orders', '/sales/documents',
      '/sales/price-tiers', '/sales/salesmen', '/sales/target',
      '/erp/sales', '/erp/purchasing'
    ].some(prefix => checkPath.startsWith(prefix));

    if (isGeneralOnly) {
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

  // Admin always has access to everything within their template
  if (user?.role === 'admin') return children;
  const allowed = safeArray(user?.allowedPages);

  // If user has explicit screen permission in allowedPages, allow access immediately
  if (allowed.length > 0 && allowed.includes(checkPath)) {
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
