import React, { useState, useEffect } from 'react';
import { Plus, Edit3, Copy, Trash2, ToggleRight, ToggleLeft, Users, Building2, Check, X, Save, RefreshCw, Eye, Zap } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const ALL_MODULES = [
    { key: 'crm',        label: 'CRM & Sales',         icon: '🤝' },
    { key: 'finance',    label: 'Finance & Invoicing',  icon: '💰' },
    { key: 'hr',         label: 'HR & Attendance',      icon: '👥' },
    { key: 'inventory',  label: 'Inventory',            icon: '📦' },
    { key: 'automation', label: 'Workflow Automation',  icon: '⚙️' },
    { key: 'reports',    label: 'Advanced Reports',     icon: '📊' },
];

const emptyPlan = () => ({
    name: '', display_name: '', price_monthly: '',
    max_users: 10, max_branches: 1,
    modules: { crm: true, finance: true, hr: false, inventory: false, automation: false, reports: false },
    sort_order: 10
});

const AdminPlans = () => {
    const [plans, setPlans]       = useState([]);
    const [tenants, setTenants]   = useState([]);
    const [loading, setLoading]   = useState(true);
    const [activeTab, setActiveTab] = useState('plans'); // 'plans' | 'tenants'
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId]     = useState(null);
    const [form, setForm]         = useState(emptyPlan());

    // Tenant detail panel
    const [selectedTenant, setSelectedTenant] = useState(null);
    const [tenantOverride, setTenantOverride] = useState(null);
    const [assignPlanId, setAssignPlanId]     = useState('');
    const [overrideModules, setOverrideModules] = useState({});

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [plansRes, tenantsRes] = await Promise.all([
                api.get('/admin/plans'),
                api.get('/admin/tenants')
            ]);
            setPlans(plansRes.data.data || []);
            setTenants(tenantsRes.data.data || []);
        } catch (err) {
            toast.error('Failed to load admin data');
        } finally { setLoading(false); }
    };

    useEffect(() => { fetchAll(); }, []);

    // ── Plan Form logic ────────────────────────────────────────
    const handleEdit = (plan) => {
        setForm({
            name: plan.name, display_name: plan.display_name,
            price_monthly: plan.price_monthly,
            max_users: plan.max_users, max_branches: plan.max_branches,
            modules: typeof plan.modules === 'string' ? JSON.parse(plan.modules) : plan.modules,
            sort_order: plan.sort_order
        });
        setEditId(plan.id);
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!form.display_name.trim()) return toast.error('Display name is required');
        try {
            if (editId) {
                await api.put(`/admin/plans/${editId}`, form);
                toast.success('Plan updated!');
            } else {
                if (!form.name.trim()) return toast.error('Plan key name is required');
                await api.post('/admin/plans', form);
                toast.success('Plan created!');
            }
            setShowForm(false);
            setEditId(null);
            setForm(emptyPlan());
            fetchAll();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Save failed');
        }
    };

    const handleClone = async (id) => {
        try {
            await api.post(`/admin/plans/${id}/clone`);
            toast.success('Plan cloned as draft!');
            fetchAll();
        } catch (err) { toast.error('Clone failed'); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this plan? Cannot delete if tenants are on it.')) return;
        try {
            await api.delete(`/admin/plans/${id}`);
            toast.success('Plan deleted');
            fetchAll();
        } catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
    };

    const handleToggleActive = async (plan) => {
        try {
            await api.put(`/admin/plans/${plan.id}`, { is_active: !plan.is_active });
            fetchAll();
        } catch { toast.error('Toggle failed'); }
    };

    // ── Tenant Panel logic ─────────────────────────────────────
    const openTenantPanel = async (tenant) => {
        setSelectedTenant(tenant);
        setAssignPlanId(tenant.plan_id || '');
        try {
            const res = await api.get(`/admin/tenants/${tenant.id}/override`);
            const ov = res.data.data;
            setTenantOverride(ov);
            const planMods = plans.find(p => p.id === tenant.plan_id)?.modules || {};
            const merged = { ...(typeof planMods === 'string' ? JSON.parse(planMods) : planMods), ...(ov?.modules || {}) };
            setOverrideModules(merged);
        } catch { setTenantOverride(null); }
    };

    const handleAssignPlan = async () => {
        try {
            await api.put(`/admin/tenants/${selectedTenant.id}/plan`, { plan_id: parseInt(assignPlanId), status: 'active' });
            toast.success('Plan assigned!');
            fetchAll();
            setSelectedTenant(null);
        } catch (err) { toast.error('Assign failed'); }
    };

    const handleSaveOverride = async () => {
        try {
            await api.put(`/admin/tenants/${selectedTenant.id}/override`, { modules: overrideModules, notes: `Manual override` });
            toast.success('Override saved — this tenant now has custom module access!');
            fetchAll();
            setSelectedTenant(null);
        } catch { toast.error('Override failed'); }
    };

    const handleRemoveOverride = async () => {
        try {
            await api.delete(`/admin/tenants/${selectedTenant.id}/override`);
            toast.success('Override removed — reverts to plan defaults');
            fetchAll();
            setSelectedTenant(null);
        } catch { toast.error('Remove failed'); }
    };

    // ── Live Plan Preview ──────────────────────────────────────
    const PlanPreview = () => (
        <div style={{ background: 'linear-gradient(135deg, rgba(79,70,229,0.08), rgba(99,102,241,0.04))', border: '1.5px solid rgba(79,70,229,0.2)', borderRadius: 16, padding: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                <Eye size={12} style={{ marginRight: 4 }}/> Live Preview
            </div>
            <div style={{ fontWeight: 900, fontSize: 20 }}>{form.display_name || 'Plan Name'}</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--primary)', margin: '4px 0' }}>
                ${form.price_monthly || 0}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)' }}>/mo</span>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}><Users size={11}/> {form.max_users === -1 ? '∞' : form.max_users} users</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}><Building2 size={11}/> {form.max_branches === -1 ? '∞' : form.max_branches} branches</span>
            </div>
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 12 }}>
                {ALL_MODULES.map(m => (
                    <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13 }}>
                        {form.modules[m.key]
                            ? <Check size={13} style={{ color: '#10b981' }}/>
                            : <X size={13} style={{ color: 'var(--text-muted)', opacity: 0.4 }}/>
                        }
                        <span style={{ color: form.modules[m.key] ? 'var(--text-main)' : 'var(--text-muted)', opacity: form.modules[m.key] ? 1 : 0.5 }}>
                            {m.icon} {m.label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div style={{ padding: 28 }}>
            <style>{`
                .ap-tabs { display: flex; gap: 4px; background: rgba(0,0,0,0.04); padding: 4px; border-radius: 10px; width: fit-content; margin-bottom: 24px; }
                .ap-tab { padding: 8px 20px; border-radius: 7px; font-weight: 700; font-size: 13px; border: none; cursor: pointer; background: transparent; color: var(--text-muted); transition: all 0.2s; }
                .ap-tab.active { background: var(--bg-card); color: var(--primary); box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
                .ap-card { background: var(--bg-card); border: 1px solid var(--glass-border); border-radius: 14px; padding: 24px; margin-bottom: 16px; }
                .ap-grid { display: grid; grid-template-columns: 1fr 320px; gap: 24px; }
                .ap-form-group { margin-bottom: 16px; }
                .ap-label { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; display: block; }
                .ap-input { width: 100%; padding: 9px 12px; border: 1px solid var(--glass-border); border-radius: 8px; background: var(--bg-main); color: var(--text-main); font-size: 14px; font-weight: 500; box-sizing: border-box; }
                .ap-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(79,70,229,0.1); }
                .module-toggle { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 10px; background: rgba(0,0,0,0.02); margin-bottom: 6px; cursor: pointer; transition: 0.15s; }
                .module-toggle:hover { background: rgba(79,70,229,0.04); }
                .btn-save { background: var(--primary); color: white; border: none; padding: 11px 22px; border-radius: 8px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; }
                .btn-save:hover { opacity: 0.9; }
                .badge-active { background: rgba(16,185,129,0.1); color: #10b981; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
                .badge-inactive { background: rgba(107,114,128,0.1); color: #9ca3af; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
                .plan-table { width: 100%; border-collapse: collapse; }
                .plan-table th, .plan-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--glass-border); }
                .plan-table th { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }
                .tenant-row { cursor: pointer; transition: 0.15s; }
                .tenant-row:hover td { background: rgba(79,70,229,0.02); }
                .override-panel { position: fixed; right: 0; top: 0; bottom: 0; width: 480px; background: var(--bg-card); border-left: 1px solid var(--glass-border); padding: 32px; overflow-y: auto; z-index: 200; box-shadow: -20px 0 40px rgba(0,0,0,0.1); }
            `}</style>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Zap size={26} color="var(--primary)"/> Pricing Engine
                    </h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>Build custom plans and manage tenant subscriptions</p>
                </div>
                {activeTab === 'plans' && (
                    <button className="btn-save" onClick={() => { setShowForm(true); setEditId(null); setForm(emptyPlan()); }}>
                        <Plus size={16}/> New Plan
                    </button>
                )}
            </div>

            <div className="ap-tabs">
                <button className={`ap-tab ${activeTab === 'plans' ? 'active' : ''}`} onClick={() => setActiveTab('plans')}>📦 Plans ({plans.length})</button>
                <button className={`ap-tab ${activeTab === 'tenants' ? 'active' : ''}`} onClick={() => setActiveTab('tenants')}>🏢 Tenants ({tenants.length})</button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div>
            ) : activeTab === 'plans' ? (
                <>
                    {/* Plan Builder Form */}
                    {showForm && (
                        <div className="ap-card" style={{ border: '1.5px solid var(--primary)', marginBottom: 24 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <h3 style={{ margin: 0, fontWeight: 900 }}>{editId ? 'Edit Plan' : 'Create New Plan'}</h3>
                                <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                            </div>

                            <div className="ap-grid">
                                <div>
                                    {/* Basic Info */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                                        {!editId && (
                                            <div className="ap-form-group">
                                                <label className="ap-label">Plan Key (slug)</label>
                                                <input className="ap-input" placeholder="e.g. starter" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                                            </div>
                                        )}
                                        <div className="ap-form-group">
                                            <label className="ap-label">Display Name</label>
                                            <input className="ap-input" placeholder="e.g. Starter" value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} />
                                        </div>
                                        <div className="ap-form-group">
                                            <label className="ap-label">Price ($/month)</label>
                                            <input className="ap-input" type="number" min="0" placeholder="49" value={form.price_monthly} onChange={e => setForm(f => ({ ...f, price_monthly: e.target.value }))} />
                                        </div>
                                    </div>

                                    {/* Limits */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                                        <div className="ap-form-group">
                                            <label className="ap-label">Max Users (-1 = ∞)</label>
                                            <input className="ap-input" type="number" value={form.max_users} onChange={e => setForm(f => ({ ...f, max_users: parseInt(e.target.value) || -1 }))} />
                                        </div>
                                        <div className="ap-form-group">
                                            <label className="ap-label">Max Branches (-1 = ∞)</label>
                                            <input className="ap-input" type="number" value={form.max_branches} onChange={e => setForm(f => ({ ...f, max_branches: parseInt(e.target.value) || -1 }))} />
                                        </div>
                                        <div className="ap-form-group">
                                            <label className="ap-label">Sort Order</label>
                                            <input className="ap-input" type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} />
                                        </div>
                                    </div>

                                    {/* Module Toggles */}
                                    <label className="ap-label">Included Modules</label>
                                    {ALL_MODULES.map(m => (
                                        <div key={m.key} className="module-toggle" onClick={() => setForm(f => ({ ...f, modules: { ...f.modules, [m.key]: !f.modules[m.key] } }))}>
                                            <span style={{ fontWeight: 600, fontSize: 14 }}>{m.icon} {m.label}</span>
                                            {form.modules[m.key]
                                                ? <ToggleRight size={28} color="#10b981"/>
                                                : <ToggleLeft size={28} color="#9ca3af"/>
                                            }
                                        </div>
                                    ))}

                                    <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                                        <button className="btn-save" onClick={handleSave}><Save size={15}/> Save Plan</button>
                                        <button onClick={() => setShowForm(false)} style={{ background: 'none', border: '1px solid var(--glass-border)', padding: '10px 18px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                    </div>
                                </div>

                                <PlanPreview/>
                            </div>
                        </div>
                    )}

                    {/* Plans Table */}
                    <div className="ap-card">
                        <table className="plan-table">
                            <thead>
                                <tr>
                                    <th>Plan</th>
                                    <th>Price</th>
                                    <th>Limits</th>
                                    <th>Modules</th>
                                    <th>Tenants</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {plans.map(plan => {
                                    const mods = typeof plan.modules === 'string' ? JSON.parse(plan.modules) : plan.modules || {};
                                    const activeModCount = Object.values(mods).filter(Boolean).length;
                                    return (
                                        <tr key={plan.id}>
                                            <td>
                                                <div style={{ fontWeight: 800 }}>{plan.display_name}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{plan.name}</div>
                                            </td>
                                            <td style={{ fontWeight: 700 }}>${plan.price_monthly}<span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/mo</span></td>
                                            <td style={{ fontSize: 13 }}>
                                                <div>{plan.max_users === -1 ? '∞' : plan.max_users} users</div>
                                                <div>{plan.max_branches === -1 ? '∞' : plan.max_branches} branches</div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                    {ALL_MODULES.filter(m => mods[m.key]).map(m => (
                                                        <span key={m.key} title={m.label} style={{ fontSize: 16 }}>{m.icon}</span>
                                                    ))}
                                                    {activeModCount === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>None</span>}
                                                </div>
                                            </td>
                                            <td style={{ fontWeight: 700 }}>{plan.tenant_count}</td>
                                            <td>
                                                <span className={plan.is_active ? 'badge-active' : 'badge-inactive'}>
                                                    {plan.is_active ? 'Active' : 'Draft'}
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button title="Edit" onClick={() => handleEdit(plan)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><Edit3 size={15}/></button>
                                                    <button title="Clone" onClick={() => handleClone(plan.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><Copy size={15}/></button>
                                                    <button title={plan.is_active ? 'Disable' : 'Enable'} onClick={() => handleToggleActive(plan)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                                                        {plan.is_active ? <ToggleRight size={18} color="#10b981"/> : <ToggleLeft size={18} color="#9ca3af"/>}
                                                    </button>
                                                    <button title="Delete" onClick={() => handleDelete(plan.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444' }}><Trash2 size={15}/></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            ) : (
                /* Tenants Tab */
                <div className="ap-card">
                    <table className="plan-table">
                        <thead>
                            <tr><th>Tenant</th><th>Plan</th><th>Status</th><th>Users</th><th>Override</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            {tenants.map(t => (
                                <tr key={t.id} className="tenant-row" onClick={() => openTenantPanel(t)}>
                                    <td>
                                        <div style={{ fontWeight: 800 }}>{t.name}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.slug}</div>
                                    </td>
                                    <td style={{ fontWeight: 700 }}>
                                        {t.display_name || t.plan_name || '—'}
                                        {t.price_monthly > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> · ${t.price_monthly}/mo</span>}
                                    </td>
                                    <td>
                                        <span className={t.sub_status === 'active' ? 'badge-active' : t.sub_status === 'trial' ? 'badge-inactive' : 'badge-inactive'} style={{ textTransform: 'capitalize' }}>
                                            {t.sub_status || 'none'}
                                        </span>
                                    </td>
                                    <td style={{ fontWeight: 700 }}>{t.user_count}</td>
                                    <td>
                                        {t.has_override && <span style={{ fontSize: 11, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>⚡ Override</span>}
                                    </td>
                                    <td><button style={{ fontSize: 12, background: 'rgba(79,70,229,0.08)', color: 'var(--primary)', border: 'none', padding: '5px 12px', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>Manage →</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Tenant Side Panel */}
            {selectedTenant && (
                <div className="override-panel">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <div>
                            <div style={{ fontWeight: 900, fontSize: 18 }}>{selectedTenant.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedTenant.user_count} users · {selectedTenant.sub_status}</div>
                        </div>
                        <button onClick={() => setSelectedTenant(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>✕</button>
                    </div>

                    {/* Plan Assignment */}
                    <div style={{ marginBottom: 24, padding: 16, background: 'rgba(79,70,229,0.05)', borderRadius: 12, border: '1px solid rgba(79,70,229,0.15)' }}>
                        <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 13 }}>📦 Assign Plan</div>
                        <select className="ap-input" value={assignPlanId} onChange={e => setAssignPlanId(e.target.value)} style={{ marginBottom: 10 }}>
                            <option value="">Select plan...</option>
                            {plans.map(p => <option key={p.id} value={p.id}>{p.display_name} — ${p.price_monthly}/mo</option>)}
                        </select>
                        <button className="btn-save" style={{ width: '100%', justifyContent: 'center' }} onClick={handleAssignPlan} disabled={!assignPlanId}>
                            <RefreshCw size={14}/> Update Plan
                        </button>
                    </div>

                    {/* Module Override */}
                    <div style={{ marginBottom: 24, padding: 16, background: 'rgba(245,158,11,0.05)', borderRadius: 12, border: '1px solid rgba(245,158,11,0.2)' }}>
                        <div style={{ fontWeight: 800, marginBottom: 4, fontSize: 13 }}>⚡ Per-Tenant Module Override</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Override specific modules regardless of plan</div>

                        {ALL_MODULES.map(m => (
                            <div key={m.key} className="module-toggle" onClick={() => setOverrideModules(prev => ({ ...prev, [m.key]: !prev[m.key] }))}>
                                <span style={{ fontWeight: 600, fontSize: 13 }}>{m.icon} {m.label}</span>
                                {overrideModules[m.key]
                                    ? <ToggleRight size={26} color="#10b981"/>
                                    : <ToggleLeft size={26} color="#9ca3af"/>
                                }
                            </div>
                        ))}

                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button className="btn-save" style={{ flex: 1, justifyContent: 'center', background: '#f59e0b' }} onClick={handleSaveOverride}>
                                <Save size={14}/> Save Override
                            </button>
                            {tenantOverride && (
                                <button onClick={handleRemoveOverride} style={{ border: '1px solid #ef4444', color: '#ef4444', padding: '8px 14px', borderRadius: 8, background: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPlans;
