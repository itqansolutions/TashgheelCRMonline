import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Building2, Users, Layers, Shield, Sliders, Check, X, AlertTriangle,
    RefreshCw, Clock, History, AlertCircle, Sparkles, Box, DollarSign,
    ShoppingBag, UserCheck, Truck, MessageCircle, Zap, GitCommit,
    HelpCircle, ChevronRight, Lock, Unlock, ArrowRight, Info
} from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

export const CANONICAL_MODULES = [
    {
        key: 'crm',
        name: 'CRM & Accounts',
        nameAr: 'إدارة علاقات العملاء',
        desc: 'Customer directory, deals pipeline, customer 360, quotations & tasks.',
        icon: Users,
        category: 'Core Operations'
    },
    {
        key: 'sales',
        name: 'Sales & Orders',
        nameAr: 'المبيعات وأوامر التوريد',
        desc: 'Sales orders, delivery notes, sales team hierarchies & quotations.',
        icon: ShoppingBag,
        category: 'Core Operations'
    },
    {
        key: 'finance',
        name: 'Finance & Invoicing',
        nameAr: 'المالية والفواتير',
        desc: 'Invoices, payment receipts, treasury accounts, vouchers & expenses.',
        icon: DollarSign,
        category: 'Core Operations'
    },
    {
        key: 'real_estate',
        name: 'Real Estate Portfolio',
        nameAr: 'التطوير والتسويق العقاري',
        desc: 'Units inventory, properties, reservations, installments & contracts.',
        icon: Building2,
        category: 'Sector Specialized'
    },
    {
        key: 'hr',
        name: 'HR & Personnel',
        nameAr: 'الموارد البشرية وشؤون الموظفين',
        desc: 'Staff profiles, biometric ADMS attendance, work shifts & leave tracking.',
        icon: UserCheck,
        category: 'Administration'
    },
    {
        key: 'inventory',
        name: 'Stock & Inventory',
        nameAr: 'المخازن والمستودعات',
        desc: 'Product catalog, warehouse balances, item cards & stock movements.',
        icon: Box,
        category: 'Supply Chain'
    },
    {
        key: 'purchasing',
        name: 'Purchasing & Procurement',
        nameAr: 'المشتريات والموردين',
        desc: 'Vendor management, purchase requests, RFQs & purchase orders.',
        icon: Truck,
        category: 'Supply Chain'
    },
    {
        key: 'marketing',
        name: 'Marketing & Channels',
        nameAr: 'التسويق والقنوات الرقمية',
        desc: 'Official WhatsApp Cloud API campaigns & Meta lead sync webhooks.',
        icon: MessageCircle,
        category: 'Growth & Outreach'
    },
    {
        key: 'reports',
        name: 'Reports & Analytics',
        nameAr: 'التقارير والتحليلات المتقدمة',
        desc: 'Operational reporting, BI dashboards, activity logs & data exports.',
        icon: Layers,
        category: 'Intelligence'
    },
    {
        key: 'automation',
        name: 'Automations & Rules',
        nameAr: 'الأتمتة وقواعد سير العمل',
        desc: 'Smart notification rules, automated assignment & trigger actions.',
        icon: Zap,
        category: 'Intelligence'
    }
];

