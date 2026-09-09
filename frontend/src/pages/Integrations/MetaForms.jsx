import { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { 
  Share2, Plus, RefreshCw, Trash2, Edit2, ShieldCheck, Key, Settings, User,
  Calendar, ExternalLink, Users, Eye, Search, X, Download
} from 'lucide-react';
import IntegrationsSubNav from '../../components/Integrations/IntegrationsSubNav';
import { exportCustomersToExcel } from '../../utils/excelExport';

const MetaForms = () => {
  const [forms, setForms] = useState([]);
  const [leadSources, setLeadSources] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState(null);

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editingForm, setEditingForm] = useState(null);

  // Form Leads Modal State
  const [viewingFormLeads, setViewingFormLeads] = useState(null);
  const [formCustomers, setFormCustomers] = useState([]);
  const [loadingFormCustomers, setLoadingFormCustomers] = useState(false);
  const [leadsSearch, setLeadsSearch] = useState('');
  const [selectedLeadDetails, setSelectedLeadDetails] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    form_id: '',
    form_name: '',
    page_name: '',
    page_access_token: '',
    lead_source_id: '',
    assigned_to: ''
  });

  // Global Settings State
  const [metaSettings, setMetaSettings] = useState({
    meta_app_id: '',
    meta_app_secret: '',
    meta_webhook_verify_token: '',
    meta_default_access_token: '',
    has_default_access_token: false,
    has_app_secret: false
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [formsRes, sourcesRes, usersRes, settingsRes] = await Promise.all([
        api.get('/meta/forms'),
        api.get('/lead-sources'),
        api.get('/users'),
        api.get('/meta/settings')
      ]);

      setForms(formsRes.data.data || []);
      setLeadSources(sourcesRes.data.data || []);
      setUsers(usersRes.data.data || []);
      if (settingsRes.data.data) {
        setMetaSettings(prev => ({
          ...prev,
          ...settingsRes.data.data,
          meta_app_secret: '',
          meta_default_access_token: ''
        }));
      }
    } catch (err) {
      toast.error('Failed to load Meta integration data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenAddModal = (form = null) => {
    if (form) {
      setEditingForm(form);
      setFormData({
        form_id: form.form_id || '',
        form_name: form.form_name || '',
        page_name: form.page_name || '',
        page_access_token: '',
        lead_source_id: form.lead_source_id || '',
        assigned_to: form.assigned_to || ''
      });
    } else {
      setEditingForm(null);
      setFormData({
        form_id: '',
        form_name: '',
        page_name: '',
        page_access_token: '',
        lead_source_id: leadSources.length > 0 ? leadSources[0].id : '',
        assigned_to: ''
      });
    }
    setShowAddModal(true);
  };

  const handleSaveForm = async (e) => {
    e.preventDefault();
    if (!formData.form_id || !formData.form_name) {
      toast.error('Form ID and Form Name are required');
      return;
    }

    try {
      if (editingForm) {
        await api.put(`/meta/forms/${editingForm.id}`, formData);
        toast.success('Meta Form configuration updated');
      } else {
        await api.post('/meta/forms', formData);
        toast.success('Meta Form added successfully');
      }
      setShowAddModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save Meta Form');
    }
  };

  const handleDeleteForm = async (id, formName) => {
    if (!window.confirm(`Are you sure you want to remove "${formName}"? This will stop syncing leads for this Form ID.`)) {
      return;
    }

    try {
      await api.delete(`/meta/forms/${id}`);
      toast.success('Meta Form removed');
      setForms(forms.filter(f => f.id !== id));
    } catch (err) {
      toast.error('Failed to delete Meta Form');
    }
  };

  const handleSyncForm = async (id, formName) => {
    setSyncingId(id);
    try {
      const res = await api.post(`/meta/forms/${id}/sync`);
      const { created, updated, skipped } = res.data.data || {};
      toast.success(`Successfully synced "${formName}": ${created || 0} new leads imported, ${updated || 0} existing leads updated!`, { duration: 5000 });
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.message || 'Lead sync failed. Check your Access Token.';
      toast.error(msg, { duration: 6000 });
    } finally {
      setSyncingId(null);
    }
  };

  const handleOpenFormLeads = async (form) => {
    setViewingFormLeads(form);
    setLoadingFormCustomers(true);
    setLeadsSearch('');
    setSelectedLeadDetails(null);
    try {
      const res = await api.get(`/meta/forms/${form.id}/customers`);
      setFormCustomers(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load customers for this form');
    } finally {
      setLoadingFormCustomers(false);
    }
  };

  const handleSaveGlobalSettings = async (e) => {
    e.preventDefault();
    try {
      await api.post('/meta/settings', metaSettings);
      toast.success('Meta Integration settings saved');
      setMetaSettings(prev => ({
        ...prev,
        meta_app_secret: '',
        meta_default_access_token: ''
      }));
      setShowSettingsModal(false);
      fetchData();
    } catch (err) {
      toast.error('Failed to save settings');
    }
  };

  const modalStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '16px'
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px',
    fontSize: '14px', fontWeight: 600, outline: 'none', background: '#f8fafc', boxSizing: 'border-box'
  };

  return (
    <div>
      <IntegrationsSubNav />
      <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'linear-gradient(135deg, #1877F2, #0D65D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                <Share2 size={20} />
              </div>
              Meta Lead Ads Integration
            </h2>
            <p style={{ margin: '6px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              Connect Facebook & Instagram Lead Forms by Form ID to automatically collect customer leads into your CRM
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => setShowSettingsModal(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px',
                background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1',
                borderRadius: '10px', fontWeight: 800, cursor: 'pointer', fontSize: '13px'
              }}
            >
              <Settings size={16} /> Webhook & Organization Credentials
            </button>

            <button
              onClick={() => handleOpenAddModal()}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
                background: 'linear-gradient(135deg, #1877F2, #0066ee)', color: 'white', border: 'none',
                borderRadius: '10px', fontWeight: 800, cursor: 'pointer', fontSize: '13px',
                boxShadow: '0 4px 12px rgba(24, 119, 242, 0.25)'
              }}
            >
              <Plus size={16} /> Add Meta Form ID
            </button>
          </div>
        </div>

        {/* Info Banner / Webhook Notice */}
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '14px', padding: '18px 22px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <ShieldCheck size={26} style={{ color: '#2563eb', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1e40af' }}>
                  Two Ingestion Channels: Instant Webhooks & On-Demand Sync
                </h4>
                <span style={{ padding: '2px 8px', borderRadius: '12px', background: metaSettings.has_app_secret ? '#dcfce7' : '#fef3c7', color: metaSettings.has_app_secret ? '#15803d' : '#a16207', fontSize: '11px', fontWeight: 800 }}>
                  {metaSettings.has_app_secret ? '● Signature protected' : '● Webhook setup required'}
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#3b82f6', lineHeight: 1.4 }}>
                Add your <strong>Meta Form ID</strong> below. You can click <strong>&quot;Sync Leads&quot;</strong> anytime to fetch previous leads, or configure your Meta App Webhook to receive incoming leads in real-time.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowSettingsModal(true)}
            style={{
              padding: '8px 14px', background: 'white', color: '#1d4ed8', border: '1px solid #93c5fd',
              borderRadius: '8px', fontWeight: 800, cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <Key size={14} /> View Webhook URL
          </button>
        </div>

        {/* Forms Table */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflowX: 'auto', overflowY: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>
              Connected Meta Form IDs ({forms.length})
            </h3>
            <button
              onClick={fetchData}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px',
                fontSize: '12px', fontWeight: 700, color: '#64748b', cursor: 'pointer'
              }}
            >
              <RefreshCw size={12} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading Meta forms...</div>
          ) : forms.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Share2 size={26} />
              </div>
              <h4 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>No Meta Forms Configured Yet</h4>
              <p style={{ margin: '0 0 18px', color: '#64748b', fontSize: '13px' }}>
                Add your Meta Instant Form ID from your Meta Ads Manager to start collecting leads automatically.
              </p>
              <button
                onClick={() => handleOpenAddModal()}
                style={{
                  padding: '9px 18px', background: 'linear-gradient(135deg, #1877F2, #0066ee)', color: 'white',
                  border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', fontSize: '13px'
                }}
              >
                + Add Your First Form ID
              </button>
            </div>
          ) : (
            <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Form Name & ID</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Lead Source</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Assigned Rep</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Total Leads</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Last Sync</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {forms.map((form) => {
                  const isSyncing = syncingId === form.id;

                  return (
                    <tr key={form.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '14px' }}>
                          {form.form_name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: '#1877F2', background: '#eff6ff', padding: '2px 8px', borderRadius: '6px' }}>
                            ID: {form.form_id}
                          </span>
                          {form.page_name && (
                            <span style={{ fontSize: '11px', color: '#64748b' }}>
                              Page: {form.page_name}
                            </span>
                          )}
                        </div>
                      </td>

                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ padding: '4px 10px', borderRadius: '12px', background: '#f1f5f9', color: '#334155', fontSize: '12px', fontWeight: 700 }}>
                          {form.lead_source_name || 'Meta Lead Ads'}
                        </span>
                      </td>

                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                          <User size={14} style={{ color: '#94a3b8' }} />
                          {form.assigned_to_name || 'Unassigned'}
                        </div>
                      </td>

                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ padding: '3px 9px', borderRadius: '10px', background: '#dcfce7', color: '#15803d', fontSize: '12px', fontWeight: 800 }}>
                          {form.lead_count || 0} Leads
                        </span>
                      </td>

                      <td style={{ padding: '14px 18px', fontSize: '12px', color: '#64748b' }}>
                        {form.last_synced_at ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Calendar size={13} style={{ color: '#94a3b8' }} />
                            {new Date(form.last_synced_at).toLocaleString()}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Never synced</span>
                        )}
                      </td>

                      <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                          <button
                            onClick={() => handleOpenFormLeads(form)}
                            style={{
                              padding: '6px 12px', background: '#e0e7ff',
                              color: '#4338ca', border: 'none', borderRadius: '8px', fontWeight: 800,
                              cursor: 'pointer', fontSize: '12px',
                              display: 'inline-flex', alignItems: 'center', gap: '5px'
                            }}
                            title="View leads registered for this form"
                          >
                            <Users size={14} />
                            Leads ({form.lead_count || 0})
                          </button>

                          <button
                            disabled={isSyncing}
                            onClick={() => handleSyncForm(form.id, form.form_name)}
                            style={{
                              padding: '6px 12px', background: 'linear-gradient(135deg, #1877F2, #0066ee)',
                              color: 'white', border: 'none', borderRadius: '8px', fontWeight: 800,
                              cursor: isSyncing ? 'not-allowed' : 'pointer', fontSize: '12px',
                              display: 'inline-flex', alignItems: 'center', gap: '5px'
                            }}
                            title="Download leads directly from Meta"
                          >
                            <RefreshCw size={13} className={isSyncing ? 'spin' : ''} />
                            {isSyncing ? 'Syncing...' : 'Sync Leads'}
                          </button>

                          <button
                            onClick={() => handleOpenAddModal(form)}
                            style={{ padding: '6px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                            title="Edit form configuration"
                          >
                            <Edit2 size={14} />
                          </button>

                          <button
                            onClick={() => handleDeleteForm(form.id, form.form_name)}
                            style={{ padding: '6px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                            title="Delete form"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Add / Edit Form Modal */}
        {showAddModal && (
          <div style={modalStyle}>
            <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '520px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                  {editingForm ? 'Edit Meta Form Configuration' : 'Add Meta Lead Ads Form ID'}
                </h3>
                <button onClick={() => setShowAddModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
              </div>

              <form onSubmit={handleSaveForm} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Meta Form ID <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 102938475610293"
                    value={formData.form_id}
                    onChange={(e) => setFormData({ ...formData, form_id: e.target.value })}
                    style={inputStyle}
                  />
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                    Found in Meta Ads Manager or Facebook Page Lead Center under Instant Forms.
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Form Label / Campaign Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Real Estate Q3 Leads Campaign"
                    value={formData.form_name}
                    onChange={(e) => setFormData({ ...formData, form_name: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Assign Lead Source
                    </label>
                    <select
                      value={formData.lead_source_id}
                      onChange={(e) => setFormData({ ...formData, lead_source_id: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="">Default (Meta Ads)</option>
                      {leadSources.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Assign to Sales Rep
                    </label>
                    <select
                      value={formData.assigned_to}
                      onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="">Auto / Unassigned</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Page Access Token (Optional Per-Form Override)
                  </label>
                  <input
                    type="password"
                    placeholder="Leave empty to use global default token"
                    value={formData.page_access_token}
                    onChange={(e) => setFormData({ ...formData, page_access_token: e.target.value })}
                    style={inputStyle}
                  />
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                    Meta Page Access Token with <code>leads_retrieval</code> and <code>pages_manage_ads</code> permissions.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', color: '#475569', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #1877F2, #0066ee)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    {editingForm ? 'Save Changes' : 'Connect Form'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Global Webhook & Settings Modal */}
        {showSettingsModal && (
          <div style={modalStyle}>
            <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '560px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                  Meta Integration & Webhook Credentials for This Organization
                </h3>
                <button onClick={() => setShowSettingsModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
              </div>

              <form onSubmit={handleSaveGlobalSettings} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {/* Webhook Instructions Box */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ExternalLink size={14} style={{ color: '#1877F2' }} /> Meta Developer Webhook Setup:
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                    <strong>Callback URL:</strong>
                  </div>
                  <div style={{ background: '#e2e8f0', padding: '6px 10px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px', color: '#0f172a', wordBreak: 'break-all' }}>
                    {window.location.origin}/api/meta/webhook
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Webhook Verify Token
                  </label>
                  <input
                    type="text"
                    required
                    value={metaSettings.meta_webhook_verify_token}
                    onChange={(e) => setMetaSettings({ ...metaSettings, meta_webhook_verify_token: e.target.value })}
                    style={inputStyle}
                  />
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                    Use a unique token for this organization and copy it into Meta App Dashboard under <strong>Webhooks &rarr; Page &rarr; Verify Token</strong>.
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Organization Default Meta Page Access Token
                  </label>
                  <input
                    type="password"
                    placeholder={metaSettings.has_default_access_token ? '•••••••••••••••• (Token is set)' : 'EAAB...'}
                    value={metaSettings.meta_default_access_token}
                    onChange={(e) => setMetaSettings({ ...metaSettings, meta_default_access_token: e.target.value })}
                    style={inputStyle}
                  />
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                    Used only by this organization when a form-specific token is not provided.
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Meta App ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 123456789012"
                    value={metaSettings.meta_app_id}
                    onChange={(e) => setMetaSettings({ ...metaSettings, meta_app_id: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Meta App Secret {metaSettings.has_app_secret ? '(configured)' : '(required for real-time webhooks)'}
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder={metaSettings.has_app_secret ? '•••••••••••••••• (leave blank to keep current secret)' : 'Enter the Meta App Secret'}
                    value={metaSettings.meta_app_secret}
                    onChange={(e) => setMetaSettings({ ...metaSettings, meta_app_secret: e.target.value })}
                    style={inputStyle}
                  />
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                    Used to verify that webhook events genuinely come from Meta before leads are imported.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(false)}
                    style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', color: '#475569', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #1877F2, #0066ee)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    Save Credentials
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: View Leads For Specific Meta Form */}
        {viewingFormLeads && (
          <div style={modalStyle}>
            <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
              {/* Modal Header */}
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, #1877F2, #0D65D9)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                    <Users size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, color: 'white', fontSize: '17px', fontWeight: 800 }}>
                      Form Leads: {viewingFormLeads.form_name}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                      <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '12px' }}>
                        ID: {viewingFormLeads.form_id}
                      </span>
                      <span style={{ background: 'rgba(255,255,255,0.25)', color: 'white', padding: '1px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 800 }}>
                        {formCustomers.length} Leads
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { setViewingFormLeads(null); setSelectedLeadDetails(null); }}
                  style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Search Bar */}
              <div style={{ padding: '14px 24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    placeholder="Search form leads by name, phone, email, or notes..."
                    value={leadsSearch}
                    onChange={(e) => setLeadsSearch(e.target.value)}
                    style={{ ...inputStyle, paddingRight: '36px', background: 'white' }}
                  />
                </div>
                <button
                  onClick={() => exportCustomersToExcel(formCustomers, `meta_leads_${viewingFormLeads.form_name || viewingFormLeads.form_id}_${new Date().toISOString().slice(0,10)}`)}
                  style={{
                    padding: '9px 16px', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0',
                    borderRadius: '10px', fontWeight: 800, fontSize: '12px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap'
                  }}
                  title="Export leads to Excel"
                >
                  <Download size={14} /> Export Excel
                </button>
                <button
                  onClick={() => handleSyncForm(viewingFormLeads.id, viewingFormLeads.form_name).then(() => handleOpenFormLeads(viewingFormLeads))}
                  style={{
                    padding: '9px 16px', background: '#1877F2', color: 'white', border: 'none',
                    borderRadius: '10px', fontWeight: 800, fontSize: '12px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap'
                  }}
                >
                  <RefreshCw size={13} /> Refresh / Sync
                </button>
              </div>

              {/* Modal Body: Leads Table */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 20px 24px' }}>
                {loadingFormCustomers ? (
                  <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                    Loading leads...
                  </div>
                ) : formCustomers.length === 0 ? (
                  <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                    <Users size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <h4 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                      No leads retrieved for this form yet
                    </h4>
                    <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b' }}>
                      Ensure leads exist in Meta Ads Manager and click &quot;Sync Leads&quot;.
                    </p>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginTop: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Name</th>
                        <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Phone Number</th>
                        <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Company / Position</th>
                        <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Submitted Date</th>
                        <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', textAlign: 'center' }}>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formCustomers
                        .filter(c => {
                          const q = leadsSearch.toLowerCase().trim();
                          return !q || 
                            c.name?.toLowerCase().includes(q) || 
                            c.phone?.includes(q) || 
                            c.company_name?.toLowerCase().includes(q) ||
                            c.email?.toLowerCase().includes(q) ||
                            c.notes?.toLowerCase().includes(q);
                        })
                        .map((c, i) => (
                          <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafbfc' }}>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '13px' }}>{c.name}</div>
                              {c.email && <div style={{ fontSize: '11px', color: '#64748b' }}>{c.email}</div>}
                            </td>
                            <td style={{ padding: '12px 14px', fontWeight: 700, color: '#1e293b', fontSize: '13px', direction: 'ltr', textAlign: 'left' }}>
                              {c.phone ? (
                                <span style={{ color: '#0f766e', background: '#f0fdfa', padding: '2px 8px', borderRadius: '6px' }}>
                                  {c.phone}
                                </span>
                              ) : <span style={{ color: '#94a3b8' }}>—</span>}
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: '12px', color: '#475569' }}>
                              {c.company_name || '—'}
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: '12px', color: '#64748b' }}>
                              {new Date(c.created_at).toLocaleDateString('en-US')}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <button
                                onClick={() => setSelectedLeadDetails(c)}
                                style={{
                                  padding: '5px 10px', background: '#eff6ff', color: '#1877F2',
                                  border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 800,
                                  cursor: 'pointer'
                                }}
                              >
                                Form Responses
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}

                {/* Lead Form Responses Viewer Drawer / Modal */}
                {selectedLeadDetails && (
                  <div style={{ marginTop: '16px', padding: '16px', background: '#f0f9ff', borderRadius: '12px', border: '1.5px solid #bae6fd' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0369a1' }}>
                        📋 Form Responses: {selectedLeadDetails.name} ({selectedLeadDetails.phone || 'No phone'})
                      </h4>
                      <button
                        onClick={() => setSelectedLeadDetails(null)}
                        style={{ background: 'none', border: 'none', color: '#0369a1', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}
                      >
                        Close ✕
                      </button>
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '13px', color: '#334155', lineHeight: 1.6, background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      {selectedLeadDetails.notes || 'No additional notes available for this lead.'}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setViewingFormLeads(null); setSelectedLeadDetails(null); }}
                  style={{ padding: '9px 20px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default MetaForms;
