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
        <div className="min-h-screen bg-slate-950 p-8 md:p-16 flex flex-col items-center">
            <style>{`
                .portal-bg {
                    position: fixed; inset: 0; pointer-events: none; opacity: 0.3;
                    background-image: 
                        radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.05) 0%, transparent 50%),
                        linear-gradient(rgba(15, 23, 42, 0) 0%, rgba(15, 23, 42, 0.8) 100%);
                }
                .crt-overlay {
                    position: fixed; inset: 0; pointer-events: none; z-index: 50;
                    background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.05) 50%), 
                                linear-gradient(90deg, rgba(255, 0, 0, 0.01), rgba(0, 255, 0, 0.005), rgba(0, 0, 255, 0.01));
                    background-size: 100% 4px, 3px 100%;
                }
                .hud-tile {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.7) 100%);
                    backdrop-filter: blur(24px);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .hud-tile:hover {
                    border-color: rgba(99, 102, 241, 0.6);
                    transform: translateY(-8px) scale(1.03);
                    box-shadow: 0 40px 100px -20px rgba(99, 102, 241, 0.4), inset 0 0 40px rgba(99, 102, 241, 0.1);
                }
                .glow-text {
                    text-shadow: 0 0 15px rgba(99, 102, 241, 0.7);
                }
                @keyframes scan {
                    from { transform: translateY(-100%); }
                    to { transform: translateY(100%); }
                }
                .scanline {
                    position: absolute; inset: 0; background: linear-gradient(to bottom, transparent, rgba(99, 102, 241, 0.05), transparent);
                    height: 20%; width: 100%; animation: scan 8s linear infinite; pointer-events: none;
                }
            `}</style>
            
            <div className="portal-bg" />
            <div className="crt-overlay" />

            {/* HEADER HUB */}
            <div className="w-full max-w-6xl flex flex-col md:flex-row md:items-end justify-between gap-8 mb-24 relative z-10 animate-in fade-in slide-in-from-top-12 duration-1000">
                <div>
                    <div className="flex items-center gap-5 mb-5">
                        <div className="p-3 bg-indigo-600 rounded-2xl shadow-2xl shadow-indigo-600/50 border border-white/20">
                            <Cpu size={32} className="text-white" />
                        </div>
                        <div>
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.5em] glow-text block">Access Protocol: GENESIS_OS_V1</span>
                            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-0.5 block">Encryption Cipher: AES-XTS-256</span>
                        </div>
                    </div>
                    <h1 className="text-6xl font-black text-white tracking-tighter leading-none mb-3">SaaS Command Nexus</h1>
                    <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-xs opacity-60">Strategic Platform Operating Layer & Sovereign Node Control</p>
                </div>
                <button 
                  onClick={handleExit}
                  className="flex items-center gap-3 px-10 py-5 bg-white/5 border border-white/5 rounded-2xl text-slate-400 hover:text-white hover:bg-rose-600/10 hover:border-rose-500/20 transition-all font-black text-[11px] uppercase tracking-widest active:scale-95 group"
                >
                    <LogOut size={18} className="group-hover:text-rose-500 transition-colors" /> De-authorize Session
                </button>
            </div>

            {/* SECTIONS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-10 w-full max-w-7xl relative z-10 px-4">
                {modules.map((mod, idx) => (
                    <div 
                        key={mod.id} 
                        onClick={() => navigate(mod.path)}
                        className="hud-tile group p-12 rounded-[2.5rem] cursor-pointer relative overflow-hidden animate-in zoom-in-95 duration-700"
                        style={{ animationDelay: `${idx * 150}ms` }}
                    >
                        <div className="scanline" />
                        <div className="absolute -right-10 -top-10 p-12 opacity-[0.02] group-hover:opacity-[0.06] transition-opacity duration-1000 pointer-events-none transform group-hover:rotate-12 transition-transform">
                            {React.cloneElement(mod.icon, { size: 200 })}
                        </div>

                        <div className={`p-4 rounded-2xl mb-8 w-fit shadow-xl ${
                            mod.color === 'indigo' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/20' :
                            mod.color === 'emerald' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/20' :
                            mod.color === 'amber' ? 'bg-amber-600/20 text-amber-400 border border-amber-500/20' :
                            'bg-rose-600/20 text-rose-400 border border-rose-500/20'
                        }`}>
                            {React.cloneElement(mod.icon, { size: 28 })}
                        </div>

                        <h3 className="text-2xl font-black text-white mb-2 group-hover:text-indigo-300 transition-colors">{mod.name}</h3>
                        <p className="text-slate-500 font-bold text-xs uppercase tracking-wider leading-relaxed opacity-70">{mod.desc}</p>
                        
                        <div className="mt-10 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest group-hover:text-slate-400 transition-colors">Invoke Module</span>
                            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-indigo-600 transition-all">
                                <ExternalLink size={14} className="text-slate-400 group-hover:text-white" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* SYSTEM STATUS FOOTER */}
            <div className="mt-24 w-full max-w-6xl border-t border-white/5 pt-10 flex items-center justify-between opacity-30 animate-in fade-in duration-1000 delay-500 relative z-10">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest leading-none">Database Sync: Active</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest leading-none">Edge Security: Hardened</span>
                    </div>
                </div>
                <div className="flex items-center gap-2 font-black text-[10px] text-white uppercase tracking-widest">
                    <Fingerprint size={12} /> ITQAN DYNAMICS GENESIS LAYER © 2026
                </div>
            </div>
        </div>
    );
};

export default SecretPortalHUD;
