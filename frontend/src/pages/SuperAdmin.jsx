import React, { useState, useEffect } from 'react';
import { 
  Building2, Users, Calendar, AlertCircle, 
  CheckCircle2, XCircle, Search, RefreshCw, 
  ShieldAlert, Settings, FileSearch, Save,
  Lock, Phone, Mail, LayoutDashboard,
  ExternalLink, Layers, Fingerprint
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
      toast.success('Tenant record updated successfully');
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
      toast.success('Admin credentials overridden');
      setResettingPassword(null);
      setNewPassword('');
    } catch (err) {
      toast.error('Password override failed');
    }
  };

  const filteredTenants = safeArray(tenants).filter(t => 
    (t.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
    (t.slug?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-t-indigo-500 rounded-full animate-spin" />
        </div>
        <p className="text-slate-500 font-black uppercase tracking-[0.3em] text-[10px] animate-pulse">Initializing Command Center</p>
    </div>
  );

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-500">
      <style>{`
        .glass-header {
            background: rgba(255, 255, 255, 0.01);
            backdrop-filter: blur(10px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .table-container {
            background: linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.4) 100%);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 2.5rem;
            overflow: hidden;
            box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.4);
        }
        .search-hud {
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);
            transition: all 0.3s ease;
        }
        .search-hud:focus-within {
            border-color: rgba(99, 102, 241, 0.5);
            box-shadow: 0 0 20px rgba(99, 102, 241, 0.15), inset 0 2px 4px rgba(0,0,0,0.3);
            transform: scale(1.02);
        }
        .status-badge {
            padding: 4px 12px;
            border-radius: 99px;
            font-size: 10px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            border: 1px solid rgba(255,255,255,0.05);
        }
        .action-circle {
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 12px;
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.05);
            transition: all 0.2s;
        }
        .action-circle:hover {
            background: rgba(99, 102, 241, 0.1);
            border-color: rgba(99, 102, 241, 0.3);
            transform: translateY(-2px);
            color: white;
        }
      `}</style>

      {/* --- RE-DESIGNED HEADER --- */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 px-2 pt-4">
        <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-500/20 border border-white/20">
                <ShieldAlert className="text-white" size={32} />
            </div>
            <div>
                <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-3">
                    Command Center
                    <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_#10b981]" />
                    </div>
                </h1>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-[0.2em] mt-1 opacity-70">SaaS Ecosystem Management</p>
            </div>
        </div>

        <div className="flex items-center gap-4">
            <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 group-focus-within:text-indigo-400 transition-colors" />
                <input 
                    type="text" 
                    placeholder="Search Workspaces..." 
                    className="pl-12 pr-6 py-4 search-hud rounded-2xl text-sm text-white outline-none w-full md:w-80 font-medium"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <button 
                onClick={fetchTenants}
                className="h-14 w-14 search-hud rounded-2xl flex items-center justify-center hover:bg-slate-800 transition-all active:scale-95"
                title="Refresh Environment"
            >
                <RefreshCw className={`w-5 h-5 text-slate-400 ${loading ? 'animate-spin text-indigo-500' : ''}`} />
            </button>
        </div>
      </div>
      
      {/* --- INTELLIGENCE HUD --- */}
      <InsightsPanel />

      {/* --- TENANT EXPLORER TABLE --- */}
      <div className="table-container">
        <div className="p-8 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-xl font-black text-white flex items-center gap-3">
                <Layers className="text-indigo-500" size={20} />
                Global Tenant Registry
            </h3>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-white/5 py-1 px-3 rounded-lg border border-white/5">
                {filteredTenants.length} Active Nodes
            </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-900/30 border-b border-white/5">
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Workspace ID</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Admin Control</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Contact Intel</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Access Level</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Node Status</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredTenants.map((tenant) => (
                <tr key={tenant.id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/5 flex items-center justify-center font-black text-indigo-500 text-sm shadow-xl">
                        {tenant.name?.[0] || '?'}
                      </div>
                      <div>
                        <p className="font-bold text-white text-base group-hover:text-indigo-400 transition-colors">{tenant.name || 'Unnamed'}</p>
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Slug: {tenant.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-300">{tenant.admin_name || 'N/A'}</span>
                      <span className="text-[10px] font-bold text-slate-600 uppercase">Super Admin</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-xs text-slate-400 font-bold group-hover:text-slate-300">
                        <Mail size={14} className="text-indigo-500/50" />
                        {tenant.admin_email}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 font-bold group-hover:text-slate-300">
                        <Phone size={14} className="text-indigo-500/50" />
                        {tenant.admin_phone || 'Unset'}
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`status-badge ${
                      tenant.plan === 'enterprise' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 
                      tenant.plan === 'pro' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                      'bg-slate-500/10 text-slate-400 border-slate-500/20'
                    }`}>
                      {tenant.plan}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                       <div className={`w-3 h-3 rounded-full ${tenant.status === 'active' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-red-500 shadow-[0_0_10px_#ef4444]'} transition-all`} />
                       <span className="text-xs font-black text-white uppercase tracking-widest">{tenant.status}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-3 translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300">
                      <button 
                        onClick={() => setEditingSubscription(tenant)}
                        className="action-circle text-indigo-400"
                        title="Manage Subscription"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button 
                         onClick={() => setResettingPassword(tenant)}
                         className="action-circle text-amber-500"
                         title="Override Password"
                      >
                        <Lock className="w-4 h-4" />
                      </button>
                      <button 
                         className="action-circle text-slate-500"
                         title="Analytics Insight"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- PREMIUM MODALS (RESTYLED) --- */}
      {editingSubscription && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-slate-900 rounded-[2.5rem] w-full max-w-lg p-10 border border-white/10 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                <Settings size={140} className="animate-spin-slow" />
            </div>
            <h3 className="text-2xl font-black mb-8 flex items-center gap-4 text-white">
              <div className="p-3 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-600/20">
                <Building2 size={24} />
              </div>
              Control Node: {editingSubscription.name}
            </h3>
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Subscription Protocol</label>
                <select 
                  className="w-full p-4 bg-slate-800 border border-white/5 rounded-2xl text-sm text-white outline-none focus:border-indigo-500/50 transition-all appearance-none"
                  defaultValue={editingSubscription.plan}
                  onChange={(e) => setEditingSubscription({...editingSubscription, plan: e.target.value})}
                >
                  <option value="basic">Standard Tier (Basic)</option>
                  <option value="pro">Advanced Operations (Pro)</option>
                  <option value="enterprise">Maximum Scalability (Enterprise)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Operational Status</label>
                <select 
                  className="w-full p-4 bg-slate-800 border border-white/5 rounded-2xl text-sm text-white outline-none focus:border-indigo-500/50 transition-all appearance-none"
                  defaultValue={editingSubscription.status}
                  onChange={(e) => setEditingSubscription({...editingSubscription, status: e.target.value})}
                >
                  <option value="active">Operational (Active)</option>
                  <option value="suspended">De-commissioned (Suspended)</option>
                  <option value="trial">Beta Testing (Trial)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Authorization Expiry</label>
                <input 
                  type="date" 
                  className="w-full p-4 bg-slate-800 border border-white/5 rounded-2xl text-sm text-white outline-none focus:border-indigo-500/50 transition-all"
                  defaultValue={editingSubscription.subscription_end ? editingSubscription.subscription_end.split('T')[0] : ''}
                  onChange={(e) => setEditingSubscription({...editingSubscription, subscription_end: e.target.value})}
                />
              </div>
            </div>
            <div className="flex gap-4 mt-12">
              <button 
                onClick={() => setEditingSubscription(null)}
                className="flex-1 py-4 bg-slate-800 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-400 hover:bg-slate-700 transition-colors"
              >
                Abort
              </button>
              <button 
                onClick={() => handleUpdateTenant(editingSubscription.id, editingSubscription)}
                className="flex-2 py-4 bg-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest text-white shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 transition-all"
              >
                Authorize Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- PASSWORD OVERRIDE MODAL --- */}
      {resettingPassword && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-slate-900 rounded-[2.5rem] w-full max-w-lg p-10 border border-rose-500/20 shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                <Lock size={140} />
            </div>
            <h3 className="text-2xl font-black mb-8 flex items-center gap-4 text-white text-rose-500">
              <div className="p-3 bg-rose-600 rounded-2xl shadow-xl shadow-rose-600/20">
                <ShieldAlert size={24} className="text-white" />
              </div>
              Credentials Override
            </h3>
            <p className="text-sm text-slate-400 mb-8 font-medium leading-relaxed">
              Initiating emergency credential override for <strong className="text-white">{resettingPassword.name}</strong>. Provide a secure temporary passphrase.
            </p>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Temporary Passphrase</label>
              <input 
                type="text" 
                className="w-full p-4 bg-slate-800 border border-white/5 rounded-2xl text-sm text-white outline-none focus:border-rose-500/50 transition-all placeholder:text-slate-600"
                placeholder="Enter 256-bit character string..."
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="flex gap-4 mt-12">
              <button 
                onClick={() => setResettingPassword(null)}
                className="flex-1 py-4 bg-slate-800 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-400 hover:bg-slate-700 transition-colors"
              >
                Cancel Override
              </button>
              <button 
                onClick={() => handleResetPassword(resettingPassword.id)}
                className="flex-2 py-4 bg-rose-600 rounded-2xl font-black text-xs uppercase tracking-widest text-white shadow-xl shadow-rose-600/20 hover:bg-rose-500 transition-all"
              >
                Execute Protocol
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdmin;
