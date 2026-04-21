import React, { useState, useEffect } from 'react';
import { 
    Plus, Edit3, Copy, Trash2, ToggleRight, ToggleLeft, 
    Users, Building2, Check, X, Save, RefreshCw, 
    Eye, Zap, Layers, DollarSign, Settings,
    ShieldCheck, Box, ChevronRight, Layout
} from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const BarChart3 = ({ size }) => <Layers size={size} />; // Fallback - MOVED UP TO FIX TDZ

const ALL_MODULES = [
    { key: 'crm',        label: 'CRM & Sales',         icon: <Users size={16}/> },
    { key: 'finance',    label: 'Finance & Invoicing',  icon: <DollarSign size={16}/> },
    { key: 'hr',         label: 'HR & Attendance',      icon: <Users size={16}/> },
    { key: 'inventory',  label: 'Inventory Control',     icon: <Box size={16}/> },
    { key: 'automation', label: 'Workflow Engine',      icon: <Zap size={16}/> },
    { key: 'reports',    label: 'BI Analytics',         icon: <BarChart3 size={16}/> },
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
    const [activeTab, setActiveTab] = useState('plans'); 
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId]     = useState(null);
    const [form, setForm]         = useState(emptyPlan());

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
                toast.success('Plan metadata updated');
            } else {
                if (!form.name.trim()) return toast.error('Plan key name is required');
                await api.post('/admin/plans', form);
                toast.success('New plan protocol registered');
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
            toast.success('DNA Cloned. Draft record created.');
            fetchAll();
        } catch (err) { toast.error('Clone failed'); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Erase this plan from record?')) return;
        try {
            await api.delete(`/admin/plans/${id}`);
            toast.success('Plan record purged');
            fetchAll();
        } catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
    };

    const handleToggleActive = async (plan) => {
        try {
            await api.put(`/admin/plans/${plan.id}`, { is_active: !plan.is_active });
            fetchAll();
        } catch { toast.error('Toggle failed'); }
    };

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
            toast.success('Re-assigned subscription package');
            fetchAll();
            setSelectedTenant(null);
        } catch (err) { toast.error('Assign failed'); }
    };

    const handleSaveOverride = async () => {
        try {
            await api.put(`/admin/tenants/${selectedTenant.id}/override`, { modules: overrideModules, notes: `Manual override` });
            toast.success('Custom access protocol applied');
            fetchAll();
            setSelectedTenant(null);
        } catch { toast.error('Override failed'); }
    };

    return (
        <div className="p-4 md:p-8 animate-in fade-in duration-500">
            <style>{`
                .ap-tab-btn {
                    padding: 10px 24px;
                    font-weight: 700;
                    font-size: 14px;
                    border-radius: 12px;
                    transition: all 0.2s;
                }
                .ap-tab-btn.active {
                    background: var(--primary);
                    color: white;
                    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
                }
                .ap-tab-btn:not(.active) {
                    color: var(--text-muted);
                }
                .module-toggle-card {
                    padding: 16px;
                    border-radius: 14px;
                    border: 1px solid var(--border);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .module-toggle-card.active {
                    background: rgba(79, 70, 229, 0.05);
                    border-color: var(--primary);
                }
                .preview-header {
                   background: var(--grad-premium);
                   padding: 32px;
                   border-radius: 20px 20px 0 0;
                   color: white;
                }
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
            `}</style>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                <div className="section-header">
                    <h2 className="text-3xl font-extrabold tracking-tight text-[var(--text-main)]">Subscription Architecture</h2>
                    <p className="text-[var(--text-muted)] mt-1 font-medium">Manage platform tiers and enterprise access protocols.</p>
                </div>
                {activeTab === 'plans' && (
                    <button 
                        onClick={() => { setShowForm(true); setEditId(null); setForm(emptyPlan()); }}
                        className="btn-primary-premium"
                    >
                        <Plus size={18}/> Create Subscription Tier
                    </button>
                )}
            </div>

            <div className="flex gap-2 p-1 bg-white dark:bg-slate-900 rounded-xl w-fit mb-8 border border-[var(--border)] shadow-sm">
                <button className={`ap-tab-btn ${activeTab === 'plans' ? 'active' : ''}`} onClick={() => setActiveTab('plans')}>
                    Tier Definitions
                </button>
                <button className={`ap-tab-btn ${activeTab === 'tenants' ? 'active' : ''}`} onClick={() => setActiveTab('tenants')}>
                    Tenant Mapping
                </button>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-24 opacity-50">
                    <RefreshCw className="animate-spin text-[var(--primary)] mb-4" size={32} />
                    <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">Synchronizing Registry...</span>
                </div>
            ) : activeTab === 'plans' ? (
                <div className="space-y-8">
                    {showForm && (
                        <div className="ap-card p-0 overflow-hidden wow-reveal">
                            <div className="preview-header flex items-center justify-between">
                                <div>
                                    <h3 className="text-2xl font-black">{editId ? 'Update Subscription' : 'New Tier Definition'}</h3>
                                    <p className="text-indigo-100 opacity-80 text-sm mt-1">Configure logic limits and active modules.</p>
                                </div>
                                <button onClick={() => setShowForm(false)} className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-8 lg:p-12 grid grid-cols-1 lg:grid-cols-3 gap-12">
                                <div className="lg:col-span-2 space-y-10">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-2">
                                            <label className="ap-label">Template ID (Unique)</label>
                                            <input className="ap-input" disabled={!!editId} placeholder="e.g. enterprise_v1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="ap-label">Public Alias</label>
                                            <input className="ap-input" placeholder="e.g. Elite Enterprise" value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="ap-label">Monthly Billing Cycle ($)</label>
                                            <input className="ap-input" type="number" placeholder="499" value={form.price_monthly} onChange={e => setForm(f => ({ ...f, price_monthly: e.target.value }))} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="ap-label">Node Capacity (-1 = ∞)</label>
                                            <input className="ap-input" type="number" value={form.max_users} onChange={e => setForm(f => ({ ...f, max_users: parseInt(e.target.value) || -1 }))} />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <label className="ap-label text-[var(--primary)]">Entitlement Matrix</label>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {ALL_MODULES.map(m => (
                                                <div 
                                                    key={m.key} 
                                                    className={`module-toggle-card ${form.modules[m.key] ? 'active' : ''}`}
                                                    onClick={() => setForm(f => ({ ...f, modules: { ...f.modules, [m.key]: !f.modules[m.key] } }))}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-2 rounded-lg ${form.modules[m.key] ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                                                            {m.icon}
                                                        </div>
                                                        <span className="text-[13px] font-bold">{m.label}</span>
                                                    </div>
                                                    {form.modules[m.key] ? <ToggleRight size={24} className="text-indigo-600" /> : <ToggleLeft size={24} className="text-slate-300" />}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex gap-4 pt-6">
                                        <button className="btn-primary-premium px-10" onClick={handleSave}>
                                            Save Protocol
                                        </button>
                                        <button className="px-8 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[var(--text-muted)] rounded-xl font-bold text-sm transition-colors" onClick={() => setShowForm(false)}>
                                            Cancel
                                        </button>
                                    </div>
                                </div>

                                {/* PREVIEW PANEL */}
                                <div className="space-y-6">
                                    <div className="ap-card p-8 border-[var(--primary)] shadow-2xl relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-10 opacity-5 grayscale group-hover:grayscale-0 transition-all pointer-events-none">
                                            <ShieldCheck size={140} className="text-indigo-600" />
                                        </div>
                                        <div className="inline-block px-3 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest mb-6">Preview</div>
                                        <h2 className="text-3xl font-black text-[var(--text-main)] mb-2">{form.display_name || 'Protocol_Alpha'}</h2>
                                        <div className="text-3xl font-extrabold text-[var(--primary)] mb-8">
                                            ${form.price_monthly || '00'}<span className="text-sm text-[var(--text-muted)] lowercase ml-1">/mo</span>
                                        </div>
                                        <div className="space-y-4 mb-8">
                                            <div className="flex items-center gap-3 text-sm font-bold text-[var(--text-main)]">
                                                <Users size={16} className="text-indigo-500" /> 
                                                {form.max_users === -1 ? 'Infinite Users' : `${form.max_users} Active Users`}
                                            </div>
                                            <div className="flex items-center gap-3 text-sm font-bold text-[var(--text-main)]">
                                                <Building2 size={16} className="text-indigo-500" /> 
                                                {form.max_branches === -1 ? 'Infinite Branches' : `${form.max_branches} Branches`}
                                            </div>
                                        </div>
                                        <div className="border-t border-[var(--border)] pt-6 space-y-3">
                                            {ALL_MODULES.filter(m => form.modules[m.key]).map(m => (
                                                <div key={m.key} className="flex items-center gap-3 text-xs font-bold text-[var(--text-muted)]">
                                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> {m.label} Access
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="ap-card overflow-hidden">
                        <table className="w-full text-left platform-table">
                            <thead>
                                <tr>
                                    <th>Tier Identity</th>
                                    <th>Monthly Billing</th>
                                    <th>Service Bounds</th>
                                    <th className="text-right">Administration</th>
                                </tr>
                            </thead>
                            <tbody>
                                {plans.map(plan => (
                                    <tr key={plan.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                                        <td>
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-lg shadow-indigo-600/20">
                                                    {plan.id}
                                                </div>
                                                <div>
                                                    <p className="font-extrabold text-lg text-[var(--text-main)]">{plan.display_name}</p>
                                                    <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{plan.name}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex flex-col">
                                                <span className="text-xl font-extrabold text-[var(--text-main)]">${plan.price_monthly}</span>
                                                <span className="text-[10px] font-bold text-[var(--text-muted)]">subscription/mo</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex gap-6">
                                                <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-main)]">
                                                    <Users size={16} className="text-indigo-500" /> {plan.max_users === -1 ? '∞' : plan.max_users}
                                                </div>
                                                <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-main)]">
                                                    <Building2 size={16} className="text-indigo-500" /> {plan.max_branches === -1 ? '∞' : plan.max_branches}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-right">
                                            <div className="flex items-center justify-end gap-3">
                                                <button onClick={() => handleEdit(plan)} className="p-3 bg-slate-100 hover:bg-indigo-600 hover:text-white dark:bg-slate-800 rounded-xl text-slate-500 transition-all">
                                                    <Edit3 size={18} />
                                                </button>
                                                <button onClick={() => handleClone(plan.id)} className="p-3 bg-slate-100 hover:bg-emerald-600 hover:text-white dark:bg-slate-800 rounded-xl text-slate-500 transition-all">
                                                    <Copy size={18} />
                                                </button>
                                                <button onClick={() => handleDelete(plan.id)} className="p-3 bg-slate-100 hover:bg-rose-600 hover:text-white dark:bg-slate-800 rounded-xl text-slate-500 transition-all">
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="ap-card overflow-hidden wow-reveal">
                    <table className="w-full text-left platform-table">
                        <thead>
                            <tr>
                                <th>Active Tenant</th>
                                <th>Primary Admin</th>
                                <th>Active Subscription</th>
                                <th className="text-right">Configuration</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tenants.map(t => (
                                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors cursor-pointer" onClick={() => openTenantPanel(t)}>
                                    <td>
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 border border-[var(--border)] flex items-center justify-center font-black text-indigo-600 text-sm">
                                                {t.name?.[0]}
                                            </div>
                                            <div>
                                                <p className="font-extrabold text-[var(--text-main)]">{t.name}</p>
                                                <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t.slug}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-[var(--text-main)]">{t.admin_name || 'Unknown'}</span>
                                            <span className="text-[11px] font-bold text-[var(--text-muted)]">{t.admin_email}</span>
                                        </div>
                                    </td>
                                    <td>
                                         <div className="flex flex-col">
                                            <span className="text-sm font-extrabold text-indigo-600 uppercase">
                                                {t.display_name || t.plan_name || 'Standard'}
                                            </span>
                                            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">{t.sub_status}</span>
                                        </div>
                                    </td>
                                    <td className="text-right">
                                        <button className="px-5 py-2.5 bg-indigo-600/10 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all">
                                            Analyze Node
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* SIDE OVERRIDE PANEL (PREMIUM STYLE) */}
            {selectedTenant && (
                <>
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[250] animate-in fade-in" onClick={() => setSelectedTenant(null)} />
                <div className="fixed inset-y-0 right-0 w-full max-w-[540px] bg-white dark:bg-slate-950 shadow-2xl z-[300] p-10 overflow-y-auto animate-in slide-in-from-right duration-500">
                    <div className="flex items-center justify-between mb-12">
                        <div className="flex items-center gap-5">
                            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/30">
                                <Layout size={28} />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-[var(--text-main)] tracking-tight">{selectedTenant.name}</h3>
                                <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-[0.2em]">Tier & Entitlement Management</p>
                            </div>
                        </div>
                        <button onClick={() => setSelectedTenant(null)} className="p-2 text-slate-400 hover:text-rose-600 transition-colors">
                            <X size={32} />
                        </button>
                    </div>

                    <div className="space-y-12">
                        {/* Plan Switch */}
                        <div className="space-y-4">
                            <label className="ap-label text-[var(--primary)]">Subscription Level</label>
                            <div className="ap-card p-6 border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/30 dark:bg-indigo-900/10">
                                <select className="ap-input mb-4" value={assignPlanId} onChange={e => setAssignPlanId(e.target.value)}>
                                    <option value="">Select standard package...</option>
                                    {plans.map(p => <option key={p.id} value={p.id}>{p.display_name} — ${p.price_monthly}</option>)}
                                </select>
                                <button className="btn-primary-premium w-full justify-center" onClick={handleAssignPlan}>
                                    Apply Subscription Package
                                </button>
                            </div>
                        </div>

                        {/* Logic Matrix */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="ap-label text-amber-600">Manual Module Override</label>
                                <span className="text-[10px] font-bold text-amber-600 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 rounded uppercase tracking-wider">Active</span>
                            </div>
                            <div className="grid grid-cols-1 gap-3">
                                {ALL_MODULES.map(m => (
                                    <div 
                                        key={m.key} 
                                        className={`p-5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                            overrideModules[m.key] 
                                            ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500/20' 
                                            : 'bg-slate-50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800'
                                        }`}
                                        onClick={() => setOverrideModules(prev => ({ ...prev, [m.key]: !prev[m.key] }))}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={overrideModules[m.key] ? 'text-emerald-500' : 'text-slate-400'}>{m.icon}</div>
                                            <span className="text-sm font-bold text-[var(--text-main)]">{m.label}</span>
                                        </div>
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${overrideModules[m.key] ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'}`}>
                                            {overrideModules[m.key] ? <Check size={14} /> : <X size={14} />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button className="btn-primary-premium w-full justify-center mt-6 shadow-amber-600/20" style={{ background: 'var(--accent)' }} onClick={handleSaveOverride}>
                                Save Custom Entitlements
                            </button>
                        </div>
                    </div>
                </div>
                </>
            )}
        </div>
    );
};

export default AdminPlans;
