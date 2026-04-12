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

  // Admin always has access to everything
  if (user?.role === 'admin') return children;

  // RBAC: Check role
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/" replace />;
  }

  // PBAC: Check granular path access
  const currentPath = location.pathname;
  const checkPath = currentPath === '/' ? '/dashboard' : currentPath;
  
  if (!safeArray(user?.allowedPages).includes(checkPath)) {
    // If not allowed, redirect to dashboard or home
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
