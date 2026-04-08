import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Settings as AdminSettingsIcon, Plus, Trash2, Edit2, Save, X, Megaphone } from 'lucide-react';

const Settings = () => {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    setLoading(true);
    try {
      const res = await api.get('/lead-sources');
      setSources(res.data.data);
    } catch (err) {
      toast.error('Failed to load lead sources');
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
        .settings-container { max-width: 800px; }
        .settings-card { background: white; border-radius: 12px; border: 1px solid var(--border); overflow: hidden; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .card-header { padding: 20px; border-bottom: 1px solid var(--border); background: #f8fafc; display: flex; align-items: center; gap: 12px; }
        .card-header h3 { font-size: 18px; font-weight: 700; color: var(--text-main); }
        .card-content { padding: 20px; }
        
        .source-form { display: flex; gap: 12px; margin-bottom: 24px; }
        .source-form input { flex: 1; padding: 10px; border: 1px solid var(--border); border-radius: 8px; outline: none; }
        .source-form input:focus { border-color: var(--primary); }
        .btn-add { background: var(--primary); color: white; padding: 0 20px; border-radius: 8px; font-weight: 600; display: flex; align-items: center; gap: 8px; }

        .source-list { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
        .source-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border); transition: 0.2s; }
        .source-item:last-child { border-bottom: none; }
        .source-item:hover { background: #f8fafc; }
        .source-actions { display: flex; gap: 8px; }
        .btn-icon { padding: 6px; border-radius: 6px; color: var(--text-muted); transition: 0.2s; }
        .btn-icon:hover { background: #f1f5f9; color: var(--primary); }
        .btn-delete:hover { color: #ef4444; background: #fef2f2; }
      `}</style>

      <div className="page-header" style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '28px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AdminSettingsIcon size={32} className="text-primary" />
          System Settings
        </h2>
        <p style={{ color: 'var(--text-muted)' }}>Configure global system defaults and modules.</p>
      </div>

      <div className="settings-container">
        {/* Lead Sources Section */}
        <div className="settings-card">
          <div className="card-header">
            <Megaphone size={20} style={{ color: 'var(--primary)' }} />
            <h3>Lead Sources</h3>
          </div>
          <div className="card-content">
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Define where your leads are coming from (e.g. Google, LinkedIn, Referrals) so you can track marketing performance.
            </p>

            <form className="source-form" onSubmit={handleAddSource}>
              <input 
                type="text" 
                placeholder="e.g. LinkedIn Campaign" 
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
              {sources.map(source => (
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
                      <button label="save source edit" onClick={() => handleUpdateSource(source.id)} style={{ color: 'var(--primary)' }}><Save size={18} /></button>
                      <button label="cancel source edit" onClick={() => setEditingId(null)}><X size={18} /></button>
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
              {sources.length === 0 && (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No lead sources defined yet.
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Placeholder for future sections */}
        <div className="settings-card" style={{ opacity: 0.6 }}>
          <div className="card-header">
            <AdminSettingsIcon size={20} />
            <h3>General Settings</h3>
          </div>
          <div className="card-content">
            <p style={{ fontSize: '13px', fontStyle: 'italic' }}>More administrative settings will be available in the next phase.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
