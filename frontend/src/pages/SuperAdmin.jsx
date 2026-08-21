import React, { useState, useEffect } from 'react';
import { Building2, Users, CreditCard, Calendar, CheckCircle, XCircle, AlertCircle, Search, RefreshCw, Settings, Lock, Mail, Phone, LayoutDashboard, LogOut, ChevronRight, BarChart3, TrendingUp, Clock, ArrowLeft } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { safeArray } from '../utils/dataUtils';
import { useNavigate } from 'react-router-dom';

const StatCard = ({ label, value, icon, color }) => (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4 shadow-sm">
        <div className={`p-3 rounded-xl ${color}`}>{icon}</div>
        <div>
            <p className="text-2xl font-bold text-slate-800">{value ?? '—'}</p>
            <p className="text-sm text-slate-500">{label}</p>
        </div>
    </div>
);

const StatusBadge = ({ status }) => {
    const map = {
        active:    'bg-emerald-100 text-emerald-700',
        suspended: 'bg-red-100 text-red-700',
        trial:     'bg-amber-100 text-amber-700',
        inactive:  'bg-slate-100 text-slate-600',
    };
    return (
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${map[status] || 'bg-slate-100 text-slate-600'}`}>
            {status || 'Unknown'}
        </span>
    );
};

const PlanBadge = ({ plan }) => {
    const map = {
        enterprise: 'bg-indigo-100 text-indigo-700',
        pro:        'bg-violet-100 text-violet-700',
        basic:      'bg-slate-100 text-slate-600',
    };
    return (
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${map[plan] || 'bg-slate-100 text-slate-600'}`}>
            {plan || 'No Plan'}
        </span>
    );
};

