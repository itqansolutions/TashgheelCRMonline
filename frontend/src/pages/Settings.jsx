import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Settings as AdminSettingsIcon, Plus, Trash2, Edit2, Save, X, Megaphone, Building2, Image as ImageIcon, FileText, Upload } from 'lucide-react';

const Settings = () => {
  const navigate = useNavigate();
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  // Branding Settings
  const [branding, setBranding] = useState({
    company_name: '',
    company_logo: '',
    invoice_footer: '',
    invoice_terms: ''
  });

  useEffect(() => {
    fetchSources();
    fetchBranding();
  }, []);

  const fetchSources = async () => {
    try {
      const res = await api.get('/lead-sources');
      setSources(res.data?.data || []);
    } catch (err) {
      toast.error('Failed to load lead sources');
    }
  };

  const fetchBranding = async () => {
    try {
      const res = await api.get('/settings');
      if (res.data.status === 'success') {
        setBranding(prev => ({ ...prev, ...res.data.data }));
      }
    } catch (err) {
      toast.error('Failed to load branding settings');
    }
  };

  const handleSaveBranding = async () => {
    setLoading(true);
    try {
      await api.post('/settings', branding);
      toast.success('Branding settings saved');
    } catch (err) {
      toast.error('Failed to save branding');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('linked_type', 'branding');
    formData.append('linked_id', '0');

    setLoading(true);
    try {
      const res = await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      // Assuming the backend returns the file path
      setBranding({ ...branding, company_logo: res.data.data.file_path });
      toast.success('Logo uploaded');
    } catch (err) {
      toast.error('Logo upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSource = async (e) => {
    e.preventDefault();
    if (!newSourceName) return;
    setLoading(true);
    try {
      await api.post('/lead-sources', { name: newSourceName });
      toast.success('Lead source added');
      setNewSourceName('');
      fetchSources();
    } catch (err) {
      toast.error('Failed to add source');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSource = async (id) => {
    if (!editName) return;
    setLoading(true);
    try {
      await api.put(`/lead-sources/${id}`, { name: editName });
      toast.success('Source updated');
      setEditingId(null);
      fetchSources();
    } catch (err) {
      toast.error('Failed to update source');
    } finally {
      setLoading(false);
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

  return (
    <div className="settings-page">
      <style>{`
        .settings-container { display: grid; grid-template-columns: 1fr; gap: 24px; max-width: 1000px; }
        .settings-card { background: white; border-radius: 12px; border: 1px solid var(--border); overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .card-header { padding: 20px; border-bottom: 1px solid var(--border); background: #f8fafc; display: flex; align-items: center; gap: 12px; }
        .card-header h3 { font-size: 18px; font-weight: 700; color: var(--text-main); }
        .card-content { padding: 24px; }
        
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 8px; font-size: 14px; font-weight: 600; color: var(--text-main); }
        .form-group input, .form-group textarea { width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; transition: 0.2s; outline: none; }
        .form-group textarea { min-height: 100px; resize: vertical; }
        .form-group input:focus, .form-group textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }

        .logo-upload-container { display: flex; align-items: center; gap: 20px; padding: 16px; background: #f1f5f9; border-radius: 8px; }
        .logo-preview { width: 100px; height: 100px; background: white; border: 1px solid var(--border); border-radius: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .logo-preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .upload-btn-wrapper { position: relative; overflow: hidden; display: inline-block; cursor: pointer; }
        .upload-btn { background: white; color: var(--primary); border: 1px solid var(--primary); padding: 8px 16px; border-radius: 8px; font-weight: 600; display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .upload-btn-wrapper input[type=file] { position: absolute; left: 0; top: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }

        .source-form { display: flex; gap: 12px; margin-bottom: 24px; }
        .source-form input { flex: 1; padding: 10px; border: 1px solid var(--border); border-radius: 8px; outline: none; }
        .btn-add { background: var(--primary); color: white; padding: 0 20px; border-radius: 8px; font-weight: 600; display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .btn-save-branding { background: var(--success, #16a34a); color: white; padding: 12px 24px; border-radius: 8px; font-weight: 700; border: none; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: transform 0.2s; }
        .btn-save-branding:hover { transform: translateY(-1px); filter: brightness(1.1); }
        .btn-save-branding:disabled { opacity: 0.7; cursor: not-allowed; }

        .source-list { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
        .source-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border); }
        .source-item:last-child { border-bottom: none; }
        .btn-icon { padding: 6px; border-radius: 6px; color: var(--text-muted); transition: 0.2s; background: none; border: none; cursor: pointer; }
        .btn-icon:hover { background: #f1f5f9; color: var(--primary); }
      `}</style>

      <div className="page-header" style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '28px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AdminSettingsIcon size={32} className="text-primary" style={{ color: 'var(--primary)' }} />
          System Administration
        </h2>
        <p style={{ color: 'var(--text-muted)' }}>Configure global system defaults, branding, and billing modules.</p>
      </div>

      <div className="settings-container">
        {/* SaaS Company Link */}
        <div className="settings-card" onClick={() => navigate('/settings/company')} style={{ cursor: 'pointer', border: '1px solid #3b82f633', background: '#3b82f605', marginBottom: '24px' }}>
          <div className="card-header" style={{ borderBottom: 'none' }}>
            <Building2 size={24} style={{ color: '#3b82f6' }} />
            <div>
              <h3 style={{ margin: 0 }}>Company Workspace</h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontWeight: 'normal' }}>Identity, Plans & Multi-Tenant Branding</p>
            </div>
          </div>
        </div>
        {/* Company Branding Section */}
        <div className="settings-card">
          <div className="card-header">
            <Building2 size={20} style={{ color: 'var(--primary)' }} />
            <h3>Company Branding</h3>
          </div>
          <div className="card-content">
            <div className="form-group">
              <label>Global Company Name</label>
              <input 
                type="text" 
                placeholder="e.g. Tashgheel Solutions" 
                value={branding.company_name}
                onChange={(e) => setBranding({...branding, company_name: e.target.value})}
              />
            </div>

            <div className="form-group">
              <label>Company Logo</label>
              <div className="logo-upload-container">
                <div className="logo-preview">
                  {branding.company_logo ? (
                    <img src={`/${branding.company_logo}`} alt="Logo Preview" />
                  ) : (
                    <ImageIcon size={32} style={{ color: '#cbd5e1' }} />
                  )}
                </div>
                <div>
                  <div className="upload-btn-wrapper">
                    <button className="upload-btn">
                      <Upload size={18} />
                      Choose New Logo
                    </button>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} />
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                    Recommended: PNG or SVG with transparent background.
                  </p>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="form-group">
                <label>Invoice Footer Text</label>
                <textarea 
                  placeholder="Thank you for your business!" 
                  value={branding.invoice_footer}
                  onChange={(e) => setBranding({...branding, invoice_footer: e.target.value})}
                ></textarea>
              </div>
              <div className="form-group">
                <label>Invoice Terms & Conditions</label>
                <textarea 
                  placeholder="Payment is due within 15 days..." 
                  value={branding.invoice_terms}
                  onChange={(e) => setBranding({...branding, invoice_terms: e.target.value})}
                ></textarea>
              </div>
            </div>

            <button 
              className="btn-save-branding" 
              onClick={handleSaveBranding}
              disabled={loading}
            >
              <Save size={20} />
              {loading ? 'Saving...' : 'Save Branding Changes'}
            </button>
          </div>
        </div>

        {/* Lead Sources Section */}
        <div className="settings-card">
          <div className="card-header">
            <Megaphone size={20} style={{ color: 'var(--primary)' }} />
            <h3>Marketing: Lead Sources</h3>
          </div>
          <div className="card-content">
            <form className="source-form" onSubmit={handleAddSource}>
              <input 
                type="text" 
                placeholder="New marketing source..." 
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                disabled={loading}
              />
              <button label="add source control" type="submit" className="btn-add" disabled={loading || !newSourceName}>
                <Plus size={18} />
                Add Source
              </button>
            </form>

            <div className="source-list">
              {(sources || []).map(source => (
                <div key={source.id} className="source-item">
                  {editingId === source.id ? (
                    <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                      <input 
                        className="edit-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--primary)', borderRadius: '4px' }}
                      />
                      <button label="save source edit" onClick={() => handleUpdateSource(source.id)} style={{ color: 'var(--primary)', border: 'none', background: 'none' }}><Save size={18} /></button>
                      <button label="cancel source edit" onClick={() => setEditingId(null)} style={{ border: 'none', background: 'none' }}><X size={18} /></button>
                    </div>
                  ) : (
                    <>
                      <span style={{ fontWeight: '600' }}>{source.name}</span>
                      <div className="source-actions">
                        <button label="edit source button" className="btn-icon" onClick={() => { setEditingId(source.id); setEditName(source.name); }}>
                          <Edit2 size={16} />
                        </button>
                        <button label="delete source button" className="btn-icon btn-delete" onClick={() => handleDeleteSource(source.id)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
