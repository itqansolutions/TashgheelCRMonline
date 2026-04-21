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
        <div className="min-h-screen bg-slate-950 p-6 md:p-10 animate-in fade-in duration-700">
            <style>{`
                .hud-table-wrapper {
                    background: rgba(30, 41, 59, 0.4);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 2rem;
                    overflow: hidden;
                }
                .glow-amber { box-shadow: 0 0 20px rgba(245, 158, 11, 0.1); }
                .glow-emerald { box-shadow: 0 0 20px rgba(16, 185, 129, 0.1); }
                .hud-btn {
                    padding: 0.6rem 1.2rem;
                    border-radius: 0.75rem;
                    font-weight: 800;
                    font-size: 0.7rem;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                }
                .hud-input {
                    background: rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: white;
                    border-radius: 0.75rem;
                    padding: 0.75rem 1rem;
                    outline: none;
                    font-size: 0.8rem;
                }
                .hud-input:focus { border-color: rgba(245, 158, 11, 0.5); }
            `}</style>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                <div>
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-amber-600/20 text-amber-500 rounded-lg border border-amber-500/20">
                            <TrendingUp size={20} />
                        </div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">System: Expansion_Queue_v2</span>
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tighter">Growth Intelligence</h1>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1 opacity-70">Monitor and authorize subscription level adjustments</p>
                </div>
                <div className="flex gap-4">
                    <div className="flex flex-col items-end">
                       <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">{pendingCount} Pending</span>
                       <span className="text-[9px] font-bold text-slate-600 uppercase">Requests requiring attention</span>
                    </div>
                    <button 
                        onClick={load}
                        className="p-3 bg-white/5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-95 border border-white/5"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* MAIN QUEUE */}
            <div className="hud-table-wrapper mb-12">
                <div className="p-8 border-b border-white/5 flex items-center justify-between">
                    <h3 className="text-xl font-black text-white flex items-center gap-3">
                        <Layers className="text-amber-500" size={20} />
                        Subscription Request Feed
                    </h3>
                </div>
                
                {loading ? (
                    <div className="py-32 flex flex-col items-center justify-center space-y-4 opacity-50">
                        <Loader2 className="animate-spin text-amber-500" size={32} />
                        <span className="text-[9px] font-black text-white uppercase tracking-[0.4em]">Interpreting Signal...</span>
                    </div>
                ) : requests.length === 0 ? (
                    <div className="py-40 flex flex-col items-center justify-center space-y-4 opacity-30 text-center">
                        <Check size={48} className="text-emerald-500 mb-2" />
                        <h4 className="text-lg font-black text-white">Grid Neutralized</h4>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">No active upgrade requests in the buffer</p>
                    </div>
                ) : (
                    <table className="w-full text-left">
                        <thead className="bg-black/20 border-b border-white/5">
                            <tr>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Origin Node</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Expansion Delta</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Request Status</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Auth Protocol</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {requests.map(r => (
                                <tr key={r.id} className="group hover:bg-white/[0.02] transition-colors">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-white/5 flex items-center justify-center font-black text-amber-500 text-sm">
                                                {r.tenant_name?.[0]}
                                            </div>
                                            <div>
                                                <p className="font-bold text-white text-base group-hover:text-amber-400 transition-colors uppercase tracking-tight">{r.tenant_name}</p>
                                                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-2">
                                                   <Users size={10}/> {r.user_count} Active Units
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{r.current_plan}</span>
                                                <div className="flex items-center gap-2">
                                                    <ArrowUpRight size={14} className="text-emerald-500" />
                                                    <span className="text-sm font-black text-white uppercase tracking-tighter">{r.requested_plan}</span>
                                                </div>
                                            </div>
                                            <div className="px-3 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/10">
                                                <span className="text-[10px] font-black text-emerald-500">${r.requested_price}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${STATUS[r.status]?.bg} ${STATUS[r.status]?.color} ${STATUS[r.status]?.border}`}>
                                            {STATUS[r.status]?.icon}
                                            {STATUS[r.status]?.label}
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        {r.status === 'pending' && (
                                            <div className="flex items-center justify-end gap-3 translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300">
                                                <button onClick={() => handleApprove(r.id)} className="hud-btn bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 active:scale-95">
                                                    <Check size={14}/> Authorize
                                                </button>
                                                <button onClick={() => { setRejectId(r.id); setRejectNote(''); }} className="hud-btn bg-rose-600/10 text-rose-500 border border-rose-500/20 hover:bg-rose-600 hover:text-white active:scale-95">
                                                    <X size={14}/> Reject
                                                </button>
                                            </div>
                                        )}
                                        {r.status !== 'pending' && (
                                            <span className="text-[9px] font-bold text-slate-800 uppercase tracking-widest italic">Archived Sequence</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* INSTANT OVERRIDE TOOL */}
            <div className="hud-table-wrapper bg-amber-500/[0.03] border-amber-500/10 p-10 relative overflow-hidden group">
                <div className="absolute -right-10 -bottom-10 opacity-5 grayscale group-hover:grayscale-0 transition-all">
                    <Zap size={180} className="text-amber-500" />
                </div>
                
                <h3 className="text-xl font-black text-white flex items-center gap-3 mb-2">
                    <Zap className="text-amber-500" size={20} />
                    Warp Command Center
                </h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-8">Direct Subscription Injection Protocol</p>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative z-10">
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">Target Tenant ID</label>
                        <input value={instantTenant} onChange={e => setInstantTenant(e.target.value)} placeholder="000...-000" className="hud-input w-full uppercase" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">Select Logic Package</label>
                        <select value={instantPlan} onChange={e => setInstantPlan(e.target.value)} className="hud-input w-full appearance-none">
                            <option value="">Choose Protocol...</option>
                            {plans.map(p => <option key={p.id} value={p.id}>{p.display_name.toUpperCase()} — ${p.price_monthly}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">Persistence (Months)</label>
                        <input type="number" min={1} value={instantMonths} onChange={e => setInstantMonths(parseInt(e.target.value) || 1)} className="hud-input w-full" />
                    </div>
                    <div className="flex items-end">
                        <button onClick={handleInstantUpgrade} className="hud-btn bg-amber-600 text-white w-full justify-center h-12 shadow-xl shadow-amber-600/20 hover:bg-amber-500 active:scale-95">
                            <Zap size={16}/> Engage Instant Warp
                        </button>
                    </div>
                </div>
            </div>

            {/* REJECT MODAL */}
            {rejectId && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="hud-table-wrapper w-full max-w-lg p-12 bg-slate-900 border-rose-500/20 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none transform rotate-12">
                            <ShieldCheck size={140} className="text-rose-500" />
                        </div>
                        <h3 className="text-2xl font-black text-white mb-6 uppercase tracking-tighter flex items-center gap-4">
                            <div className="p-3 bg-rose-600/20 rounded-2xl border border-rose-500/20 shadow-lg">
                                <AlertTriangle className="text-rose-500" size={24} />
                            </div>
                            Authorization Denied
                        </h3>
                        <p className="text-sm text-slate-400 mb-8 font-medium leading-relaxed">
                            Explain the reason for rejecting expansion sequence. The node administrator will receive this signal.
                        </p>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">Rejection Note</label>
                            <textarea 
                                value={rejectNote} 
                                onChange={e => setRejectNote(e.target.value)} 
                                rows={3} 
                                placeholder="e.g. Validation failure: Unverified payment source..." 
                                className="hud-input w-full resize-none placeholder:text-slate-800 placeholder:italic"
                            />
                        </div>
                        <div className="flex gap-4 mt-10">
                            <button onClick={() => setRejectId(null)} className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-700 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleReject} className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-500 transition-all shadow-xl shadow-rose-600/20">
                                Confirm Rejection
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminUpgradeRequests;
