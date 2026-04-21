import React, { useState } from 'react';
import { 
  Cpu, Building2, CreditCard, Shield,
  Layers, Zap, Fingerprint, Activity, BarChart3,
  Network, Settings, ExternalLink, ArrowLeft, LogOut,
  LayoutGrid, Terminal, History, Bell, User, ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const SecretPortalHUD = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [activePath, setActivePath] = useState(location.pathname);

    const modules = [
        {
            id: 'hub',
            name: 'Platform Command Center',
            desc: 'Global Tenant Management & SaaS Health monitoring systems.',
            icon: <LayoutGrid size={22} />,
            path: '/itqan-crm-hud/hub',
            color: 'indigo'
        },
        {
            id: 'pricing',
            name: 'Pricing Engine',
            desc: 'Subscription Tiers & Business Rules engine for dynamic billing.',
            icon: <CreditCard size={22} />,
            path: '/itqan-crm-hud/pricing',
            color: 'indigo'
        },
        {
            id: 'upgrades',
            name: 'Upgrade Requests',
            desc: 'Expansion Workflow & License Approval for enterprise clients.',
            icon: <Zap size={22} />,
            path: '/itqan-crm-hud/upgrades',
            color: 'indigo'
        },
        {
            id: 'audit',
            name: 'The Oracle (Audit)',
            desc: 'Forensic event tracking & system-wide action audit trails.',
            icon: <Activity size={22} />,
            path: '/itqan-crm-hud/audit',
            color: 'indigo'
        }
    ];

    const navLinks = [
        { name: 'Overview', path: '/itqan-crm-hud', icon: <LayoutGrid size={18} /> },
        { name: 'Command Center', path: '/itqan-crm-hud/hub', icon: <Terminal size={18} /> },
        { name: 'Pricing Engine', path: '/itqan-crm-hud/pricing', icon: <CreditCard size={18} /> },
        { name: 'Upgrade Requests', path: '/itqan-crm-hud/upgrades', icon: <Zap size={18} /> },
        { name: 'The Oracle', path: '/itqan-crm-hud/audit', icon: <History size={18} /> },
    ];

    const handleExit = () => {
        sessionStorage.removeItem('ITQAN_CORE_AUTHORIZED');
        navigate('/dashboard');
    };

    return (
        <div className="min-h-screen bg-[#020617] flex text-slate-300 font-sans relative overflow-hidden">
            {/* --- GENESIS CORE OVERLAYS --- */}
            {/* CRT Scanline Effect */}
            <div className="fixed inset-0 pointer-events-none z-[999] opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.02),rgba(0,255,0,0.01),rgba(0,0,255,0.02))] bg-[length:100%_3px,2px_100%]" />
            
            {/* Ambient Background Glows */}
            <div className="fixed -top-24 -left-24 w-96 h-96 bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[150px] pointer-events-none" />

            <style>{`
                @keyframes neonPulse {
                    0%, 100% { box-shadow: 0 0 15px rgba(99, 102, 241, 0.2), inset 0 0 5px rgba(99, 102, 241, 0.1); }
                    50% { box-shadow: 0 0 25px rgba(99, 102, 241, 0.5), inset 0 0 10px rgba(99, 102, 241, 0.2); }
                }
                @keyframes slideRight {
                    from { opacity: 0; transform: translateX(-10px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes borderFlow {
                    0% { border-color: rgba(99, 102, 241, 0.2); }
                    50% { border-color: rgba(99, 102, 241, 0.6); }
                    100% { border-color: rgba(99, 102, 241, 0.2); }
                }

                .genesis-sidebar {
                    width: 280px;
                    background: rgba(15, 23, 42, 0.7);
                    backdrop-filter: blur(12px);
                    border-right: 1px solid rgba(255, 255, 255, 0.05);
                    display: flex;
                    flex-direction: column;
                    padding: 32px 0;
                    height: 100vh;
                    position: sticky;
                    top: 0;
                    z-index: 50;
                }
                .nav-item {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 14px 28px;
                    color: #94a3b8;
                    font-weight: 700;
                    font-size: 13px;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                    margin: 2px 16px;
                    border-radius: 12px;
                    position: relative;
                }
                .nav-item:hover {
                    color: #fff;
                    background: rgba(255, 255, 255, 0.03);
                    padding-left: 36px;
                }
                .nav-item.active {
                    color: #fff;
                    background: linear-gradient(90deg, rgba(79, 70, 229, 0.2) 0%, rgba(79, 70, 229, 0) 100%);
                    border-left: 3px solid #6366f1;
                }
                .nav-item.active::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: #6366f1;
                    opacity: 0.1;
                    filter: blur(15px);
                }

                .main-content {
                    flex: 1;
                    padding: 40px 60px;
                    position: relative;
                    z-index: 10;
                }
                .hero-glass-card {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%);
                    backdrop-filter: blur(8px);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 32px;
                    padding: 48px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 48px;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                    animation: slideRight 0.8s ease-out;
                }
                .module-v2-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 28px 32px;
                    background: rgba(30, 41, 59, 0.2);
                    border: 1px solid rgba(255, 255, 255, 0.03);
                    border-radius: 20px;
                    margin-bottom: 16px;
                    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .module-v2-row:hover {
                    background: rgba(79, 70, 229, 0.05);
                    border-color: rgba(99, 102, 241, 0.3);
                    transform: translateX(8px) scale(1.01);
                    box-shadow: 0 10px 30px -10px rgba(79, 70, 229, 0.3);
                }
                
                .neon-button {
                    background: #6366f1;
                    color: white;
                    padding: 12px 28px;
                    border-radius: 12px;
                    font-weight: 900;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.15em;
                    transition: all 0.3s;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
                }
                .neon-button:hover {
                    background: #4f46e5;
                    box-shadow: 0 0 25px rgba(99, 102, 241, 0.6);
                    transform: translateY(-2px);
                }

                .brand-glow {
                    width: 40px;
                    height: 40px;
                    background: #6366f1;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    animation: neonPulse 3s infinite;
                }
                .status-glitch {
                    font-size: 10px;
                    font-weight: 900;
                    color: #10b981;
                    text-transform: uppercase;
                    letter-spacing: 0.2em;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .status-dot {
                    width: 6px;
                    height: 6px;
                    background: #10b981;
                    border-radius: 50%;
                    box-shadow: 0 0 10px #10b981;
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.5); opacity: 0.5; }
                    100% { transform: scale(1); opacity: 1; }
                }
            `}</style>

            {/* SIDEBAR */}
            <aside className="genesis-sidebar">
                <div className="px-8 mb-12 flex items-center gap-5">
                    <div className="brand-glow">
                        <Cpu size={22} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black tracking-tighter text-white">GENESIS <span className="text-indigo-500">ADX</span></h2>
                        <div className="status-glitch">
                            <div className="status-dot"></div>
                            Sovereign Active
                        </div>
                    </div>
                </div>

                <nav className="flex-1">
                    <div className="px-10 mb-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">System Core</div>
                    {navLinks.map((link) => (
                        <div 
                            key={link.name} 
                            onClick={() => { setActivePath(link.path); navigate(link.path); }}
                            className={`nav-item ${activePath === link.path ? 'active' : ''}`}
                        >
                            {link.icon}
                            <span>{link.name}</span>
                        </div>
                    ))}
                    
                    <div className="h-px bg-slate-800/50 mx-8 my-6"></div>

                    <div 
                        onClick={handleExit}
                        className="nav-item text-rose-500/70 hover:text-rose-400 hover:bg-rose-500/5"
                    >
                        <LogOut size={18} />
                        <span>Terminate Session</span>
                    </div>
                </nav>

                <div className="mt-auto px-8 py-6 opacity-40 hover:opacity-100 transition-opacity">
                    <div className="flex justify-between items-center text-[9px] font-black text-slate-500 tracking-widest uppercase">
                        <span>Kernel 0.8.4-LTS</span>
                        <span className="text-indigo-400">Stable Build</span>
                    </div>
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main className="main-content">
                {/* TOP HEADER */}
                <div className="flex justify-between items-center mb-16 px-4">
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight">Command <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-blue-500">Interface</span></h1>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Authorized Access Only • System ID: XC-904</p>
                    </div>
                    <div className="flex items-center gap-8">
                        <div className="h-10 w-[1px] bg-slate-800" />
                        <div className="flex items-center gap-4 group cursor-pointer">
                            <div className="text-right">
                                <p className="text-xs font-black text-white">ROOT_ADMIN</p>
                                <p className="text-[10px] font-bold text-indigo-500">Nexus Sovereign</p>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 p-1 transition-transform group-hover:scale-105">
                                 <img src="https://ui-avatars.com/api/?name=Admin&background=4f46e5&color=fff" alt="User" className="w-full h-full rounded-xl object-cover" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* HERO BANNER CARD */}
                <div className="hero-glass-card group">
                    <div className="max-w-xl">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-6">
                            <Activity size={12} /> System Integrity: 99.9%
                        </div>
                        <h3 className="text-4xl font-black text-white mb-6 leading-tight">Master <br/>Orchestration <span className="text-indigo-500">Nexus</span></h3>
                        <p className="text-slate-400 font-medium leading-relaxed text-lg">
                            Welcome, Architect. You are now interfaced with the primary command node. 
                            Global tenant state-synchronization and forensic audit engines are active.
                        </p>
                        <div className="mt-10 flex gap-4">
                             <button onClick={() => navigate('/itqan-crm-hud/hub')} className="neon-button">Initialize Hub</button>
                             <button className="px-6 py-3 rounded-12 border border-slate-700 text-slate-400 font-black text-[11px] uppercase tracking-widest hover:bg-slate-800 transition-colors">Diagnostics</button>
                        </div>
                    </div>
                    <div className="w-72 h-72 relative perspective-[1000px]">
                        <div className="absolute inset-0 bg-indigo-500/20 rounded-[3rem] blur-3xl group-hover:bg-indigo-500/30 transition-colors" />
                        <img 
                            src="/assets/genesis-hero.png" 
                            alt="System Graphic" 
                            className="relative z-10 w-full h-full object-cover rounded-[3rem] shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/5 transform rotate-y-[-10deg] group-hover:rotate-y-0 transition-transform duration-700"
                        />
                    </div>
                </div>

                {/* CORE MODULES GRID */}
                <div className="mb-8 flex items-center gap-6">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] whitespace-nowrap">Operational Nodes</span>
                    <div className="h-[1px] bg-slate-800 flex-1"></div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {modules.map((mod, idx) => (
                        <div key={mod.id} className={`module-v2-row delay-${idx * 100}`}>
                            <div className="flex items-center gap-8">
                                <div className="w-14 h-14 bg-indigo-500/5 rounded-2xl flex items-center justify-center text-indigo-500 border border-indigo-500/10 shadow-[inset_0_0_15px_rgba(99,102,241,0.05)]">
                                    {mod.icon}
                                </div>
                                <div>
                                    <h4 className="font-black text-white text-xl tracking-tight mb-1">{mod.name}</h4>
                                    <p className="text-slate-500 text-sm font-medium">{mod.desc}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-8">
                                <div className="text-right hidden md:block">
                                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Node Status</p>
                                    <p className="text-xs font-bold text-indigo-400">Operational</p>
                                </div>
                                <button 
                                    onClick={() => navigate(mod.path)}
                                    className="px-6 py-3 rounded-xl border border-indigo-500/30 text-indigo-400 font-black text-[10px] uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all shadow-[0_0_20px_rgba(99,102,241,0.15)] group-hover:shadow-[0_0_30px_rgba(99,102,241,0.3)]"
                                >
                                    Access Node
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
};

export default SecretPortalHUD;

