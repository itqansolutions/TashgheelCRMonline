import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    Building2, CreditCard, Zap, History, LayoutDashboard, LogOut, 
    ChevronRight, Search, RefreshCw, CheckCircle2, XCircle, AlertTriangle, 
    Activity, Cpu, Shield, ShieldAlert, Globe, Users, DollarSign, 
    Clock, ArrowUpRight, ArrowDownRight, Eye, Key, Check, X, 
    Lock, Unlock, Mail, Phone, Layers, Box, Filter, Copy, 
    Calendar, ArrowLeft, MoreHorizontal, Sparkles, Terminal,
    Maximize2, AlertCircle, CheckCheck
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { safeArray, safeObject, safeNumber, safeString } from '../../utils/dataUtils';

// Helper for relative time
const formatTimeAgo = (dateInput) => {
    if (!dateInput) return '—';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '—';
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return `${Math.max(1, seconds)}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatCurrency = (val) => {
    const num = Number(val) || 0;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
};

const PLAN_COLORS = {
    enterprise: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-400', glow: 'shadow-indigo-500/20' },
    pro:        { bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-400', glow: 'shadow-violet-500/20' },
    basic:      { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400',   glow: 'shadow-blue-500/20' },
    trial:      { bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-400',  glow: 'shadow-amber-500/20' },
    custom:     { bg: 'bg-emerald-500/10',border: 'border-emerald-500/30',text: 'text-emerald-400',glow: 'shadow-emerald-500/20' },
};

const STATUS_CONFIG = {
    active:    { label: 'Active',    bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
    trial:     { label: 'Trial',     bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30',   dot: 'bg-amber-400' },
    suspended: { label: 'Suspended', bg: 'bg-rose-500/10',    text: 'text-rose-400',    border: 'border-rose-500/30',    dot: 'bg-rose-400' },
    inactive:  { label: 'Inactive',  bg: 'bg-slate-500/10',   text: 'text-slate-400',   border: 'border-slate-500/30',   dot: 'bg-slate-400' },
};

const MODULE_ICONS = {
    crm:        { label: 'CRM',       icon: <Users size={12} /> },
    finance:    { label: 'ERP & Fin', icon: <DollarSign size={12} /> },
    hr:         { label: 'HR',        icon: <Users size={12} /> },
    inventory:  { label: 'Stock',     icon: <Box size={12} /> },
    automation: { label: 'Auto',      icon: <Zap size={12} /> },
    reports:    { label: 'Intel',     icon: <Layers size={12} /> },
};

const SecretPortalHUD = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // Data states
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [autoRefreshInterval, setAutoRefreshInterval] = useState(30); // in seconds, 0 = off

    const [insights, setInsights] = useState(null);
    const [tenants, setTenants] = useState([]);
    const [plans, setPlans] = useState([]);
    const [upgradeRequests, setUpgradeRequests] = useState([]);
    const [recentLogs, setRecentLogs] = useState([]);

    // UI & Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [planFilter, setPlanFilter] = useState('all');
    const [viewMode, setViewMode] = useState('table'); // 'table' | 'cards'
    const [copiedKey, setCopiedKey] = useState(null);

    // Modal / Drawer states
    const [selectedTenantDossier, setSelectedTenantDossier] = useState(null);
    const [quickPlanModal, setQuickPlanModal] = useState(null); // tenant object
    const [targetPlanId, setTargetPlanId] = useState('');
    const [targetPlanExpire, setTargetPlanExpire] = useState('');
    const [resetPassModal, setResetPassModal] = useState(null); // tenant object
    const [newPassword, setNewPassword] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    // Load all platform telemetry
    const fetchPlatformData = useCallback(async (isSilent = false) => {
        if (!isSilent) setRefreshing(true);
        try {
            const [insightsRes, tenantsRes, plansRes, upgradesRes, logsRes] = await Promise.allSettled([
                api.get('/super-admin/insights'),
                api.get('/admin/tenants'),
                api.get('/admin/plans'),
                api.get('/admin/upgrade-requests'),
                api.get('/logs?limit=8')
            ]);

            if (insightsRes.status === 'fulfilled' && insightsRes.value?.data?.data) {
                setInsights(insightsRes.value.data.data);
            }
            if (tenantsRes.status === 'fulfilled' && tenantsRes.value?.data?.data) {
                setTenants(safeArray(tenantsRes.value.data.data));
            } else {
                // Fallback to /tenants if /admin/tenants is unavailable
                const fallbackTenants = await api.get('/tenants').catch(() => ({ data: { data: [] } }));
                setTenants(safeArray(fallbackTenants.data?.data));
            }

            if (plansRes.status === 'fulfilled' && plansRes.value?.data?.data) {
                setPlans(safeArray(plansRes.value.data.data));
            }

            if (upgradesRes.status === 'fulfilled' && upgradesRes.value?.data?.data) {
                setUpgradeRequests(safeArray(upgradesRes.value.data.data));
            }

            if (logsRes.status === 'fulfilled' && logsRes.value?.data?.data) {
                setRecentLogs(safeArray(logsRes.value.data.data));
            }

            setLastUpdated(new Date());
        } catch (err) {
            console.error('HUD Telemetry sync failed', err);
            toast.error('Failed to sync real-time telemetry.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchPlatformData();
    }, [fetchPlatformData]);

    // Auto-refresh timer
    useEffect(() => {
        if (autoRefreshInterval <= 0) return;
        const timer = setInterval(() => {
            fetchPlatformData(true);
        }, autoRefreshInterval * 1000);
        return () => clearInterval(timer);
    }, [autoRefreshInterval, fetchPlatformData]);

    // Copy to clipboard helper
    const handleCopy = (text, key) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        toast.success(`Copied to clipboard: ${text}`);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    // Exit HUD
    const handleExit = () => {
        sessionStorage.removeItem('ITQAN_CORE_AUTHORIZED');
        navigate('/dashboard');
    };

    // Quick Tenant Status Toggle (Active / Suspended)
    const handleToggleTenantStatus = async (tenant) => {
        const nextStatus = tenant.status === 'active' ? 'suspended' : 'active';
        try {
            setActionLoading(true);
            await api.put(`/tenants/${tenant.id}`, { status: nextStatus });
            toast.success(`Tenant status updated to ${nextStatus.toUpperCase()}`);
            setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, status: nextStatus } : t));
            if (selectedTenantDossier && selectedTenantDossier.id === tenant.id) {
                setSelectedTenantDossier(prev => ({ ...prev, status: nextStatus }));
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Status update failed.');
        } finally {
            setActionLoading(false);
        }
    };

    // Quick Plan Assignment
    const handleSaveQuickPlan = async () => {
        if (!quickPlanModal || !targetPlanId) {
            toast.error('Please select a plan.');
            return;
        }
        try {
            setActionLoading(true);
            await api.put(`/admin/tenants/${quickPlanModal.id}/plan`, {
                plan_id: targetPlanId,
                status: 'active',
                expires_at: targetPlanExpire || null
            });
            toast.success('Subscription plan updated successfully!');
            setQuickPlanModal(null);
            fetchPlatformData(true);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update plan.');
        } finally {
            setActionLoading(false);
        }
    };

    // Quick Password Reset
    const handleExecutePasswordReset = async () => {
        if (!resetPassModal || !newPassword.trim()) {
            toast.error('Please enter a valid new password.');
            return;
        }
        try {
            setActionLoading(true);
            await api.post(`/tenants/${resetPassModal.id}/reset-admin`, { newPassword });
            toast.success(`Admin password for ${resetPassModal.name} reset successfully!`);
            setResetPassModal(null);
            setNewPassword('');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Password reset failed.');
        } finally {
            setActionLoading(false);
        }
    };

    // Approve / Reject Upgrade Request
    const handleApproveUpgrade = async (id) => {
        try {
            setActionLoading(true);
            await api.post(`/admin/upgrade-requests/${id}/approve`);
            toast.success('Upgrade request approved and plan assigned!');
            fetchPlatformData(true);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Approval failed.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRejectUpgrade = async (id) => {
        try {
            setActionLoading(true);
            await api.post(`/admin/upgrade-requests/${id}/reject`, { notes: 'Rejected via HUD Quick Action' });
            toast.success('Upgrade request rejected.');
            fetchPlatformData(true);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Rejection failed.');
        } finally {
            setActionLoading(false);
        }
    };

    // Filtered Tenants
    const filteredTenants = useMemo(() => {
        return tenants.filter(t => {
            const matchesSearch = 
                (t.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                (t.slug?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                (t.admin_email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                (t.admin_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                (t.plan_name?.toLowerCase() || '').includes(searchTerm.toLowerCase());

            const matchesStatus = 
                statusFilter === 'all' ? true :
                statusFilter === 'expiring' ? (t.expires_at && new Date(t.expires_at) < new Date(Date.now() + 7 * 86400000)) :
                t.status === statusFilter;

            const matchesPlan = 
                planFilter === 'all' ? true :
                (t.plan_name || t.plan || '').toLowerCase() === planFilter.toLowerCase();

            return matchesSearch && matchesStatus && matchesPlan;
        });
    }, [tenants, searchTerm, statusFilter, planFilter]);

    // Computed high-level metrics
    const metrics = useMemo(() => {
        const total = tenants.length;
        const active = tenants.filter(t => t.status === 'active').length;
        const trial = tenants.filter(t => t.status === 'trial').length;
        const suspended = tenants.filter(t => t.status === 'suspended').length;
        
        const now = new Date();
        const expiringSoon = tenants.filter(t => 
            t.status === 'active' && 
            t.expires_at && 
            new Date(t.expires_at) < new Date(now.getTime() + 7 * 86400000)
        ).length;

        const calculatedMRR = tenants.reduce((acc, t) => {
            if (t.status !== 'active') return acc;
            if (t.price_monthly) return acc + Number(t.price_monthly);
            const planKey = (t.plan_name || t.plan || '').toLowerCase();
            const planObj = plans.find(p => p.name === planKey);
            if (planObj?.price_monthly) return acc + Number(planObj.price_monthly);
            if (planKey === 'enterprise') return acc + 199;
            if (planKey === 'pro') return acc + 79;
            if (planKey === 'basic') return acc + 29;
            return acc;
        }, 0);

        const pendingUpgrades = upgradeRequests.filter(r => r.status === 'pending').length;
        const healthScore = insights?.metrics?.healthScore ?? (total > 0 ? Math.min(100, Math.round((active / total) * 100)) : 98);

        return {
            total,
            active,
            trial,
            suspended,
            expiringSoon,
            mrr: insights?.metrics?.mrr || calculatedMRR,
            pendingUpgrades,
            healthScore,
            activeRate: total > 0 ? Math.round((active / total) * 100) : 100,
            conversionRate: insights?.metrics?.conversionRate ?? (total > 0 ? Math.round((active / total) * 70) : 0),
            growthVelocity: insights?.metrics?.growthVelocity ?? 12
        };
    }, [tenants, plans, upgradeRequests, insights]);

    return (
        <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col font-sans antialiased selection:bg-indigo-500 selection:text-white relative overflow-x-hidden">
            {/* CYBER HUD AMBIENT GLOWS & BACKGROUND GRID */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute top-[-10%] left-[15%] w-[600px] h-[600px] bg-indigo-600/15 rounded-full blur-[140px]" />
                <div className="absolute top-[40%] right-[-5%] w-[500px] h-[500px] bg-violet-600/10 rounded-full blur-[160px]" />
                <div className="absolute bottom-[-10%] left-[30%] w-[700px] h-[700px] bg-cyan-600/10 rounded-full blur-[180px]" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b10_1px,transparent_1px),linear-gradient(to_bottom,#1e293b10_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30" />
            </div>

            {/* TOP COCKPIT HEADER */}
            <header className="sticky top-0 z-40 bg-[#0B101D]/80 backdrop-blur-2xl border-b border-slate-800/80 px-6 py-3.5 shadow-2xl transition-all">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                    {/* Brand & Live Beacon */}
                    <div className="flex items-center gap-4">
                        <div className="relative group">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 flex items-center justify-center shadow-lg shadow-indigo-600/30 border border-indigo-400/30">
                                <Cpu size={20} className="text-white" />
                            </div>
                            <div className="absolute -inset-1 bg-indigo-500/20 rounded-2xl blur-sm group-hover:bg-indigo-500/40 transition-all" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-base font-black tracking-tight text-white uppercase flex items-center gap-2">
                                    ITQAN GENESIS <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-bold tracking-wider">HUD v2.5</span>
                                </h1>
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                    LIVE TELEMETRY
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-400 font-medium">Sovereign Multi-Tenant Command & Revenue Cockpit</p>
                        </div>
                    </div>

                    {/* Quick Portal Switcher Pills */}
                    <div className="hidden lg:flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-2xl border border-slate-800/80 shadow-inner">
                        <button 
                            onClick={() => navigate('/itqan-crm-hud')} 
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-md shadow-indigo-600/30 flex items-center gap-2"
                        >
                            <LayoutDashboard size={13} />
                            Cockpit HUD
                        </button>
                        <button 
                            onClick={() => navigate('/itqan-crm-hud/hub')} 
                            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all flex items-center gap-2"
                        >
                            <Building2 size={13} />
                            Companies ({metrics.total})
                        </button>
                        <button 
                            onClick={() => navigate('/itqan-crm-hud/pricing')} 
                            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all flex items-center gap-2"
                        >
                            <CreditCard size={13} />
                            Subscription Plans
                        </button>
                        <button 
                            onClick={() => navigate('/itqan-crm-hud/upgrades')} 
                            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all flex items-center gap-2 relative"
                        >
                            <Zap size={13} className={metrics.pendingUpgrades > 0 ? 'text-amber-400' : ''} />
                            Upgrades
                            {metrics.pendingUpgrades > 0 && (
                                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] flex items-center justify-center animate-pulse">
                                    {metrics.pendingUpgrades}
                                </span>
                            )}
                        </button>
                        <button 
                            onClick={() => navigate('/itqan-crm-hud/audit')} 
                            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all flex items-center gap-2"
                        >
                            <History size={13} />
                            Audit Logs
                        </button>
                    </div>

                    {/* Right Toolbar */}
                    <div className="flex items-center gap-3">
                        {/* Auto-refresh selector */}
                        <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-400">
                            <Clock size={13} className="text-indigo-400" />
                            <select 
                                value={autoRefreshInterval} 
                                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                                className="bg-transparent text-slate-200 text-xs font-semibold outline-none cursor-pointer"
                            >
                                <option value={0} className="bg-slate-900 text-slate-200">Manual</option>
                                <option value={15} className="bg-slate-900 text-slate-200">Auto 15s</option>
                                <option value={30} className="bg-slate-900 text-slate-200">Auto 30s</option>
                                <option value={60} className="bg-slate-900 text-slate-200">Auto 60s</option>
                            </select>
                        </div>

                        {/* Manual Refresh Button */}
                        <button 
                            onClick={() => fetchPlatformData(false)}
                            disabled={refreshing}
                            className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-indigo-400 border border-slate-800/80 transition-all active:scale-95 disabled:opacity-50"
                            title="Sync Telemetry"
                        >
                            <RefreshCw size={15} className={refreshing ? 'animate-spin text-indigo-400' : ''} />
                        </button>

                        {/* Exit button */}
                        <button 
                            onClick={handleExit}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all active:scale-95"
                        >
                            <LogOut size={14} />
                            <span className="hidden sm:inline">Exit HUD</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* MAIN HUD CONTENT */}
            <main className="relative z-10 flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">

                {/* 1. EXECUTIVE KPI TELEMETRY GRID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* TOTAL WORKSPACES */}
                    <div className="group relative bg-[#0C1222]/90 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 hover:border-indigo-500/40 hover:shadow-xl hover:shadow-indigo-500/10 transition-all">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Total Workspaces</p>
                                <h3 className="text-3xl font-black text-white mt-1 tracking-tight">{metrics.total}</h3>
                            </div>
                            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 group-hover:scale-110 transition-transform">
                                <Building2 size={22} />
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
                            <span className="text-emerald-400 font-bold flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                {metrics.active} Active ({metrics.activeRate}%)
                            </span>
                            <span className="text-amber-400 font-medium">{metrics.trial} Trials</span>
                        </div>
                    </div>

                    {/* MONTHLY RECURRING REVENUE */}
                    <div className="group relative bg-[#0C1222]/90 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 hover:border-emerald-500/40 hover:shadow-xl hover:shadow-emerald-500/10 transition-all">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Estimated MRR</p>
                                <h3 className="text-3xl font-black text-emerald-400 mt-1 tracking-tight">{formatCurrency(metrics.mrr)}</h3>
                            </div>
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 group-hover:scale-110 transition-transform">
                                <DollarSign size={22} />
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
                            <span className="text-slate-400 font-medium">Conversion: <strong className="text-slate-200">{metrics.conversionRate}%</strong></span>
                            <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                                <ArrowUpRight size={13} />
                                +{metrics.growthVelocity}% 7d
                            </span>
                        </div>
                    </div>

                    {/* PLATFORM HEALTH INDEX */}
                    <div className="group relative bg-[#0C1222]/90 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-500/10 transition-all">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Platform Health</p>
                                <div className="flex items-baseline gap-2 mt-1">
                                    <h3 className="text-3xl font-black text-cyan-400 tracking-tight">{metrics.healthScore}%</h3>
                                    <span className="text-xs font-bold text-slate-400 uppercase">{metrics.healthScore >= 80 ? 'Optimal' : 'Attention'}</span>
                                </div>
                            </div>
                            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 group-hover:scale-110 transition-transform">
                                <Activity size={22} />
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
                            <span className="text-slate-400">Suspended: <strong className="text-rose-400">{metrics.suspended}</strong></span>
                            <span className="text-slate-400">Expiring &lt;7d: <strong className="text-amber-400">{metrics.expiringSoon}</strong></span>
                        </div>
                    </div>

                    {/* ACTION & UPGRADE QUEUE */}
                    <div className="group relative bg-[#0C1222]/90 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 hover:border-amber-500/40 hover:shadow-xl hover:shadow-amber-500/10 transition-all">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Pending Actions</p>
                                <h3 className="text-3xl font-black text-amber-400 mt-1 tracking-tight">
                                    {metrics.pendingUpgrades + metrics.expiringSoon}
                                </h3>
                            </div>
                            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 group-hover:scale-110 transition-transform">
                                <Zap size={22} />
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
                            <span className="text-amber-300 font-bold">{metrics.pendingUpgrades} Upgrade Requests</span>
                            <button 
                                onClick={() => navigate('/itqan-crm-hud/upgrades')}
                                className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-0.5"
                            >
                                Process <ChevronRight size={12} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* 2. STRATEGIC INTELLIGENCE & ANOMALY RADAR */}
                {insights?.alerts?.length > 0 && (
                    <div className="bg-gradient-to-r from-slate-900/90 via-indigo-950/40 to-slate-900/90 backdrop-blur-xl border border-indigo-500/20 rounded-2xl p-5 shadow-2xl space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ShieldAlert size={18} className="text-indigo-400 animate-pulse" />
                                <h3 className="text-sm font-black uppercase tracking-wider text-white">Genesis Intelligence Alerts</h3>
                            </div>
                            <span className="text-[11px] font-bold text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/30">
                                {insights.alerts.length} Tactical Actionable Insights
                            </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {insights.alerts.map((alert, idx) => (
                                <div key={idx} className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between gap-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                                alert.level === 'high' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                                                alert.level === 'medium' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                                                'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                            }`}>
                                                {alert.level || 'info'} priority
                                            </span>
                                        </div>
                                        <h4 className="text-sm font-bold text-slate-100">{alert.message}</h4>
                                        <p className="text-xs text-slate-400 leading-relaxed">{alert.suggestion}</p>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            if (alert.action?.toLowerCase().includes('plan') || alert.action?.toLowerCase().includes('pricing')) {
                                                navigate('/itqan-crm-hud/pricing');
                                            } else if (alert.action?.toLowerCase().includes('campaign') || alert.action?.toLowerCase().includes('workspaces')) {
                                                setStatusFilter('expiring');
                                            } else {
                                                toast.success(`Protocol initiated: ${alert.action}`);
                                            }
                                        }}
                                        className="w-full py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/60 border border-indigo-500/40 text-indigo-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                                    >
                                        <Sparkles size={13} />
                                        {alert.action || 'Execute Action'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 3. CORE TENANT / COMPANY EXPLORER & LIVE PREVIEW */}
                <div className="bg-[#0C1222]/90 backdrop-blur-xl border border-slate-800/80 rounded-2xl shadow-2xl overflow-hidden">
                    {/* Header & Controls */}
                    <div className="p-5 border-b border-slate-800/80 space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-black text-white tracking-tight flex items-center gap-2.5">
                                    <Building2 size={20} className="text-indigo-400" />
                                    Live Company Directory & Subscription Dossiers
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Real-time overview of active tenants, resource allocation, and direct control tools.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => navigate('/itqan-crm-hud/hub')}
                                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition-all flex items-center gap-1.5"
                                >
                                    <Maximize2 size={13} />
                                    Full Command View
                                </button>
                            </div>
                        </div>

                        {/* Search & Filter Bar */}
                        <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-2">
                            {/* Search */}
                            <div className="relative w-full md:w-80">
                                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input 
                                    type="text"
                                    placeholder="Search company, admin, email, slug..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                                />
                                {searchTerm && (
                                    <button 
                                        onClick={() => setSearchTerm('')} 
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </div>

                            {/* Filter Pills */}
                            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                                <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1 mr-1">
                                    <Filter size={12} /> Filter:
                                </span>
                                {['all', 'active', 'trial', 'expiring', 'suspended'].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setStatusFilter(s)}
                                        className={`px-3 py-1 rounded-xl text-xs font-bold capitalize transition-all ${
                                            statusFilter === s 
                                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-500' 
                                                : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800/80'
                                        }`}
                                    >
                                        {s === 'expiring' ? 'Expiring (<7d)' : s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Table View */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-slate-950/80 border-b border-slate-800/80 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                                    <th className="py-3.5 px-5">Company / Workspace</th>
                                    <th className="py-3.5 px-4">Primary Admin</th>
                                    <th className="py-3.5 px-4">Current Plan</th>
                                    <th className="py-3.5 px-4">Subscription Status</th>
                                    <th className="py-3.5 px-4">Capacity / Users</th>
                                    <th className="py-3.5 px-4">Modules</th>
                                    <th className="py-3.5 px-5 text-right">HUD Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="py-12 text-center text-slate-400">
                                            <div className="flex flex-col items-center justify-center gap-3">
                                                <RefreshCw size={24} className="animate-spin text-indigo-500" />
                                                <span className="font-bold text-sm tracking-wide">Syncing Tenant Directory...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredTenants.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-12 text-center text-slate-400">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <AlertCircle size={28} className="text-slate-600" />
                                                <span className="font-bold text-sm text-slate-300">No companies found</span>
                                                <p className="text-xs text-slate-500">Try adjusting your search query or status filter.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTenants.map((t) => {
                                        const planKey = (t.plan_name || t.plan || 'basic').toLowerCase();
                                        const planStyle = PLAN_COLORS[planKey] || PLAN_COLORS.basic;
                                        const statusStyle = STATUS_CONFIG[t.status] || STATUS_CONFIG.inactive;
                                        const isExpiring = t.expires_at && new Date(t.expires_at) < new Date(Date.now() + 7 * 86400000);

                                        return (
                                            <tr 
                                                key={t.id} 
                                                className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                                                onClick={() => setSelectedTenantDossier(t)}
                                            >
                                                {/* Company Name & Slug */}
                                                <td className="py-3.5 px-5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/20 to-slate-800 border border-slate-700/60 flex items-center justify-center font-black text-indigo-400 text-xs shadow-inner">
                                                            {t.name ? t.name.charAt(0).toUpperCase() : 'C'}
                                                        </div>
                                                        <div>
                                                            <span className="font-bold text-white text-sm group-hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                                                                {t.name}
                                                            </span>
                                                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                                                                <span className="font-mono text-slate-400">/{t.slug || t.id.slice(0, 8)}</span>
                                                                <span>•</span>
                                                                <span>Joined {formatTimeAgo(t.created_at)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Admin Contact */}
                                                <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                                                    <div>
                                                        <p className="font-semibold text-slate-200 text-xs">{t.admin_name || 'Admin User'}</p>
                                                        {t.admin_email && (
                                                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-indigo-400 mt-0.5">
                                                                <span className="truncate max-w-[150px]">{t.admin_email}</span>
                                                                <button 
                                                                    onClick={() => handleCopy(t.admin_email, `email-${t.id}`)}
                                                                    title="Copy email"
                                                                    className="text-slate-500 hover:text-slate-300"
                                                                >
                                                                    {copiedKey === `email-${t.id}` ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Plan & Price */}
                                                <td className="py-3.5 px-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black uppercase border ${planStyle.bg} ${planStyle.border} ${planStyle.text} shadow-sm`}>
                                                        <CreditCard size={11} />
                                                        {t.display_name || t.plan_name || t.plan || 'Free Plan'}
                                                    </span>
                                                    {t.price_monthly && (
                                                        <p className="text-[10px] text-slate-500 font-bold mt-1">
                                                            {formatCurrency(t.price_monthly)}/mo
                                                        </p>
                                                    )}
                                                </td>

                                                {/* Status & Expiry */}
                                                <td className="py-3.5 px-4">
                                                    <div className="space-y-1">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusStyle.bg} ${statusStyle.border} ${statusStyle.text}`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                                                            {statusStyle.label}
                                                        </span>
                                                        {t.expires_at && (
                                                            <p className={`text-[10px] font-semibold flex items-center gap-1 ${isExpiring ? 'text-amber-400' : 'text-slate-500'}`}>
                                                                <Calendar size={10} />
                                                                {new Date(t.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                            </p>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Capacity / Users */}
                                                <td className="py-3.5 px-4">
                                                    <div className="space-y-1 w-28">
                                                        <div className="flex items-center justify-between text-[11px]">
                                                            <span className="text-slate-400 font-semibold flex items-center gap-1">
                                                                <Users size={11} /> {t.user_count || 1}
                                                            </span>
                                                            <span className="text-slate-500 text-[10px]">max {t.max_users || 10}</span>
                                                        </div>
                                                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                            <div 
                                                                className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full"
                                                                style={{ width: `${Math.min(100, ((t.user_count || 1) / (t.max_users || 10)) * 100)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Enabled Modules */}
                                                <td className="py-3.5 px-4">
                                                    <div className="flex items-center gap-1 text-slate-400">
                                                        {Object.entries(MODULE_ICONS).map(([k, m]) => {
                                                            let isEnabled = true;
                                                            if (t.modules) {
                                                                try {
                                                                    const parsed = typeof t.modules === 'string' ? JSON.parse(t.modules) : t.modules;
                                                                    isEnabled = !!parsed[k];
                                                                } catch {}
                                                            }
                                                            return (
                                                                <span 
                                                                    key={k}
                                                                    title={`${m.label}: ${isEnabled ? 'Enabled' : 'Disabled'}`}
                                                                    className={`p-1 rounded-md border ${
                                                                        isEnabled 
                                                                            ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' 
                                                                            : 'bg-slate-900 border-slate-800/80 text-slate-600 opacity-40'
                                                                    }`}
                                                                >
                                                                    {m.icon}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </td>

                                                {/* Quick Actions */}
                                                <td className="py-3.5 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button 
                                                            onClick={() => setSelectedTenantDossier(t)}
                                                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700 transition-all"
                                                            title="Inspect Full Dossier"
                                                        >
                                                            <Eye size={14} />
                                                        </button>
                                                        <button 
                                                            onClick={() => {
                                                                setQuickPlanModal(t);
                                                                setTargetPlanId(t.plan_id || '');
                                                                setTargetPlanExpire(t.expires_at ? t.expires_at.slice(0, 10) : '');
                                                            }}
                                                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-violet-600 text-slate-300 hover:text-white border border-slate-700 transition-all"
                                                            title="Change Subscription Plan"
                                                        >
                                                            <CreditCard size={14} />
                                                        </button>
                                                        <button 
                                                            onClick={() => {
                                                                setResetPassModal(t);
                                                                setNewPassword('');
                                                            }}
                                                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-600 text-slate-300 hover:text-white border border-slate-700 transition-all"
                                                            title="Reset Admin Password"
                                                        >
                                                            <Key size={14} />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleToggleTenantStatus(t)}
                                                            className={`p-1.5 rounded-lg border transition-all ${
                                                                t.status === 'active' 
                                                                    ? 'bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white border-slate-700' 
                                                                    : 'bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 border-emerald-500/30'
                                                            }`}
                                                            title={t.status === 'active' ? 'Suspend Tenant' : 'Activate Tenant'}
                                                        >
                                                            {t.status === 'active' ? <Lock size={14} /> : <Unlock size={14} />}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Table Footer info */}
                    <div className="p-4 bg-slate-950/70 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                        <span>Showing <strong className="text-slate-200">{filteredTenants.length}</strong> of <strong className="text-slate-200">{tenants.length}</strong> registered companies</span>
                        <div className="flex items-center gap-4">
                            <span className="text-[11px] text-slate-500">Tip: Click any company row to open full live dossier</span>
                        </div>
                    </div>
                </div>

                {/* 4. DUAL SECTION: PENDING UPGRADE QUEUE & LIVE AUDIT STREAM */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* LEFT: PENDING UPGRADE QUEUE WIDGET */}
                    <div className="bg-[#0C1222]/90 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 shadow-2xl flex flex-col justify-between space-y-4">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                                        <Zap size={18} />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-sm text-white uppercase tracking-wider">Subscription Upgrade Queue</h3>
                                        <p className="text-xs text-slate-400">Incoming monetization upgrade requests</p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-black">
                                    {upgradeRequests.filter(r => r.status === 'pending').length} Pending
                                </span>
                            </div>

                            {upgradeRequests.filter(r => r.status === 'pending').length === 0 ? (
                                <div className="py-8 text-center bg-slate-950/40 rounded-xl border border-slate-800/60 text-slate-500 space-y-1">
                                    <CheckCircle2 size={24} className="mx-auto text-emerald-400 mb-1" />
                                    <p className="text-xs font-bold text-slate-300">Upgrade Queue is Clear</p>
                                    <p className="text-[11px]">All subscription requests have been reviewed.</p>
                                </div>
                            ) : (
                                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                                    {upgradeRequests.filter(r => r.status === 'pending').map(req => (
                                        <div 
                                            key={req.id}
                                            className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3.5 flex items-center justify-between gap-3 hover:border-amber-500/40 transition-all"
                                        >
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-white text-xs">{req.tenant_name || 'Company'}</span>
                                                    <span className="text-[10px] text-slate-500">• {formatTimeAgo(req.created_at)}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <span className="text-slate-400">{req.current_plan || 'Free'}</span>
                                                    <ChevronRight size={12} className="text-amber-400" />
                                                    <span className="text-amber-400 font-bold uppercase">{req.requested_plan}</span>
                                                    {req.billing_cycle && (
                                                        <span className="text-[10px] text-slate-500 uppercase">({req.billing_cycle})</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() => handleApproveUpgrade(req.id)}
                                                    disabled={actionLoading}
                                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1"
                                                >
                                                    <Check size={13} /> Approve
                                                </button>
                                                <button
                                                    onClick={() => handleRejectUpgrade(req.id)}
                                                    disabled={actionLoading}
                                                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white font-bold text-xs transition-all active:scale-95 disabled:opacity-50"
                                                >
                                                    <X size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={() => navigate('/itqan-crm-hud/upgrades')}
                            className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center justify-center gap-1.5"
                        >
                            Open Full Upgrade Processing Hub <ChevronRight size={14} />
                        </button>
                    </div>

                    {/* RIGHT: LIVE AUDIT & SECURITY FEED */}
                    <div className="bg-[#0C1222]/90 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 shadow-2xl flex flex-col justify-between space-y-4">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                                        <Shield size={18} />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-sm text-white uppercase tracking-wider">Live Security & Audit Pulse</h3>
                                        <p className="text-xs text-slate-400">Real-time platform activity stream</p>
                                    </div>
                                </div>
                                <span className="flex items-center gap-1 text-[11px] font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded-full border border-cyan-500/30">
                                    <Terminal size={12} /> Live Feed
                                </span>
                            </div>

                            {recentLogs.length === 0 ? (
                                <div className="py-8 text-center bg-slate-950/40 rounded-xl border border-slate-800/60 text-slate-500">
                                    <p className="text-xs font-bold text-slate-300">No Recent Audit Logs</p>
                                    <p className="text-[11px]">System events are monitored in real time.</p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                    {recentLogs.map((log, idx) => (
                                        <div 
                                            key={log.id || idx}
                                            className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between gap-3 text-xs hover:border-slate-700 transition-all"
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                                                <div className="overflow-hidden">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono font-bold text-white text-[11px] uppercase tracking-wider truncate">
                                                            {log.action || 'SYSTEM_EVENT'}
                                                        </span>
                                                        <span className="text-[10px] text-slate-500 px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800">
                                                            {log.entity_type || 'Platform'}
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                                        {log.user_email || log.details || 'System Kernel'}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="text-[10px] text-slate-500 font-mono shrink-0">
                                                {formatTimeAgo(log.created_at)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={() => navigate('/itqan-crm-hud/audit')}
                            className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors flex items-center justify-center gap-1.5"
                        >
                            Open Global Audit Console <ChevronRight size={14} />
                        </button>
                    </div>

                </div>

            </main>

            {/* ========================================================================= */}
            {/* 5. SLIDE-OUT COMPANY DOSSIER INSPECTION MODAL */}
            {/* ========================================================================= */}
            {selectedTenantDossier && (
                <div 
                    className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
                    onClick={() => setSelectedTenantDossier(null)}
                >
                    <div 
                        className="bg-[#0D1322] border border-slate-700/80 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6 text-slate-200 relative animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Dossier Header */}
                        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-700 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-600/30">
                                    {selectedTenantDossier.name ? selectedTenantDossier.name.charAt(0).toUpperCase() : 'C'}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-black text-white">{selectedTenantDossier.name}</h2>
                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${STATUS_CONFIG[selectedTenantDossier.status]?.bg} ${STATUS_CONFIG[selectedTenantDossier.status]?.text}`}>
                                            {selectedTenantDossier.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                                        Tenant ID: {selectedTenantDossier.id}
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setSelectedTenantDossier(null)}
                                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Dossier Body */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Contact Card */}
                            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
                                <h4 className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                                    <Users size={14} /> Primary Administrator
                                </h4>
                                <div className="space-y-2 text-xs">
                                    <div>
                                        <span className="text-slate-500 text-[11px] block">Name:</span>
                                        <strong className="text-slate-100">{selectedTenantDossier.admin_name || 'Admin'}</strong>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 text-[11px] block">Email:</span>
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-200 font-mono">{selectedTenantDossier.admin_email || '—'}</span>
                                            {selectedTenantDossier.admin_email && (
                                                <button 
                                                    onClick={() => handleCopy(selectedTenantDossier.admin_email, 'dossier-email')}
                                                    className="text-slate-400 hover:text-indigo-400"
                                                >
                                                    <Copy size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 text-[11px] block">Phone:</span>
                                        <span className="text-slate-200">{selectedTenantDossier.admin_phone || '—'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Subscription Card */}
                            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
                                <h4 className="text-xs font-black uppercase tracking-wider text-violet-400 flex items-center gap-1.5">
                                    <CreditCard size={14} /> Subscription & Limits
                                </h4>
                                <div className="space-y-2 text-xs">
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-500 text-[11px]">Active Plan:</span>
                                        <strong className="text-violet-300 font-black uppercase">{selectedTenantDossier.display_name || selectedTenantDossier.plan_name || selectedTenantDossier.plan || 'Free'}</strong>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-500 text-[11px]">Monthly Rate:</span>
                                        <span className="text-slate-200 font-bold">{formatCurrency(selectedTenantDossier.price_monthly || 0)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-500 text-[11px]">User Capacity:</span>
                                        <span className="text-slate-200">{selectedTenantDossier.user_count || 1} / {selectedTenantDossier.max_users || 10} Users</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-500 text-[11px]">Subscription End:</span>
                                        <span className="text-slate-200">{selectedTenantDossier.expires_at ? new Date(selectedTenantDossier.expires_at).toLocaleDateString() : 'Continuous'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Module Matrix */}
                        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                                <Layers size={14} className="text-indigo-400" /> Module Access Entitlements
                            </h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                                {Object.entries(MODULE_ICONS).map(([key, info]) => {
                                    let isEnabled = true;
                                    if (selectedTenantDossier.modules) {
                                        try {
                                            const p = typeof selectedTenantDossier.modules === 'string' ? JSON.parse(selectedTenantDossier.modules) : selectedTenantDossier.modules;
                                            isEnabled = !!p[key];
                                        } catch {}
                                    }
                                    return (
                                        <div key={key} className={`p-2.5 rounded-xl border flex items-center gap-2 ${
                                            isEnabled ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'bg-slate-900 border-slate-800 text-slate-600'
                                        }`}>
                                            {isEnabled ? <CheckCircle2 size={14} className="text-emerald-400" /> : <XCircle size={14} className="text-slate-600" />}
                                            <span className="font-bold">{info.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Dossier Action Buttons */}
                        <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => {
                                        setQuickPlanModal(selectedTenantDossier);
                                        setTargetPlanId(selectedTenantDossier.plan_id || '');
                                        setTargetPlanExpire(selectedTenantDossier.expires_at ? selectedTenantDossier.expires_at.slice(0, 10) : '');
                                        setSelectedTenantDossier(null);
                                    }}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/30 flex items-center gap-1.5"
                                >
                                    <CreditCard size={14} /> Change Plan
                                </button>
                                <button 
                                    onClick={() => {
                                        setResetPassModal(selectedTenantDossier);
                                        setSelectedTenantDossier(null);
                                    }}
                                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all border border-slate-700 flex items-center gap-1.5"
                                >
                                    <Key size={14} /> Reset Password
                                </button>
                            </div>

                            <button 
                                onClick={() => handleToggleTenantStatus(selectedTenantDossier)}
                                disabled={actionLoading}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                    selectedTenantDossier.status === 'active' 
                                        ? 'bg-rose-500/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30' 
                                        : 'bg-emerald-500/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30'
                                }`}
                            >
                                {selectedTenantDossier.status === 'active' ? (
                                    <>
                                        <Lock size={14} /> Suspend Company
                                    </>
                                ) : (
                                    <>
                                        <Unlock size={14} /> Reactivate Company
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* 6. QUICK PLAN ASSIGNMENT MODAL */}
            {/* ========================================================================= */}
            {quickPlanModal && (
                <div 
                    className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
                    onClick={() => setQuickPlanModal(null)}
                >
                    <div 
                        className="bg-[#0D1322] border border-slate-700/80 rounded-3xl max-w-md w-full shadow-2xl p-6 space-y-5 text-slate-200 relative animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                            <div>
                                <h3 className="text-base font-black text-white">Assign Subscription Plan</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Target Company: <strong className="text-indigo-300">{quickPlanModal.name}</strong></p>
                            </div>
                            <button onClick={() => setQuickPlanModal(null)} className="text-slate-400 hover:text-white">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="space-y-4 text-xs">
                            <div>
                                <label className="block text-slate-400 font-bold mb-1.5">Select Subscription Tier</label>
                                <select 
                                    value={targetPlanId}
                                    onChange={(e) => setTargetPlanId(e.target.value)}
                                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500 font-semibold"
                                >
                                    <option value="">-- Choose a Plan --</option>
                                    {plans.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.display_name} ({formatCurrency(p.price_monthly)}/mo - {p.max_users} users)
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-slate-400 font-bold mb-1.5">Expiration / Renewal Date</label>
                                <input 
                                    type="date"
                                    value={targetPlanExpire}
                                    onChange={(e) => setTargetPlanExpire(e.target.value)}
                                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                                />
                                <span className="text-[10px] text-slate-500 mt-1 block">Leave blank for ongoing recurring subscription.</span>
                            </div>
                        </div>

                        <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                            <button 
                                onClick={() => setQuickPlanModal(null)}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSaveQuickPlan}
                                disabled={actionLoading}
                                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
                            >
                                Confirm Plan Assignment
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* 7. QUICK PASSWORD RESET MODAL */}
            {/* ========================================================================= */}
            {resetPassModal && (
                <div 
                    className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
                    onClick={() => setResetPassModal(null)}
                >
                    <div 
                        className="bg-[#0D1322] border border-slate-700/80 rounded-3xl max-w-md w-full shadow-2xl p-6 space-y-5 text-slate-200 relative animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                            <div>
                                <h3 className="text-base font-black text-white">Reset Super-Admin Password</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Company: <strong className="text-amber-300">{resetPassModal.name}</strong></p>
                            </div>
                            <button onClick={() => setResetPassModal(null)} className="text-slate-400 hover:text-white">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="space-y-4 text-xs">
                            <div>
                                <label className="block text-slate-400 font-bold mb-1.5">New Administrator Password</label>
                                <div className="relative">
                                    <input 
                                        type="text"
                                        placeholder="Enter secure password..."
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full pl-3.5 pr-20 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-amber-500 font-mono font-bold"
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            const rand = 'Tashgheel@' + Math.random().toString(36).slice(-6) + '!';
                                            setNewPassword(rand);
                                        }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded bg-slate-800 text-[10px] font-bold text-amber-400 hover:bg-slate-700"
                                    >
                                        Generate
                                    </button>
                                </div>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                                This will immediately update the primary admin login credentials for this tenant across the entire platform.
                            </p>
                        </div>

                        <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                            <button 
                                onClick={() => setResetPassModal(null)}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleExecutePasswordReset}
                                disabled={actionLoading}
                                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black shadow-lg shadow-amber-600/30 transition-all disabled:opacity-50"
                            >
                                Reset Password
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SecretPortalHUD;

