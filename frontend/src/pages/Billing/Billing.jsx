import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    CreditCard, Zap, Clock, Check, X, ArrowRight, 
    AlertTriangle, CheckCircle, Loader2, RefreshCw, XCircle
} from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
    trial:           { color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)', icon: <Clock size={14}/>,         label: 'Free Trial' },
    active:          { color: '#4f46e5', bg: 'rgba(79,70,229,0.1)',  border: 'rgba(79,70,229,0.3)',  icon: <Check size={14}/>,          label: 'Active' },
    pending_upgrade: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', icon: <Loader2 size={14}/>,        label: 'Pending Upgrade' },
    expired:         { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.3)',  icon: <AlertTriangle size={14}/>, label: 'Expired' },
};

const REQUEST_STATUS = {
    pending:  { color: '#f59e0b', label: '⏳ Pending Review' },
    approved: { color: '#10b981', label: '✅ Approved' },
    rejected: { color: '#ef4444', label: '❌ Rejected' },
    cancelled:{ color: '#9ca3af', label: '🚫 Cancelled' },
};

const Billing = () => {
    const [data, setData]         = useState(null);
    const [loading, setLoading]   = useState(true);
    const [requesting, setRequesting] = useState(false);
    const [selectedPlanId, setSelectedPlanId] = useState('');
    const navigate = useNavigate();

    const load = async () => {
        setLoading(true);
        try {
            const res = await api.get('/billing');
            setData(res.data.data);
        } catch (err) {
            toast.error('Failed to load billing data');
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const handleRequest = async () => {
        if (!selectedPlanId) return toast.error('Please select a plan');
        setRequesting(true);
        try {
            await api.post('/billing/request-upgrade', { requested_plan_id: parseInt(selectedPlanId) });
            toast.success('✅ Request submitted! Our team will contact you within 24 hours.', { duration: 6000 });
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Request failed');
        } finally { setRequesting(false); }
    };

    const handleCancel = async () => {
        if (!window.confirm('Cancel your upgrade request?')) return;
        try {
            await api.delete('/billing/request-upgrade');
            toast.success('Request cancelled');
            load();
        } catch { toast.error('Cancel failed'); }
    };

    if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} color="var(--primary)"/></div>;

    const sub = data?.subscription;
    const latestReq = data?.latest_request;
    const availablePlans = (data?.available_plans || []).filter(p => p.id !== sub?.plan_id);
    const subCfg = STATUS_CONFIG[sub?.sub_status] || STATUS_CONFIG.trial;
    const hasPending = latestReq?.status === 'pending';

    return (
        <div style={{ padding: '28px', maxWidth: 900, margin: '0 auto' }}>
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes pulse { 0%,100%{opacity:0.6;} 50%{opacity:1;} }
                .bill-card { background: var(--bg-card); border-radius: 16px; padding: 28px; border: 1px solid var(--glass-border); margin-bottom: 20px; }
                .plan-select-card { padding: 16px; border-radius: 12px; border: 2px solid transparent; cursor: pointer; transition: all 0.2s; margin-bottom: 10px; background: rgba(0,0,0,0.02); }
                .plan-select-card:hover { border-color: rgba(79,70,229,0.3); background: rgba(79,70,229,0.04); }
                .plan-select-card.selected { border-color: var(--primary); background: rgba(79,70,229,0.07); }
                .btn-upgrade { background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; border: none; padding: 14px 28px; border-radius: 12px; font-weight: 800; font-size: 16px; cursor: pointer; display: flex; align-items: center; gap: 10px; width: 100%; justify-content: center; transition: all 0.25s; }
                .btn-upgrade:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(79,70,229,0.4); }
                .btn-upgrade:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
                .badge { display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
            `}</style>

            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CreditCard size={28} color="var(--primary)"/> Billing & Subscription
                </h1>
                <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>Manage your plan and upgrade requests</p>
            </div>

            {/* Current Plan Card */}
            <div className="bill-card" style={{ border: `1.5px solid ${subCfg.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Current Plan</div>
                        <div style={{ fontSize: 32, fontWeight: 900 }}>{sub?.display_name || 'No Plan'}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)', marginTop: 4 }}>
                            ${sub?.price_monthly || 0}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)' }}>/month</span>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <span className="badge" style={{ background: subCfg.bg, color: subCfg.color, border: `1px solid ${subCfg.border}` }}>
                            {subCfg.icon} {subCfg.label}
                        </span>
                        {sub?.sub_status === 'trial' && sub?.trial_days_left !== null && (
                            <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: sub.trial_days_left <= 3 ? '#ef4444' : sub.trial_days_left <= 7 ? '#f59e0b' : '#10b981' }}>
                                ⏳ {sub.trial_days_left} day{sub.trial_days_left !== 1 ? 's' : ''} remaining
                            </div>
                        )}
                        {sub?.sub_status === 'active' && sub?.expires_at && (
                            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                                Renews: {new Date(sub.expires_at).toLocaleDateString()}
                            </div>
                        )}
                    </div>
                </div>

                {/* Module access pills */}
                {sub?.modules && (
                    <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {Object.entries(typeof sub.modules === 'string' ? JSON.parse(sub.modules) : sub.modules).map(([mod, enabled]) => (
                            <span key={mod} style={{ padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: enabled ? 'rgba(79,70,229,0.08)' : 'rgba(0,0,0,0.04)', color: enabled ? 'var(--primary)' : 'var(--text-muted)', textDecoration: enabled ? 'none' : 'line-through', opacity: enabled ? 1 : 0.5 }}>
                                {mod}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Pending Request Status Banner */}
            {latestReq && (
                <div className="bill-card" style={{ border: `1.5px solid ${REQUEST_STATUS[latestReq.status]?.color}33`, background: `${REQUEST_STATUS[latestReq.status]?.color}08` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 800, marginBottom: 4 }}>Upgrade Request Status</div>
                            <div style={{ color: REQUEST_STATUS[latestReq.status]?.color, fontWeight: 700, fontSize: 15 }}>
                                {REQUEST_STATUS[latestReq.status]?.label}
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                                {latestReq.current_plan_name} → <strong>{latestReq.requested_plan_name}</strong>
                                {' · '}{new Date(latestReq.created_at).toLocaleDateString()}
                            </div>
                        </div>
                        {hasPending && (
                            <button onClick={handleCancel} style={{ background: 'none', border: '1px solid #ef4444', color: '#ef4444', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <XCircle size={14}/> Cancel Request
                            </button>
                        )}
                        {latestReq.status === 'approved' && (
                            <CheckCircle size={28} color="#10b981"/>
                        )}
                    </div>
                    {hasPending && (
                        <div style={{ marginTop: 14, padding: 14, background: 'rgba(245,158,11,0.07)', borderRadius: 10, fontSize: 13, color: '#92400e', border: '1px solid rgba(245,158,11,0.15)' }}>
                            💬 <strong>What happens next?</strong> Our team has received your request and will contact you within 24 hours to confirm your upgrade. No payment is required yet.
                        </div>
                    )}
                </div>
            )}

            {/* Upgrade Plan Picker */}
            {!hasPending && sub?.sub_status !== 'expired' && availablePlans.length > 0 && (
                <div className="bill-card">
                    <h3 style={{ margin: '0 0 16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Zap size={18} color="var(--primary)"/> Upgrade Your Plan
                    </h3>

                    {availablePlans.map(plan => {
                        const mods = typeof plan.modules === 'string' ? JSON.parse(plan.modules) : plan.modules;
                        const activeCount = Object.values(mods || {}).filter(Boolean).length;
                        return (
                            <div
                                key={plan.id}
                                className={`plan-select-card ${selectedPlanId === String(plan.id) ? 'selected' : ''}`}
                                onClick={() => setSelectedPlanId(String(plan.id))}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 800, fontSize: 16 }}>{plan.display_name}</div>
                                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{activeCount} modules included</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: 900, fontSize: 22, color: 'var(--primary)' }}>${plan.price_monthly}<span style={{ fontSize: 12, fontWeight: 500 }}>/mo</span></div>
                                        {selectedPlanId === String(plan.id) && (
                                            <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 700 }}>✓ Selected</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    <button
                        className="btn-upgrade"
                        onClick={handleRequest}
                        disabled={!selectedPlanId || requesting}
                        style={{ marginTop: 16 }}
                    >
                        {requesting
                            ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }}/> Submitting...</>
                            : <><Zap size={16}/> Request Upgrade <ArrowRight size={16}/></>
                        }
                    </button>

                    <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                        🔒 No credit card required now. Our team will guide you through payment.
                    </div>
                </div>
            )}
        </div>
    );
};

export default Billing;
