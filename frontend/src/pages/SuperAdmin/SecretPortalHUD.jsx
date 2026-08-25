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
    enterprise: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700' },
    pro:        { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700' },
    basic:      { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700' },
    trial:      { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700' },
    custom:     { bg: 'bg-emerald-50',border: 'border-emerald-200',text: 'text-emerald-700' },
};

const STATUS_CONFIG = {
    active:    { label: 'Active',    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    trial:     { label: 'Trial',     bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
    suspended: { label: 'Suspended', bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-500' },
    inactive:  { label: 'Inactive',  bg: 'bg-slate-100',  text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400' },
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
        toast.success(`Copied: ${text}`);
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
            toast.success(`Company status updated to ${nextStatus.toUpperCase()}`);
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
            toast.success('Subscription plan assigned successfully!');
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
            toast.success('Upgrade request approved!');
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
        <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased">
            {/* TOP HEADER */}
            <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 py-3.5 shadow-sm">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                    {/* Brand & Live Beacon */}
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-600/20 text-white">
                            <LayoutDashboard size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-base font-bold text-slate-900">
                                    Platform Command HUD
                                </h1>
                                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    Live Sync
                                </span>
                            </div>
                            <p className="text-xs text-slate-500">Executive Multi-Tenant Intelligence & Operations</p>
                        </div>
                    </div>

                    {/* Sub-Portal Navigation Pills */}
                    <div className="hidden lg:flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200">
                        <button 
                            onClick={() => navigate('/itqan-crm-hud')} 
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-sm flex items-center gap-1.5"
                        >
                            <LayoutDashboard size={13} />
                            Cockpit HUD
                        </button>
                        <button 
                            onClick={() => navigate('/itqan-crm-hud/hub')} 
                            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-all flex items-center gap-1.5"
                        >
                            <Building2 size={13} />
                            Companies ({metrics.total})
                        </button>
                        <button 
                            onClick={() => navigate('/itqan-crm-hud/pricing')} 
                            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-all flex items-center gap-1.5"
                        >
                            <CreditCard size={13} />
                            Subscription Plans
                        </button>
                        <button 
                            onClick={() => navigate('/itqan-crm-hud/upgrades')} 
                            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-all flex items-center gap-1.5 relative"
                        >
                            <Zap size={13} className={metrics.pendingUpgrades > 0 ? 'text-amber-500' : ''} />
                            Upgrades
                            {metrics.pendingUpgrades > 0 && (
                                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white font-bold text-[10px]">
                                    {metrics.pendingUpgrades}
                                </span>
                            )}
                        </button>
                        <button 
                            onClick={() => navigate('/itqan-crm-hud/audit')} 
                            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-all flex items-center gap-1.5"
                        >
                            <History size={13} />
                            Audit Logs
                        </button>
                    </div>

                    {/* Right Controls */}
                    <div className="flex items-center gap-3">
                        {/* Auto-refresh selector */}
                        <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-600">
                            <Clock size={13} className="text-indigo-600" />
                            <select 
                                value={autoRefreshInterval} 
                                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                                className="bg-transparent text-slate-800 text-xs font-medium outline-none cursor-pointer"
                            >
                                <option value={0}>Manual</option>
                                <option value={15}>15s Auto</option>
                                <option value={30}>30s Auto</option>
                                <option value={60}>60s Auto</option>
                            </select>
                        </div>

                        {/* Manual Refresh Button */}
                        <button 
                            onClick={() => fetchPlatformData(false)}
                            disabled={refreshing}
                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-indigo-600 border border-slate-200 transition-colors disabled:opacity-50"
                            title="Sync Data"
                        >
                            <RefreshCw size={15} className={refreshing ? 'animate-spin text-indigo-600' : ''} />
                        </button>

                        {/* Exit button */}
                        <button 
                            onClick={handleExit}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold transition-colors"
                        >
                            <LogOut size={14} />
                            <span className="hidden sm:inline">Exit to App</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* MAIN CONTENT */}
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">

                {/* 1. EXECUTIVE KPI GRID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* TOTAL WORKSPACES */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Companies</p>
                                <h3 className="text-3xl font-extrabold text-slate-900 mt-1">{metrics.total}</h3>
                            </div>
                            <div className="p-3 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600">
                                <Building2 size={22} />
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span className="text-emerald-600 font-bold flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                {metrics.active} Active ({metrics.activeRate}%)
                            </span>
                            <span className="text-amber-600 font-medium">{metrics.trial} on Trial</span>
                        </div>
                    </div>

                    {/* MONTHLY RECURRING REVENUE */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Estimated MRR</p>
                                <h3 className="text-3xl font-extrabold text-emerald-600 mt-1">{formatCurrency(metrics.mrr)}</h3>
                            </div>
                            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600">
                                <DollarSign size={22} />
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span className="text-slate-500 font-medium">Conversion: <strong className="text-slate-800">{metrics.conversionRate}%</strong></span>
                            <span className="text-emerald-600 font-bold flex items-center gap-0.5">
                                <ArrowUpRight size={13} />
                                +{metrics.growthVelocity}% 7d
                            </span>
                        </div>
                    </div>

                    {/* PLATFORM HEALTH INDEX */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">System Health</p>
                                <div className="flex items-baseline gap-2 mt-1">
                                    <h3 className="text-3xl font-extrabold text-indigo-600">{metrics.healthScore}%</h3>
                                    <span className="text-xs font-bold text-slate-500 uppercase">{metrics.healthScore >= 80 ? 'Optimal' : 'Needs Review'}</span>
                                </div>
                            </div>
                            <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600">
                                <Activity size={22} />
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span className="text-slate-500">Suspended: <strong className="text-rose-600">{metrics.suspended}</strong></span>
                            <span className="text-slate-500">Expiring &lt;7d: <strong className="text-amber-600">{metrics.expiringSoon}</strong></span>
                        </div>
                    </div>

                    {/* ACTION & UPGRADE QUEUE */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Pending Actions</p>
                                <h3 className="text-3xl font-extrabold text-amber-600 mt-1">
                                    {metrics.pendingUpgrades + metrics.expiringSoon}
                                </h3>
                            </div>
                            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600">
                                <Zap size={22} />
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span className="text-amber-700 font-semibold">{metrics.pendingUpgrades} Upgrade Requests</span>
                            <button 
                                onClick={() => navigate('/itqan-crm-hud/upgrades')}
                                className="text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-0.5"
                            >
                                Process <ChevronRight size={12} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* 2. STRATEGIC INTELLIGENCE ALERTS */}
                {insights?.alerts?.length > 0 && (
                    <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-5 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ShieldAlert size={18} className="text-indigo-600" />
                                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Platform Intelligence Insights</h3>
                            </div>
                            <span className="text-xs font-bold text-indigo-700 bg-white px-3 py-1 rounded-full border border-indigo-200 shadow-sm">
                                {insights.alerts.length} Actionable Items
                            </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {insights.alerts.map((alert, idx) => (
                                <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3 shadow-sm">
                                    <div className="space-y-1">
                                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                                            alert.level === 'high' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                            alert.level === 'medium' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                            'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                        }`}>
                                            {alert.level || 'info'} priority
                                        </span>
                                        <h4 className="text-sm font-bold text-slate-900 mt-2">{alert.message}</h4>
                                        <p className="text-xs text-slate-600 leading-relaxed">{alert.suggestion}</p>
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
                                        className="w-full py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                                    >
                                        <Sparkles size={13} />
                                        {alert.action || 'Execute Action'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 3. CORE TENANT EXPLORER & LIVE PREVIEW TABLE */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    {/* Header & Controls */}
                    <div className="p-5 border-b border-slate-100 space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                    <Building2 size={20} className="text-indigo-600" />
                                    Company Directory & Subscription Dossiers
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Directly view, preview, and manage all tenant workspaces, plans, and credentials.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => navigate('/itqan-crm-hud/hub')}
                                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 border border-slate-200 transition-colors flex items-center gap-1.5"
                                >
                                    <Maximize2 size={13} />
                                    Open Full Directory
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
                                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                                />
                                {searchTerm && (
                                    <button 
                                        onClick={() => setSearchTerm('')} 
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </div>

                            {/* Filter Pills */}
                            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                                <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 mr-1">
                                    <Filter size={12} /> Filter:
                                </span>
                                {['all', 'active', 'trial', 'expiring', 'suspended'].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setStatusFilter(s)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${
                                            statusFilter === s 
                                                ? 'bg-indigo-600 text-white shadow-sm' 
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
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
                                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                                    <th className="py-3.5 px-5">Company / Workspace</th>
                                    <th className="py-3.5 px-4">Primary Admin</th>
                                    <th className="py-3.5 px-4">Current Plan</th>
                                    <th className="py-3.5 px-4">Subscription Status</th>
                                    <th className="py-3.5 px-4">Capacity / Users</th>
                                    <th className="py-3.5 px-4">Modules</th>
                                    <th className="py-3.5 px-5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="py-12 text-center text-slate-400">
                                            <div className="flex flex-col items-center justify-center gap-3">
                                                <RefreshCw size={24} className="animate-spin text-indigo-600" />
                                                <span className="font-bold text-sm">Loading companies...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredTenants.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-12 text-center text-slate-400">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <AlertCircle size={28} className="text-slate-300" />
                                                <span className="font-bold text-sm text-slate-700">No companies found</span>
                                                <p className="text-xs text-slate-400">Try adjusting your search query or status filter.</p>
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
                                                className="hover:bg-slate-50 transition-colors group cursor-pointer"
                                                onClick={() => setSelectedTenantDossier(t)}
                                            >
                                                {/* Company Name & Slug */}
                                                <td className="py-3.5 px-5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center font-bold text-indigo-700 text-sm">
                                                            {t.name ? t.name.charAt(0).toUpperCase() : 'C'}
                                                        </div>
                                                        <div>
                                                            <span className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">
                                                                {t.name}
                                                            </span>
                                                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                                                                <span className="font-mono">{t.slug || t.id.slice(0, 8)}</span>
                                                                <span>•</span>
                                                                <span>{formatTimeAgo(t.created_at)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Admin Contact */}
                                                <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                                                    <div>
                                                        <p className="font-medium text-slate-800 text-xs">{t.admin_name || 'Admin User'}</p>
                                                        {t.admin_email && (
                                                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-indigo-600 mt-0.5">
                                                                <span className="truncate max-w-[150px]">{t.admin_email}</span>
                                                                <button 
                                                                    onClick={() => handleCopy(t.admin_email, `email-${t.id}`)}
                                                                    title="Copy email"
                                                                    className="text-slate-400 hover:text-slate-600"
                                                                >
                                                                    {copiedKey === `email-${t.id}` ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Plan & Price */}
                                                <td className="py-3.5 px-4">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold uppercase border ${planStyle.bg} ${planStyle.border} ${planStyle.text}`}>
                                                        <CreditCard size={11} />
                                                        {t.display_name || t.plan_name || t.plan || 'Free Plan'}
                                                    </span>
                                                    {t.price_monthly && (
                                                        <p className="text-[11px] text-slate-500 font-semibold mt-1">
                                                            {formatCurrency(t.price_monthly)}/mo
                                                        </p>
                                                    )}
                                                </td>

                                                {/* Status & Expiry */}
                                                <td className="py-3.5 px-4">
                                                    <div className="space-y-1">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusStyle.bg} ${statusStyle.border} ${statusStyle.text}`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                                                            {statusStyle.label}
                                                        </span>
                                                        {t.expires_at && (
                                                            <p className={`text-[11px] font-medium flex items-center gap-1 ${isExpiring ? 'text-amber-600' : 'text-slate-400'}`}>
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
                                                            <span className="text-slate-600 font-semibold flex items-center gap-1">
                                                                <Users size={11} /> {t.user_count || 1}
                                                            </span>
                                                            <span className="text-slate-400 text-[10px]">max {t.max_users || 10}</span>
                                                        </div>
                                                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div 
                                                                className="h-full bg-indigo-600 rounded-full"
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
                                                                    className={`p-1.5 rounded-md border ${
                                                                        isEnabled 
                                                                            ? 'bg-indigo-50 border-indigo-200 text-indigo-600 font-bold' 
                                                                            : 'bg-slate-50 border-slate-200 text-slate-300 opacity-40'
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
                                                            className="p-2 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200 transition-colors"
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
                                                            className="p-2 rounded-xl bg-slate-100 hover:bg-violet-50 text-slate-600 hover:text-violet-600 border border-slate-200 transition-colors"
                                                            title="Change Subscription Plan"
                                                        >
                                                            <CreditCard size={14} />
                                                        </button>
                                                        <button 
                                                            onClick={() => {
                                                                setResetPassModal(t);
                                                                setNewPassword('');
                                                            }}
                                                            className="p-2 rounded-xl bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-600 border border-slate-200 transition-colors"
                                                            title="Reset Admin Password"
                                                        >
                                                            <Key size={14} />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleToggleTenantStatus(t)}
                                                            className={`p-2 rounded-xl border transition-colors ${
                                                                t.status === 'active' 
                                                                    ? 'bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border-slate-200' 
                                                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                                            }`}
                                                            title={t.status === 'active' ? 'Suspend Company' : 'Activate Company'}
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

                    {/* Table Footer */}
                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                        <span>Showing <strong className="text-slate-800">{filteredTenants.length}</strong> of <strong className="text-slate-800">{tenants.length}</strong> companies</span>
                        <span className="text-xs text-slate-400">Click any row to open the full company dossier</span>
                    </div>
                </div>

                {/* 4. DUAL SECTION: UPGRADE QUEUE & AUDIT STREAM */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* LEFT: PENDING UPGRADE QUEUE */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-600">
                                        <Zap size={18} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-sm text-slate-900">Upgrade Requests Queue</h3>
                                        <p className="text-xs text-slate-500">Pending customer tier upgrades</p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold">
                                    {upgradeRequests.filter(r => r.status === 'pending').length} Pending
                                </span>
                            </div>

                            {upgradeRequests.filter(r => r.status === 'pending').length === 0 ? (
                                <div className="py-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-500 space-y-1">
                                    <CheckCircle2 size={24} className="mx-auto text-emerald-500 mb-1" />
                                    <p className="text-xs font-bold text-slate-800">All caught up!</p>
                                    <p className="text-xs text-slate-400">No pending upgrade requests.</p>
                                </div>
                            ) : (
                                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                                    {upgradeRequests.filter(r => r.status === 'pending').map(req => (
                                        <div 
                                            key={req.id}
                                            className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-3 hover:border-amber-300 transition-colors"
                                        >
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-900 text-xs">{req.tenant_name || 'Company'}</span>
                                                    <span className="text-[10px] text-slate-400">• {formatTimeAgo(req.created_at)}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <span className="text-slate-500">{req.current_plan || 'Free'}</span>
                                                    <ChevronRight size={12} className="text-amber-500" />
                                                    <span className="text-amber-700 font-bold uppercase">{req.requested_plan}</span>
                                                    {req.billing_cycle && (
                                                        <span className="text-[10px] text-slate-400 uppercase">({req.billing_cycle})</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() => handleApproveUpgrade(req.id)}
                                                    disabled={actionLoading}
                                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1"
                                                >
                                                    <Check size={13} /> Approve
                                                </button>
                                                <button
                                                    onClick={() => handleRejectUpgrade(req.id)}
                                                    disabled={actionLoading}
                                                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 font-bold text-xs border border-slate-200 transition-colors disabled:opacity-50"
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
                            className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-indigo-600 transition-colors flex items-center justify-center gap-1.5"
                        >
                            Open Upgrades Manager <ChevronRight size={14} />
                        </button>
                    </div>

                    {/* RIGHT: LIVE AUDIT FEED */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600">
                                        <History size={18} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-sm text-slate-900">Recent Audit Activity</h3>
                                        <p className="text-xs text-slate-500">Live platform operations feed</p>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                                    Live Stream
                                </span>
                            </div>

                            {recentLogs.length === 0 ? (
                                <div className="py-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-500">
                                    <p className="text-xs font-bold text-slate-700">No Recent Logs</p>
                                    <p className="text-xs text-slate-400">Activity is logged in real-time.</p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                    {recentLogs.map((log, idx) => (
                                        <div 
                                            key={log.id || idx}
                                            className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3 text-xs hover:border-slate-300 transition-colors"
                                        >
                                            <div className="flex items-center gap-2.5 overflow-hidden">
                                                <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                                                <div className="overflow-hidden">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono font-bold text-slate-800 text-[11px] uppercase tracking-wider truncate">
                                                            {log.action || 'SYSTEM_EVENT'}
                                                        </span>
                                                        <span className="text-[10px] text-slate-500 px-1.5 py-0.2 rounded bg-white border border-slate-200">
                                                            {log.entity_type || 'Platform'}
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                                        {log.user_email || log.details || 'System Kernel'}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="text-[10px] text-slate-400 font-mono shrink-0">
                                                {formatTimeAgo(log.created_at)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={() => navigate('/itqan-crm-hud/audit')}
                            className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-indigo-600 transition-colors flex items-center justify-center gap-1.5"
                        >
                            Open Audit Console <ChevronRight size={14} />
                        </button>
                    </div>

                </div>

            </main>

            {/* ========================================================================= */}
            {/* 5. SLIDE-OUT COMPANY DOSSIER MODAL */}
            {/* ========================================================================= */}
            {selectedTenantDossier && (
                <div 
                    className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setSelectedTenantDossier(null)}
                >
                    <div 
                        className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6 text-slate-800 relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Dossier Header */}
                        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-extrabold text-xl shadow-sm">
                                    {selectedTenantDossier.name ? selectedTenantDossier.name.charAt(0).toUpperCase() : 'C'}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-bold text-slate-900">{selectedTenantDossier.name}</h2>
                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${STATUS_CONFIG[selectedTenantDossier.status]?.bg} ${STATUS_CONFIG[selectedTenantDossier.status]?.text} border ${STATUS_CONFIG[selectedTenantDossier.status]?.border}`}>
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
                                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Dossier Body */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Contact Card */}
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                                    <Users size={14} /> Primary Administrator
                                </h4>
                                <div className="space-y-2 text-xs">
                                    <div>
                                        <span className="text-slate-400 text-[11px] block">Name:</span>
                                        <strong className="text-slate-800">{selectedTenantDossier.admin_name || 'Admin'}</strong>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 text-[11px] block">Email:</span>
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-700 font-mono">{selectedTenantDossier.admin_email || '—'}</span>
                                            {selectedTenantDossier.admin_email && (
                                                <button 
                                                    onClick={() => handleCopy(selectedTenantDossier.admin_email, 'dossier-email')}
                                                    className="text-slate-400 hover:text-indigo-600"
                                                >
                                                    <Copy size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 text-[11px] block">Phone:</span>
                                        <span className="text-slate-700">{selectedTenantDossier.admin_phone || '—'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Subscription Card */}
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-violet-700 flex items-center gap-1.5">
                                    <CreditCard size={14} /> Subscription & Limits
                                </h4>
                                <div className="space-y-2 text-xs">
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-400 text-[11px]">Active Plan:</span>
                                        <strong className="text-violet-700 font-bold uppercase">{selectedTenantDossier.display_name || selectedTenantDossier.plan_name || selectedTenantDossier.plan || 'Free'}</strong>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-400 text-[11px]">Monthly Rate:</span>
                                        <span className="text-slate-800 font-bold">{formatCurrency(selectedTenantDossier.price_monthly || 0)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-400 text-[11px]">User Capacity:</span>
                                        <span className="text-slate-800">{selectedTenantDossier.user_count || 1} / {selectedTenantDossier.max_users || 10} Users</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-400 text-[11px]">Subscription End:</span>
                                        <span className="text-slate-800">{selectedTenantDossier.expires_at ? new Date(selectedTenantDossier.expires_at).toLocaleDateString() : 'Continuous'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Module Matrix */}
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                <Layers size={14} className="text-indigo-600" /> Module Access Entitlements
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
                                            isEnabled ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-white border-slate-200 text-slate-400'
                                        }`}>
                                            {isEnabled ? <CheckCircle2 size={14} className="text-emerald-600" /> : <XCircle size={14} className="text-slate-400" />}
                                            <span className="font-semibold">{info.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Dossier Action Buttons */}
                        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => {
                                        setQuickPlanModal(selectedTenantDossier);
                                        setTargetPlanId(selectedTenantDossier.plan_id || '');
                                        setTargetPlanExpire(selectedTenantDossier.expires_at ? selectedTenantDossier.expires_at.slice(0, 10) : '');
                                        setSelectedTenantDossier(null);
                                    }}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
                                >
                                    <CreditCard size={14} /> Change Plan
                                </button>
                                <button 
                                    onClick={() => {
                                        setResetPassModal(selectedTenantDossier);
                                        setSelectedTenantDossier(null);
                                    }}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors border border-slate-200 flex items-center gap-1.5"
                                >
                                    <Key size={14} /> Reset Password
                                </button>
                            </div>

                            <button 
                                onClick={() => handleToggleTenantStatus(selectedTenantDossier)}
                                disabled={actionLoading}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
                                    selectedTenantDossier.status === 'active' 
                                        ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200' 
                                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
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
                    className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setQuickPlanModal(null)}
                >
                    <div 
                        className="bg-white border border-slate-200 rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-5 text-slate-800 relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Assign Subscription Plan</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Target: <strong className="text-indigo-600">{quickPlanModal.name}</strong></p>
                            </div>
                            <button onClick={() => setQuickPlanModal(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="space-y-4 text-xs">
                            <div>
                                <label className="block text-slate-700 font-bold mb-1.5">Select Subscription Tier</label>
                                <select 
                                    value={targetPlanId}
                                    onChange={(e) => setTargetPlanId(e.target.value)}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:bg-white focus:border-indigo-500 font-medium"
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
                                <label className="block text-slate-700 font-bold mb-1.5">Expiration / Renewal Date</label>
                                <input 
                                    type="date"
                                    value={targetPlanExpire}
                                    onChange={(e) => setTargetPlanExpire(e.target.value)}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:bg-white focus:border-indigo-500"
                                />
                                <span className="text-[11px] text-slate-400 mt-1 block">Leave blank for continuous subscription.</span>
                            </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                            <button 
                                onClick={() => setQuickPlanModal(null)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSaveQuickPlan}
                                disabled={actionLoading}
                                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
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
                    className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setResetPassModal(null)}
                >
                    <div 
                        className="bg-white border border-slate-200 rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-5 text-slate-800 relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Reset Admin Password</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Company: <strong className="text-amber-600">{resetPassModal.name}</strong></p>
                            </div>
                            <button onClick={() => setResetPassModal(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="space-y-4 text-xs">
                            <div>
                                <label className="block text-slate-700 font-bold mb-1.5">New Administrator Password</label>
                                <div className="relative">
                                    <input 
                                        type="text"
                                        placeholder="Enter secure password..."
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full pl-3.5 pr-20 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:bg-white focus:border-indigo-500 font-mono font-bold"
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            const rand = 'Tashgheel@' + Math.random().toString(36).slice(-6) + '!';
                                            setNewPassword(rand);
                                        }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-[11px] font-bold text-indigo-700 border border-indigo-200"
                                    >
                                        Generate
                                    </button>
                                </div>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed bg-amber-50 border border-amber-100 rounded-xl p-3">
                                ⚠️ This will immediately update the primary login credentials for this company administrator.
                            </p>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                            <button 
                                onClick={() => setResetPassModal(null)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleExecutePasswordReset}
                                disabled={actionLoading}
                                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
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

