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
        <div className="min-h-screen bg-white flex text-[#1e293b] font-sans">
            <style>{`
                .genesis-sidebar {
                    width: 280px;
                    background: #f8f9fc;
                    border-right: 1px solid #edf2f7;
                    display: flex;
                    flex-direction: column;
                    padding: 32px 0;
                    height: 100vh;
                    position: sticky;
                    top: 0;
                }
                .nav-item {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 14px 28px;
                    color: #64748b;
                    font-weight: 600;
                    font-size: 14px;
                    transition: all 0.2s;
                    cursor: pointer;
                    margin: 4px 16px;
                    border-radius: 12px;
                }
                .nav-item:hover {
                    color: #4f46e5;
                    background: rgba(79, 70, 229, 0.04);
                }
                .nav-item.active {
                    color: #4f46e5;
                    background: white;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
                }
                .main-content {
                    flex: 1;
                    padding: 40px 60px;
                    background: #ffffff;
                    min-height: 100vh;
                }
                .header-bar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 48px;
                }
                .hero-card {
                    background: #ffffff;
                    border: 1px solid #edf2f7;
                    border-radius: 24px;
                    padding: 40px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 48px;
                    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
                }
                .module-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 24px;
                    background: #f8fafd;
                    border-radius: 16px;
                    margin-bottom: 16px;
                    transition: all 0.2s;
                }
                .module-row:hover {
                    background: #f1f5f9;
                }
                .btn-genesis {
                    background: #312e81;
                    color: white;
                    padding: 10px 24px;
                    border-radius: 8px;
                    font-weight: 700;
                    font-size: 13px;
                    transition: all 0.2s;
                }
                .btn-genesis:hover {
                    background: #4338ca;
                    transform: translateY(-1px);
                }
                .sidebar-footer {
                    margin-top: auto;
                    padding: 0 32px;
                    display: flex;
                    justify-content: space-between;
                    color: #94a3b8;
                    font-size: 11px;
                    font-weight: 800;
                    letter-spacing: 0.025em;
                }
                .brand-icon {
                    width: 32px;
                    height: 32px;
                    background: #312e81;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                }
                .system-badge {
                    background: #fef3c7;
                    color: #92400e;
                    padding: 4px 12px;
                    border-radius: 100px;
                    font-size: 10px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    display: inline-block;
                    margin-bottom: 12px;
                }
            `}</style>

            {/* SIDEBAR */}
            <aside className="genesis-sidebar">
                <div className="px-8 mb-12 flex items-center gap-4">
                    <div className="brand-icon">
                        <Cpu size={20} />
                    </div>
                    <div>
                        <h2 className="text-[17px] font-black tracking-tight text-[#1e1b4b]">Genesis Admin</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Architect</p>
                    </div>
                </div>

                <nav className="flex-1">
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
                    
                    <div 
                        onClick={handleExit}
                        className="nav-item mt-4 text-rose-500 hover:bg-rose-50"
                    >
                        <LogOut size={18} />
                        <span>Sign Out</span>
                    </div>
                </nav>

                <div className="sidebar-footer">
                    <span>V2.4.0</span>
                    <span className="text-emerald-500">STABLE</span>
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main className="main-content">
                {/* TOP HEADER */}
                <div className="header-bar">
                    <h1 className="text-2xl font-black text-[#1e1b4b]">Genesis</h1>
                    <div className="flex items-center gap-6">
                        <button className="text-slate-400 hover:text-slate-600 transition-colors">
                            <Bell size={20} />
                        </button>
                        <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border-2 border-slate-100">
                             <img src="https://ui-avatars.com/api/?name=Admin&background=4f46e5&color=fff" alt="User" />
                        </div>
                    </div>
                </div>

                {/* BREADCRUMB / HERO TITLE */}
                <div className="mb-8">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Architecture Control</p>
                    <h2 className="text-4xl font-extrabold text-[#111827] flex items-center gap-4">
                        Admin Dashboard
                        <div className="h-[3px] w-12 bg-[#312e81] rounded-full mt-2"></div>
                    </h2>
                </div>

                {/* HERO BANNER CARD */}
                <div className="hero-card">
                    <div className="max-w-md">
                        <div className="system-badge">System Pulse</div>
                        <h3 className="text-2xl font-extrabold text-[#111827] mb-4">Platform Overview</h3>
                        <p className="text-slate-500 font-medium leading-relaxed">
                            Welcome to the Genesis Core. From this terminal, you can orchestrate global tenants, 
                            calibrate business logic, and audit the entire system intelligence layer.
                        </p>
                    </div>
                    <div className="w-64 h-64 relative">
                        <div className="absolute inset-0 bg-indigo-600/5 rounded-3xl transform rotate-3 scale-95 transition-transform group-hover:rotate-6"></div>
                        <img 
                            src="file:///C:/Users/mmost/.gemini/antigravity/brain/d9d993b3-7bec-41aa-ad1c-13ce97597f7f/genesis_hero_graphic_1776788117931.png" 
                            alt="System Graphic" 
                            className="relative z-10 w-full h-full object-cover rounded-3xl shadow-2xl"
                        />
                    </div>
                </div>

                {/* SECTION: CORE MODULES */}
                <div className="mb-6 flex items-center gap-4">
                    <div className="h-px bg-slate-200 flex-1"></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Core Modules</span>
                    <div className="h-px bg-slate-200 w-1/4"></div>
                </div>

                <div className="space-y-4">
                    {modules.map((mod) => (
                        <div key={mod.id} className="module-row group">
                            <div className="flex items-center gap-6">
                                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-[#4f46e5] shadow-sm border border-slate-100 transition-transform group-hover:scale-110">
                                    {mod.icon}
                                </div>
                                <div>
                                    <h4 className="font-extrabold text-[#111827] text-lg">{mod.name}</h4>
                                    <p className="text-sm text-slate-500 font-medium tracking-tight">{mod.desc}</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => navigate(mod.path)}
                                className="btn-genesis"
                            >
                                Configure Module
                            </button>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
};

export default SecretPortalHUD;

