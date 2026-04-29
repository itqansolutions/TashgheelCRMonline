import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { 
  Building2, Image as ImageIcon, Globe, Receipt, 
  MapPin, Phone, Hash, FileText, Save, Eye, Upload, 
  Plus, Trash2, Edit2, X, Megaphone, Settings as AdminSettingsIcon, CheckSquare
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Settings = () => {
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  
  const [tenant, setTenant] = useState({
    name: '', address: '', phone: '', logo_url: '',
    tax_no: '', reg_no: '', currency: 'EGP',
    tax_rate: 0, invoice_prefix: 'INV-',
    invoice_footer: '', terms: '',
    quotation_prefix: 'QUO-', quotation_footer: '', quotation_terms: '',
    primary_color: '#f59e0b'
  });
  
  const [sources, setSources] = useState([]);
  const [taskStatuses, setTaskStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState({ name: '', can_make_deal: false, is_final: false, color: '#64748b', order_index: 0 });
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    fetchTenantDetails();
    fetchSources();
    fetchTaskStatuses();
  }, []);

  const fetchTenantDetails = async () => {
    try {
      const tenantRes = await api.get(`/tenants/my`);
      const data = tenantRes.data.data;
      // Normalize null values to empty strings for controlled inputs
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
      toast.error('Failed to load lead sources');
    }
  };

  const fetchTaskStatuses = async () => {
    try {
      const res = await api.get('/task-statuses');
      setTaskStatuses(res.data?.data || []);
    } catch (err) {
      toast.error('Failed to load task statuses');
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!user?.tenant_id) {
      toast.error('Session expired or invalid tenant context');
      return;
    }
    setSaving(true);
    try {
      console.log('SAVING SETTINGS:', tenant);
      const res = await api.put(`/tenants/${user.tenant_id}`, tenant);
      if (res.data.status === 'success') {
        toast.success('Settings updated successfully');
        // Refresh local state with server response
        setTenant(res.data.data);
      }
    } catch (err) {
      console.error('SAVE ERROR:', err);
      toast.error(err.response?.data?.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const [previewMode, setPreviewMode] = useState('Quotation');

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
      console.log('UPLOADING LOGO FOR:', user.tenant_id);
      const res = await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const filePath = res.data.data.file_path;
      console.log('UPLOAD SUCCESS:', filePath);
      setTenant({ ...tenant, logo_url: filePath });
      toast.success('Logo uploaded! Save settings to apply.');
    } catch (err) {
      console.error('UPLOAD ERROR:', err);
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleAddSource = async (e) => {
    e.preventDefault();
    if (!newSourceName) return;
    setSaving(true);
    try {
      await api.post('/lead-sources', { name: newSourceName });
      toast.success('Lead source added');
      setNewSourceName('');
      fetchSources();
    } catch (err) {
      toast.error('Failed to add source');
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
      toast.error('Cannot delete source (it might be in use)');
    }
  };

  const handleAddTaskStatus = async (e) => {
    e.preventDefault();
    if (!newTaskStatus.name) return;
    setSaving(true);
    try {
      await api.post('/task-statuses', newTaskStatus);
      toast.success('Task status added');
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
      toast.success('Task status removed');
      fetchTaskStatuses();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cannot delete status (it might be in use)');
    }
  };

  if (loading) return <div className="loading-state">Loading Settings Hub...</div>;

  return (
    <div className="settings-page">
      <style>{`
        .settings-page { padding: 24px; max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: 1fr 450px; gap: 32px; }
        .settings-header { grid-column: span 2; margin-bottom: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; }
        .settings-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .card-header { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; background: #fbfcfd; display: flex; align-items: center; gap: 10px; }
        .card-header h3 { font-size: 14px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.05em; }
        .card-body { padding: 20px; }
        
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .form-group { margin-bottom: 16px; }
        .form-group.full { grid-column: span 2; }
        .form-group label { display: block; font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 6px; }
        .form-group input, .form-group select, .form-group textarea { 
          width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 14px; outline: none; transition: 0.2s; 
          background: #f8fafc;
        }
        .form-group input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); background: white; }
        
        .logo-upload-container { display: flex; align-items: center; gap: 20px; padding: 16px; background: #f8fafc; border: 2px dashed #e2e8f0; border-radius: 12px; margin-bottom: 20px; }
        .logo-preview { width: 100px; height: 100px; border-radius: 8px; background: white; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid #e2e8f0; }
        .logo-preview img { width: 100%; height: 100%; object-fit: contain; }
        .upload-btn { padding: 8px 16px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 6px; }
        .upload-btn:hover { background: #f1f5f9; }

        .preview-pane { position: sticky; top: 24px; }
        .preview-box { background: white; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
        .preview-tabs { display: flex; background: #f8fafc; padding: 4px; border-bottom: 1px solid #e2e8f0; }
        .preview-tab { flex: 1; padding: 8px; font-size: 11px; font-weight: 800; text-align: center; cursor: pointer; border-radius: 6px; color: #64748b; transition: 0.2s; }
        .preview-tab.active { background: white; color: #6366f1; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }

        .a4-preview { width: 100%; aspect-ratio: 1 / 1.414; background: white; padding: 30px; font-size: 10px; color: #1e293b; overflow-y: auto; }
        .preview-header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 1px solid #f1f5f9; padding-bottom: 15px; }
        .preview-logo { max-height: 40px; max-width: 120px; object-fit: contain; }
        .preview-company-name { font-size: 16px; font-weight: 800; color: ${tenant.primary_color || '#6366f1'}; }
        .preview-title { text-align: right; color: #94a3b8; text-transform: uppercase; font-weight: 900; }
        .preview-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .preview-table th { background: #fbfcfd; text-align: left; padding: 8px; border-bottom: 2px solid #f1f5f9; font-weight: 800; color: ${tenant.primary_color || '#6366f1'}; }
        .preview-table td { padding: 12px 8px; border-bottom: 1px solid #f8fafc; }
        .preview-totals { margin-left: auto; width: 50%; border-top: 2px solid #1e293b; padding-top: 10px; }
        .preview-footer { margin-top: 40px; border-top: 1px solid #f1f5f9; padding-top: 15px; font-size: 9px; color: #64748b; }

        .btn-save { width: 100%; padding: 12px; background: #6366f1; color: white; border-radius: 10px; font-weight: 700; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: 0.2s; margin-top: 20px; }
        .btn-save:hover { background: #4f46e5; transform: translateY(-1px); box-shadow: 0 4px 6px rgba(99, 102, 241, 0.2); }

        .source-form { display: flex; gap: 10px; margin-bottom: 16px; }
        .source-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #f1f5f9; }
        .source-item:last-child { border-bottom: none; }
        .status-badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; color: white; margin-left: 8px; }
      `}</style>

      <div className="settings-header">
        <h2 style={{ fontSize: '24px', fontWeight: '900', letterSpacing: '-0.02em', color: '#1e293b' }}>
           Control Panel & Identity
        </h2>
        <p style={{ color: '#64748b', fontSize: '14px' }}>Unify your brand, marketing channels, and financial document defaults.</p>
      </div>

      <div className="settings-forms">
        <form onSubmit={handleUpdate}>
          <div className="settings-card">
            <div className="card-header">
              <Building2 size={16} color="#6366f1" />
              <h3>Business Profile</h3>
            </div>
            <div className="card-body">
              <div className="logo-upload-container">
                <div className="logo-preview">
                  {tenant.logo_url ? <img src={`/${tenant.logo_url.replace(/\\/g, '/')}`} alt="Logo" /> : <ImageIcon size={32} color="#94a3b8" />}
                </div>
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px' }}>Company Logo</h4>
                  <input type="file" ref={fileInputRef} onChange={handleLogoUpload} style={{ display: 'none' }} accept="image/*" />
                  <button type="button" className="upload-btn" onClick={() => fileInputRef.current.click()} disabled={uploading}>
                    <Upload size={14} /> {uploading ? 'Uploading...' : 'Change Logo'}
                  </button>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>Legal Company Name</label>
                  <input type="text" value={tenant.name || ''} onChange={(e) => setTenant({...tenant, name: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Brand Primary Color</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                     <input type="color" value={tenant.primary_color || '#f59e0b'} onChange={(e) => setTenant({...tenant, primary_color: e.target.value})} style={{ width: '45px', padding: '2px' }} />
                     <input type="text" value={tenant.primary_color || '#f59e0b'} onChange={(e) => setTenant({...tenant, primary_color: e.target.value})} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input type="text" value={tenant.phone || ''} onChange={(e) => setTenant({...tenant, phone: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Tax ID / Reg No.</label>
                  <input type="text" value={tenant.tax_no || ''} onChange={(e) => setTenant({...tenant, tax_no: e.target.value})} />
                </div>
                <div className="form-group full">
                  <label>Address</label>
                  <textarea style={{ height: '60px' }} value={tenant.address || ''} onChange={(e) => setTenant({...tenant, address: e.target.value})} />
                </div>
              </div>
            </div>
          </div>

          <div className="settings-card">
            <div className="card-header">
              <FileText size={16} color="#10b981" />
              <h3>Finance: Invoices & Payments</h3>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Invoice Prefix</label>
                  <input type="text" value={tenant.invoice_prefix || 'INV-'} onChange={(e) => setTenant({...tenant, invoice_prefix: e.target.value})} />
                </div>
                <div className="form-group">
                   <label>Default Tax Rate (%)</label>
                   <input type="number" step="0.01" value={tenant.tax_rate || 0} onChange={(e) => setTenant({...tenant, tax_rate: e.target.value})} />
                </div>
                <div className="form-group full">
                  <label>Invoice Terms & Conditions</label>
                  <textarea style={{ height: '80px' }} value={tenant.terms || ''} onChange={(e) => setTenant({...tenant, terms: e.target.value})} placeholder="Payment is due within..." />
                </div>
                <div className="form-group full">
                  <label>Invoice Footer</label>
                  <textarea style={{ height: '60px' }} value={tenant.invoice_footer || ''} onChange={(e) => setTenant({...tenant, invoice_footer: e.target.value})} />
                </div>
              </div>
            </div>
          </div>

          <div className="settings-card">
            <div className="card-header">
              <FileText size={16} color="#f59e0b" />
              <h3>Finance: Quotation Branding</h3>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Quotation Prefix</label>
                  <input type="text" value={tenant.quotation_prefix || 'QUO-'} onChange={(e) => setTenant({...tenant, quotation_prefix: e.target.value})} />
                </div>
                <div className="form-group">
                   <label>Default Currency</label>
                   <select value={tenant.currency || 'EGP'} onChange={(e) => setTenant({...tenant, currency: e.target.value})}>
                      <option value="EGP">EGP</option>
                      <option value="USD">USD</option>
                      <option value="SAR">SAR</option>
                      <option value="AED">AED</option>
                   </select>
                </div>
                <div className="form-group full">
                  <label>Quotation Terms & Conditions</label>
                  <textarea style={{ height: '80px' }} value={tenant.quotation_terms || ''} onChange={(e) => setTenant({...tenant, quotation_terms: e.target.value})} />
                </div>
                <div className="form-group full">
                  <label>Quotation Footer</label>
                  <textarea style={{ height: '60px' }} value={tenant.quotation_footer || ''} onChange={(e) => setTenant({...tenant, quotation_footer: e.target.value})} />
                </div>
              </div>
            </div>
          </div>

          <button type="submit" className="btn-save" disabled={saving}>
            <Save size={18} /> {saving ? 'Applying Settings...' : 'Save Global Branding'}
          </button>
        </form>

        <div className="settings-card" style={{ marginTop: '24px' }}>
          <div className="card-header">
            <Megaphone size={16} color="#6366f1" />
            <h3>Marketing Sources</h3>
          </div>
          <div className="card-body">
            <form className="source-form" onSubmit={handleAddSource}>
              <input type="text" placeholder="Add source (e.g. Facebook)..." value={newSourceName} onChange={(e) => setNewSourceName(e.target.value)} />
              <button type="submit" className="upload-btn" style={{ background: '#6366f1', color: 'white' }}>
                <Plus size={14} /> Add
              </button>
            </form>
            <div className="source-list">
              {sources.map(s => (
                <div key={s.id} className="source-item">
                  <span>{s.name}</span>
                  <button onClick={() => handleDeleteSource(s.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-card" style={{ marginTop: '24px' }}>
          <div className="card-header">
            <CheckSquare size={16} color="#10b981" />
            <h3>Task Pipeline Statuses</h3>
          </div>
          <div className="card-body">
            <form className="source-form" style={{ flexWrap: 'wrap' }} onSubmit={handleAddTaskStatus}>
              <input type="text" placeholder="Status Name (e.g. Qualified)" style={{ flex: '1 1 200px' }} value={newTaskStatus.name} onChange={(e) => setNewTaskStatus({...newTaskStatus, name: e.target.value})} />
              <input type="color" value={newTaskStatus.color} onChange={(e) => setNewTaskStatus({...newTaskStatus, color: e.target.value})} style={{ width: '45px', padding: '2px', height: '40px' }} title="Status Color" />
              <input type="number" placeholder="Order" value={newTaskStatus.order_index} onChange={(e) => setNewTaskStatus({...newTaskStatus, order_index: parseInt(e.target.value) || 0})} style={{ width: '80px' }} title="Display Order" />
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={newTaskStatus.can_make_deal} onChange={(e) => setNewTaskStatus({...newTaskStatus, can_make_deal: e.target.checked})} />
                Can Make Deal
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={newTaskStatus.is_final} onChange={(e) => setNewTaskStatus({...newTaskStatus, is_final: e.target.checked})} />
                Final Status
              </label>
              <button type="submit" className="upload-btn" style={{ background: '#10b981', color: 'white' }}>
                <Plus size={14} /> Add
              </button>
            </form>
            <div className="source-list">
              {taskStatuses.map(s => (
                <div key={s.id} className="source-item" style={{ background: '#f8fafc', margin: '4px 0', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className="status-badge" style={{ background: s.color || '#64748b' }}>{s.name}</span>
                    <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: '12px' }}>Order: {s.order_index}</span>
                    {s.can_make_deal && <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: '4px', marginLeft: '12px' }}>Deals Enabled</span>}
                    {s.is_final && <span style={{ fontSize: '11px', background: '#d1fae5', color: '#065f46', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px' }}>Final</span>}
                  </div>
                  <button onClick={() => handleDeleteTaskStatus(s.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="preview-pane">
         <div className="preview-box">
            <div className="preview-tabs">
               <div className={`preview-tab ${previewMode === 'Quotation' ? 'active' : ''}`} onClick={() => setPreviewMode('Quotation')}>QUOTATION</div>
               <div className={`preview-tab ${previewMode === 'Invoice' ? 'active' : ''}`} onClick={() => setPreviewMode('Invoice')}>INVOICE</div>
            </div>
            <div className="a4-preview">
               <div className="preview-header">
                  <div>
                     {tenant.logo_url ? <img src={`/${tenant.logo_url.replace(/\\/g, '/')}`} className="preview-logo" alt="Logo" /> : <div className="preview-company-name">{tenant.name || 'COMPANY NAME'}</div>}
                     <div style={{ marginTop: '10px', fontSize: '7px', color: '#64748b' }}>
                        {tenant.address || 'Address Placeholder'}
                     </div>
                  </div>
                  <div className="preview-title">
                     <h2 style={{ fontSize: '18px', margin: 0, color: tenant.primary_color }}>{previewMode.toUpperCase()}</h2>
                     <div>{previewMode === 'Quotation' ? (tenant.quotation_prefix || 'QUO-') : (tenant.invoice_prefix || 'INV-')}001</div>
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
                        <td>Sample Professional Service</td>
                        <td style={{ textAlign: 'center' }}>1</td>
                        <td style={{ textAlign: 'right' }}>1,000.00</td>
                     </tr>
                  </tbody>
               </table>

               <div className="preview-footer">
                  <div style={{ fontWeight: '800' }}>TERMS:</div>
                  <div style={{ whiteSpace: 'pre-wrap', marginBottom: '10px' }}>
                    {previewMode === 'Quotation' ? tenant.quotation_terms : tenant.terms}
                  </div>
                  <div style={{ fontStyle: 'italic' }}>
                    {previewMode === 'Quotation' ? tenant.quotation_footer : tenant.invoice_footer}
                  </div>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Settings;
