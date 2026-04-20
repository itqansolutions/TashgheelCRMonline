import React, { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import SecretPortalGate from './SecretPortalGate';
import { useAuth } from '../../context/AuthContext';

const PlatformWrapper = () => {
    const { user } = useAuth();
    const [isAuthorized, setIsAuthorized] = useState(sessionStorage.getItem('ITQAN_CORE_AUTHORIZED') === 'true');
    
    // System tenant check for extreme security
    const SYSTEM_DEFAULT_TENANT = '00000000-0000-0000-0000-000000000000';
    const isSystemAdmin = user && user.tenant_id === SYSTEM_DEFAULT_TENANT && user.role === 'admin';

    if (!isSystemAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    if (!isAuthorized) {
        return <SecretPortalGate onAuthorized={() => setIsAuthorized(true)} />;
    }

    return <Outlet />;
};

export default PlatformWrapper;
