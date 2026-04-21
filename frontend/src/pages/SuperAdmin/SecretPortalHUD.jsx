import React from 'react';
import { 
  Cpu, Building2, CreditCard, ShieldAlert, 
  Layers, Zap, Fingerprint, Activity, BarChart3,
  Network, Settings, ExternalLink, ArrowLeft, LogOut
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SecretPortalHUD = () => {
    const navigate = useNavigate();

    const modules = [
        {
            id: 'hub',
            name: 'Platform Command Center',
            desc: 'Global Tenant Management & SaaS Health',
            icon: <Building2 />,
            path: 'hub',
            color: 'indigo'
        },
        {
            id: 'pricing',
            name: 'Pricing Engine',
            desc: 'Subscription Tiers & Business Rules',
            icon: <CreditCard />,
            path: 'pricing',
            color: 'emerald'
        },
        {
            id: 'upgrades',
            name: 'Upgrade Requests',
            desc: 'Expansion Workflow & License Approval',
            icon: <Zap />,
            path: 'upgrades',
            color: 'amber'
        },
        {
            id: 'audit',
            name: 'The Oracle (Audit)',
            desc: 'System-Wide Action Monitoring',
            icon: <Activity />,
            path: 'audit',
            color: 'rose'
        }
    ];

    const handleExit = () => {
        sessionStorage.removeItem('ITQAN_CORE_AUTHORIZED');
        navigate('/dashboard');
    };

    return (
    return (
        <div className="min-h-screen bg-[var(--bg-main)] p-8 md:p-16 flex flex-col items-center">
            <style>{`
                .hud-header-grad {
                    background: var(--grad-premium);
                    border-radius: 24px;
                    padding: 48px;
                    position: relative;
                    overflow: hidden;
                    box-shadow: var(--shadow-xl);
                }
                .hud-header-decoration {
                    position: absolute;
                    top: -20px;
                    right: -20px;
                    opacity: 0.1;
                    transform: rotate(15deg);
                }
                .tile-icon-container {
                    width: 60px;
                    height: 60px;
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 24px;
                }
                .tile-indigo { background: rgba(79, 70, 229, 0.1); color: #4f46e5; }
                .tile-emerald { background: rgba(16, 185, 129, 0.1); color: #10b981; }
                .tile-amber { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
                .tile-rose { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
                
                .module-card {
                    padding: 32px;
                    cursor: pointer;
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                }
            `}</style>

            {/* HEADER HUB */}
            <div className="w-full max-w-7xl animate-in fade-in slide-in-from-top-8 duration-700 mb-16">
                <div className="hud-header-grad">
                    <div className="hud-header-decoration">
                        <Cpu size={200} color="white" />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="bg-white/20 p-2 rounded-lg backdrop-blur-md">
                                <ShieldCheck size={20} className="text-white" />
                            </div>
                            <span className="text-xs font-bold text-white/80 uppercase tracking-[0.3em]">Platform Authorization: Genesis v4.8</span>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-2">Platform Command Center</h1>
                        <p className="text-indigo-100 font-medium text-lg max-w-2xl opacity-90">Strategic infrastructure management and global node operations for Itqan Solutions.</p>
                    </div>
                </div>
            </div>

            {/* SECTIONS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 w-full max-w-7xl mb-24">
                {modules.map((mod, idx) => (
                    <div 
                        key={mod.id} 
                        onClick={() => navigate(mod.path)}
                        className="ap-card module-card wow-reveal"
                        style={{ animationDelay: `${idx * 0.1}s` }}
                    >
                        <div className={`tile-icon-container tile-${mod.color}`}>
                            {React.cloneElement(mod.icon, { size: 28 })}
                        </div>

                        <h3 className="text-xl font-extrabold text-[var(--text-main)] mb-3 group-hover:text-[var(--primary)] transition-colors">{mod.name}</h3>
                        <p className="text-[var(--text-muted)] font-medium text-sm leading-relaxed mb-10 flex-1">{mod.desc}</p>
                        
                        <div className="pt-6 border-t border-[var(--border)] flex items-center justify-between mt-auto">
                            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Configure Module</span>
                            <div className="w-10 h-10 rounded-full bg-[var(--bg-main)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--primary)] hover:text-white transition-all shadow-sm">
                                <ExternalLink size={16} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* SYSTEM STATUS FOOTER */}
            <div className="w-full max-w-7xl flex flex-col md:flex-row items-center justify-between gap-6 opacity-60 mt-auto pb-12">
                <div className="flex flex-wrap items-center gap-10">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                        <span className="text-xs font-bold text-[var(--text-muted)]">Database Connectivity: Secure</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full" />
                        <span className="text-xs font-bold text-[var(--text-muted)]">Platform Hardening: Active</span>
                    </div>
                </div>
                <div className="flex items-center gap-3 font-black text-[11px] text-[var(--text-muted)] uppercase tracking-widest">
                    <Fingerprint size={16} className="text-indigo-500" /> Itqan Dynamics Genesis Layer © 2026
                </div>
            </div>

            <button 
              onClick={handleExit}
              className="mt-8 flex items-center gap-2 text-[var(--text-muted)] hover:text-rose-600 transition-colors font-bold text-xs uppercase tracking-widest"
            >
                <LogOut size={16} /> De-authorize Session Profile
            </button>
        </div>


    );
};

export default SecretPortalHUD;
