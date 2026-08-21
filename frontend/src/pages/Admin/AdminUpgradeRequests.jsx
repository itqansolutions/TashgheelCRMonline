import React, { useState, useEffect } from 'react';
import { 
    Check, X, Clock, Zap, AlertTriangle, 
    RefreshCw, Layers, Users, DollarSign, 
    CheckCircle2, XCircle, AlertCircle, ArrowLeft, LogOut
} from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const STATUS = {
    pending:  { color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-amber-200', icon: <Clock size={14}/>, label: 'Pending' },
    approved: { color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-200', icon: <CheckCircle2 size={14}/>, label: 'Approved' },
    rejected: { color: 'text-rose-700', bg: 'bg-rose-100', border: 'border-rose-200', icon: <XCircle size={14}/>, label: 'Rejected' },
    cancelled:{ color: 'text-slate-700', bg: 'bg-slate-100', border: 'border-slate-200', icon: <AlertCircle size={14}/>, label: 'Cancelled' },
};

const AdminUpgradeRequests = () => {
    const navigate = useNavigate();
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
        } catch { 
            toast.error('Failed to load upgrade requests'); 
        } finally { 
            setLoading(false); 
        }
    };

    useEffect(() => { load(); }, []);

    const handleApprove = async (id) => {
        try {
            await api.post(`/admin/upgrade-requests/${id}/approve`);
            toast.success('Upgrade request approved successfully');
            load();
        } catch (err) { 
            toast.error(err.response?.data?.message || 'Approval failed'); 
        }
    };

    const handleReject = async () => {
        try {
            await api.post(`/admin/upgrade-requests/${rejectId}/reject`, { notes: rejectNote });
            toast.success('Upgrade request rejected');
            setRejectId(null);
            setRejectNote('');
            load();
        } catch { 
            toast.error('Rejection failed'); 
        }
    };

    const handleInstantUpgrade = async () => {
        if (!instantTenant || !instantPlan) return toast.error('Please specify company ID and plan');
        try {
            await api.post(`/admin/tenants/${instantTenant}/instant-upgrade`, { plan_id: parseInt(instantPlan), months: instantMonths });
            toast.success('Instant upgrade applied successfully');
            setInstantTenant(''); 
            setInstantPlan('');
            load();
        } catch (err) { 
            toast.error(err.response?.data?.message || 'Upgrade failed'); 
        }
    };

    const handleExit = () => {
        sessionStorage.removeItem('ITQAN_CORE_AUTHORIZED');
        navigate('/dashboard');
    };

    const pendingCount = requests.filter(r => r.status === 'pending').length;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* TOP HEADER */}
            <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate('/itqan-crm-hud')} className="flex items-center gap-2 text-slate-400 hover:text-slate-700 transition-colors mr-2">
                        <ArrowLeft size={18} />
                    </button>
                    <div className="w-9 h-9 bg-amber-600 rounded-xl flex items-center justify-center">
                        <Zap size={18} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-base font-bold text-slate-800">Upgrade Requests</h1>
                        <p className="text-xs text-slate-400">Review & Approve Company Subscription Upgrades</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/itqan-crm-hud/pricing')} className="text-sm font-medium text-indigo-600 hover:underline">
                        Subscription Plans
                    </button>
                    <button onClick={handleExit} className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-red-600 transition-colors">
                        <LogOut size={16} /> Exit to App
                    </button>
                </div>
            </header>

            <main className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Pending & Past Requests</h2>
                        <p className="text-xs text-slate-500 mt-0.5">{pendingCount} requests currently pending review</p>
                    </div>
                    <button 
                        onClick={load}
                        className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-sm font-medium text-slate-600 transition-colors shadow-sm"
                    >
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                </div>

                {/* TABLE */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="py-24 flex items-center justify-center text-slate-400">
                            <RefreshCw className="animate-spin mr-3 text-amber-600" size={24} />
                            <span className="text-sm font-medium">Loading requests...</span>
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="py-24 flex flex-col items-center justify-center text-center text-slate-400 space-y-2">
                            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-2">
                                <Check size={24} />
                            </div>
                            <h4 className="text-base font-bold text-slate-700">No Requests Found</h4>
                            <p className="text-xs text-slate-400">There are no pending upgrade requests from any company.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100">
                                        <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Company</th>
                                        <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Current Plan</th>
                                        <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Requested Plan</th>
                                        <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Status</th>
                                        <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {requests.map(r => {
                                        const badge = STATUS[r.status] || STATUS.pending;
                                        return (
                                            <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-5 py-4">
                                                    <p className="font-semibold text-slate-800">{r.tenant_name}</p>
                                                    <p className="text-xs text-slate-400">{r.user_count || 0} users</p>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 capitalize">
                                                        {r.current_plan || 'None'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-slate-800 capitalize">{r.requested_plan}</span>
                                                        {r.requested_price !== undefined && (
                                                            <span className="text-xs text-emerald-600 font-bold">(${r.requested_price}/mo)</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${badge.bg} ${badge.color}`}>
                                                        {badge.icon}
                                                        {badge.label}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4 text-right">
                                                    {r.status === 'pending' ? (
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button 
                                                                onClick={() => handleApprove(r.id)} 
                                                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
                                                            >
                                                                Approve
                                                            </button>
                                                            <button 
                                                                onClick={() => { setRejectId(r.id); setRejectNote(''); }} 
                                                                className="px-3.5 py-1.5 bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-600 rounded-lg text-xs font-semibold transition-colors"
                                                            >
                                                                Reject
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-slate-400 font-medium italic">Completed</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* DIRECT INSTANT UPGRADE TOOL */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                    <div>
                        <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                            <Zap size={18} className="text-amber-500" />
                            Direct Company Upgrade
                        </h3>
                        <p className="text-xs text-slate-500">Instantly assign or upgrade any company subscription directly</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Company ID (UUID)</label>
                            <input 
                                value={instantTenant} 
                                onChange={e => setInstantTenant(e.target.value)} 
                                placeholder="Paste Company UUID..." 
                                className="w-full p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-amber-400" 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Select Plan</label>
                            <select 
                                value={instantPlan} 
                                onChange={e => setInstantPlan(e.target.value)} 
                                className="w-full p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-amber-400 bg-white"
                            >
                                <option value="">Choose Plan...</option>
                                {plans.map(p => (
                                    <option key={p.id} value={p.id}>{p.display_name} (${p.price_monthly}/mo)</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Duration (Months)</label>
                            <input 
                                type="number" 
                                min={1} 
                                value={instantMonths} 
                                onChange={e => setInstantMonths(parseInt(e.target.value) || 1)} 
                                className="w-full p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-amber-400" 
                            />
                        </div>
                        <div className="flex items-end">
                            <button 
                                onClick={handleInstantUpgrade} 
                                className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
                            >
                                Apply Instant Upgrade
                            </button>
                        </div>
                    </div>
                </div>
            </main>

            {/* REJECT MODAL */}
            {rejectId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-100">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-red-100 rounded-xl text-red-600">
                                <AlertTriangle size={20} />
                            </div>
                            <h3 className="font-bold text-slate-800 text-lg">Reject Upgrade Request</h3>
                        </div>
                        <p className="text-xs text-slate-500 mb-4">
                            Provide an optional reason for rejecting this request.
                        </p>
                        <textarea 
                            value={rejectNote} 
                            onChange={e => setRejectNote(e.target.value)} 
                            rows={3} 
                            placeholder="Reason for rejection..." 
                            className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-red-400 resize-none mb-6"
                        />
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setRejectId(null)} 
                                className="flex-1 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleReject} 
                                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold shadow-sm"
                            >
                                Confirm Reject
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminUpgradeRequests;
