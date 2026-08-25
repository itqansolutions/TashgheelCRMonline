import React, { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import SecretPortalGate from './SecretPortalGate';
import { useAuth } from '../../context/AuthContext';
import { Cpu, Shield, Loader2 } from 'lucide-react';

const HandshakeLoader = () => (
    <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center p-6 z-[1000]">
        <div className="relative mb-6">
            <div className="p-5 bg-indigo-50 rounded-2xl border border-indigo-100 shadow-md">
                <Cpu size={40} className="text-indigo-600 animate-pulse" />
            </div>
        </div>
        <div className="flex flex-col items-center gap-3 text-center">
            <h2 className="text-lg font-bold text-slate-800 tracking-wide">ITQAN Platform Nexus</h2>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Loader2 size={14} className="animate-spin text-indigo-600" />
                <span>Verifying Administrator Session...</span>
            </div>
        </div>
    </div>
);

const PlatformWrapper = () => {
    const { user, loading } = useAuth();
    const [isAuthorized, setIsAuthorized] = useState(sessionStorage.getItem('ITQAN_CORE_AUTHORIZED') === 'true');
    
    // System tenant check for extreme security
    const SYSTEM_DEFAULT_TENANT = '00000000-0000-0000-0000-000000000000';

    if (loading) {
        return <HandshakeLoader />;
    }

    const isSystemAdmin = user && user.tenant_id === SYSTEM_DEFAULT_TENANT && user.role === 'admin';

    if (!isSystemAdmin) {
        console.warn(`[AUTH_Nexus] Unauthorized access attempt detected. User ${user?.email || 'Unknown'} rejected.`);
        return <Navigate to="/dashboard" replace />;
    }

    if (!isAuthorized) {
        return <SecretPortalGate onAuthorized={() => setIsAuthorized(true)} />;
    }

    return <Outlet />;
};

export default PlatformWrapper;
