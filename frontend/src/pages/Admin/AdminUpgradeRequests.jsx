import React, { useState, useEffect } from 'react';
import { Check, X, Clock, Zap, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const STATUS = {
    pending:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Pending' },
    approved: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Approved' },
    rejected: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  label: 'Rejected' },
    cancelled:{ color: '#9ca3af', bg: 'rgba(156,163,175,0.1)',label: 'Cancelled' },
};

const AdminUpgradeRequests = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [rejectId, setRejectId] = useState(null);
    const [rejectNote, setRejectNote] = useState('');

    // Instant upgrade state
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
        } catch { toast.error('Failed to load'); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const handleApprove = async (id) => {
        try {
            await api.post(`/admin/upgrade-requests/${id}/approve`);
            toast.success('✅ Upgrade approved! Tenant subscription updated.');
            load();
        } catch (err) { toast.error(err.response?.data?.message || 'Approve failed'); }
    };

    const handleReject = async () => {
        try {
            await api.post(`/admin/upgrade-requests/${rejectId}/reject`, { notes: rejectNote });
            toast.success('Request rejected. Tenant notified.');
            setRejectId(null);
            setRejectNote('');
            load();
        } catch { toast.error('Reject failed'); }
    };

    const handleInstantUpgrade = async () => {
        if (!instantTenant || !instantPlan) return toast.error('Select tenant and plan');
        try {
            await api.post(`/admin/tenants/${instantTenant}/instant-upgrade`, { plan_id: parseInt(instantPlan), months: instantMonths });
            toast.success('⚡ Instant upgrade applied!');
            setInstantTenant(''); setInstantPlan('');
            load();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    };

    const pending = requests.filter(r => r.status === 'pending');

    return (
        <div style={{ padding: 28 }}>
            <style>{`
                .ur-table { width: 100%; border-collapse: collapse; }
                .ur-table th, .ur-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--glass-border); font-size: 14px; }
                .ur-table th { font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
                .badge-sm { padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; }
                .btn-approve { background: rgba(16,185,129,0.1); color: #10b981; border: 1px solid rgba(16,185,129,0.3); padding: 6px 14px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 12px; }
                .btn-approve:hover { background: rgba(16,185,129,0.2); }
                .btn-reject  { background: rgba(239,68,68,0.06); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); padding: 6px 14px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 12px; }
                .btn-reject:hover { background: rgba(239,68,68,0.12); }
                .ur-card { background: var(--bg-card); border-radius: 14px; padding: 24px; border: 1px solid var(--glass-border); margin-bottom: 20px; }
            `}</style>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>
                        💳 Upgrade Requests
                    </h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
                        {pending.length} pending request{pending.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button onClick={load} style={{ background: 'none', border: '1px solid var(--glass-border)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
                    <RefreshCw size={13}/> Refresh
                </button>
            </div>

            {/* ─ Requests Table ─ */}
            <div className="ur-card">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}><Loader2 size={24}/></div>
                ) : requests.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                        <Check size={36} style={{ opacity: 0.2, marginBottom: 8 }}/><br/>No upgrade requests. All clear.
                    </div>
                ) : (
                    <table className="ur-table">
                        <thead>
                            <tr>
                                <th>Tenant</th>
                                <th>Request</th>
                                <th>Users</th>
                                <th>Date</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map(r => (
                                <tr key={r.id}>
                                    <td>
                                        <div style={{ fontWeight: 800 }}>{r.tenant_name}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.tenant_slug}</div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                            <span style={{ color: 'var(--text-muted)' }}>{r.current_plan}</span>
                                            <span>→</span>
                                            <strong style={{ color: 'var(--primary)' }}>{r.requested_plan}</strong>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(${r.requested_price}/mo)</span>
                                        </div>
                                    </td>
                                    <td style={{ fontWeight: 700 }}>{r.user_count}</td>
                                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                                    <td>
                                        <span className="badge-sm" style={{ background: STATUS[r.status]?.bg, color: STATUS[r.status]?.color }}>
                                            {STATUS[r.status]?.label}
                                        </span>
                                    </td>
                                    <td>
                                        {r.status === 'pending' && (
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button className="btn-approve" onClick={() => handleApprove(r.id)}>
                                                    <Check size={12}/> Approve
                                                </button>
                                                <button className="btn-reject" onClick={() => { setRejectId(r.id); setRejectNote(''); }}>
                                                    <X size={12}/> Reject
                                                </button>
                                            </div>
                                        )}
                                        {r.notes && r.status === 'rejected' && (
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }} title={r.notes}>💬 Note</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ─ Reject Modal ─ */}
            {rejectId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
                    <div style={{ background: 'var(--bg-card)', padding: 32, borderRadius: 16, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ margin: '0 0 16px', fontWeight: 900 }}>Reject Upgrade Request</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 14 }}>Provide a reason (optional). The tenant will be notified.</p>
                        <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={3} placeholder="e.g. Payment verification required..." style={{ width: '100%', padding: 12, border: '1px solid var(--glass-border)', borderRadius: 8, background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: 14, resize: 'none', boxSizing: 'border-box' }}/>
                        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                            <button onClick={() => setRejectId(null)} style={{ flex: 1, padding: '10px', border: '1px solid var(--glass-border)', borderRadius: 8, background: 'none', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
                            <button onClick={handleReject} style={{ flex: 1, padding: '10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}>Reject Request</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─ Instant Upgrade Tool ─ */}
            <div className="ur-card" style={{ border: '1.5px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.02)' }}>
                <h3 style={{ margin: '0 0 4px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Zap size={18} color="#f59e0b"/> Admin Instant Upgrade
                </h3>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>Override any tenant's subscription instantly — for testing or sales.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tenant ID</label>
                        <input value={instantTenant} onChange={e => setInstantTenant(e.target.value)} placeholder="UUID..." style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--glass-border)', borderRadius: 8, background: 'var(--bg-main)', color: 'var(--text-main)', boxSizing: 'border-box' }}/>
                    </div>
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Plan</label>
                        <select value={instantPlan} onChange={e => setInstantPlan(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--glass-border)', borderRadius: 8, background: 'var(--bg-main)', color: 'var(--text-main)' }}>
                            <option value="">Select...</option>
                            {plans.map(p => <option key={p.id} value={p.id}>{p.display_name} — ${p.price_monthly}/mo</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Duration (months)</label>
                        <input type="number" min={1} value={instantMonths} onChange={e => setInstantMonths(parseInt(e.target.value) || 1)} style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--glass-border)', borderRadius: 8, background: 'var(--bg-main)', color: 'var(--text-main)' }}/>
                    </div>
                    <button onClick={handleInstantUpgrade} style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Zap size={14}/> Apply
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AdminUpgradeRequests;
