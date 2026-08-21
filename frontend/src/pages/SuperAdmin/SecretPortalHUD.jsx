import React from 'react';
import { Building2, CreditCard, Zap, History, LayoutDashboard, LogOut, ChevronRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const SecretPortalHUD = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const handleExit = () => {
        sessionStorage.removeItem('ITQAN_CORE_AUTHORIZED');
        navigate('/dashboard');
    };

    const cards = [
        {
            id: 'hub',
            title: 'Command Center',
            desc: 'View all registered companies, manage subscriptions, and reset admin passwords.',
            icon: <Building2 size={28} className="text-blue-600" />,
            bg: 'bg-blue-50',
            border: 'border-blue-100',
            path: '/itqan-crm-hud/hub',
            btnColor: 'bg-blue-600 hover:bg-blue-700',
            stats: 'Companies & Tenants'
        },
        {
            id: 'pricing',
            title: 'Subscription Plans',
            desc: 'Create and manage subscription tiers, assign plans to companies, and set module access.',
            icon: <CreditCard size={28} className="text-violet-600" />,
            bg: 'bg-violet-50',
            border: 'border-violet-100',
            path: '/itqan-crm-hud/pricing',
            btnColor: 'bg-violet-600 hover:bg-violet-700',
            stats: 'Plans & Billing'
        },
        {
            id: 'upgrades',
            title: 'Upgrade Requests',
            desc: 'Review and approve or reject subscription upgrade requests from companies.',
            icon: <Zap size={28} className="text-amber-600" />,
            bg: 'bg-amber-50',
            border: 'border-amber-100',
            path: '/itqan-crm-hud/upgrades',
            btnColor: 'bg-amber-600 hover:bg-amber-700',
            stats: 'Pending Approvals'
        },
        {
            id: 'audit',
            title: 'Audit Logs',
            desc: 'Track all system activity, user actions, and changes across all companies.',
            icon: <History size={28} className="text-slate-600" />,
            bg: 'bg-slate-50',
            border: 'border-slate-200',
            path: '/itqan-crm-hud/audit',
            btnColor: 'bg-slate-700 hover:bg-slate-800',
            stats: 'System Activity'
        }
    ];

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* TOP NAV */}
            <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
                        <LayoutDashboard size={18} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-base font-bold text-slate-800">Admin Portal</h1>
                        <p className="text-xs text-slate-400">Platform Management Dashboard</p>
                    </div>
                </div>
                <button
                    onClick={handleExit}
                    className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-red-600 transition-colors"
                >
                    <LogOut size={16} />
                    Exit to App
                </button>
            </header>

            {/* MAIN */}
            <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12">
                <div className="mb-10">
                    <h2 className="text-2xl font-bold text-slate-800">Welcome, Super Admin</h2>
                    <p className="text-slate-500 mt-1">Select a section to manage.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {cards.map(card => (
                        <div
                            key={card.id}
                            className={`bg-white rounded-2xl border ${card.border} shadow-sm p-6 flex flex-col gap-5 hover:shadow-md transition-shadow`}
                        >
                            <div className="flex items-start gap-4">
                                <div className={`p-3 rounded-xl ${card.bg}`}>
                                    {card.icon}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 text-lg">{card.title}</h3>
                                    <p className="text-slate-500 text-sm mt-1 leading-relaxed">{card.desc}</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100">
                                <span className="text-xs font-medium text-slate-400">{card.stats}</span>
                                <button
                                    onClick={() => navigate(card.path)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold ${card.btnColor} transition-colors`}
                                >
                                    Open <ChevronRight size={15} />
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
