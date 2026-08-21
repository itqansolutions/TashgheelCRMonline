import React, { useState, useEffect } from 'react';
import { 
    Plus, Edit3, Copy, Trash2, ToggleRight, ToggleLeft, 
    Users, Building2, Check, X, Save, RefreshCw, 
    Zap, Layers, DollarSign, Settings,
    Shield, Box, ChevronRight, Layout, ArrowLeft,
    Search, Calendar, CheckCircle, Clock, XCircle, LogOut
} from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const ALL_MODULES = [
    { key: 'crm',        label: 'CRM & Sales',         icon: <Users size={16}/> },
    { key: 'finance',    label: 'Finance & Invoicing',  icon: <DollarSign size={16}/> },
    { key: 'hr',         label: 'HR & Attendance',      icon: <Users size={16}/> },
    { key: 'inventory',  label: 'Inventory Control',     icon: <Box size={16}/> },
    { key: 'automation', label: 'Workflow Automation',  icon: <Zap size={16}/> },
    { key: 'reports',    label: 'Reports & Analytics',  icon: <Layers size={16}/> },
];

const emptyPlan = () => ({
    name: '', display_name: '', price_monthly: '',
    max_users: 10, max_branches: 1,
    modules: { crm: true, finance: true, hr: false, inventory: false, automation: false, reports: false },
    sort_order: 10
});