export const formatTimeAgo = (dateInput) => {
    if (!dateInput) return '—';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '—';
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return `${Math.max(1, seconds)}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 24);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * 🏛️ ITQAN HUD: Tenant Access & Entitlements Management Modal
 * 
 * Provides centralized, manual control over tenant module entitlements and usage limits.
 * Replaces fixed commercial plans with explicit per-tenant access configuration.
 */
const TenantAccessManagementModal = ({ tenant, isOpen, onClose, onUpdated }) => {
    // Active Tab: 'edit' | 'audit'
    const [activeTab, setActiveTab] = useState('edit');

    // Fetching state
    const [loadingInitial, setLoadingInitial] = useState(true);
    const [saving, setSaving] = useState(false);
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);

    // Initial Baseline state (from database)
    const [isConfiguredBaseline, setIsConfiguredBaseline] = useState(false);
    const [baselineModules, setBaselineModules] = useState({});
    const [baselineLimits, setBaselineLimits] = useState({ max_users: 10, max_branches: 1 });
    const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

    // Form state (current edits)
    const [modulesState, setModulesState] = useState({});
    const [usersInput, setUsersInput] = useState('10');
    const [isUsersUnlimited, setIsUsersUnlimited] = useState(false);
    const [branchesInput, setBranchesInput] = useState('1');
    const [isBranchesUnlimited, setIsBranchesUnlimited] = useState(false);
    const [auditReason, setAuditReason] = useState('');
    const [notes, setNotes] = useState('');

    // Audit logs state
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditNotice, setAuditNotice] = useState(null);

    // Load initial tenant entitlement profile
    const loadEntitlementProfile = useCallback(async () => {
        if (!tenant?.id) return;
        setLoadingInitial(true);
        try {
            const res = await api.get(`/admin/tenants/${tenant.id}/override`);
            const data = res.data?.data || {};

            const configured = Boolean(data.isConfigured);
            setIsConfiguredBaseline(configured);
            setLastUpdatedAt(data.updated_at || null);
            setNotes(data.notes || '');

            // 1. Resolve Modules
            const resolvedMods = {};
            for (const mod of CANONICAL_MODULES) {
                if (data.modules && data.modules[mod.key] !== undefined) {
                    resolvedMods[mod.key] = Boolean(data.modules[mod.key]);
                } else {
                    // Fallback to tenant snapshot if unconfigured
                    const snapMods = typeof tenant.modules === 'string'
                        ? JSON.parse(tenant.modules || '{}')
                        : (tenant.modules || {});
                    resolvedMods[mod.key] = snapMods[mod.key] !== undefined
                        ? Boolean(snapMods[mod.key])
                        : false;
                }
            }
            setBaselineModules(resolvedMods);
            setModulesState(resolvedMods);

            // 2. Resolve Limits
            const rawLimits = data.limits || {};
            const effMaxUsers = rawLimits.max_users !== undefined ? Number(rawLimits.max_users) : (Number(tenant.max_users) || 10);
            const effMaxBranches = rawLimits.max_branches !== undefined ? Number(rawLimits.max_branches) : (Number(tenant.max_branches) || 1);

            setBaselineLimits({ max_users: effMaxUsers, max_branches: effMaxBranches });

            if (effMaxUsers === -1) {
                setIsUsersUnlimited(true);
                setUsersInput('-1');
            } else {
                setIsUsersUnlimited(false);
                setUsersInput(String(effMaxUsers));
            }

            if (effMaxBranches === -1) {
                setIsBranchesUnlimited(true);
                setBranchesInput('-1');
            } else {
                setIsBranchesUnlimited(false);
                setBranchesInput(String(effMaxBranches));
            }

        } catch (err) {
            console.warn('[TenantAccessModal] Failed to load override profile:', err);
            toast.error('Could not load tenant entitlement profile.');
        } finally {
            setLoadingInitial(false);
        }
    }, [tenant]);

    // Load Audit History
    const loadAuditHistory = useCallback(async () => {
        if (!tenant?.id) return;
        setAuditLoading(true);
        setAuditNotice(null);
        try {
            const res = await api.get(`/admin/tenants/${tenant.id}/audit-log`);
            if (res.data?.notice) {
                setAuditNotice(res.data.notice);
            }
            setAuditLogs(Array.isArray(res.data?.data) ? res.data.data : []);
        } catch (err) {
            console.warn('[TenantAccessModal] Failed to load audit history:', err);
            setAuditLogs([]);
        } finally {
            setAuditLoading(false);
        }
    }, [tenant]);

    useEffect(() => {
        if (isOpen && tenant?.id) {
            setActiveTab('edit');
            setAuditReason('');
            setConfirmModalOpen(false);
            loadEntitlementProfile();
            loadAuditHistory();
        }
    }, [isOpen, tenant, loadEntitlementProfile, loadAuditHistory]);

    // Module Toggle Handler
    const handleToggleModule = (key) => {
        setModulesState(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    // User Limit Unlimited Toggle
    const handleToggleUsersUnlimited = (checked) => {
        setIsUsersUnlimited(checked);
        if (checked) {
            setUsersInput('-1');
        } else {
            setUsersInput('10');
        }
    };

    // Branch Limit Unlimited Toggle
    const handleToggleBranchesUnlimited = (checked) => {
        setIsBranchesUnlimited(checked);
        if (checked) {
            setBranchesInput('-1');
        } else {
            setBranchesInput('1');
        }
    };

    // Validation
    const validationErrors = useMemo(() => {
        const errors = [];

        // Users validation
        if (isUsersUnlimited) {
            // Valid -1
        } else {
            const val = Number(usersInput);
            if (usersInput.trim() === '' || isNaN(val) || !Number.isInteger(val)) {
                errors.push('Maximum Users must be a valid whole integer.');
            } else if (val < 0) {
                errors.push('Maximum Users cannot be negative (use Unlimited option for -1).');
            }
        }

        // Branches validation
        if (isBranchesUnlimited) {
            // Valid -1
        } else {
            const val = Number(branchesInput);
            if (branchesInput.trim() === '' || isNaN(val) || !Number.isInteger(val)) {
                errors.push('Maximum Branches must be a valid whole integer.');
            } else if (val < 0) {
                errors.push('Maximum Branches cannot be negative (use Unlimited option for -1).');
            }
        }

        // Audit reason validation
        if (auditReason.trim().length < 10) {
            errors.push('Audit Reason is mandatory and must be at least 10 characters.');
        }

        return errors;
    }, [usersInput, isUsersUnlimited, branchesInput, isBranchesUnlimited, auditReason]);

    const isFormValid = validationErrors.length === 0;

    // Detect if there are unsaved changes
    const hasUnsavedChanges = useMemo(() => {
        const modsChanged = CANONICAL_MODULES.some(m => Boolean(modulesState[m.key]) !== Boolean(baselineModules[m.key]));
        const targetUsers = isUsersUnlimited ? -1 : parseInt(usersInput, 10);
        const targetBranches = isBranchesUnlimited ? -1 : parseInt(branchesInput, 10);
        const limitsChanged = targetUsers !== baselineLimits.max_users || targetBranches !== baselineLimits.max_branches;
        return modsChanged || limitsChanged || auditReason.trim().length > 0;
    }, [modulesState, baselineModules, isUsersUnlimited, usersInput, isBranchesUnlimited, branchesInput, baselineLimits, auditReason]);

    // Handle Safe Close with Unsaved Changes Guard
    const handleRequestClose = () => {
        if (hasUnsavedChanges) {
            if (!window.confirm('You have unsaved access changes. Are you sure you want to discard them and close?')) {
                return;
            }
        }
        onClose();
    };

    // Commit Save Handler
    const handleCommitSave = async () => {
        if (!isFormValid || saving) return;
        setSaving(true);
        try {
            const finalUsers = isUsersUnlimited ? -1 : parseInt(usersInput, 10);
            const finalBranches = isBranchesUnlimited ? -1 : parseInt(branchesInput, 10);

            const payload = {
                modules: modulesState,
                limits: {
                    max_users: finalUsers,
                    max_branches: finalBranches
                },
                reason: auditReason.trim(),
                notes: notes.trim()
            };

            const res = await api.put(`/admin/tenants/${tenant.id}/override`, payload);

            toast.success(`Access permissions saved successfully for ${tenant.name}`);

            setConfirmModalOpen(false);
            setAuditReason('');

            // Reload data
            await loadEntitlementProfile();
            await loadAuditHistory();

            if (onUpdated) {
                onUpdated({
                    tenant_id: tenant.id,
                    modules: modulesState,
                    max_users: finalUsers,
                    max_branches: finalBranches,
                    has_override: true,
                    updated_at: new Date().toISOString()
                });
            }

        } catch (err) {
            console.error('[TenantAccessModal] Save error:', err);
            const msg = err.response?.data?.message || 'Failed to save access permissions.';
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    // Enabled count
    const enabledModulesCount = useMemo(() => {
        return Object.values(modulesState).filter(Boolean).length;
    }, [modulesState]);

    if (!isOpen || !tenant) return null;

    return (
        <div 
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
            onClick={handleRequestClose}
            data-testid="tenant-access-modal-backdrop"
        >
            <div 
                className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative"
                onClick={(e) => e.stopPropagation()}
                data-testid="tenant-access-modal"
            >
                {/* ── HEADER ── */}
                <div className="p-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/70 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
                            <Sliders size={20} />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                                    {tenant.name}
                                </h2>
                                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border uppercase ${
                                    isConfiguredBaseline 
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}>
                                    {isConfiguredBaseline ? 'Configured (Manual Agreement)' : 'Unconfigured — Needs Setup'}
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono bg-white px-2 py-0.5 rounded-md border border-slate-200">
                                    ID: {tenant.id.slice(0, 8)}...
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                                <span>Template: <strong className="text-slate-700 capitalize">{tenant.template_name || 'general'}</strong></span>
                                <span>•</span>
                                <span>Status: <strong className="text-slate-700 capitalize">{tenant.status || 'active'}</strong></span>
                                <span>•</span>
                                <span>Last Updated: <strong className="text-slate-700 font-mono">{formatTimeAgo(lastUpdatedAt)}</strong></span>
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={handleRequestClose}
                        className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                        title="Close Modal"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* ── TABS NAVIGATION ── */}
                <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-100 bg-white shrink-0">
                    <button
                        onClick={() => setActiveTab('edit')}
                        className={`pb-3 px-3 text-xs font-bold transition-all relative flex items-center gap-1.5 ${
                            activeTab === 'edit'
                                ? 'text-indigo-600 border-b-2 border-indigo-600'
                                : 'text-slate-500 hover:text-slate-800'
                        }`}
                        data-testid="tab-edit-entitlements"
                    >
                        <Sliders size={14} />
                        Modules & Usage Limits
                        {hasUnsavedChanges && (
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Unsaved changes" />
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTab('audit')}
                        className={`pb-3 px-3 text-xs font-bold transition-all relative flex items-center gap-1.5 ${
                            activeTab === 'audit'
                                ? 'text-indigo-600 border-b-2 border-indigo-600'
                                : 'text-slate-500 hover:text-slate-800'
                        }`}
                        data-testid="tab-audit-history"
                    >
                        <History size={14} />
                        Audit History
                        {auditLogs.length > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] border border-slate-200">
                                {auditLogs.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* ── BODY (SCROLLABLE) ── */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {loadingInitial ? (
                        <div className="py-20 text-center flex flex-col items-center justify-center gap-3 text-slate-400">
                            <RefreshCw size={28} className="animate-spin text-indigo-600" />
                            <p className="text-sm font-bold text-slate-700">Loading organization entitlement profile...</p>
                        </div>
                    ) : activeTab === 'edit' ? (
                        <>
                            {/* SECTION A: MODULE ENTITLEMENTS */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                                            <Layers size={15} className="text-indigo-600" />
                                            Section A: Canonical Module Entitlements
                                        </h3>
                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                            Explicit technical access control. Only enabled modules can be reached by this company's users.
                                        </p>
                                    </div>
                                    <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full">
                                        {enabledModulesCount} / {CANONICAL_MODULES.length} Enabled
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                    {CANONICAL_MODULES.map((mod) => {
                                        const isEnabled = Boolean(modulesState[mod.key]);
                                        const IconComponent = mod.icon;
                                        return (
                                            <div
                                                key={mod.key}
                                                onClick={() => handleToggleModule(mod.key)}
                                                className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none flex items-center justify-between group ${
                                                    isEnabled
                                                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950 shadow-xs hover:border-emerald-300'
                                                        : 'bg-slate-50/60 border-slate-200 text-slate-400 opacity-60 hover:opacity-100 hover:border-slate-300'
                                                }`}
                                                data-testid={`module-toggle-${mod.key}`}
                                            >
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className={`p-2 rounded-xl transition-colors shrink-0 ${
                                                        isEnabled ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'
                                                    }`}>
                                                        <IconComponent size={16} />
                                                    </div>
                                                    <div className="overflow-hidden">
                                                        <div className="text-xs font-bold flex items-center gap-1.5 truncate">
                                                            <span>{mod.name}</span>
                                                            <span className="text-[10px] text-slate-400 font-normal">({mod.nameAr})</span>
                                                        </div>
                                                        <div className="text-[10px] text-slate-500 truncate mt-0.5">
                                                            {mod.desc}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="shrink-0 pl-2">
                                                    <div className={`w-11 h-6 rounded-full transition-colors flex items-center p-0.5 ${
                                                        isEnabled ? 'bg-emerald-600 justify-end' : 'bg-slate-300 justify-start'
                                                    }`}>
                                                        <span className="w-5 h-5 rounded-full bg-white shadow-sm flex items-center justify-center">
                                                            {isEnabled ? (
                                                                <Check size={11} className="text-emerald-700 stroke-[3]" />
                                                            ) : (
                                                                <X size={11} className="text-slate-400" />
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* SECTION B: USAGE LIMITS */}
                            <div className="space-y-4 pt-2">
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                                        <Users size={15} className="text-emerald-600" />
                                        Section B: Operational Resource Limits
                                    </h3>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        Server-side hard caps for active user seats and operational branches.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* USERS CAPACITY CARD */}
                                    <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                <Users size={14} className="text-emerald-600" />
                                                Maximum Users (Active Seats)
                                            </label>
                                            <span className="text-[11px] text-slate-500">
                                                Currently Active: <strong className="text-slate-800">{tenant.user_count ?? 1}</strong>
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="flex-1">
                                                <input
                                                    type="number"
                                                    disabled={isUsersUnlimited}
                                                    value={usersInput}
                                                    onChange={(e) => setUsersInput(e.target.value)}
                                                    min="0"
                                                    placeholder="e.g. 10 (0 to block)"
                                                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 font-mono font-bold text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all disabled:bg-slate-100 disabled:text-slate-400"
                                                    data-testid="input-max-users"
                                                />
                                            </div>
                                            <label className="flex items-center gap-2 bg-white px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer select-none hover:bg-slate-50">
                                                <input
                                                    type="checkbox"
                                                    checked={isUsersUnlimited}
                                                    onChange={(e) => handleToggleUsersUnlimited(e.target.checked)}
                                                    className="rounded text-emerald-600 focus:ring-emerald-500"
                                                    data-testid="toggle-users-unlimited"
                                                />
                                                Unlimited (∞)
                                            </label>
                                        </div>

                                        <p className="text-[10px] text-slate-400">
                                            Rule: Inactive users do not consume seats. Set to 0 to freeze new user creation.
                                        </p>
                                    </div>

                                    {/* BRANCHES CAPACITY CARD */}
                                    <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                <Building2 size={14} className="text-indigo-600" />
                                                Maximum Branches (Locations)
                                            </label>
                                            <span className="text-[11px] text-slate-500">
                                                Currently Active: <strong className="text-slate-800">{tenant.branch_count ?? 1}</strong>
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="flex-1">
                                                <input
                                                    type="number"
                                                    disabled={isBranchesUnlimited}
                                                    value={branchesInput}
                                                    onChange={(e) => setBranchesInput(e.target.value)}
                                                    min="0"
                                                    placeholder="e.g. 1 (0 to block)"
                                                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 font-mono font-bold text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all disabled:bg-slate-100 disabled:text-slate-400"
                                                    data-testid="input-max-branches"
                                                />
                                            </div>
                                            <label className="flex items-center gap-2 bg-white px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer select-none hover:bg-slate-50">
                                                <input
                                                    type="checkbox"
                                                    checked={isBranchesUnlimited}
                                                    onChange={(e) => handleToggleBranchesUnlimited(e.target.checked)}
                                                    className="rounded text-indigo-600 focus:ring-indigo-500"
                                                    data-testid="toggle-branches-unlimited"
                                                />
                                                Unlimited (∞)
                                            </label>
                                        </div>

                                        <p className="text-[10px] text-slate-400">
                                            Rule: Controls the number of physical/virtual branches permitted.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* SECTION C: MANDATORY AUDIT REASON */}
                            <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                                        <History size={14} className="text-amber-600" />
                                        Section C: Mandatory Audit Reason
                                        <span className="text-rose-500">*</span>
                                    </label>
                                    <span className={`text-[11px] font-mono font-bold ${
                                        auditReason.trim().length >= 10 ? 'text-emerald-600' : 'text-slate-400'
                                    }`}>
                                        {auditReason.trim().length} / 10 min chars
                                    </span>
                                </div>

                                <textarea
                                    rows={2}
                                    value={auditReason}
                                    onChange={(e) => setAuditReason(e.target.value)}
                                    placeholder="State the business rationale or authorization reason for this entitlement modification (minimum 10 characters)..."
                                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
                                    data-testid="textarea-audit-reason"
                                />

                                <div className="flex items-center justify-between text-[11px]">
                                    <span className="text-slate-400">
                                        This explanation is permanently logged with your administrator ID and IP address.
                                    </span>
                                    {auditReason.trim().length > 0 && auditReason.trim().length < 10 && (
                                        <span className="text-rose-600 font-semibold">
                                            Need {10 - auditReason.trim().length} more characters
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* SECTION D: EFFECTIVE ACCESS SUMMARY */}
                            <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-3 shadow-sm">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                                        <Shield size={14} className="text-emerald-400" />
                                        Section D: Effective Access Preview (Proposed State)
                                    </h4>
                                    {hasUnsavedChanges && (
                                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                            Unsaved Draft
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                    <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
                                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Active Modules</span>
                                        <span className="text-emerald-400 font-bold text-sm">{enabledModulesCount} Active</span>
                                    </div>
                                    <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
                                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Disabled Modules</span>
                                        <span className="text-slate-300 font-bold text-sm">{CANONICAL_MODULES.length - enabledModulesCount} Locked</span>
                                    </div>
                                    <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
                                        <span className="text-[10px] text-slate-400 uppercase font-bold block">User Seats Cap</span>
                                        <span className="text-white font-bold text-sm font-mono">
                                            {isUsersUnlimited ? 'Unlimited (∞)' : `${usersInput} Seats`}
                                        </span>
                                    </div>
                                    <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
                                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Branches Cap</span>
                                        <span className="text-white font-bold text-sm font-mono">
                                            {isBranchesUnlimited ? 'Unlimited (∞)' : `${branchesInput} Branches`}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        /* AUDIT HISTORY TAB */
                        <div className="space-y-4" data-testid="audit-history-view">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                                        <History size={15} className="text-indigo-600" />
                                        Access Configuration Audit Trail
                                    </h3>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        Historical record of all manual changes made to this organization's permissions and limits.
                                    </p>
                                </div>
                                <button
                                    onClick={loadAuditHistory}
                                    disabled={auditLoading}
                                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                    title="Refresh Audit History"
                                >
                                    <RefreshCw size={13} className={auditLoading ? 'animate-spin' : ''} />
                                </button>
                            </div>

                            {auditNotice && (
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2">
                                    <Info size={15} className="shrink-0 text-amber-600" />
                                    <span>{auditNotice} — Historical records will appear here once Migration 011 is applied.</span>
                                </div>
                            )}

                            {auditLoading ? (
                                <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                                    <RefreshCw size={24} className="animate-spin text-indigo-600" />
                                    <span className="text-xs font-bold">Loading audit logs...</span>
                                </div>
                            ) : auditLogs.length === 0 ? (
                                <div className="py-16 text-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 flex flex-col items-center justify-center gap-2">
                                    <History size={32} className="text-slate-300" />
                                    <p className="text-xs font-bold text-slate-700">No Access Change Records Found</p>
                                    <p className="text-[11px] text-slate-400">
                                        Every time you modify this organization's access, an immutable entry is recorded here.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {auditLogs.map((log) => (
                                        <div 
                                            key={log.id} 
                                            className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5 text-xs hover:border-slate-300 transition-colors"
                                        >
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-200/60 pb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                                    <strong className="text-slate-900">{log.admin_name || 'ITQAN Super Admin'}</strong>
                                                    <span className="text-slate-400 font-mono text-[11px]">({log.admin_email || 'admin'})</span>
                                                </div>
                                                <span className="text-[11px] text-slate-500 font-mono">
                                                    {new Date(log.created_at).toLocaleString()}
                                                </span>
                                            </div>

                                            <div>
                                                <span className="text-[10px] uppercase font-bold text-slate-400 block">Reason for Change:</span>
                                                <p className="text-slate-800 font-medium bg-white p-2.5 rounded-xl border border-slate-200 mt-1">
                                                    "{log.reason}"
                                                </p>
                                            </div>

                                            {/* Limits Delta */}
                                            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                                                <div className="bg-white p-2 rounded-lg border border-slate-200">
                                                    <span className="text-slate-400 block text-[10px]">User Seats:</span>
                                                    <span className="font-mono text-slate-800 font-bold">
                                                        {log.previous_limits?.max_users ?? '—'} <ArrowRight size={10} className="inline mx-1 text-slate-400" /> {log.new_limits?.max_users ?? '—'}
                                                    </span>
                                                </div>
                                                <div className="bg-white p-2 rounded-lg border border-slate-200">
                                                    <span className="text-slate-400 block text-[10px]">Branches:</span>
                                                    <span className="font-mono text-slate-800 font-bold">
                                                        {log.previous_limits?.max_branches ?? '—'} <ArrowRight size={10} className="inline mx-1 text-slate-400" /> {log.new_limits?.max_branches ?? '—'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── FOOTER ACTIONS ── */}
                <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="text-xs">
                        {validationErrors.length > 0 && activeTab === 'edit' ? (
                            <span className="text-rose-600 font-semibold flex items-center gap-1.5">
                                <AlertTriangle size={14} className="shrink-0" />
                                {validationErrors[0]}
                            </span>
                        ) : hasUnsavedChanges ? (
                            <span className="text-amber-600 font-semibold flex items-center gap-1.5">
                                <Sparkles size={14} className="shrink-0 text-amber-500" />
                                Unsaved changes pending authorization.
                            </span>
                        ) : (
                            <span className="text-slate-400 flex items-center gap-1.5">
                                <Check size={14} className="text-emerald-600" />
                                Current configuration synchronized with server.
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleRequestClose}
                            className="px-4 py-2 bg-slate-200/80 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            disabled={!isFormValid || saving}
                            onClick={() => setConfirmModalOpen(true)}
                            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                            data-testid="btn-save-entitlements"
                        >
                            {saving ? (
                                <>
                                    <RefreshCw size={14} className="animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Shield size={14} />
                                    Save Access Configuration
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* ── CONFIRMATION MODAL ── */}
                {confirmModalOpen && (
                    <div 
                        className="absolute inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
                        data-testid="confirmation-modal"
                    >
                        <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
                            <div className="flex items-center gap-3 text-indigo-600">
                                <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200">
                                    <Shield size={22} />
                                </div>
                                <div>
                                    <h4 className="text-base font-bold text-slate-900">Confirm Entitlement Change</h4>
                                    <p className="text-xs text-slate-500">Target Tenant: {tenant.name}</p>
                                </div>
                            </div>

                            <p className="text-xs text-slate-600 leading-relaxed">
                                You are about to apply new manual module entitlements and usage limits to this organization. These changes take effect immediately across all active sessions.
                            </p>

                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Modules Enabled:</span>
                                    <strong className="text-slate-800">{enabledModulesCount} of {CANONICAL_MODULES.length}</strong>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">User Limit:</span>
                                    <strong className="text-slate-800 font-mono">{isUsersUnlimited ? 'Unlimited (-1)' : usersInput}</strong>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Branch Limit:</span>
                                    <strong className="text-slate-800 font-mono">{isBranchesUnlimited ? 'Unlimited (-1)' : branchesInput}</strong>
                                </div>
                                <div className="pt-1.5 border-t border-slate-200">
                                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Audit Reason:</span>
                                    <span className="text-slate-700 italic block mt-0.5">"{auditReason}"</span>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setConfirmModalOpen(false)}
                                    disabled={saving}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                                >
                                    Review Again
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCommitSave}
                                    disabled={saving}
                                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
                                    data-testid="btn-confirm-save-commit"
                                >
                                    {saving ? (
                                        <>
                                            <RefreshCw size={13} className="animate-spin" />
                                            Applying...
                                        </>
                                    ) : (
                                        <>
                                            <Check size={14} />
                                            Apply Changes Now
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TenantAccessManagementModal;
