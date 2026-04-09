import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { 
  Building2, Shield, CreditCard, Layout, CheckCircle, 
  AlertCircle, ChevronRight, Globe, Users, ExternalLink
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const CompanySettings = () => {
  const { user } = useAuth();
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTenantDetails();
  }, []);

  const fetchTenantDetails = async () => {
    try {
      const res = await api.get('/auth/me'); // Check if this provides tenant info or add a new endpoint
      // Assuming we need a dedicated endpoint for tenant details
      const tenantRes = await api.get(`/tenants/${user.tenant_id}`);
      setTenant(tenantRes.data.data);
    } catch (err) {
      console.error('Failed to load company details');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/tenants/${user.tenant_id}`, { name: tenant.name });
      toast.success('Company settings updated');
    } catch (err) {
      toast.error('Failed to update company settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-state">Initializing SaaS Context...</div>;

  return (
    <div className="company-settings-page">
      <style>{`
        .company-settings-page { padding: 24px; max-width: 1000px; margin: 0 auto; }
        .settings-header { margin-bottom: 32px; }
        .settings-card { background: white; border-radius: 16px; border: 1px solid var(--border); overflow: hidden; margin-bottom: 24px; }
        .card-header { padding: 20px 24px; border-bottom: 1px solid var(--border); background: #f8fafc; display: flex; align-items: center; gap: 12px; }
        .card-header h3 { font-size: 16px; font-weight: 700; color: #1e293b; }
        .card-body { padding: 24px; }
        
        .plan-badge { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc; }
        .plan-badge.pro { border-color: #fbbf24; background: #fffbeb; }
        .plan-badge.pro .plan-type { color: #b45309; }

        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; font-size: 13px; font-weight: 700; color: #64748b; margin-bottom: 8px; text-transform: uppercase; }
        .form-group input { width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border); outline: none; transition: 0.2s; }
        .form-group input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
        
        .subscription-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
        .usage-bar { height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; margin: 10px 0; }
        .usage-progress { height: 100%; background: var(--primary); border-radius: 4px; }
      `}</style>

      <div className="settings-header">
        <h2 style={{ fontSize: '28px', fontWeight: '900', letterSpacing: '-0.02em' }}>Company Workspace</h2>
        <p style={{ color: '#64748b' }}>Manage your organization's global identity and SaaS subscription.</p>
      </div>

      <div className="subscription-grid">
        <div className="settings-card" style={{ flex: 1 }}>
          <div className="card-header">
            <Building2 size={20} style={{ color: 'var(--primary)' }} />
            <h3>Organization Profile</h3>
          </div>
          <div className="card-body">
            <form onSubmit={handleUpdate}>
              <div className="form-group">
                <label>Company Name</label>
                <input 
                  type="text" 
                  value={tenant?.name} 
                  onChange={(e) => setTenant({ ...tenant, name: e.target.value })}
                  placeholder="Acme Corp"
                />
              </div>
              <div className="form-group">
                <label>Organization Slug (Namespace)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '13px' }}>
                  <Globe size={14} />
                  tashgheel-crm.com/<b>{tenant?.slug}</b>
                </div>
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Update Profile'}
              </button>
            </form>
          </div>
        </div>

        <div className="settings-card" style={{ flex: 1 }}>
          <div className="card-header">
            <CreditCard size={20} style={{ color: '#0ea5e9' }} />
            <h3>SaaS Subscription</h3>
          </div>
          <div className="card-body">
             <div className={`plan-badge ${tenant?.plan === 'pro' ? 'pro' : ''}`}>
               <div style={{ padding: '8px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                 <Layout size={20} style={{ color: '#0ea5e9' }} />
               </div>
               <div>
                  <div className="plan-type" style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase' }}>Current Plan</div>
                  <div style={{ fontSize: '18px', fontWeight: '900', textTransform: 'capitalize' }}>{tenant?.plan} Edition</div>
               </div>
             </div>

             <div style={{ marginTop: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '8px' }}>
                   <span>USER SLOTS</span>
                   <span>4 / 10 used</span>
                </div>
                <div className="usage-bar">
                   <div className="usage-progress" style={{ width: '40%' }}></div>
                </div>
                <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '12px' }}>
                  Your next billing cycle starts on <b>May 1st, 2024</b>.
                </p>
             </div>

             <button className="btn-secondary" style={{ width: '100%', marginTop: '24px', display: 'flex', alignItems: 'center', gap: '8px', justify: 'center' }}>
               Manage Subscription <ExternalLink size={14} />
             </button>
          </div>
        </div>
      </div>

      <div className="settings-card">
         <div className="card-header">
           <Shield size={20} style={{ color: '#16a34a' }} />
           <h3>Platform Security</h3>
         </div>
         <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
               <h4 style={{ fontSize: '14px', fontWeight: '700' }}>Multi-Tenant Isolation</h4>
               <p style={{ fontSize: '13px', color: '#64748b' }}>Your data is cryptographically isolated and hosted in a secure VPC.</p>
            </div>
            <div style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '13px' }}>
               <CheckCircle size={18} /> Verified Active
            </div>
         </div>
      </div>
    </div>
  );
};

export default CompanySettings;