const StatusBadge = ({ status }) => {
    const map = {
        active:    'bg-emerald-100 text-emerald-700',
        trial:     'bg-amber-100 text-amber-700',
        expired:   'bg-red-100 text-red-700',
        cancelled: 'bg-slate-100 text-slate-600',
        suspended: 'bg-red-100 text-red-700',
    };
    return (
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${map[status] || 'bg-slate-100 text-slate-600'}`}>
            {status || 'Unknown'}
        </span>
    );
};

const AdminPlans = () => {
    const navigate = useNavigate();
    const [plans, setPlans]       = useState([]);
    const [tenants, setTenants]   = useState([]);
    const [loading, setLoading]   = useState(true);
    const [activeTab, setActiveTab] = useState('tenants'); // default to company subscriptions
    const [searchTerm, setSearchTerm] = useState('');
    
    // Plan Form State
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId]     = useState(null);
    const [form, setForm]         = useState(emptyPlan());

    // Tenant Override / Assign State
    const [selectedTenant, setSelectedTenant] = useState(null);
    const [assignPlanId, setAssignPlanId]     = useState('');
    const [assignExpiresAt, setAssignExpiresAt] = useState('');
    const [assignStatus, setAssignStatus]     = useState('active');
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
        } catch {
            toast.error('Failed to load subscription data');
        } finally { 
            setLoading(false); 
        }
    };

    useEffect(() => { fetchAll(); }, []);

    const handleEditPlan = (plan) => {
        setForm({
            name: plan.name,
            display_name: plan.display_name,
            price_monthly: plan.price_monthly,
            max_users: plan.max_users,
            max_branches: plan.max_branches,
            modules: typeof plan.modules === 'string' ? JSON.parse(plan.modules) : (plan.modules || {}),
            sort_order: plan.sort_order || 10
        });
        setEditId(plan.id);
        setShowForm(true);
    };

    const handleSavePlan = async () => {
        if (!form.display_name.trim()) return toast.error('Plan display name is required');
        try {
            if (editId) {
                await api.put(`/admin/plans/${editId}`, form);
                toast.success('Plan updated successfully');
            } else {
                if (!form.name.trim()) return toast.error('Plan key/identifier is required');
                await api.post('/admin/plans', form);
                toast.success('New plan created successfully');
            }
            setShowForm(false);
            setEditId(null);
            setForm(emptyPlan());
            fetchAll();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save plan');
        }
    };

    const handleClonePlan = async (id) => {
        try {
            await api.post(`/admin/plans/${id}/clone`);
            toast.success('Plan cloned successfully');
            fetchAll();
        } catch {
            toast.error('Failed to clone plan');
        }
    };

    const handleDeletePlan = async (id) => {
        if (!window.confirm('Are you sure you want to delete this plan?')) return;
        try {
            await api.delete(`/admin/plans/${id}`);
            toast.success('Plan deleted successfully');
            fetchAll();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete plan');
        }
    };

    const handleToggleActive = async (plan) => {
        try {
            await api.put(`/admin/plans/${plan.id}`, { is_active: !plan.is_active });
            toast.success(`Plan ${!plan.is_active ? 'enabled' : 'disabled'}`);
            fetchAll();
        } catch {
            toast.error('Failed to update status');
        }
    };

    const openTenantPanel = async (tenant) => {
        setSelectedTenant(tenant);
        setAssignPlanId(tenant.plan_id || '');
        setAssignStatus(tenant.sub_status || 'active');
        setAssignExpiresAt(tenant.expires_at ? tenant.expires_at.split('T')[0] : '');

        try {
            const res = await api.get(`/admin/tenants/${tenant.id}/override`);
            const ov = res.data.data;
            const currentPlan = plans.find(p => p.id === tenant.plan_id);
            const planMods = currentPlan ? (typeof currentPlan.modules === 'string' ? JSON.parse(currentPlan.modules) : currentPlan.modules) : {};
            
            const merged = { ...planMods, ...(ov?.modules || {}) };
            setOverrideModules(merged);
        } catch {
            setOverrideModules({});
        }
    };

    const handleAssignPlan = async () => {
        if (!assignPlanId) return toast.error('Please select a plan');
        try {
            await api.put(`/admin/tenants/${selectedTenant.id}/plan`, { 
                plan_id: parseInt(assignPlanId), 
                status: assignStatus,
                expires_at: assignExpiresAt || null
            });
            toast.success('Subscription plan updated');
            fetchAll();
            setSelectedTenant(null);
        } catch {
            toast.error('Failed to update plan');
        }
    };

    const handleSaveOverride = async () => {
        try {
            await api.put(`/admin/tenants/${selectedTenant.id}/override`, { 
                modules: overrideModules, 
                notes: 'Manual custom modules update' 
            });
            toast.success('Custom module access saved');
            fetchAll();
            setSelectedTenant(null);
        } catch {
            toast.error('Failed to save module overrides');
        }
    };

    const handleExit = () => {
        sessionStorage.removeItem('ITQAN_CORE_AUTHORIZED');
        navigate('/dashboard');
    };

    const filteredTenants = tenants.filter(t =>
        (t.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (t.slug?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (t.admin_email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (t.display_name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    const stats = {
        totalCompanies: tenants.length,
        activeSubs: tenants.filter(t => t.sub_status === 'active').length,
        trialSubs: tenants.filter(t => t.sub_status === 'trial').length,
        totalPlans: plans.length,
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* TOP HEADER */}
            <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate('/itqan-crm-hud')} className="flex items-center gap-2 text-slate-400 hover:text-slate-700 transition-colors mr-2">
                        <ArrowLeft size={18} />
                    </button>
                    <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center">
                        <Layers size={18} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-base font-bold text-slate-800">Subscription Management</h1>
                        <p className="text-xs text-slate-400">Manage Plans & Company Subscriptions</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/itqan-crm-hud/hub')} className="text-sm font-medium text-indigo-600 hover:underline">
                        Companies List
                    </button>
                    <button onClick={handleExit} className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-red-600 transition-colors">
                        <LogOut size={16} /> Exit to App
                    </button>
                </div>
            </header>

            <main className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full space-y-6">
                {/* TABS & ACTIONS */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex gap-2 p-1 bg-slate-200/80 rounded-xl w-fit">
                        <button 
                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'tenants' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`} 
                            onClick={() => setActiveTab('tenants')}
                        >
                            Company Subscriptions ({tenants.length})
                        </button>
                        <button 
                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'plans' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`} 
                            onClick={() => setActiveTab('plans')}
                        >
                            Subscription Plans ({plans.length})
                        </button>
                    </div>

                    {activeTab === 'plans' && (
                        <button 
                            onClick={() => { setShowForm(true); setEditId(null); setForm(emptyPlan()); }}
                            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
                        >
                            <Plus size={16} /> Create New Plan
                        </button>
                    )}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-24 text-slate-400">
                        <RefreshCw size={24} className="animate-spin mr-3 text-violet-600" />
                        <span className="text-sm font-medium">Loading data...</span>
                    </div>
                ) : activeTab === 'tenants' ? (
                    /* TAB 1: TENANT SUBSCRIPTIONS */
                    <div className="space-y-6">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                                <p className="text-2xl font-bold text-slate-800">{stats.totalCompanies}</p>
                                <p className="text-xs text-slate-500 mt-1">Total Companies</p>
                            </div>
                            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                                <p className="text-2xl font-bold text-emerald-600">{stats.activeSubs}</p>
                                <p className="text-xs text-slate-500 mt-1">Active Subscriptions</p>
                            </div>
                            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                                <p className="text-2xl font-bold text-amber-600">{stats.trialSubs}</p>
                                <p className="text-xs text-slate-500 mt-1">Trial Subscriptions</p>
                            </div>
                            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                                <p className="text-2xl font-bold text-violet-600">{stats.totalPlans}</p>
                                <p className="text-xs text-slate-500 mt-1">Available Plans</p>
                            </div>
                        </div>

                        {/* Tenants Table */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <h2 className="font-bold text-slate-800 text-lg">Companies & Subscription Plans</h2>
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Search by company, admin, plan..."
                                            className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-violet-400 w-72"
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                    <button
                                        onClick={fetchAll}
                                        className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                                        title="Refresh"
                                    >
                                        <RefreshCw size={15} className="text-slate-500" />
                                    </button>
                                </div>
                            </div>

                            {filteredTenants.length === 0 ? (
                                <div className="py-20 text-center text-slate-400 text-sm">No companies found.</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-100">
                                                <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Company</th>
                                                <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Admin Contact</th>
                                                <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Assigned Plan</th>
                                                <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Sub Status</th>
                                                <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Expiry Date</th>
                                                <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Users</th>
                                                <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Custom Access</th>
                                                <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredTenants.map(t => (
                                                <tr key={t.id} className="hover:bg-slate-50 transition-colors group">
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center font-bold text-violet-600 text-sm flex-shrink-0">
                                                                {t.name?.[0]?.toUpperCase() || '?'}
                                                            </div>
                                                            <div>
                                                                <p className="font-semibold text-slate-800">{t.name}</p>
                                                                <p className="text-xs text-slate-400">{t.slug}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <p className="font-medium text-slate-700">{t.admin_name || '—'}</p>
                                                        <p className="text-xs text-slate-400">{t.admin_email || '—'}</p>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-slate-800">
                                                                {t.display_name || t.plan_name || 'Not assigned'}
                                                            </span>
                                                            {t.price_monthly !== undefined && t.price_monthly !== null && (
                                                                <span className="text-xs text-slate-400">(${t.price_monthly}/mo)</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <StatusBadge status={t.sub_status || 'active'} />
                                                    </td>
                                                    <td className="px-5 py-4 text-xs text-slate-600">
                                                        {t.expires_at 
                                                            ? new Date(t.expires_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                                            : (t.trial_ends_at ? `Trial: ${new Date(t.trial_ends_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : <span className="text-slate-400">No Expiry</span>)
                                                        }
                                                    </td>
                                                    <td className="px-5 py-4 text-xs font-semibold text-slate-700">
                                                        {t.user_count || 0} users
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        {t.has_override ? (
                                                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                                                                Custom Modules
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-slate-400">Standard</span>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-4 text-right">
                                                        <button 
                                                            onClick={() => openTenantPanel(t)}
                                                            className="px-3 py-1.5 text-xs font-semibold bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100 transition-colors"
                                                        >
                                                            Manage Plan
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
                                Showing {filteredTenants.length} of {tenants.length} companies
                            </div>
                        </div>
                    </div>
                ) : (
                    /* TAB 2: PLANS DEFINITIONS */
                    <div className="space-y-6">
                        {/* Plan Form Modal/Card */}
                        {showForm && (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-800">{editId ? 'Edit Plan' : 'Create New Plan'}</h3>
                                        <p className="text-xs text-slate-500">Configure plan pricing, user limits, and accessible modules</p>
                                    </div>
                                    <button onClick={() => setShowForm(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
                                        <X size={18} />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">Plan Key (e.g. basic, pro, enterprise)</label>
                                        <input 
                                            disabled={!!editId}
                                            className="w-full p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 disabled:bg-slate-100" 
                                            placeholder="plan_code" 
                                            value={form.name} 
                                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">Display Name</label>
                                        <input 
                                            className="w-full p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400" 
                                            placeholder="e.g. Professional Plan" 
                                            value={form.display_name} 
                                            onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">Monthly Price ($)</label>
                                        <input 
                                            type="number"
                                            className="w-full p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400" 
                                            placeholder="49" 
                                            value={form.price_monthly} 
                                            onChange={e => setForm(f => ({ ...f, price_monthly: e.target.value }))} 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">Max Users (-1 for unlimited)</label>
                                        <input 
                                            type="number"
                                            className="w-full p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400" 
                                            value={form.max_users} 
                                            onChange={e => setForm(f => ({ ...f, max_users: parseInt(e.target.value) || 0 }))} 
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-3">Included Modules</label>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {ALL_MODULES.map(m => (
                                            <div 
                                                key={m.key} 
                                                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-colors ${form.modules[m.key] ? 'bg-violet-50 border-violet-200 text-violet-900' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                                                onClick={() => setForm(f => ({ ...f, modules: { ...f.modules, [m.key]: !f.modules[m.key] } }))}
                                            >
                                                <div className="flex items-center gap-2 text-sm font-medium">
                                                    {m.icon}
                                                    <span>{m.label}</span>
                                                </div>
                                                {form.modules[m.key] ? <ToggleRight size={22} className="text-violet-600" /> : <ToggleLeft size={22} className="text-slate-300" />}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                    <button 
                                        onClick={() => setShowForm(false)} 
                                        className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={handleSavePlan} 
                                        className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold shadow-sm"
                                    >
                                        Save Plan
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Plans Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {plans.map(plan => (
                                <div key={plan.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between hover:shadow-md transition-shadow">
                                    <div>
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h3 className="text-lg font-bold text-slate-800">{plan.display_name}</h3>
                                                <p className="text-xs text-slate-400 uppercase font-mono">{plan.name}</p>
                                            </div>
                                            <span className="text-2xl font-black text-violet-600">${plan.price_monthly}<span className="text-xs text-slate-400 font-normal">/mo</span></span>
                                        </div>

                                        <div className="mt-4 space-y-2 py-3 border-y border-slate-100 text-xs text-slate-600">
                                            <div className="flex justify-between">
                                                <span>Users Limit:</span>
                                                <span className="font-semibold">{plan.max_users === -1 ? 'Unlimited' : plan.max_users}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Subscribed Companies:</span>
                                                <span className="font-semibold text-violet-600">{plan.tenant_count || 0}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Status:</span>
                                                <span className={`font-semibold ${plan.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                    {plan.is_active ? 'Active' : 'Disabled'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="mt-4 space-y-1.5">
                                            <p className="text-xs font-semibold text-slate-500 uppercase">Modules Included:</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {ALL_MODULES.map(m => {
                                                    const isIncluded = (typeof plan.modules === 'string' ? JSON.parse(plan.modules) : (plan.modules || {}))[m.key];
                                                    return (
                                                        <span 
                                                            key={m.key} 
                                                            className={`px-2 py-0.5 rounded text-[11px] font-medium ${isIncluded ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-400 opacity-60'}`}
                                                        >
                                                            {m.label}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-6 mt-6 border-t border-slate-100">
                                        <button 
                                            onClick={() => handleToggleActive(plan)} 
                                            className={`text-xs font-semibold ${plan.is_active ? 'text-amber-600 hover:text-amber-700' : 'text-emerald-600 hover:text-emerald-700'}`}
                                        >
                                            {plan.is_active ? 'Disable' : 'Enable'}
                                        </button>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => handleClonePlan(plan.id)} 
                                                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                                title="Clone Plan"
                                            >
                                                <Copy size={15} />
                                            </button>
                                            <button 
                                                onClick={() => handleEditPlan(plan)} 
                                                className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                                                title="Edit Plan"
                                            >
                                                <Edit3 size={15} />
                                            </button>
                                            <button 
                                                onClick={() => handleDeletePlan(plan.id)} 
                                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Delete Plan"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {/* SIDE MODAL FOR TENANT PLAN ASSIGNMENT & MODULE OVERRIDE */}
            {selectedTenant && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-2xl w-full max-w-xl p-8 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">Manage Subscription</h3>
                                <p className="text-sm text-slate-500 font-medium">{selectedTenant.name} ({selectedTenant.slug})</p>
                            </div>
                            <button onClick={() => setSelectedTenant(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Section 1: Assign Plan */}
                        <div className="space-y-4 mb-8">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">1. Assign Standard Plan</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Select Plan</label>
                                    <select 
                                        className="w-full p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 bg-white"
                                        value={assignPlanId} 
                                        onChange={e => setAssignPlanId(e.target.value)}
                                    >
                                        <option value="">Choose a plan...</option>
                                        {plans.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.display_name} (${p.price_monthly}/mo)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Subscription Status</label>
                                    <select 
                                        className="w-full p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 bg-white"
                                        value={assignStatus} 
                                        onChange={e => setAssignStatus(e.target.value)}
                                    >
                                        <option value="active">Active</option>
                                        <option value="trial">Trial</option>
                                        <option value="expired">Expired</option>
                                        <option value="suspended">Suspended</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Expiry Date (Optional)</label>
                                <input 
                                    type="date"
                                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400"
                                    value={assignExpiresAt}
                                    onChange={e => setAssignExpiresAt(e.target.value)}
                                />
                            </div>
                            <button 
                                onClick={handleAssignPlan}
                                className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
                            >
                                Apply Plan
                            </button>
                        </div>

                        {/* Section 2: Custom Module Overrides */}
                        <div className="space-y-4 pt-6 border-t border-slate-100">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">2. Custom Feature / Module Access</h4>
                                <span className="text-[11px] text-slate-400">Override default plan modules</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {ALL_MODULES.map(m => (
                                    <div 
                                        key={m.key} 
                                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-colors ${
                                            overrideModules[m.key] 
                                                ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                                                : 'bg-slate-50 border-slate-200 text-slate-400'
                                        }`}
                                        onClick={() => setOverrideModules(prev => ({ ...prev, [m.key]: !prev[m.key] }))}
                                    >
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            {m.icon}
                                            <span>{m.label}</span>
                                        </div>
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${overrideModules[m.key] ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                                            {overrideModules[m.key] ? <Check size={12} /> : <X size={12} />}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <button 
                                onClick={handleSaveOverride}
                                className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
                            >
                                Save Custom Module Access
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPlans;
