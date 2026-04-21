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
        <div className="min-h-screen bg-slate-950 p-6 md:p-10 animate-in fade-in duration-500">
            <style>{`
                .hud-card {
                    background: rgba(30, 41, 59, 0.4);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 2rem;
                }
                .hud-input {
                    background: rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: white;
                    border-radius: 1rem;
                    padding: 0.75rem 1rem;
                    outline: none;
                    transition: all 0.2s;
                }
                .hud-input:focus {
                    border-color: rgba(99, 102, 241, 0.5);
                    box-shadow: 0 0 20px rgba(99, 102, 241, 0.1);
                }
                .mod-switch {
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    transition: all 0.2s;
                }
                .mod-switch:hover {
                    background: rgba(99, 102, 241, 0.05);
                    border-color: rgba(99, 102, 241, 0.2);
                }
                .ap-tab {
                    padding: 0.75rem 2rem;
                    border-radius: 1rem;
                    font-weight: 800;
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    transition: all 0.3s;
                }
                .ap-tab.active {
                    background: rgba(99, 102, 241, 0.15);
                    color: #818cf8;
                    box-shadow: 0 0 20px rgba(99, 102, 241, 0.1);
                }
                .btn-hud {
                    padding: 0.75rem 1.5rem;
                    border-radius: 1rem;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    font-size: 0.7rem;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
            `}</style>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                <div>
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/20">
                            <DollarSign size={20} />
                        </div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Module: Pricing_Engine_Core</span>
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tighter">Business Logic Tiers</h1>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1 opacity-70">Define system packages and access protocols</p>
                </div>
                {activeTab === 'plans' && (
                    <button 
                        onClick={() => { setShowForm(true); setEditId(null); setForm(emptyPlan()); }}
                        className="btn-hud bg-indigo-600 text-white shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 active:scale-95"
                    >
                        <Plus size={16}/> Initialize New Plan
                    </button>
                )}
            </div>

            <div className="flex gap-2 p-1 bg-slate-900/50 rounded-2xl w-fit mb-10 border border-white/5">
                <button className={`ap-tab ${activeTab === 'plans' ? 'active text-white' : 'text-slate-500 hover:text-slate-300'}`} onClick={() => setActiveTab('plans')}>
                    Package Definitions
                </button>
                <button className={`ap-tab ${activeTab === 'tenants' ? 'active text-white' : 'text-slate-500 hover:text-slate-300'}`} onClick={() => setActiveTab('tenants')}>
                    Tenant Map
                </button>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 opacity-30">
                    <RefreshCw className="animate-spin text-indigo-500 mb-4" size={40} />
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white">Synchronizing Registry...</span>
                </div>
            ) : activeTab === 'plans' ? (
                <div className="space-y-8">
                    {showForm && (
                        <div className="hud-card p-10 border-indigo-500/30 animate-in zoom-in-95 duration-500">
                            <div className="flex items-center justify-between mb-10">
                                <h3 className="text-xl font-black text-white flex items-center gap-3">
                                    <Settings className="text-indigo-500" size={20} />
                                    {editId ? 'Modify Subscription Template' : 'Initialize Template DNA'}
                                </h3>
                                <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-white transition-colors">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                                <div className="lg:col-span-2 space-y-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Internal Slug</label>
                                            <input className="hud-input w-full" disabled={!!editId} placeholder="e.g. starter_v1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Display Alias</label>
                                            <input className="hud-input w-full" placeholder="e.g. Premium Hub" value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Monthly Billing ($)</label>
                                            <input className="hud-input w-full" type="number" placeholder="499" value={form.price_monthly} onChange={e => setForm(f => ({ ...f, price_monthly: e.target.value }))} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">User Capacity (-1=∞)</label>
                                            <input className="hud-input w-full" type="number" value={form.max_users} onChange={e => setForm(f => ({ ...f, max_users: parseInt(e.target.value) || -1 }))} />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest px-1">Module Permissions Matrix</label>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {ALL_MODULES.map(m => (
                                                <div 
                                                    key={m.key} 
                                                    className={`mod-switch p-4 rounded-2xl flex items-center justify-between cursor-pointer ${form.modules[m.key] ? 'bg-indigo-600/10 border-indigo-500/20' : ''}`}
                                                    onClick={() => setForm(f => ({ ...f, modules: { ...f.modules, [m.key]: !f.modules[m.key] } }))}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className={form.modules[m.key] ? 'text-indigo-400' : 'text-slate-600'}>{m.icon}</span>
                                                        <span className={`text-xs font-bold ${form.modules[m.key] ? 'text-white' : 'text-slate-600'}`}>{m.label}</span>
                                                    </div>
                                                    {form.modules[m.key] ? <ToggleRight size={24} className="text-indigo-500" /> : <ToggleLeft size={24} className="text-slate-700" />}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex gap-4 pt-6">
                                        <button className="btn-hud bg-indigo-600 text-white" onClick={handleSave}>
                                            <Save size={16}/> Commit Protocol
                                        </button>
                                        <button className="btn-hud bg-slate-800 text-slate-400" onClick={() => setShowForm(false)}>
                                            Abort
                                        </button>
                                    </div>
                                </div>

                                {/* PREVIEW PANEL */}
                                <div className="space-y-6">
                                    <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest text-center">Live Logic Preview</h4>
                                    <div className="hud-card p-8 border-indigo-500/20 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-10 opacity-5 grayscale group-hover:grayscale-0 transition-all">
                                            <ShieldCheck size={120} className="text-indigo-500" />
                                        </div>
                                        <span className="text-[9px] font-black px-2 py-1 bg-indigo-600 text-white rounded mb-4 inline-block">Active Preview</span>
                                        <h2 className="text-3xl font-black text-white leading-none mb-2">{form.display_name || 'Protocol_X'}</h2>
                                        <div className="text-3xl font-black text-indigo-400 mb-6">
                                            ${form.price_monthly || '00'}<span className="text-xs text-slate-500">/MO</span>
                                        </div>
                                        <div className="space-y-3 mb-8">
                                            <div className="flex items-center gap-3 text-xs font-bold text-slate-400">
                                                <Users size={14} className="text-indigo-500" /> 
                                                {form.max_users === -1 ? 'Infinite Node Capacity' : `${form.max_users} Active User Nodes`}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs font-bold text-slate-400">
                                                <Building2 size={14} className="text-indigo-500" /> 
                                                {form.max_branches === -1 ? 'Global Branching' : `${form.max_branches} Linked Branches`}
                                            </div>
                                        </div>
                                        <div className="border-t border-white/5 pt-6 space-y-2">
                                            {ALL_MODULES.filter(m => form.modules[m.key]).map(m => (
                                                <div key={m.key} className="flex items-center gap-3 text-[10px] font-black text-slate-300 uppercase">
                                                    <Check size={12} className="text-emerald-500" /> {m.label} Enabled
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="hud-card overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-black/20 border-b border-white/5">
                                <tr>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Protocol Tier</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Pricing</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Logic Limits</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {plans.map(plan => (
                                    <tr key={plan.id} className="group hover:bg-white/[0.02] transition-colors">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-black text-indigo-400 text-xs border border-white/5">
                                                    {plan.id}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-white text-base group-hover:text-indigo-400 transition-colors">{plan.display_name}</p>
                                                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">ID: {plan.name}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex flex-col">
                                                <span className="text-lg font-black text-white">${plan.price_monthly}</span>
                                                <span className="text-[9px] font-black text-slate-600 uppercase">Per Cycle</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex gap-6">
                                                <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                                                    <Users size={14} className="text-slate-600" /> {plan.max_users === -1 ? '∞' : plan.max_users}
                                                </div>
                                                <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                                                    <Building2 size={14} className="text-slate-600" /> {plan.max_branches === -1 ? '∞' : plan.max_branches}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <div className="flex items-center justify-end gap-3 translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300">
                                                <button onClick={() => handleEdit(plan)} className="p-3 bg-white/5 rounded-xl text-slate-400 hover:text-white hover:bg-indigo-600/20 transition-all">
                                                    <Edit3 size={16} />
                                                </button>
                                                <button onClick={() => handleClone(plan.id)} className="p-3 bg-white/5 rounded-xl text-slate-400 hover:text-white hover:bg-emerald-600/20 transition-all">
                                                    <Copy size={16} />
                                                </button>
                                                <button onClick={() => handleDelete(plan.id)} className="p-3 bg-white/5 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-600/20 transition-all">
                                                    <Trash2 size={16} />
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
                <div className="hud-card overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <table className="w-full text-left">
                        <thead className="bg-black/20 border-b border-white/5">
                            <tr>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Workspace</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Admin Nexus</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Subscription Tier</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Operations</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {tenants.map(t => (
                                <tr key={t.id} className="group hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => openTenantPanel(t)}>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/5 flex items-center justify-center font-black text-indigo-500 text-sm">
                                                {t.name?.[0]}
                                            </div>
                                            <div>
                                                <p className="font-bold text-white text-base group-hover:text-indigo-400 transition-colors">{t.name}</p>
                                                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{t.slug}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-300">{t.admin_name || 'System Admin'}</span>
                                            <span className="text-[10px] font-bold text-slate-600 uppercase">{t.admin_email}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                         <div className="flex flex-col">
                                            <span className="text-sm font-black text-indigo-400 uppercase tracking-widest">
                                                {t.display_name || t.plan_name || 'Custom'}
                                            </span>
                                            <span className="text-[9px] font-black text-slate-600">Sub ID: {t.sub_status}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <button className="px-5 py-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all">
                                            Manage Nexus
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* SIDE OVERRIDE PANEL (HUD STYLE) */}
            {selectedTenant && (
                <div className="fixed inset-y-0 right-0 w-[500px] bg-slate-950 border-l border-white/10 shadow-2xl z-[300] p-12 overflow-y-auto animate-in slide-in-from-right duration-500">
                    <div className="flex items-center justify-between mb-12">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-indigo-600/30">
                                <Layout size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white tracking-tight">{selectedTenant.name}</h3>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Workspace Profile Access</p>
                            </div>
                        </div>
                        <button onClick={() => setSelectedTenant(null)} className="text-slate-500 hover:text-white transition-colors">
                            <X size={28} />
                        </button>
                    </div>

                    <div className="space-y-12">
                        {/* Plan Switch */}
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Subscription Protocol Override</label>
                            <div className="hud-card p-6 border-indigo-500/20 bg-indigo-500/5">
                                <select className="hud-input w-full mb-4" value={assignPlanId} onChange={e => setAssignPlanId(e.target.value)}>
                                    <option value="">Select standard package...</option>
                                    {plans.map(p => <option key={p.id} value={p.id}>{p.display_name} — ${p.price_monthly}</option>)}
                                </select>
                                <button className="btn-hud w-full bg-indigo-600 text-white justify-center" onClick={handleAssignPlan}>
                                    <RefreshCw size={14}/> Push Update to Node
                                </button>
                            </div>
                        </div>

                        {/* Logic Matrix */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Per-Tenant Logic Matrix</label>
                                <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Manual Override Active</span>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                                {ALL_MODULES.map(m => (
                                    <div 
                                        key={m.key} 
                                        className={`p-4 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                                            overrideModules[m.key] 
                                            ? 'bg-emerald-600/5 border-emerald-500/20' 
                                            : 'bg-white/5 border-white/5'
                                        }`}
                                        onClick={() => setOverrideModules(prev => ({ ...prev, [m.key]: !prev[m.key] }))}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className={overrideModules[m.key] ? 'text-emerald-500' : 'text-slate-600'}>{m.icon}</span>
                                            <span className="text-xs font-bold text-white">{m.label}</span>
                                        </div>
                                        {overrideModules[m.key] ? <Check size={16} className="text-emerald-500" /> : <X size={16} className="text-slate-800" />}
                                    </div>
                                ))}
                            </div>
                            <button className="btn-hud w-full bg-amber-600 text-white justify-center mt-6" onClick={handleSaveOverride}>
                                <Save size={14}/> Save Matrix State
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPlans;
