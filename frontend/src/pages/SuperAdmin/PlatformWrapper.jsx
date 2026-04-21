import React, { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import SecretPortalGate from './SecretPortalGate';
import { useAuth } from '../../context/AuthContext';
import { Cpu, Shield, Loader2 } from 'lucide-react';

const HandshakeLoader = () => (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 z-[1000]">
        <div className="relative mb-12 animate-pulse">
            <div className="p-6 bg-indigo-600/20 rounded-[2.5rem] border border-indigo-500/30">
                <Cpu size={48} className="text-indigo-400" />
            </div>
            <div className="absolute -inset-4 bg-indigo-500/10 rounded-full blur-2xl animate-pulse" />
        </div>
        <div className="flex flex-col items-center gap-4">
            <h2 className="text-xl font-black text-white uppercase tracking-[0.5em] animate-in fade-in slide-in-from-bottom-2 duration-1000">Genesis Handshake</h2>
            <div className="flex items-center gap-3">
                <Loader2 size={14} className="animate-spin text-indigo-500" />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Verifying Sovereign Identity...</span>
            </div>
        </div>
        
        {/* CRT Scanline effect also here for consistency */}
        <div className="fixed inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.01),rgba(0,255,0,0.005),rgba(0,0,255,0.01))] bg-[length:100%_4px,3px_100%]" />
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
