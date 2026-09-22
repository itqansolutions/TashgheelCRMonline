import React, { useState, useEffect, useCallback } from 'react';
import {
    ClipboardList, Check, X, Clock, CheckCircle2, XCircle,
    RefreshCw, Building2, User, Mail, Phone, Layers,
    ArrowLeft, LogOut, LayoutDashboard, CreditCard, Zap, History,
    AlertTriangle, ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';

const MODULE_LIST = [
    { key: 'crm',        label: 'CRM',         desc: 'Customers, Deals & Pipeline' },
    { key: 'finance',    label: 'Finance & ERP',desc: 'Invoices, Journals, Banking' },
    { key: 'hr',         label: 'HR',           desc: 'Employees, Payroll, Attendance' },
    { key: 'inventory',  label: 'Inventory',    desc: 'Warehouses & Stock' },
    { key: 'real_estate',label: 'Real Estate',  desc: 'Units, Contracts & Tracking' },
    { key: 'automation', label: 'Automation',   desc: 'Workflows & Rules' },
];

const PLAN_LIST = ['basic', 'pro', 'enterprise'];

const STATUS = {
    pending:  { color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   icon: <Clock size={13}/>,        label: 'Pending' },
    approved: { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: <CheckCircle2 size={13}/>, label: 'Approved' },
    rejected: { color: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-200',    icon: <XCircle size={13}/>,      label: 'Rejected' },
};

const RegistrationRequests = () => {
    const navigate = useNavigate();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('pending');

    // Approve modal state
    const [approveModal, setApproveModal] = useState(null); // request object
    const [selectedModules, setSelectedModules] = useState({ crm: true, finance: true, hr: false, inventory: false, real_estate: false, automation: false });
    const [selectedPlan, setSelectedPlan] = useState('basic');
    const [approveNotes, setApproveNotes] = useState('');
    const [approveLoading, setApproveLoading] = useState(false);

    // Reject modal state
    const [rejectModal, setRejectModal] = useState(null); // request object
    const [rejectNotes, setRejectNotes] = useState('');
    const [rejectLoading, setRejectLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/admin/registration-requests${filter !== 'all' ? '?status=' + filter : ''}`);
            setRequests(res.data.data || []);
        } catch {
            toast.error('Failed to load registration requests');
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { load(); }, [load]);

    const handleExit = () => {
        sessionStorage.removeItem('ITQAN_CORE_AUTHORIZED');
        navigate('/dashboard');
    };

    const openApproveModal = (req) => {
        setApproveModal(req);
        // Pre-select real_estate module if template is real_estate
        setSelectedModules({
            crm: true,
            finance: true,
            hr: false,
            inventory: false,
            real_estate: req.template_name === 'real_estate',
            automation: false
        });
        setSelectedPlan('basic');
        setApproveNotes('');
    };

    const handleApprove = async () => {
        const hasModule = Object.values(selectedModules).some(Boolean);
        if (!hasModule) { toast.error('Please enable at least one module.'); return; }
        setApproveLoading(true);
        try {
            await api.post(`/admin/registration-requests/${approveModal.id}/approve`, {
                modules: selectedModules,
                plan: selectedPlan,
                notes: approveNotes || undefined
            });
            toast.success(`Workspace for ${approveModal.company_name} created!`);
            setApproveModal(null);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Approval failed');
        } finally {
            setApproveLoading(false);
        }
    };

    const handleReject = async () => {
        setRejectLoading(true);
        try {
            await api.post(`/admin/registration-requests/${rejectModal.id}/reject`, {
                notes: rejectNotes || undefined
            });
            toast.success('Request rejected.');
            setRejectModal(null);
            setRejectNotes('');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Rejection failed');
        } finally {
            setRejectLoading(false);
        }
    };

    const pendingCount = requests.filter(r => r.status === 'pending').length;

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased">

            {/* TOP NAV */}
            <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 py-3.5 shadow-sm">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-600/20 text-white">
                            <ClipboardList size={20}/>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-base font-bold text-slate-900">Registration Requests</h1>
                                {pendingCount > 0 && (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white font-bold text-[10px]">{pendingCount}</span>
                                )}
                            </div>
                            <p className="text-xs text-slate-500">Review and approve new workspace requests</p>
                        </div>
                    </div>

                    {/* Sub-portal Navigation */}
                    <div className="hidden lg:flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200">
                        <button onClick={() => navigate('/itqan-crm-hud')} className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/60 transition-all flex items-center gap-1.5">
                            <LayoutDashboard size={13}/> Cockpit HUD
                        </button>
                        <button onClick={() => navigate('/itqan-crm-hud/hub')} className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/60 transition-all flex items-center gap-1.5">
                            <Building2 size={13}/> Companies
                        </button>
                        <button onClick={() => navigate('/itqan-crm-hud/pricing')} className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/60 transition-all flex items-center gap-1.5">
                            <CreditCard size={13}/> Plans
                        </button>
                        <button onClick={() => navigate('/itqan-crm-hud/upgrades')} className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/60 transition-all flex items-center gap-1.5">
                            <Zap size={13}/> Upgrades
                        </button>
                        <button onClick={() => navigate('/itqan-crm-hud/registrations')} className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-sm flex items-center gap-1.5">
                            <ClipboardList size={13}/> Registrations
                            {pendingCount > 0 && <span className="px-1.5 rounded-full bg-white/30 text-white font-bold text-[9px]">{pendingCount}</span>}
                        </button>
                        <button onClick={() => navigate('/itqan-crm-hud/audit')} className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/60 transition-all flex items-center gap-1.5">
                            <History size={13}/> Audit
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <button onClick={load} disabled={loading} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 transition-colors disabled:opacity-50" title="Refresh">
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
                        </button>
                        <button onClick={handleExit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold transition-colors">
                            <LogOut size={14}/> <span className="hidden sm:inline">Exit to App</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
                {/* Filter Tabs */}
                <div className="flex items-center gap-2 mb-6 bg-white border border-slate-200 rounded-2xl p-1.5 w-fit shadow-sm">
                    {['pending', 'approved', 'rejected', 'all'].map(f => (
                        <button key={f} onClick={() => setFilter(f)} className={`px-4 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${filter === f ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}>
                            {f}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="text-center py-16 text-slate-400">
                        <RefreshCw size={24} className="animate-spin mx-auto mb-3"/>
                        Loading requests...
                    </div>
                ) : requests.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 text-slate-400">
                        <ClipboardList size={40} className="mx-auto mb-4 text-slate-200"/>
                        <p className="font-semibold text-slate-600">No {filter !== 'all' ? filter : ''} requests</p>
                        <p className="text-sm mt-1">Registration requests will appear here once submitted.</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 text-left">
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Company</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contact</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Template</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {requests.map(req => {
                                    const s = STATUS[req.status] || STATUS.pending;
                                    return (
                                        <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                                                        <Building2 size={16} className="text-indigo-600"/>
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-900 text-sm">{req.company_name}</div>
                                                        <div className="text-xs text-slate-500 capitalize">{req.plan || '—'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-semibold text-slate-800">{req.contact_name}</div>
                                                <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5"><Mail size={11}/>{req.email}</div>
                                                {req.phone && <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5"><Phone size={11}/>{req.phone}</div>}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold capitalize">
                                                    {req.template_name?.replace('_', ' ') || 'general'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-xs text-slate-500">
                                                {new Date(req.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${s.bg} ${s.text} ${s.border}`}>
                                                    {s.icon} {s.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                {req.status === 'pending' && (
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => openApproveModal(req)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-colors">
                                                            <Check size={13}/> Approve
                                                        </button>
                                                        <button onClick={() => { setRejectModal(req); setRejectNotes(''); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors">
                                                            <X size={13}/> Reject
                                                        </button>
                                                    </div>
                                                )}
                                                {req.status !== 'pending' && (
                                                    <span className="text-xs text-slate-400">
                                                        {req.approved_at ? new Date(req.approved_at).toLocaleDateString('en-GB') : '—'}
                                                        {req.approved_by_name && <span className="ml-1 text-slate-300">by {req.approved_by_name}</span>}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>

            {/* ── APPROVE MODAL ─────────────────────────────────────────── */}
            {approveModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 border border-slate-200">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                                <Check size={20}/>
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-slate-900">Approve & Create Workspace</h2>
                                <p className="text-sm text-slate-500">{approveModal.company_name}</p>
                            </div>
                        </div>

                        {/* Modules */}
                        <div className="mb-5">
                            <label className="block text-xs font-bold text-slate-700 mb-3 uppercase tracking-wide">Modules to Enable</label>
                            <div className="grid grid-cols-2 gap-2">
                                {MODULE_LIST.map(({ key, label, desc }) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setSelectedModules(prev => ({ ...prev, [key]: !prev[key] }))}
                                        className={`text-left p-3 rounded-xl border transition-all ${selectedModules[key] ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`}
                                    >
                                        <div className="flex items-center justify-between mb-0.5">
                                            <span className="text-xs font-bold">{label}</span>
                                            {selectedModules[key] && <Check size={12} className="text-indigo-600"/>}
                                        </div>
                                        <div className="text-[10px] opacity-70">{desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Plan */}
                        <div className="mb-5">
                            <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Plan</label>
                            <div className="flex gap-2">
                                {PLAN_LIST.map(p => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => setSelectedPlan(p)}
                                        className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize border transition-all ${selectedPlan === p ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-300'}`}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="mb-6">
                            <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Notes (optional)</label>
                            <textarea
                                rows={2}
                                value={approveNotes}
                                onChange={e => setApproveNotes(e.target.value)}
                                placeholder="Internal notes..."
                                className="w-full text-sm border border-slate-200 rounded-xl p-3 text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
                            />
                        </div>

                        {/* Warning */}
                        <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                            <AlertTriangle size={14} className="text-amber-600 mt-0.5 flex-shrink-0"/>
                            <p className="text-xs text-amber-700">This will create the tenant and user and activate the selected modules. This action cannot be undone.</p>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setApproveModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                            <button onClick={handleApprove} disabled={approveLoading} className="flex-2 flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                                {approveLoading ? <><RefreshCw size={14} className="animate-spin"/> Creating...</> : <><Check size={14}/> Approve & Create</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── REJECT MODAL ──────────────────────────────────────────── */}
            {rejectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 border border-slate-200">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                                <X size={20}/>
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-slate-900">Reject Request</h2>
                                <p className="text-sm text-slate-500">{rejectModal.company_name}</p>
                            </div>
                        </div>
                        <div className="mb-6">
                            <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Reason / Notes (optional)</label>
                            <textarea
                                rows={3}
                                value={rejectNotes}
                                onChange={e => setRejectNotes(e.target.value)}
                                placeholder="Reason for rejection..."
                                className="w-full text-sm border border-slate-200 rounded-xl p-3 text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100 resize-none"
                            />
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setRejectModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                            <button onClick={handleReject} disabled={rejectLoading} className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                                {rejectLoading ? <><RefreshCw size={14} className="animate-spin"/> Rejecting...</> : <><X size={14}/> Reject</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RegistrationRequests;
