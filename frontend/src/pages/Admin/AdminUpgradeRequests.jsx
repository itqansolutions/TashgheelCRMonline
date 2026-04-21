import React, { useState, useEffect } from 'react';
import { 
    Check, X, Clock, Zap, AlertTriangle, 
    Loader2, RefreshCw, Layers, ShieldCheck, 
    Users, DollarSign, ArrowUpRight, TrendingUp,
    CheckCircle2, XCircle, AlertCircle
} from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const STATUS = {
    pending:  { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: <Clock size={14}/>, label: 'Awaiting Authorization' },
    approved: { color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: <CheckCircle2 size={14}/>, label: 'Execution Confirmed' },
    rejected: { color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/20', icon: <XCircle size={14}/>, label: 'Access Denied' },
    cancelled:{ color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/20', icon: <AlertCircle size={14}/>, label: 'Voided' },
};

const AdminUpgradeRequests = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [rejectId, setRejectId] = useState(null);
    const [rejectNote, setRejectNote] = useState('');

    const [instantTenant, setInstantTenant] = useState('');
    const [instantPlan, setInstantPlan]     = useState('');
    const [plans, setPlans]                 = useState([]);
    const [instantMonths, setInstantMonths] = useState(1);

    const load = async () => {
        setLoading(true);
        try {
            const [reqRes, planRes] = await Promise.all([
                api.get('/admin/upgrade-requests'),
                api.get('/admin/plans')
            ]);
            setRequests(reqRes.data.data || []);
            setPlans(planRes.data.data?.filter(p => p.is_active) || []);
        } catch { toast.error('Signal Interrupted: Data link failure'); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const handleApprove = async (id) => {
        try {
            await api.post(`/admin/upgrade-requests/${id}/approve`);
            toast.success('Protocol Executed. License expansion live.');
            load();
        } catch (err) { toast.error(err.response?.data?.message || 'Execution error'); }
    };

    const handleReject = async () => {
        try {
            await api.post(`/admin/upgrade-requests/${rejectId}/reject`, { notes: rejectNote });
            toast.success('Expansion Blocked. Record archived.');
            setRejectId(null);
            setRejectNote('');
            load();
        } catch { toast.error('Rejection protocol failed'); }
    };

    const handleInstantUpgrade = async () => {
        if (!instantTenant || !instantPlan) return toast.error('Specify Target & Protocol');
        try {
            await api.post(`/admin/tenants/${instantTenant}/instant-upgrade`, { plan_id: parseInt(instantPlan), months: instantMonths });
            toast.success('⚡ Warp Drive Engaged: Instant Upgrade Applied');
            setInstantTenant(''); setInstantPlan('');
            load();
        } catch (err) { toast.error(err.response?.data?.message || 'Operation failed'); }
    };

    const pendingCount = requests.filter(r => r.status === 'pending').length;

    return (
        <div className="p-4 md:p-8 animate-in fade-in duration-700">
            <style>{`
                .platform-table th {
                    padding: 16px 24px;
                    font-size: 11px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--text-muted);
                    border-bottom: 1px solid var(--border);
                }
                .platform-table td {
                    padding: 20px 24px;
                    border-bottom: 1px solid var(--border);
                }
                .status-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    border-radius: 8px;
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .pending-badge { background: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.2); }
                .approved-badge { background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); }
                .rejected-badge { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); }
            `}</style>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                <div className="section-header">
                    <h2 className="text-3xl font-extrabold tracking-tight text-[var(--text-main)]">Growth Intelligence</h2>
                    <p className="text-[var(--text-muted)] mt-1 font-medium">Monitor and authorize subscription expansion requests.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right hidden md:block">
                       <span className="block text-sm font-extrabold text-amber-500">{pendingCount} Pending</span>
                       <span className="block text-[10px] font-bold text-[var(--text-muted)] uppercase">Active Requests</span>
                    </div>
                    <button 
                        onClick={load}
                        className="w-12 h-12 flex items-center justify-center bg-white dark:bg-slate-900 border border-[var(--border)] rounded-xl text-[var(--text-muted)] hover:text-[var(--primary)] transition-all shadow-sm"
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* MAIN QUEUE */}
            <div className="ap-card overflow-hidden mb-12">
                <div className="p-6 border-b border-[var(--border)] flex items-center justify-between bg-slate-50 dark:bg-slate-900/40">
                    <h3 className="text-lg font-bold text-[var(--text-main)] flex items-center gap-3">
                        <Layers className="text-amber-500" size={20} />
                        Subscription Request Queue
                    </h3>
                </div>
                
                {loading ? (
                    <div className="py-24 flex flex-col items-center justify-center space-y-4 opacity-50">
                        <RefreshCw className="animate-spin text-[var(--primary)]" size={32} />
                        <span className="text-xs font-bold uppercase tracking-widest">Interpreting Network Signal...</span>
                    </div>
                ) : requests.length === 0 ? (
                    <div className="py-32 flex flex-col items-center justify-center space-y-4 opacity-40 text-center">
                        <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-500 rounded-full flex items-center justify-center mb-2">
                             <Check size={32} />
                        </div>
                        <h4 className="text-lg font-extrabold">Queue Clear</h4>
                        <p className="text-sm font-medium text-[var(--text-muted)]">No active expansion requests detected.</p>
                    </div>
                ) : (
                    <table className="w-full text-left platform-table">
                        <thead>
                            <tr>
                                <th>Client Identity</th>
                                <th>Upgrade Path</th>
                                <th>Authorization Status</th>
                                <th className="text-right">Execution</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map(r => (
                                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                                    <td>
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-[var(--bg-main)] border border-[var(--border)] flex items-center justify-center font-black text-amber-500 text-sm">
                                                {r.tenant_name?.[0]}
                                            </div>
                                            <div>
                                                <p className="font-extrabold text-[var(--text-main)] text-base">{r.tenant_name}</p>
                                                <div className="flex items-center gap-2 text-[11px] font-bold text-[var(--text-muted)]">
                                                   <Users size={12}/> {r.user_count} Active Nodes
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-4">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{r.current_plan}</span>
                                                <div className="flex items-center gap-2">
                                                    <TrendingUp size={14} className="text-emerald-500" />
                                                    <span className="text-sm font-extrabold text-[var(--text-main)] uppercase">{r.requested_plan}</span>
                                                </div>
                                            </div>
                                            <div className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                                                <span className="text-xs font-black text-emerald-600">${r.requested_price}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div className={`status-badge ${r.status === 'pending' ? 'pending-badge' : r.status === 'approved' ? 'approved-badge' : 'rejected-badge'}`}>
                                            {STATUS[r.status]?.icon}
                                            {STATUS[r.status]?.label}
                                        </div>
                                    </td>
                                    <td className="text-right">
                                        {r.status === 'pending' ? (
                                            <div className="flex items-center justify-end gap-2">
                                                <button onClick={() => handleApprove(r.id)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-xs hover:bg-emerald-500 transition-all shadow-md shadow-emerald-600/20">
                                                    Approve
                                                </button>
                                                <button onClick={() => { setRejectId(r.id); setRejectNote(''); }} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg font-bold text-xs hover:bg-rose-600 hover:text-white transition-all">
                                                    Reject
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest italic">Process Archived</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* DIRECT SYSTEM UPGRADE TOOL */}
            <div className="ap-card p-10 border-amber-100 dark:border-amber-900/20 bg-amber-50/20 dark:bg-amber-950/10 relative overflow-hidden group">
                <div className="absolute -right-6 -bottom-6 opacity-5 grayscale group-hover:grayscale-0 transition-opacity pointer-events-none">
                    <Zap size={160} className="text-amber-500" />
                </div>
                
                <h3 className="text-xl font-extrabold text-[var(--text-main)] flex items-center gap-3 mb-2">
                    <Zap className="text-amber-500" size={24} />
                    Direct System Expansion
                </h3>
                <p className="text-sm font-medium text-[var(--text-muted)] mb-8">Force-upgrade any node bypassing standard request cycles.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative z-10">
                    <div className="space-y-2">
                        <label className="ap-label">Target Tenant Node</label>
                        <input value={instantTenant} onChange={e => setInstantTenant(e.target.value)} placeholder="Enter Tenant ID..." className="ap-input" />
                    </div>
                    <div className="space-y-2">
                        <label className="ap-label">Target Protocol</label>
                        <select value={instantPlan} onChange={e => setInstantPlan(e.target.value)} className="ap-input">
                            <option value="">Select Package...</option>
                            {plans.map(p => <option key={p.id} value={p.id}>{p.display_name.toUpperCase()}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="ap-label">Expansion Duration (Mo)</label>
                        <input type="number" min={1} value={instantMonths} onChange={e => setInstantMonths(parseInt(e.target.value) || 1)} className="ap-input" />
                    </div>
                    <div className="flex items-end">
                        <button onClick={handleInstantUpgrade} className="btn-primary-premium w-full justify-center h-[50px] shadow-amber-600/20" style={{ background: 'var(--accent)' }}>
                            <Zap size={18}/> Engage Warp Expansion
                        </button>
                    </div>
                </div>
            </div>

            {/* REJECT MODAL */}
            {rejectId && (
                <>
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[400] animate-in fade-in" onClick={() => setRejectId(null)} />
                <div className="fixed inset-0 z-[450] flex items-center justify-center p-6 pointer-events-none">
                    <div className="ap-card w-full max-w-lg p-10 pointer-events-auto animate-in zoom-in-95">
                        <h3 className="text-2xl font-black text-[var(--text-main)] mb-4 flex items-center gap-4">
                            <div className="p-3 bg-rose-100 dark:bg-rose-950/30 text-rose-600 rounded-xl">
                                <AlertTriangle size={28} />
                            </div>
                            Deny Expansion
                        </h3>
                        <p className="text-sm font-medium text-[var(--text-muted)] mb-8">
                            Specify the reason for rejecting this subscription change. This will be transmitted to the node administrator.
                        </p>
                        <div className="space-y-2">
                            <label className="ap-label">Internal Message</label>
                            <textarea 
                                value={rejectNote} 
                                onChange={e => setRejectNote(e.target.value)} 
                                rows={3} 
                                placeholder="Describe reason for denial..." 
                                className="ap-input resize-none"
                            />
                        </div>
                        <div className="flex gap-4 mt-10">
                            <button onClick={() => setRejectId(null)} className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleReject} className="flex-1 py-3.5 bg-rose-600 text-white rounded-xl font-bold text-sm hover:bg-rose-500 transition-all shadow-lg shadow-rose-600/20">
                                Confirm Rejection
                            </button>
                        </div>
                    </div>
                </div>
                </>
            )}
        </div>
    );
};

export default AdminUpgradeRequests;
