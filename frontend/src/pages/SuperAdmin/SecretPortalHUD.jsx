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
        <div className="min-h-screen bg-slate-950 p-8 md:p-16 flex flex-col items-center relative overflow-hidden">
            <style>{`
                .portal-bg {
                    position: fixed; inset: 0; pointer-events: none; opacity: 0.2;
                    background-image: 
                        radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.05) 0%, transparent 50%),
                        linear-gradient(rgba(15, 23, 42, 0) 0%, rgba(15, 23, 42, 0.9) 100%);
                    z-index: 0;
                }
                .crt-overlay {
                    position: fixed; inset: 0; pointer-events: none; z-index: 50;
                    background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.03) 50%), 
                                linear-gradient(90deg, rgba(255, 0, 0, 0.005), rgba(0, 255, 0, 0.002), rgba(0, 0, 255, 0.005));
                    background-size: 100% 3px, 2px 100%;
                }
                .hud-tile {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%);
                    backdrop-filter: blur(32px);
                    border: 1px solid rgba(255, 255, 255, 0.03);
                    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                    min-height: 380px;
                    display: flex;
                    flex-direction: column;
                }
                .hud-tile:hover {
                    border-color: rgba(99, 102, 241, 0.4);
                    transform: translateY(-8px) scale(1.02);
                    box-shadow: 0 40px 120px -20px rgba(99, 102, 241, 0.3), inset 0 0 20px rgba(99, 102, 241, 0.05);
                }
                .glow-text {
                    text-shadow: 0 0 12px rgba(99, 102, 241, 0.6);
                }
                @keyframes scan {
                    from { transform: translateY(-100%); }
                    to { transform: translateY(100%); }
                }
                .scanline {
                    position: absolute; inset: 0; background: linear-gradient(to bottom, transparent, rgba(99, 102, 241, 0.02), transparent);
                    height: 25%; width: 100%; animation: scan 10s linear infinite; pointer-events: none;
                }
            `}</style>
            
            <div className="portal-bg" />
            <div className="crt-overlay" />

            {/* HEADER HUB */}
            <div className="w-full max-w-7xl flex flex-col md:flex-row md:items-end justify-between gap-10 mb-20 relative z-10 animate-in fade-in slide-in-from-top-12 duration-1000">
                <div>
                    <div className="flex items-center gap-5 mb-5">
                        <div className="p-3.5 bg-indigo-600 rounded-2xl shadow-2xl shadow-indigo-600/40 border border-white/20">
                            <Cpu size={32} className="text-white" />
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-8">
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] glow-text block">Access Protocol: GENESIS_OS_V1</span>
                            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest block opacity-60">Encryption Cipher: AES-XTS-256</span>
                        </div>
                    </div>
                    <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-none mb-4">SaaS Command Nexus</h1>
                    <p className="text-slate-500 font-bold uppercase tracking-[0.25em] text-[10px] md:text-xs opacity-60">Sovereign Layer Control & Strategic Node Operation System</p>
                </div>
                <button 
                  onClick={handleExit}
                  className="flex items-center gap-3 px-10 py-5 bg-white/5 border border-white/5 rounded-2xl text-slate-400 hover:text-white hover:bg-rose-950/20 hover:border-rose-500/20 transition-all font-black text-[11px] uppercase tracking-widest active:scale-95 group"
                >
                    <LogOut size={18} className="group-hover:text-rose-500 transition-colors" /> De-authorize Session
                </button>
            </div>

            {/* SECTIONS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-12 w-full max-w-7xl relative z-10">
                {modules.map((mod, idx) => (
                    <div 
                        key={mod.id} 
                        onClick={() => navigate(mod.path)}
                        className="hud-tile group p-12 rounded-[3.5rem] cursor-pointer relative overflow-hidden animate-in zoom-in-95 duration-700"
                        style={{ animationDelay: `${idx * 120}ms` }}
                    >
                        <div className="scanline" />
                        <div className="absolute -right-12 -top-12 p-12 opacity-[0.01] group-hover:opacity-[0.05] transition-opacity duration-1000 transform group-hover:rotate-12 transition-transform">
                            {React.cloneElement(mod.icon, { size: 220 })}
                        </div>

                        <div className={`p-5 rounded-2xl mb-8 w-fit shadow-2xl ${
                            mod.color === 'indigo' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 shadow-indigo-600/10' :
                            mod.color === 'emerald' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 shadow-emerald-600/10' :
                            mod.color === 'amber' ? 'bg-amber-600/20 text-amber-400 border border-amber-500/20 shadow-amber-600/10' :
                            'bg-rose-600/20 text-rose-400 border border-rose-500/20 shadow-rose-600/10'
                        }`}>
                            {React.cloneElement(mod.icon, { size: 30 })}
                        </div>

                        <div className="flex-1">
                            <h3 className="text-2xl font-black text-white mb-3 group-hover:text-indigo-400 transition-colors uppercase tracking-tight">{mod.name}</h3>
                            <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest leading-relaxed opacity-70 mb-8">{mod.desc}</p>
                        </div>
                        
                        <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                            <span className="text-[9px] font-black text-slate-700 uppercase tracking-[0.2em] group-hover:text-slate-400 transition-colors">Invoke Module</span>
                            <div className="w-11 h-11 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-indigo-600 group-hover:shadow-[0_0_20px_#4f46e5] transition-all duration-500">
                                <ExternalLink size={14} className="text-slate-400 group-hover:text-white" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* SYSTEM STATUS FOOTER */}
            <div className="mt-32 w-full max-w-7xl border-t border-white/5 pt-12 flex flex-col md:flex-row items-center justify-between gap-6 opacity-30 animate-in fade-in duration-1000 delay-500 relative z-10 pb-16">
                <div className="flex items-center gap-10">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_#10b981]" />
                        <span className="text-[9px] font-black text-white uppercase tracking-[0.3em] leading-none">Database Sync: Active</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full shadow-[0_0_8px_#6366f1]" />
                        <span className="text-[9px] font-black text-white uppercase tracking-[0.3em] leading-none">Core Security: Hardened</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_#10b981]" />
                        <span className="text-[9px] font-black text-white uppercase tracking-[0.3em] leading-none">System Load: Nominal</span>
                    </div>
                </div>
                <div className="flex items-center gap-3 font-black text-[9px] text-white uppercase tracking-[0.4em]">
                    <Fingerprint size={14} className="text-indigo-500" /> ITQAN GENESIS OS v4.8_STABLE
                </div>
            </div>
        </div>

    );
};

export default SecretPortalHUD;