const SuperAdmin = () => {
    const navigate = useNavigate();
    const [tenants, setTenants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingSubscription, setEditingSubscription] = useState(null);
    const [resettingPassword, setResettingPassword] = useState(null);
    const [newPassword, setNewPassword] = useState('');

    const fetchTenants = async () => {
        try {
            setLoading(true);
            const res = await api.get('/tenants');
            setTenants(safeArray(res.data.data));
        } catch {
            toast.error('Failed to load companies');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchTenants(); }, []);

    const handleUpdateTenant = async (id, data) => {
        try {
            await api.put(`/tenants/${id}`, data);
            toast.success('Company updated successfully');
            setEditingSubscription(null);
            fetchTenants();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Update failed');
        }
    };

    const handleResetPassword = async (id) => {
        if (!newPassword) return toast.error('Please enter a new password');
        try {
            await api.post(`/tenants/${id}/reset-admin`, { newPassword });
            toast.success('Admin password reset successfully');
            setResettingPassword(null);
            setNewPassword('');
        } catch {
            toast.error('Password reset failed');
        }
    };

    const filtered = safeArray(tenants).filter(t =>
        (t.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (t.slug?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (t.admin_email?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    const stats = {
        total: tenants.length,
        active: tenants.filter(t => t.status === 'active').length,
        trial: tenants.filter(t => t.status === 'trial').length,
        suspended: tenants.filter(t => t.status === 'suspended').length,
    };

    const handleExit = () => {
        sessionStorage.removeItem('ITQAN_CORE_AUTHORIZED');
        navigate('/dashboard');
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* TOP NAV */}
            <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate('/itqan-crm-hud')} className="flex items-center gap-2 text-slate-400 hover:text-slate-700 transition-colors mr-2">
                        <ArrowLeft size={18} />
                    </button>
                    <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
                        <Building2 size={18} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-base font-bold text-slate-800">Command Center</h1>
                        <p className="text-xs text-slate-400">All Registered Companies</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/itqan-crm-hud/pricing')} className="text-sm font-medium text-indigo-600 hover:underline">
                        Manage Plans
                    </button>
                    <button onClick={handleExit} className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-red-600 transition-colors">
                        <LogOut size={16} /> Exit to App
                    </button>
                </div>
            </header>

            <main className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full space-y-8">
                {/* STATS */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard label="Total Companies" value={stats.total} icon={<Building2 size={20} className="text-blue-600" />} color="bg-blue-50" />
                    <StatCard label="Active" value={stats.active} icon={<CheckCircle size={20} className="text-emerald-600" />} color="bg-emerald-50" />
                    <StatCard label="On Trial" value={stats.trial} icon={<Clock size={20} className="text-amber-600" />} color="bg-amber-50" />
                    <StatCard label="Suspended" value={stats.suspended} icon={<XCircle size={20} className="text-red-500" />} color="bg-red-50" />
                </div>

                {/* TABLE */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Table header */}
                    <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <h2 className="font-bold text-slate-800 text-lg">Companies List</h2>
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search by name, email..."
                                    className="pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400 w-72"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <button
                                onClick={fetchTenants}
                                className="p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                                title="Refresh"
                            >
                                <RefreshCw size={15} className={`text-slate-500 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-20 text-slate-400">
                            <RefreshCw size={24} className="animate-spin mr-3" />
                            <span className="text-sm font-medium">Loading companies...</span>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="py-20 text-center text-slate-400 text-sm">No companies found.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100">
                                        <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Company</th>
                                        <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Admin Contact</th>
                                        <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Plan</th>
                                        <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Status</th>
                                        <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Subscription End</th>
                                        <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">Registered</th>
                                        <th className="px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filtered.map(tenant => (
                                        <tr key={tenant.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center font-bold text-indigo-600 text-sm flex-shrink-0">
                                                        {tenant.name?.[0]?.toUpperCase() || '?'}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-slate-800">{tenant.name}</p>
                                                        <p className="text-xs text-slate-400">{tenant.slug}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <p className="font-medium text-slate-700">{tenant.admin_name || '—'}</p>
                                                <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                                                    <Mail size={11} />
                                                    {tenant.admin_email || '—'}
                                                </div>
                                                {tenant.admin_phone && (
                                                    <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                                                        <Phone size={11} />
                                                        {tenant.admin_phone}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-5 py-4">
                                                <PlanBadge plan={tenant.plan} />
                                            </td>
                                            <td className="px-5 py-4">
                                                <StatusBadge status={tenant.status} />
                                            </td>
                                            <td className="px-5 py-4 text-slate-600 text-xs">
                                                {tenant.subscription_end
                                                    ? new Date(tenant.subscription_end).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                                    : <span className="text-slate-400">Not set</span>
                                                }
                                            </td>
                                            <td className="px-5 py-4 text-xs text-slate-400">
                                                {tenant.created_at
                                                    ? new Date(tenant.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                                    : '—'
                                                }
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => setEditingSubscription(tenant)}
                                                        className="px-3 py-1.5 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1"
                                                        title="Edit Subscription"
                                                    >
                                                        <Settings size={13} /> Edit
                                                    </button>
                                                    <button
                                                        onClick={() => setResettingPassword(tenant)}
                                                        className="px-3 py-1.5 text-xs font-semibold bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors flex items-center gap-1"
                                                        title="Reset Password"
                                                    >
                                                        <Lock size={13} /> Reset PW
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Footer */}
                    {!loading && (
                        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
                            Showing {filtered.length} of {tenants.length} companies
                        </div>
                    )}
                </div>
            </main>

            {/* EDIT SUBSCRIPTION MODAL */}
            {editingSubscription && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-md p-8 shadow-2xl border border-slate-100">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2.5 bg-indigo-100 rounded-xl">
                                <Building2 size={20} className="text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">Edit Company</h3>
                                <p className="text-sm text-slate-500">{editingSubscription.name}</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-600 mb-1.5">Subscription Plan</label>
                                <select
                                    className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 bg-white"
                                    defaultValue={editingSubscription.plan}
                                    onChange={e => setEditingSubscription({ ...editingSubscription, plan: e.target.value })}
                                >
                                    <option value="basic">Basic</option>
                                    <option value="pro">Pro</option>
                                    <option value="enterprise">Enterprise</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-600 mb-1.5">Status</label>
                                <select
                                    className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 bg-white"
                                    defaultValue={editingSubscription.status}
                                    onChange={e => setEditingSubscription({ ...editingSubscription, status: e.target.value })}
                                >
                                    <option value="active">Active</option>
                                    <option value="trial">Trial</option>
                                    <option value="suspended">Suspended</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-600 mb-1.5">Subscription End Date</label>
                                <input
                                    type="date"
                                    className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400"
                                    defaultValue={editingSubscription.subscription_end ? editingSubscription.subscription_end.split('T')[0] : ''}
                                    onChange={e => setEditingSubscription({ ...editingSubscription, subscription_end: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button
                                onClick={() => setEditingSubscription(null)}
                                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleUpdateTenant(editingSubscription.id, editingSubscription)}
                                className="flex-1 py-2.5 bg-indigo-600 rounded-xl text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* RESET PASSWORD MODAL */}
            {resettingPassword && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-md p-8 shadow-2xl border border-slate-100">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 bg-amber-100 rounded-xl">
                                <Lock size={20} className="text-amber-600" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">Reset Admin Password</h3>
                                <p className="text-sm text-slate-500">{resettingPassword.name}</p>
                            </div>
                        </div>
                        <p className="text-sm text-slate-500 mb-6 mt-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
                            ⚠️ This will reset the password for the admin user of this company.
                        </p>
                        <div>
                            <label className="block text-sm font-semibold text-slate-600 mb-1.5">New Password</label>
                            <input
                                type="text"
                                className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-amber-400"
                                placeholder="Enter new password..."
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => { setResettingPassword(null); setNewPassword(''); }}
                                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleResetPassword(resettingPassword.id)}
                                className="flex-1 py-2.5 bg-amber-600 rounded-xl text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
                            >
                                Reset Password
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuperAdmin;
