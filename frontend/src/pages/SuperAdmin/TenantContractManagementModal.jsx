import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { 
    FileText, Calendar, DollarSign, Clock, ShieldAlert, CheckCircle2, 
    AlertTriangle, X, RefreshCw, Plus, Edit3, History, Info, ChevronRight, AlertCircle
} from 'lucide-react';

/**
 * Format currency with locale
 */
const formatCurrency = (val, currency = 'EGP') => {
    const num = Number(val) || 0;
    return `${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
};

/**
 * Format dates cleanly
 */
const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * Status badge styling helper
 */
const getStatusBadge = (status) => {
    switch (status) {
        case 'active':
            return {
                bg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
                dot: 'bg-emerald-500',
                label: 'Active Agreement',
                labelAr: 'عقد نشط ومسجل'
            };
        case 'expiring_soon':
            return {
                bg: 'bg-amber-50 border-amber-200 text-amber-800',
                dot: 'bg-amber-500',
                label: 'Expiring Soon (<30d)',
                labelAr: 'ينتهي قريباً (أقل من 30 يوماً)'
            };
        case 'expired':
            return {
                bg: 'bg-slate-100 border-slate-300 text-slate-700',
                dot: 'bg-slate-400',
                label: 'Past Period / Expired',
                labelAr: 'منتهي (استرشادي)'
            };
        case 'upcoming':
            return {
                bg: 'bg-indigo-50 border-indigo-200 text-indigo-800',
                dot: 'bg-indigo-500',
                label: 'Upcoming Agreement',
                labelAr: 'عقد يبدأ مستقبلاً'
            };
        default:
            return {
                bg: 'bg-slate-50 border-slate-200 text-slate-600',
                dot: 'bg-slate-300',
                label: 'No Contract Recorded',
                labelAr: 'لا يوجد عقد مسجل'
            };
    }
};

/**
 * 🏛️ ITQAN HUD: Commercial Contract Management Modal
 * Phase 4.2.6-B — Commercial Contracts: Value & Duration Ledger
 * 
 * Strict Guarantees:
 * - Reference ledger only; 100% decoupled from technical runtime permissions.
 * - Multi-contract historical preservation; older contracts are never overwritten or deleted.
 * - Contract updates create audit log entries preserving previous values.
 */
const TenantContractManagementModal = ({ tenant, isOpen, onClose, onUpdated }) => {
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'form' | 'audit'
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Data State
    const [contracts, setContracts] = useState([]);
    const [activeContract, setActiveContract] = useState(null);
    const [hasOverlap, setHasOverlap] = useState(false);
    const [overlapWarning, setOverlapWarning] = useState(null);
    const [migrationNotice, setMigrationNotice] = useState(null);

    // Audit Logs State
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditNotice, setAuditNotice] = useState(null);

    // Form State (for Create / Edit)
    const [editingContractId, setEditingContractId] = useState(null);
    const [formValue, setFormValue] = useState('');
    const [formCurrency, setFormCurrency] = useState('EGP');
    const [formStartDate, setFormStartDate] = useState('');
    const [formEndDate, setFormEndDate] = useState('');
    const [formNotes, setFormNotes] = useState('');
    const [formReason, setFormReason] = useState('');

    // Load Contracts Data
    const loadContracts = useCallback(async () => {
        if (!tenant?.id) return;
        setLoading(true);
        setMigrationNotice(null);
        try {
            const res = await api.get(`/admin/tenants/${tenant.id}/contracts`);
            if (res.data?.notice) {
                setMigrationNotice(res.data.notice);
            }
            const data = res.data?.data || {};
            setContracts(Array.isArray(data.contracts) ? data.contracts : []);
            setActiveContract(data.active_contract || null);
            setHasOverlap(Boolean(data.has_overlap));
            setOverlapWarning(data.overlap_warning || null);
        } catch (err) {
            console.warn('[TenantContractModal] Failed to load contracts:', err);
            toast.error(err.response?.data?.message || 'Failed to load commercial contracts.');
        } finally {
            setLoading(false);
        }
    }, [tenant]);

    // Load Audit Logs
    const loadAuditLogs = useCallback(async () => {
        if (!tenant?.id) return;
        setAuditLoading(true);
        setAuditNotice(null);
        try {
            const res = await api.get(`/admin/tenants/${tenant.id}/contracts/audit-log`);
            if (res.data?.notice) {
                setAuditNotice(res.data.notice);
            }
            setAuditLogs(Array.isArray(res.data?.data) ? res.data.data : []);
        } catch (err) {
            console.warn('[TenantContractModal] Failed to load audit logs:', err);
            setAuditLogs([]);
        } finally {
            setAuditLoading(false);
        }
    }, [tenant]);

    useEffect(() => {
        if (isOpen && tenant?.id) {
            setActiveTab('overview');
            setEditingContractId(null);
            resetForm();
            loadContracts();
            loadAuditLogs();
        }
    }, [isOpen, tenant, loadContracts, loadAuditLogs]);

    const resetForm = () => {
        const today = new Date().toISOString().slice(0, 10);
        const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10);
        setEditingContractId(null);
        setFormValue('');
        setFormCurrency('EGP');
        setFormStartDate(today);
        setFormEndDate(nextYear);
        setFormNotes('');
        setFormReason('');
    };

    const handleStartCreate = () => {
        resetForm();
        setActiveTab('form');
    };

    const handleStartEdit = (contract) => {
        setEditingContractId(contract.id);
        setFormValue(String(contract.contract_value));
        setFormCurrency(contract.currency || 'EGP');
        setFormStartDate(String(contract.start_date).slice(0, 10));
        setFormEndDate(String(contract.end_date).slice(0, 10));
        setFormNotes(contract.notes || '');
        setFormReason('');
        setActiveTab('form');
    };

    // Client Validation
    const formErrors = useMemo(() => {
        const errors = [];
        const val = Number(formValue);
        if (formValue.trim() === '' || isNaN(val) || val < 0) {
            errors.push('Contract Total Value must be a valid non-negative number.');
        }
        if (!formStartDate || !formEndDate) {
            errors.push('Start Date and End Date are both required.');
        } else if (formStartDate > formEndDate) {
            errors.push('End Date must be greater than or equal to Start Date.');
        }
        if (editingContractId && formReason.trim().length < 5) {
            errors.push('Modification Reason is required (at least 5 characters).');
        }
        return errors;
    }, [formValue, formStartDate, formEndDate, editingContractId, formReason]);

    const isFormValid = formErrors.length === 0;

    // Submit Create or Update
    const handleSubmitForm = async (e) => {
        e.preventDefault();
        if (!isFormValid || saving) return;
        setSaving(true);

        const payload = {
            contract_value: Number(formValue),
            currency: formCurrency.trim().toUpperCase(),
            start_date: formStartDate,
            end_date: formEndDate,
            notes: formNotes.trim(),
            reason: formReason.trim()
        };

        try {
            if (editingContractId) {
                // Update existing contract
                await api.put(`/admin/tenants/${tenant.id}/contracts/${editingContractId}`, payload);
                toast.success('Commercial contract updated successfully.');
            } else {
                // Create new contract
                await api.post(`/admin/tenants/${tenant.id}/contracts`, payload);
                toast.success('Commercial contract recorded successfully.');
            }

            resetForm();
            setActiveTab('overview');
            await loadContracts();
            await loadAuditLogs();

            if (onUpdated) {
                onUpdated({
                    tenant_id: tenant.id,
                    contract_updated_at: new Date().toISOString()
                });
            }
        } catch (err) {
            console.error('[TenantContractModal] Save error:', err);
            const msg = err.response?.data?.message || 'Failed to save commercial contract.';
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen || !tenant) return null;

    return (
        <div 
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 1. MODAL HEADER */}
                <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-violet-600/20 text-violet-400 rounded-2xl border border-violet-500/30">
                            <FileText size={24} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-bold">Commercial Agreement & Contracts</h3>
                                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                                    {tenant.name}
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                                ITQAN Administrative Reference Ledger • سجل العقود والاتفاقيات التجارية
                            </p>
                        </div>
                    </div>

                    <button 
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* 2. PERMANENT PROMINENT DISCLAIMER */}
                <div className="bg-indigo-50/80 border-b border-indigo-100 px-6 py-3 flex items-start gap-2.5 text-xs text-indigo-900">
                    <Info size={16} className="text-indigo-600 mt-0.5 shrink-0" />
                    <div>
                        <strong className="font-bold">Administrative Reference Only: </strong>
                        Commercial contract records are for ITQAN administrative tracking and revenue records only. 
                        Contract dates and status <strong>do not</strong> affect tenant system access, enabled technical modules, or user quotas.
                    </div>
                </div>

                {/* 3. SUB-TABS NAVIGATION */}
                <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-200 bg-slate-50/70">
                    <button
                        onClick={() => { setActiveTab('overview'); setEditingContractId(null); }}
                        className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
                            activeTab === 'overview'
                                ? 'border-violet-600 text-violet-700 bg-white rounded-t-xl'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <History size={14} />
                        Active Agreement & History
                    </button>
                    <button
                        onClick={handleStartCreate}
                        className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
                            activeTab === 'form' && !editingContractId
                                ? 'border-violet-600 text-violet-700 bg-white rounded-t-xl'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <Plus size={14} />
                        Record New Contract
                    </button>
                    {editingContractId && (
                        <button
                            className="px-4 py-2 text-xs font-bold border-b-2 border-violet-600 text-violet-700 bg-white rounded-t-xl flex items-center gap-2"
                        >
                            <Edit3 size={14} />
                            Amend Contract
                        </button>
                    )}
                    <button
                        onClick={() => setActiveTab('audit')}
                        className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
                            activeTab === 'audit'
                                ? 'border-violet-600 text-violet-700 bg-white rounded-t-xl'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <ShieldAlert size={14} />
                        Contract Audit Trail
                    </button>
                </div>

                {/* 4. MODAL BODY */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {loading ? (
                        <div className="py-16 text-center space-y-3">
                            <RefreshCw size={28} className="animate-spin text-violet-600 mx-auto" />
                            <p className="text-xs text-slate-500 font-medium">Loading commercial contract records...</p>
                        </div>
                    ) : migrationNotice ? (
                        <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs space-y-2">
                            <div className="flex items-center gap-2 font-bold text-sm">
                                <AlertCircle size={18} className="text-amber-600" />
                                Database Table Pending Migration
                            </div>
                            <p>
                                The commercial contracts table (<code>tenant_contracts</code>) has not yet been migrated to the active database.
                                Migration file <code>026_create_tenant_contracts_ledger.sql</code> is staged locally and ready for execution during scheduled maintenance.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* OVERVIEW TAB */}
                            {activeTab === 'overview' && (
                                <div className="space-y-6">
                                    {/* Date Overlap Warning */}
                                    {hasOverlap && (
                                        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-xs text-amber-800">
                                            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                                            <div>
                                                <strong className="font-bold">Multiple Overlapping Agreements: </strong>
                                                {overlapWarning || 'Two or more recorded contracts have overlapping date intervals.'}
                                            </div>
                                        </div>
                                    )}

                                    {/* Active Agreement Spotlight Card */}
                                    {activeContract ? (
                                        <div className="p-5 bg-gradient-to-br from-violet-50/80 via-white to-slate-50 border border-violet-200 rounded-3xl shadow-sm space-y-4">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div className="flex items-center gap-2.5">
                                                    <span className={`px-3 py-1 rounded-full border text-xs font-bold flex items-center gap-1.5 ${getStatusBadge(activeContract.status).bg}`}>
                                                        <span className={`w-2 h-2 rounded-full ${getStatusBadge(activeContract.status).dot}`} />
                                                        {getStatusBadge(activeContract.status).label}
                                                    </span>
                                                    <span className="text-xs text-slate-500">
                                                        {getStatusBadge(activeContract.status).labelAr}
                                                    </span>
                                                </div>

                                                <button
                                                    onClick={() => handleStartEdit(activeContract)}
                                                    className="px-3 py-1.5 bg-white hover:bg-violet-50 text-violet-700 border border-violet-200 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                                                >
                                                    <Edit3 size={13} />
                                                    Amend Agreement
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                                                <div className="p-3 bg-white rounded-2xl border border-slate-200">
                                                    <span className="text-[11px] text-slate-400 font-medium block">Total Contract Value</span>
                                                    <strong className="text-lg font-bold text-violet-700">
                                                        {formatCurrency(activeContract.contract_value, activeContract.currency)}
                                                    </strong>
                                                </div>

                                                <div className="p-3 bg-white rounded-2xl border border-slate-200">
                                                    <span className="text-[11px] text-slate-400 font-medium block">Agreement Duration</span>
                                                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                                                        <Calendar size={13} className="text-slate-400" />
                                                        {formatDate(activeContract.start_date)} → {formatDate(activeContract.end_date)}
                                                    </div>
                                                </div>

                                                <div className="p-3 bg-white rounded-2xl border border-slate-200">
                                                    <span className="text-[11px] text-slate-400 font-medium block">Time Status</span>
                                                    <span className="text-xs font-bold text-slate-700 block mt-0.5">
                                                        {activeContract.status === 'active' || activeContract.status === 'expiring_soon'
                                                            ? `${activeContract.days_remaining} days remaining`
                                                            : activeContract.status === 'expired'
                                                            ? `Ended ${activeContract.days_expired_ago || 0} days ago`
                                                            : `Starts in ${activeContract.days_remaining} days`
                                                        }
                                                    </span>
                                                </div>
                                            </div>

                                            {activeContract.notes && (
                                                <div className="text-xs text-slate-600 bg-white/80 p-3 rounded-xl border border-slate-100">
                                                    <strong className="text-slate-700">Internal Notes: </strong>
                                                    {activeContract.notes}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-3xl space-y-3">
                                            <div className="p-3 bg-white text-slate-400 rounded-2xl w-fit mx-auto border border-slate-200 shadow-xs">
                                                <FileText size={24} />
                                            </div>
                                            <div className="space-y-1">
                                                <h4 className="font-bold text-sm text-slate-800">No Commercial Contract Recorded</h4>
                                                <p className="text-xs text-slate-500 max-w-md mx-auto">
                                                    Record the commercial value and agreed duration for this organization. 
                                                    This creates an administrative reference record for ITQAN operations.
                                                </p>
                                            </div>
                                            <button
                                                onClick={handleStartCreate}
                                                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 mx-auto"
                                            >
                                                <Plus size={14} />
                                                Record First Contract
                                            </button>
                                        </div>
                                    )}

                                    {/* Historical Contracts List */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                                <History size={14} className="text-violet-600" />
                                                Contract History Timeline ({contracts.length})
                                            </h4>
                                            <button
                                                onClick={handleStartCreate}
                                                className="text-xs text-violet-700 font-bold hover:underline flex items-center gap-1"
                                            >
                                                <Plus size={12} /> Add Extension / New Agreement
                                            </button>
                                        </div>

                                        {contracts.length === 0 ? (
                                            <p className="text-xs text-slate-400 italic">No historical agreements found.</p>
                                        ) : (
                                            <div className="space-y-2.5">
                                                {contracts.map(c => {
                                                    const badge = getStatusBadge(c.status);
                                                    return (
                                                        <div 
                                                            key={c.id}
                                                            className="p-3.5 bg-white border border-slate-200 rounded-2xl hover:border-slate-300 transition-all flex flex-wrap items-center justify-between gap-3 shadow-2xs"
                                                        >
                                                            <div className="space-y-1">
                                                                <div className="flex items-center gap-2">
                                                                    <strong className="text-sm font-bold text-slate-900">
                                                                        {formatCurrency(c.contract_value, c.currency)}
                                                                    </strong>
                                                                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold flex items-center gap-1 ${badge.bg}`}>
                                                                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                                                                        {badge.label}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
                                                                    <span>{formatDate(c.start_date)} → {formatDate(c.end_date)}</span>
                                                                    {c.created_by_name && (
                                                                        <span className="text-slate-400">• by {c.created_by_name}</span>
                                                                    )}
                                                                </div>
                                                                {c.notes && (
                                                                    <p className="text-xs text-slate-600 mt-1">{c.notes}</p>
                                                                )}
                                                            </div>

                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => handleStartEdit(c)}
                                                                    className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                                                                >
                                                                    <Edit3 size={12} /> Edit
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* RECORD / EDIT FORM TAB */}
                            {activeTab === 'form' && (
                                <form onSubmit={handleSubmitForm} className="space-y-5">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                        <h4 className="text-sm font-bold text-slate-900">
                                            {editingContractId ? 'Amend Commercial Agreement Terms' : 'Record New Commercial Agreement'}
                                        </h4>
                                        <button
                                            type="button"
                                            onClick={() => { setActiveTab('overview'); setEditingContractId(null); }}
                                            className="text-xs text-slate-500 hover:text-slate-800"
                                        >
                                            Cancel
                                        </button>
                                    </div>

                                    {/* Errors list */}
                                    {formErrors.length > 0 && (
                                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
                                            {formErrors.map((err, idx) => (
                                                <div key={idx} className="flex items-center gap-1.5">
                                                    <AlertCircle size={13} className="text-rose-600 shrink-0" />
                                                    <span>{err}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        {/* Contract Total Value */}
                                        <div className="sm:col-span-2 space-y-1.5">
                                            <label className="text-xs font-bold text-slate-700 block">
                                                Contract Total Value <span className="text-rose-500">*</span>
                                            </label>
                                            <div className="relative">
                                                <DollarSign size={16} className="absolute left-3 top-3 text-slate-400" />
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={formValue}
                                                    onChange={(e) => setFormValue(e.target.value)}
                                                    placeholder="e.g. 45000"
                                                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        {/* Currency */}
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-slate-700 block">Currency</label>
                                            <select
                                                value={formCurrency}
                                                onChange={(e) => setFormCurrency(e.target.value)}
                                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                                            >
                                                <option value="EGP">EGP (جنيه مصري)</option>
                                                <option value="USD">USD ($)</option>
                                                <option value="SAR">SAR (ريال سعودي)</option>
                                                <option value="EUR">EUR (€)</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Dates */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-slate-700 block">
                                                Agreement Start Date <span className="text-rose-500">*</span>
                                            </label>
                                            <input
                                                type="date"
                                                value={formStartDate}
                                                onChange={(e) => setFormStartDate(e.target.value)}
                                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                                                required
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-slate-700 block">
                                                Agreement End Date <span className="text-rose-500">*</span>
                                            </label>
                                            <input
                                                type="date"
                                                value={formEndDate}
                                                onChange={(e) => setFormEndDate(e.target.value)}
                                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                                                required
                                            />
                                        </div>
                                    </div>

                                    {/* Modification Reason (Mandatory if editing) */}
                                    {editingContractId && (
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-slate-700 block">
                                                Reason for Modification <span className="text-rose-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={formReason}
                                                onChange={(e) => setFormReason(e.target.value)}
                                                placeholder="e.g. Contract value adjusted per CEO approval"
                                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                                                required
                                            />
                                            <span className="text-[11px] text-slate-400">
                                                Stored in the audit log alongside the previous values.
                                            </span>
                                        </div>
                                    )}

                                    {/* Internal Notes */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-700 block">
                                            Internal Administrative Notes (Optional)
                                        </label>
                                        <textarea
                                            value={formNotes}
                                            onChange={(e) => setFormNotes(e.target.value)}
                                            rows={3}
                                            placeholder="e.g. Contract #2026-ITQ-081, signed by Managing Director. Special pilot discount."
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                                        />
                                    </div>

                                    {/* Form Submit Buttons */}
                                    <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                                        <button
                                            type="button"
                                            onClick={() => { setActiveTab('overview'); setEditingContractId(null); }}
                                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={!isFormValid || saving}
                                            className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                                        >
                                            {saving ? (
                                                <>
                                                    <RefreshCw size={13} className="animate-spin" />
                                                    Saving Contract...
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircle2 size={14} />
                                                    {editingContractId ? 'Save Amendment' : 'Record Contract'}
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            )}

                            {/* AUDIT TRAIL TAB */}
                            {activeTab === 'audit' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                            <ShieldAlert size={14} className="text-violet-600" />
                                            Commercial Contract Audit Logs
                                        </h4>
                                        <button
                                            onClick={loadAuditLogs}
                                            disabled={auditLoading}
                                            className="text-xs text-violet-700 font-bold hover:underline flex items-center gap-1"
                                        >
                                            <RefreshCw size={12} className={auditLoading ? 'animate-spin' : ''} />
                                            Refresh
                                        </button>
                                    </div>

                                    {auditLoading ? (
                                        <div className="py-12 text-center text-xs text-slate-400">Loading audit history...</div>
                                    ) : auditNotice ? (
                                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                                            {auditNotice}
                                        </div>
                                    ) : auditLogs.length === 0 ? (
                                        <p className="text-xs text-slate-400 italic py-6 text-center">
                                            No contract modification audit records found.
                                        </p>
                                    ) : (
                                        <div className="space-y-3">
                                            {auditLogs.map((log) => {
                                                const prev = log.previous_data ? (typeof log.previous_data === 'string' ? JSON.parse(log.previous_data) : log.previous_data) : null;
                                                const next = log.new_data ? (typeof log.new_data === 'string' ? JSON.parse(log.new_data) : log.new_data) : {};

                                                return (
                                                    <div key={log.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                    log.action === 'CREATE' ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'
                                                                }`}>
                                                                    {log.action}
                                                                </span>
                                                                <span className="font-bold text-slate-800">{log.admin_name || 'Admin'}</span>
                                                                <span className="text-slate-400 font-mono text-[11px]">({log.admin_email || '—'})</span>
                                                            </div>
                                                            <span className="text-slate-400 text-[11px] font-mono">
                                                                {new Date(log.created_at).toLocaleString()}
                                                            </span>
                                                        </div>

                                                        {log.reason && (
                                                            <div className="text-slate-700 bg-white p-2 rounded-xl border border-slate-100">
                                                                <strong className="text-slate-800">Reason: </strong>
                                                                {log.reason}
                                                            </div>
                                                        )}

                                                        {prev && (
                                                            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 font-mono">
                                                                <div className="p-2 bg-rose-50 border border-rose-100 rounded-lg text-rose-800">
                                                                    <span className="block font-bold">Previous:</span>
                                                                    <span>Value: {prev.contract_value} {prev.currency}</span><br />
                                                                    <span>Period: {formatDate(prev.start_date)} - {formatDate(prev.end_date)}</span>
                                                                </div>
                                                                <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-800">
                                                                    <span className="block font-bold">Updated:</span>
                                                                    <span>Value: {next.contract_value} {next.currency}</span><br />
                                                                    <span>Period: {formatDate(next.start_date)} - {formatDate(next.end_date)}</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* 5. MODAL FOOTER */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                    <span className="flex items-center gap-1.5">
                        <ShieldAlert size={14} className="text-violet-600" />
                        Commercial Ledger • Audit trail active
                    </span>
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TenantContractManagementModal;
