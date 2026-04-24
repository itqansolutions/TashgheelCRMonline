import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { 
  Building2, Image as ImageIcon, Globe, Receipt, 
  MapPin, Phone, Hash, FileText, Save, Eye, Upload, 
  Plus, Trash2, Edit2, X, Megaphone, Settings as AdminSettingsIcon 
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    fetchTenantDetails();
    fetchSources();
  }, []);

  const fetchTenantDetails = async () => {
    try {
      const tenantRes = await api.get(`/tenants/my`);
      setTenant(tenantRes.data.data);
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

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/tenants/${user.tenant_id}`, tenant);
      toast.success('Settings updated successfully');
    } catch (err) {
      toast.error('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('linked_type', 'Tenant');
    formData.append('linked_id', user.tenant_id);

    setUploading(true);
    try {
      const res = await api.post('/files/upload', formData);
      const filePath = res.data.data.file_path;
      setTenant({ ...tenant, logo_url: filePath });
      toast.success('Logo uploaded! Save settings to apply.');
    } catch (err) {
      toast.error('Upload failed');
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

  const handleUpdateSource = async (id) => {
    if (!editName) return;
    setSaving(true);
    try {
      await api.put(`/lead-sources/${id}`, { name: editName });
      toast.success('Source updated');
      setEditingId(null);
      fetchSources();
    } catch (err) {
      toast.error('Failed to update source');
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

  if (loading) return <div className="loading-state">Loading Settings Hub...</div>;

  return (
    <div className="settings-page">
      <style>{`
        .settings-page { padding: 24px; max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: 1fr 400px; gap: 32px; }
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
        .a4-preview { width: 100%; aspect-ratio: 1 / 1.414; background: white; padding: 30px; font-size: 10px; color: #1e293b; overflow-y: auto; }
        .preview-header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 1px solid #f1f5f9; padding-bottom: 15px; }
        .preview-logo { max-height: 40px; max-width: 120px; object-fit: contain; }
        .preview-company-name { font-size: 16px; font-weight: 800; color: ${tenant.primary_color || '#6366f1'}; }
        .preview-title { text-align: right; color: #94a3b8; text-transform: uppercase; font-weight: 900; }
        .preview-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .preview-table th { background: #fbfcfd; text-align: left; padding: 8px; border-bottom: 2px solid #f1f5f9; font-weight: 800; }
        .preview-table td { padding: 12px 8px; border-bottom: 1px solid #f8fafc; }
        .preview-totals { margin-left: auto; width: 50%; border-top: 2px solid #1e293b; padding-top: 10px; }
        .preview-footer { margin-top: 40px; border-top: 1px solid #f1f5f9; padding-top: 15px; font-size: 9px; color: #64748b; }

        .btn-save { width: 100%; padding: 12px; background: #6366f1; color: white; border-radius: 10px; font-weight: 700; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: 0.2s; margin-top: 20px; }
        .btn-save:hover { background: #4f46e5; transform: translateY(-1px); box-shadow: 0 4px 6px rgba(99, 102, 241, 0.2); }

        .source-form { display: flex; gap: 10px; margin-bottom: 16px; }
        .source-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #f1f5f9; }
        .source-item:last-child { border-bottom: none; }
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
              <FileText size={16} color="#f59e0b" />
              <h3>Finance & Branding Defaults</h3>
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
      </div>

      <div className="preview-pane">
         <div className="preview-box">
            <div className="card-header">
               <Eye size={16} /> <h3>Document Preview</h3>
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
                     <h2 style={{ fontSize: '18px', margin: 0, color: tenant.primary_color }}>QUOTATION</h2>
                     <div>{tenant.quotation_prefix || 'QUO-'}001</div>
                  </div>
               </div>
               <div style={{ height: '100px', border: '1px dashed #e2e8f0', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                  Table Body Example
               </div>
               <div className="preview-footer">
                  <div style={{ fontWeight: '800' }}>TERMS:</div>
                  <div style={{ whiteSpace: 'pre-wrap', marginBottom: '10px' }}>{tenant.quotation_terms || 'Standard Terms'}</div>
                  <div style={{ fontStyle: 'italic' }}>{tenant.quotation_footer || 'Footer Message'}</div>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Settings;
