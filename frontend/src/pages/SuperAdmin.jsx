import React, { useState, useEffect } from 'react';
import { 
  Building2, Users, Calendar, AlertCircle, 
  CheckCircle2, XCircle, Search, RefreshCw, 
  ShieldAlert, Settings, FileSearch, Save,
  Lock, Phone, Mail
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { safeArray } from '../utils/dataUtils';
import InsightsPanel from './SuperAdmin/InsightsPanel';

const SuperAdmin = () => {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [editingSubscription, setEditingSubscription] = useState(null);
  const [resettingPassword, setResettingPassword] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const res = await api.get('/tenants');
      setTenants(safeArray(res.data.data));
    } catch (err) {
      toast.error('Failed to fetch global tenant list');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTenant = async (id, data) => {
    try {
      await api.put(`/tenants/${id}`, data);
      toast.success('Tenant updated successfully');
      setEditingSubscription(null);
      fetchTenants();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    }
  };

  const handleResetPassword = async (id) => {
    if (!newPassword) return toast.error('Enter a new password');
    try {
      await api.post(`/tenants/${id}/reset-admin`, { newPassword });
      toast.success('Admin password reset successfully');
      setResettingPassword(null);
      setNewPassword('');
    } catch (err) {
      toast.error('Password reset failed');
    }
  };

  const filteredTenants = safeArray(tenants).filter(t => 
    (t.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
    (t.slug?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><RefreshCw className="animate-spin text-indigo-500" /></div>;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="text-indigo-600" /> Platform Command Center
          </h1>
          <p className="text-slate-500 text-sm">Global Management of all SaaS Workspaces</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search companies..." 
              className="pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={fetchTenants}
            className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg h-10 w-10 flex items-center justify-center hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>
      
      {/* SaaS STRATEGIC INTELLIGENCE ENGINE */}
      <InsightsPanel />

      {/* Tenant Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Company</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contact Person</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contact Info</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Plan</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredTenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300">
                        {tenant.name[0]}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{tenant.name}</p>
                        <p className="text-xs text-slate-400">/{tenant.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{tenant.admin_name || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                        <Mail size={12} className="text-slate-400" />
                        {tenant.admin_email || 'No email'}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                        <Phone size={12} className="text-slate-400" />
                        {tenant.admin_phone || 'No phone'}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                      tenant.plan === 'enterprise' ? 'bg-indigo-100 text-indigo-700' : 
                      tenant.plan === 'basic' ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {tenant.plan}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                       <div className={`w-2 h-2 rounded-full ${tenant.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                       <span className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">{tenant.status}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 text-right">
                      <button 
                        onClick={() => setEditingSubscription(tenant)}
                        className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg text-indigo-600 transition-colors"
                        title="Manage Subscription"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button 
                         onClick={() => setResettingPassword(tenant)}
                         className="p-1.5 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg text-amber-600 transition-colors"
                         title="Override Password"
                      >
                        <Lock className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Subscription Modal */}
      {editingSubscription && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-md p-8 border border-white/10 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2 dark:text-white">
              <Calendar className="text-indigo-600" /> Manage Access: {editingSubscription.name}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Subscription Plan</label>
                <select 
                  className="w-full p-3 bg-slate-100 dark:bg-slate-900 border-none rounded-xl text-sm dark:text-white"
                  defaultValue={editingSubscription.plan}
                  onChange={(e) => setEditingSubscription({...editingSubscription, plan: e.target.value})}
                >
                  <option value="basic">Basic Plan</option>
                  <option value="pro">Professional Plan</option>
                  <option value="enterprise">Enterprise Plan</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Workspace Status</label>
                <select 
                  className="w-full p-3 bg-slate-100 dark:bg-slate-900 border-none rounded-xl text-sm dark:text-white"
                  defaultValue={editingSubscription.status}
                  onChange={(e) => setEditingSubscription({...editingSubscription, status: e.target.value})}
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="trial">Trial Mode</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Expiry Date</label>
                <input 
                  type="date" 
                  className="w-full p-3 bg-slate-100 dark:bg-slate-900 border-none rounded-xl text-sm dark:text-white"
                  defaultValue={editingSubscription.subscription_end ? editingSubscription.subscription_end.split('T')[0] : ''}
                  onChange={(e) => setEditingSubscription({...editingSubscription, subscription_end: e.target.value})}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setEditingSubscription(null)}
                className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 rounded-xl font-bold text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleUpdateTenant(editingSubscription.id, editingSubscription)}
                className="flex-1 py-3 bg-indigo-600 rounded-xl font-bold text-white shadow-lg shadow-indigo-200 dark:shadow-none"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {resettingPassword && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-md p-8 border border-white/10 shadow-2xl">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2 dark:text-white">
              <ShieldAlert className="text-amber-600" /> Administrative Password Override
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              You are overriding the primary admin password for <strong>{resettingPassword.name}</strong>. Provide a temporary password for their next login.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">New Admin Password</label>
              <input 
                type="text" 
                className="w-full p-3 bg-slate-100 dark:bg-slate-900 border-none rounded-xl text-sm dark:text-white"
                placeholder="Enter strong temporary password..."
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setResettingPassword(null)}
                className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 rounded-xl font-bold text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleResetPassword(resettingPassword.id)}
                className="flex-1 py-3 bg-amber-600 rounded-xl font-bold text-white shadow-lg shadow-amber-200 dark:shadow-none"
              >
                Force Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdmin;
