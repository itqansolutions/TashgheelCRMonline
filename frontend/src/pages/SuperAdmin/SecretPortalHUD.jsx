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
                .hud-tile {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.7) 100%);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }
                .hud-tile:hover {
                    border-color: rgba(99, 102, 241, 0.4);
                    transform: translateY(-10px) scale(1.02);
                    box-shadow: 0 40px 80px -20px rgba(99, 102, 241, 0.25);
                }
                .glow-text {
                    text-shadow: 0 0 10px rgba(99, 102, 241, 0.5);
                }
            `}</style>
            
            <div className="portal-bg" />

            {/* HEADER HUB */}
            <div className="w-full max-w-6xl flex flex-col md:flex-row md:items-end justify-between gap-8 mb-20 relative z-10 animate-in fade-in slide-in-from-top-4 duration-700">
                <div>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-600/30">
                            <Cpu size={28} className="text-white" />
                        </div>
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] glow-text">Access Mode: GENESIS CORE</span>
                    </div>
                    <h1 className="text-5xl font-black text-white tracking-tighter leading-none mb-2">Internal Management Hub</h1>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-xs opacity-70">ITQAN CRM Platform Operating Layer</p>
                </div>
                <button 
                  onClick={handleExit}
                  className="flex items-center gap-3 px-8 py-4 bg-white/5 border border-white/5 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-all font-black text-[10px] uppercase tracking-widest active:scale-95"
                >
                    <LogOut size={16} /> De-authorize Session
                </button>
            </div>

            {/* SECTIONS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-8 w-full max-w-7xl relative z-10">
                {modules.map((mod, idx) => (
                    <div 
                        key={mod.id} 
                        onClick={() => navigate(mod.path)}
                        className="hud-tile group p-10 rounded-[2.5rem] cursor-pointer relative overflow-hidden animate-in zoom-in-95 duration-500"
                        style={{ animationDelay: `${idx * 100}ms` }}
                    >
                        <div className="absolute -right-8 -top-8 p-12 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none">
                            {React.cloneElement(mod.icon, { size: 160 })}
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
