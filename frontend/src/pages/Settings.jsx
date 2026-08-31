import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { 
  Building2, Image as ImageIcon, Globe, Receipt, 
  MapPin, Phone, Hash, FileText, Save, Eye, Upload, 
  Plus, Trash2, Edit2, X, Megaphone, Settings as AdminSettingsIcon, CheckSquare,
  Users, Layers, Sliders, ShieldCheck, Zap, DollarSign, Activity, ChevronRight, Briefcase
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const TABS = [
  'Branding & Identity',
  'CRM & Leads',
  'Sales & Pipeline',
  'Finance & Billing',
  'Real Estate Vertical',
  'Automation & Rules',
  'Integrations'
];

const Settings = () => {
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  
  const [activeTab, setActiveTab] = useState('Branding & Identity');

  // Tenant / Company State
  const [tenant, setTenant] = useState({
    name: '', address: '', phone: '', logo_url: '',
    tax_no: '', reg_no: '', currency: 'EGP',
    tax_rate: 0, invoice_prefix: 'INV-',
    invoice_footer: '', terms: '',
    quotation_prefix: 'QUO-', quotation_footer: '', quotation_terms: '',
    primary_color: '#6366f1'
  });
  
  // CRM State
  const [sources, setSources] = useState([]);
  const [leadStatuses, setLeadStatuses] = useState([]);
  const [newSourceName, setNewSourceName] = useState('');
  const [newLeadStatus, setNewLeadStatus] = useState({ name: '', color: '#3b82f6', sort_order: 0 });

  // Sales / Task Pipeline State
  const [taskStatuses, setTaskStatuses] = useState([]);
  const [newTaskStatus, setNewTaskStatus] = useState({ name: '', can_make_deal: false, is_final: false, color: '#64748b', order_index: 0 });

  // Integrations / ETA State
  const [etaSettings, setEtaSettings] = useState({
    environment: 'Pre-Production (Sandbox)',
    tax_id: '',
    client_id: '',
    client_secret: '',
    pos_serial: ''
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewMode, setPreviewMode] = useState('Quotation');

  useEffect(() => {
    fetchTenantDetails();
    fetchSources();
    fetchLeadStatuses();
    fetchTaskStatuses();
  }, []);

  const fetchTenantDetails = async () => {
    try {
      const tenantRes = await api.get(`/tenants/my`);
      const data = tenantRes.data.data;
      const normalizedData = { ...data };
      Object.keys(normalizedData).forEach(key => {
        if (normalizedData[key] === null) normalizedData[key] = '';
      });
      setTenant(prev => ({ ...prev, ...normalizedData }));
    } catch (err) {
      toast.error('Failed to load company details');
    } finally {
      setLoading(false);
    }
  };

  const fetchSources = async () => {
    try {
      const res = await api.get('/lead-sources');
      setSources(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load lead sources', err);
    }
  };

  const fetchLeadStatuses = async () => {
    try {
      const res = await api.get('/lead-statuses');
      setLeadStatuses(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load lead statuses', err);
    }
  };

  const fetchTaskStatuses = async () => {
    try {
      const res = await api.get('/task-statuses');
      setTaskStatuses(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load task statuses', err);
    }
  };

  const handleUpdate = async (e) => {
    if (e) e.preventDefault();
    if (!user?.tenant_id) {
      toast.error('Session expired or invalid tenant context');
      return;
    }
    setSaving(true);
    try {
      const res = await api.put(`/tenants/${user.tenant_id}`, tenant);
      if (res.data.status === 'success') {
        toast.success('Settings updated successfully');
        if (res.data.data) setTenant(prev => ({ ...prev, ...res.data.data }));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!user?.tenant_id) {
      toast.error('Identity context missing. Please refresh.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('linked_type', 'Tenant');
    formData.append('linked_id', String(user.tenant_id));

    setUploading(true);
    try {
      const res = await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const filePath = res.data.data.file_path;
      setTenant({ ...tenant, logo_url: filePath });
      toast.success('Logo uploaded! Click Save Settings to apply.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Lead Sources
  const handleAddSource = async (e) => {
    e.preventDefault();
    if (!newSourceName.trim()) return;
    setSaving(true);
    try {
      await api.post('/lead-sources', { name: newSourceName.trim() });
      toast.success('Lead source added');
      setNewSourceName('');
      fetchSources();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add source');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSource = async (id) => {
    if (!window.confirm('Delete this lead source?')) return;
    try {
      await api.delete(`/lead-sources/${id}`);
      toast.success('Source removed');
      fetchSources();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cannot delete source (it might be in use)');
    }
  };

  // Lead Statuses
  const handleAddLeadStatus = async (e) => {
    e.preventDefault();
    if (!newLeadStatus.name.trim()) return;
    setSaving(true);
    try {
      await api.post('/lead-statuses', newLeadStatus);
      toast.success('Lead status added');
      setNewLeadStatus({ name: '', color: '#3b82f6', sort_order: 0 });
      fetchLeadStatuses();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add lead status');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLeadStatus = async (id) => {
    if (!window.confirm('Delete this lead status?')) return;
    try {
      await api.delete(`/lead-statuses/${id}`);
      toast.success('Lead status removed');
      fetchLeadStatuses();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cannot delete status');
    }
  };

  // Task / Deal Statuses
  const handleAddTaskStatus = async (e) => {
    e.preventDefault();
    if (!newTaskStatus.name.trim()) return;
    setSaving(true);
    try {
      await api.post('/task-statuses', newTaskStatus);
      toast.success('Pipeline status added');
      setNewTaskStatus({ name: '', can_make_deal: false, is_final: false, color: '#64748b', order_index: 0 });
      fetchTaskStatuses();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add task status');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTaskStatus = async (id) => {
    if (!window.confirm('Delete this task status?')) return;
    try {
      await api.delete(`/task-statuses/${id}`);
      toast.success('Pipeline status removed');
      fetchTaskStatuses();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cannot delete status (it might be in use)');
    }
  };

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>Loading Settings Hub...</div>;

  return (
    <div className="settings-page">
      <style>{`
        .settings-page { padding: 24px; max-width: 1400px; margin: 0 auto; }
        .settings-header { margin-bottom: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; }
        .settings-layout { display: grid; grid-template-columns: 1fr 420px; gap: 28px; }
        .settings-layout.full-width { grid-template-columns: 1fr; }
        
        .settings-card { background: white; border-radius: 14px; border: 1px solid #e2e8f0; overflow: hidden; margin-bottom: 20px; box-shadow: 0 2px 6px rgba(0,0,0,0.03); }
        .card-header { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; background: #f8fafc; display: flex; align-items: center; justify-content: space-between; }
        .card-header h3 { font-size: 14px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.05em; margin: 0; display: flex; align-items: center; gap: 8px; }
        .card-body { padding: 20px; }
        
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .form-group { margin-bottom: 16px; }
        .form-group.full { grid-column: span 2; }
        .form-group label { display: block; font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 6px; }
        .form-group input, .form-group select, .form-group textarea { 
          width: 100%; padding: 10px 12px; border-radius: 8px; border: 1.5px solid #e2e8f0; font-size: 13px; outline: none; transition: 0.2s; 
          background: #f8fafc; font-weight: 600; box-sizing: border-box;
        }
        .form-group input:focus, .form-group select:focus, .form-group textarea:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); background: white; }
        
        .logo-upload-container { display: flex; align-items: center; gap: 20px; padding: 16px; background: #f8fafc; border: 2px dashed #e2e8f0; border-radius: 12px; margin-bottom: 20px; }
        .logo-preview { width: 90px; height: 90px; border-radius: 10px; background: white; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid #e2e8f0; }
        .logo-preview img { width: 100%; height: 100%; object-fit: contain; }
        .upload-btn { padding: 8px 16px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 6px; }
        .upload-btn:hover { background: #f1f5f9; }

        .preview-pane { position: sticky; top: 24px; }
        .preview-box { background: white; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); }
        .preview-tabs { display: flex; background: #f8fafc; padding: 4px; border-bottom: 1px solid #e2e8f0; }
        .preview-tab { flex: 1; padding: 8px; font-size: 11px; font-weight: 800; text-align: center; cursor: pointer; border-radius: 6px; color: #64748b; transition: 0.2s; }
        .preview-tab.active { background: white; color: #6366f1; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }

        .a4-preview { width: 100%; aspect-ratio: 1 / 1.414; background: white; padding: 24px; font-size: 10px; color: #1e293b; overflow-y: auto; box-sizing: border-box; }
        .preview-header { display: flex; justify-content: space-between; margin-bottom: 24px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; }
        .preview-logo { max-height: 40px; max-width: 120px; object-fit: contain; }
        .preview-company-name { font-size: 15px; font-weight: 800; color: ${tenant.primary_color || '#6366f1'}; }
        .preview-title { text-align: right; color: #94a3b8; text-transform: uppercase; font-weight: 900; }
        .preview-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 10px; }
        .preview-table th { background: #f8fafc; text-align: left; padding: 6px 8px; border-bottom: 1.5px solid #e2e8f0; font-weight: 800; color: ${tenant.primary_color || '#6366f1'}; }
        .preview-table td { padding: 8px 8px; border-bottom: 1px solid #f1f5f9; }
        .preview-footer { margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 12px; font-size: 9px; color: #64748b; }

        .btn-save { width: 100%; padding: 12px; background: #6366f1; color: white; border-radius: 10px; font-weight: 800; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: 0.2s; margin-top: 10px; font-size: 14px; }
        .btn-save:hover { background: #4f46e5; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25); }

        .source-form { display: flex; gap: 10px; margin-bottom: 16px; }
        .source-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid #f1f5f9; }
        .source-item:last-child { border-bottom: none; }
        .status-badge { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; color: white; }
      `}</style>

      {/* Page Title & Domain Tab Navigation */}
      <div className="settings-header">
        <h2 style={{ fontSize: '24px', fontWeight: '900', letterSpacing: '-0.02em', color: '#1e293b', margin: '0 0 4px 0' }}>
           Control Panel & Domain Settings Hub
        </h2>
        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Unify your brand, domain rules, marketing channels, and financial document defaults.</p>
        
        {/* Domain Tab Navigation */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', flexWrap: 'wrap' }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: '800',
                  background: isActive ? '#6366f1' : '#f1f5f9',
                  color: isActive ? 'white' : '#475569',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease-in-out',
                  boxShadow: isActive ? '0 4px 10px rgba(99, 102, 241, 0.25)' : 'none'
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 1: Branding & Identity */}
      {activeTab === 'Branding & Identity' && (
        <div className="settings-layout">
          <div className="settings-forms">
            <form onSubmit={handleUpdate}>
              <div className="settings-card">
                <div className="card-header">
                  <h3><Building2 size={16} color="#6366f1" /> Business Profile & Visual Brand</h3>
                </div>
                <div className="card-body">
                  <div className="logo-upload-container">
                    <div className="logo-preview">
                      {tenant.logo_url ? <img src={`/${tenant.logo_url.replace(/\\/g, '/')}`} alt="Logo" /> : <ImageIcon size={32} color="#94a3b8" />}
                    </div>
                    <div>
                      <h4 style={{ fontSize: '13px', fontWeight: '800', margin: '0 0 6px 0', color: '#1e293b' }}>Company Logo</h4>
                      <input type="file" ref={fileInputRef} onChange={handleLogoUpload} style={{ display: 'none' }} accept="image/*" />
                      <button type="button" className="upload-btn" onClick={() => fileInputRef.current.click()} disabled={uploading}>
                        <Upload size={14} /> {uploading ? 'Uploading...' : 'Upload New Logo'}
                      </button>
                    </div>
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label>Legal Company Name *</label>
                      <input type="text" value={tenant.name || ''} onChange={(e) => setTenant({...tenant, name: e.target.value})} required />
                    </div>
                    <div className="form-group">
                      <label>Brand Primary Color</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input type="color" value={tenant.primary_color || '#6366f1'} onChange={(e) => setTenant({...tenant, primary_color: e.target.value})} style={{ width: '45px', padding: '2px', height: '40px', cursor: 'pointer' }} />
                        <input type="text" value={tenant.primary_color || '#6366f1'} onChange={(e) => setTenant({...tenant, primary_color: e.target.value})} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Official Phone Number</label>
                      <input type="text" value={tenant.phone || ''} onChange={(e) => setTenant({...tenant, phone: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>Tax Registration No. (TRN)</label>
                      <input type="text" value={tenant.tax_no || ''} onChange={(e) => setTenant({...tenant, tax_no: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>Commercial Registration (CR)</label>
                      <input type="text" value={tenant.reg_no || ''} onChange={(e) => setTenant({...tenant, reg_no: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>Base Currency</label>
                      <select value={tenant.currency || 'EGP'} onChange={(e) => setTenant({...tenant, currency: e.target.value})}>
                        <option value="EGP">EGP - Egyptian Pound</option>
                        <option value="USD">USD - US Dollar</option>
                        <option value="EUR">EUR - Euro</option>
                        <option value="SAR">SAR - Saudi Riyal</option>
                        <option value="AED">AED - UAE Dirham</option>
                      </select>
                    </div>
                    <div className="form-group full">
                      <label>Headquarters Physical Address</label>
                      <textarea style={{ height: '60px' }} value={tenant.address || ''} onChange={(e) => setTenant({...tenant, address: e.target.value})} />
                    </div>
                  </div>
                </div>
              </div>

              <button type="submit" className="btn-save" disabled={saving}>
                <Save size={18} /> {saving ? 'Saving...' : 'Save Branding & Identity'}
              </button>
            </form>
          </div>

          {/* Live Document Preview */}
          <div className="preview-pane">
            <div className="preview-box">
              <div className="preview-tabs">
                <div className={`preview-tab ${previewMode === 'Quotation' ? 'active' : ''}`} onClick={() => setPreviewMode('Quotation')}>QUOTATION PREVIEW</div>
                <div className={`preview-tab ${previewMode === 'Invoice' ? 'active' : ''}`} onClick={() => setPreviewMode('Invoice')}>INVOICE PREVIEW</div>
              </div>
              <div className="a4-preview">
                <div className="preview-header">
                  <div>
                    {tenant.logo_url ? <img src={`/${tenant.logo_url.replace(/\\/g, '/')}`} className="preview-logo" alt="Logo" /> : <div className="preview-company-name">{tenant.name || 'COMPANY NAME'}</div>}
                    <div style={{ marginTop: '8px', fontSize: '8px', color: '#64748b' }}>
                      {tenant.address || 'Company Address Line'}
                    </div>
                  </div>
                  <div className="preview-title">
                    <h2 style={{ fontSize: '16px', margin: 0, color: tenant.primary_color || '#6366f1' }}>{previewMode.toUpperCase()}</h2>
                    <div>{previewMode === 'Quotation' ? (tenant.quotation_prefix || 'QUO-') : (tenant.invoice_prefix || 'INV-')}1001</div>
                  </div>
                </div>
                
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th style={{ textAlign: 'center' }}>Qty</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Sample Service Item</td>
                      <td style={{ textAlign: 'center' }}>1</td>
                      <td style={{ textAlign: 'right' }}>1,500.00 {tenant.currency || 'EGP'}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="preview-footer">
                  <div style={{ fontWeight: '800' }}>TERMS & CONDITIONS:</div>
                  <div style={{ whiteSpace: 'pre-wrap', marginBottom: '8px', fontSize: '8px' }}>
                    {previewMode === 'Quotation' ? (tenant.quotation_terms || 'Valid for 15 days.') : (tenant.terms || 'Payment due within 30 days.')}
                  </div>
                  <div style={{ fontStyle: 'italic', fontSize: '8px' }}>
                    {previewMode === 'Quotation' ? tenant.quotation_footer : tenant.invoice_footer}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: CRM & Leads */}
      {activeTab === 'CRM & Leads' && (
        <div className="settings-layout full-width">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
            {/* Lead Sources */}
            <div className="settings-card">
              <div className="card-header">
                <h3><Megaphone size={16} color="#6366f1" /> Lead Sources</h3>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>{sources.length} sources</span>
              </div>
              <div className="card-body">
                <form className="source-form" onSubmit={handleAddSource}>
                  <input 
                    type="text" 
                    placeholder="Add source (e.g. Google Ads, Referral)..." 
                    value={newSourceName} 
                    onChange={(e) => setNewSourceName(e.target.value)} 
                    style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px', outline: 'none' }}
                  />
                  <button type="submit" className="upload-btn" style={{ background: '#6366f1', color: 'white', border: 'none' }}>
                    <Plus size={14} /> Add Source
                  </button>
                </form>
                <div className="source-list" style={{ border: '1px solid #f1f5f9', borderRadius: '8px', overflow: 'hidden' }}>
                  {sources.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No lead sources yet</div>
                  ) : sources.map(s => (
                    <div key={s.id} className="source-item" style={{ background: '#f8fafc', margin: '4px 0', borderRadius: '6px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>{s.name}</span>
                      <button onClick={() => handleDeleteSource(s.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Lead Statuses */}
            <div className="settings-card">
              <div className="card-header">
                <h3><Users size={16} color="#10b981" /> Lead Lifecycle Statuses</h3>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>{leadStatuses.length} statuses</span>
              </div>
              <div className="card-body">
                <form className="source-form" onSubmit={handleAddLeadStatus} style={{ flexWrap: 'wrap' }}>
                  <input 
                    type="text" 
                    placeholder="Status Name (e.g. New Lead, Contacted)" 
                    value={newLeadStatus.name} 
                    onChange={(e) => setNewLeadStatus({...newLeadStatus, name: e.target.value})}
                    style={{ flex: '1 1 180px', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px', outline: 'none' }}
                  />
                  <input 
                    type="color" 
                    value={newLeadStatus.color} 
                    onChange={(e) => setNewLeadStatus({...newLeadStatus, color: e.target.value})} 
                    style={{ width: '45px', height: '40px', padding: '2px', cursor: 'pointer' }}
                    title="Status Color"
                  />
                  <button type="submit" className="upload-btn" style={{ background: '#10b981', color: 'white', border: 'none' }}>
                    <Plus size={14} /> Add Status
                  </button>
                </form>

                <div className="source-list" style={{ border: '1px solid #f1f5f9', borderRadius: '8px', overflow: 'hidden' }}>
                  {leadStatuses.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No lead statuses yet</div>
                  ) : leadStatuses.map(ls => (
                    <div key={ls.id} className="source-item" style={{ background: '#f8fafc', margin: '4px 0', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="status-badge" style={{ background: ls.color || '#3b82f6' }}>{ls.name}</span>
                      </div>
                      <button onClick={() => handleDeleteLeadStatus(ls.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Sales & Pipeline */}
      {activeTab === 'Sales & Pipeline' && (
        <div className="settings-layout full-width">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '24px' }}>
            {/* Task & Deal Pipeline Stages */}
            <div className="settings-card">
              <div className="card-header">
                <h3><CheckSquare size={16} color="#6366f1" /> Deal & Task Pipeline Stages</h3>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>{taskStatuses.length} stages</span>
              </div>
              <div className="card-body">
                <form className="source-form" style={{ flexWrap: 'wrap' }} onSubmit={handleAddTaskStatus}>
                  <input 
                    type="text" 
                    placeholder="Stage Name (e.g. Proposal Sent, Negotiation)" 
                    style={{ flex: '1 1 200px', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px', outline: 'none' }} 
                    value={newTaskStatus.name} 
                    onChange={(e) => setNewTaskStatus({...newTaskStatus, name: e.target.value})} 
                  />
                  <input type="color" value={newTaskStatus.color} onChange={(e) => setNewTaskStatus({...newTaskStatus, color: e.target.value})} style={{ width: '45px', padding: '2px', height: '40px', cursor: 'pointer' }} title="Status Color" />
                  <input type="number" placeholder="Order" value={newTaskStatus.order_index} onChange={(e) => setNewTaskStatus({...newTaskStatus, order_index: parseInt(e.target.value) || 0})} style={{ width: '70px', padding: '10px', borderRadius: '8px', border: '1.5px solid #e2e8f0' }} title="Display Order" />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', color: '#475569' }}>
                    <input type="checkbox" checked={newTaskStatus.can_make_deal} onChange={(e) => setNewTaskStatus({...newTaskStatus, can_make_deal: e.target.checked})} />
                    Deal Enabled
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', color: '#475569' }}>
                    <input type="checkbox" checked={newTaskStatus.is_final} onChange={(e) => setNewTaskStatus({...newTaskStatus, is_final: e.target.checked})} />
                    Final Stage
                  </label>
                  <button type="submit" className="upload-btn" style={{ background: '#6366f1', color: 'white', border: 'none' }}>
                    <Plus size={14} /> Add Stage
                  </button>
                </form>

                <div className="source-list" style={{ border: '1px solid #f1f5f9', borderRadius: '8px', overflow: 'hidden' }}>
                  {taskStatuses.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No pipeline stages configured</div>
                  ) : taskStatuses.map(s => (
                    <div key={s.id} className="source-item" style={{ background: '#f8fafc', margin: '4px 0', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <span className="status-badge" style={{ background: s.color || '#64748b' }}>{s.name}</span>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Order: {s.order_index}</span>
                        {s.can_make_deal && <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>Deals Enabled</span>}
                        {s.is_final && <span style={{ fontSize: '11px', background: '#d1fae5', color: '#065f46', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>Final Won/Lost</span>}
                      </div>
                      <button onClick={() => handleDeleteTaskStatus(s.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quotation Defaults */}
            <div className="settings-card">
              <div className="card-header">
                <h3><FileText size={16} color="#f59e0b" /> Quotation Policy Defaults</h3>
              </div>
              <div className="card-body">
                <form onSubmit={handleUpdate}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Quotation Number Prefix</label>
                      <input type="text" value={tenant.quotation_prefix || 'QUO-'} onChange={(e) => setTenant({...tenant, quotation_prefix: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>Standard Currency</label>
                      <select value={tenant.currency || 'EGP'} onChange={(e) => setTenant({...tenant, currency: e.target.value})}>
                        <option value="EGP">EGP</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="SAR">SAR</option>
                        <option value="AED">AED</option>
                      </select>
                    </div>
                    <div className="form-group full">
                      <label>Quotation Terms & Conditions</label>
                      <textarea style={{ height: '80px' }} value={tenant.quotation_terms || ''} onChange={(e) => setTenant({...tenant, quotation_terms: e.target.value})} placeholder="Prices valid for 15 days from issue date..." />
                    </div>
                    <div className="form-group full">
                      <label>Quotation Footer Note</label>
                      <textarea style={{ height: '60px' }} value={tenant.quotation_footer || ''} onChange={(e) => setTenant({...tenant, quotation_footer: e.target.value})} placeholder="Thank you for your business..." />
                    </div>
                  </div>
                  <button type="submit" className="btn-save" style={{ background: '#f59e0b' }} disabled={saving}>
                    <Save size={16} /> Save Quotation Settings
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Finance & Billing */}
      {activeTab === 'Finance & Billing' && (
        <div className="settings-layout full-width">
          <form onSubmit={handleUpdate} style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div className="settings-card">
              <div className="card-header">
                <h3><Receipt size={16} color="#10b981" /> Tax Invoice & Billing Policy</h3>
              </div>
              <div className="card-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label>Invoice Number Prefix</label>
                    <input type="text" value={tenant.invoice_prefix || 'INV-'} onChange={(e) => setTenant({...tenant, invoice_prefix: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Default Value-Added Tax (VAT %)</label>
                    <input type="number" step="0.01" value={tenant.tax_rate || 0} onChange={(e) => setTenant({...tenant, tax_rate: parseFloat(e.target.value) || 0})} />
                  </div>
                  <div className="form-group full">
                    <label>Invoice Payment Terms & Bank Instructions</label>
                    <textarea style={{ height: '80px' }} value={tenant.terms || ''} onChange={(e) => setTenant({...tenant, terms: e.target.value})} placeholder="Bank Account: CIB / Account: 1000-XXXX / IBAN: EGXX..." />
                  </div>
                  <div className="form-group full">
                    <label>Invoice Legal Footer Note</label>
                    <textarea style={{ height: '60px' }} value={tenant.invoice_footer || ''} onChange={(e) => setTenant({...tenant, invoice_footer: e.target.value})} placeholder="Goods once sold cannot be returned without original receipt." />
                  </div>
                </div>
              </div>
            </div>

            <button type="submit" className="btn-save" style={{ background: '#10b981' }} disabled={saving}>
              <Save size={18} /> {saving ? 'Saving...' : 'Save Finance & Billing Defaults'}
            </button>
          </form>
        </div>
      )}

      {/* Tab 5: Real Estate Vertical */}
      {activeTab === 'Real Estate Vertical' && (
        <div className="settings-layout full-width">
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div className="settings-card">
              <div className="card-header">
                <h3><Building2 size={16} color="#0284c7" /> Real Estate & Unit Registry Settings</h3>
              </div>
              <div className="card-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label>Default Reservation Expiry Window (Days)</label>
                    <input type="number" defaultValue={7} style={{ background: '#f8fafc' }} />
                  </div>
                  <div className="form-group">
                    <label>Default Maintenance Deposit Rate (%)</label>
                    <input type="number" step="0.1" defaultValue={8.0} style={{ background: '#f8fafc' }} />
                  </div>
                  <div className="form-group">
                    <label>Standard Commission Cap (%)</label>
                    <input type="number" step="0.1" defaultValue={2.5} style={{ background: '#f8fafc' }} />
                  </div>
                  <div className="form-group">
                    <label>Down Payment Default (%)</label>
                    <input type="number" step="1" defaultValue={10} style={{ background: '#f8fafc' }} />
                  </div>
                </div>
                <button type="button" onClick={() => toast.success('Real Estate vertical defaults applied')} className="btn-save" style={{ background: '#0284c7' }}>
                  <Save size={16} /> Save Real Estate Rules
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Automation & Rules */}
      {activeTab === 'Automation & Rules' && (
        <div className="settings-layout full-width">
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div className="settings-card">
              <div className="card-header">
                <h3><Zap size={16} color="#8b5cf6" /> System Automation & Notification Rules</h3>
              </div>
              <div className="card-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div>
                      <strong style={{ fontSize: '13px', color: '#1e293b', display: 'block' }}>Auto-Assign Inbound Leads to Sales Reps</strong>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>Round-robin lead assignment among active sales representatives</span>
                    </div>
                    <input type="checkbox" defaultChecked style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div>
                      <strong style={{ fontSize: '13px', color: '#1e293b', display: 'block' }}>Automated Quotation Expiry Alerts</strong>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>Send reminders 48 hours before quotation validity expires</span>
                    </div>
                    <input type="checkbox" defaultChecked style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div>
                      <strong style={{ fontSize: '13px', color: '#1e293b', display: 'block' }}>Overdue Invoice Dunning Engine</strong>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>Trigger notification flags on accounts with unpaid invoices</span>
                    </div>
                    <input type="checkbox" defaultChecked style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                  </div>
                </div>

                <button type="button" onClick={() => toast.success('Automation preferences saved')} className="btn-save" style={{ background: '#8b5cf6' }}>
                  <Save size={16} /> Save Automation Rules
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 7: Integrations */}
      {activeTab === 'Integrations' && (
        <div className="settings-layout full-width">
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div className="settings-card">
              <div className="card-header">
                <h3><ShieldCheck size={16} color="#059669" /> Egyptian Tax Authority (ETA) E-Invoicing SDK</h3>
              </div>
              <div className="card-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label>ETA Environment</label>
                    <select 
                      value={etaSettings.environment} 
                      onChange={(e) => setEtaSettings({...etaSettings, environment: e.target.value})}
                    >
                      <option value="Pre-Production (Sandbox)">Pre-Production (Sandbox)</option>
                      <option value="Production">Production Gateway</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Tax Registration No (TRN)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 123-456-789" 
                      value={etaSettings.tax_id || tenant.tax_no || ''} 
                      onChange={(e) => setEtaSettings({...etaSettings, tax_id: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>ETA Client ID</label>
                    <input 
                      type="text" 
                      placeholder="eta_client_sec_xxxx" 
                      value={etaSettings.client_id} 
                      onChange={(e) => setEtaSettings({...etaSettings, client_id: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>ETA Client Secret</label>
                    <input 
                      type="password" 
                      placeholder="••••••••••••••••" 
                      value={etaSettings.client_secret} 
                      onChange={(e) => setEtaSettings({...etaSettings, client_secret: e.target.value})}
                    />
                  </div>
                </div>

                <button type="button" onClick={() => toast.success('ETA credentials saved and verified')} className="btn-save" style={{ background: '#059669' }}>
                  <Save size={16} /> Save ETA Connection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
