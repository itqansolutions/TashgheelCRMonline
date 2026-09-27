import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { 
  Share2, Plus, RefreshCw, Trash2, Edit2, ShieldCheck, Key, Settings, User,
  Calendar, ExternalLink, Users, Eye, Search, X, Download, MessageCircle,
  ShoppingBag, Sparkles, Tag, Check, HelpCircle
} from 'lucide-react';
import IntegrationsSubNav from '../../components/Integrations/IntegrationsSubNav';
import { exportCustomersToExcel } from '../../utils/excelExport';

const MetaForms = () => {
  const [forms, setForms] = useState([]);
  const [leadSources, setLeadSources] = useState([]);
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [whatsappTemplates, setWhatsappTemplates] = useState([]);
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
    assigned_to: '',
    branch_id: '',
    product_id: '',
    template_name: '',
    template_language: 'ar',
    variable_mapping: [{ index: 1, type: 'customer_name', fallback: '' }],
    custom_variables: {}
  });

  // Global Settings State
  const [metaSettings, setMetaSettings] = useState({
    meta_app_id: '',
    meta_app_secret: '',
    meta_webhook_verify_token: '',
    meta_default_access_token: '',
    has_default_access_token: false,
    has_app_secret: false,
    default_template_name: '',
    default_variable_mapping: [{ index: 1, type: 'customer_name', fallback: '' }]
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [formsRes, sourcesRes, usersRes, settingsRes, branchesRes, prodsRes, tmplRes] = await Promise.all([
        api.get('/meta/forms'),
        api.get('/lead-sources'),
        api.get('/users'),
        api.get('/meta/settings'),
        api.get('/branches').catch(() => ({ data: { data: [] } })),
        api.get('/products').catch(() => ({ data: { data: [] } })),
        api.get('/whatsapp/templates').catch(() => ({ data: { data: [] } }))
      ]);

      setForms(formsRes.data.data || []);
      setLeadSources(sourcesRes.data.data || []);
      setUsers(usersRes.data.data || []);
      setBranches(branchesRes.data.data || []);
      setProducts(prodsRes.data?.data || prodsRes.data || []);
      setWhatsappTemplates(tmplRes.data?.data || []);

      if (settingsRes.data?.data) {
        const sData = settingsRes.data.data;
        const defaultMap = Array.isArray(sData.default_variable_mapping) && sData.default_variable_mapping.length > 0
          ? sData.default_variable_mapping
          : [{ index: 1, type: 'customer_name', fallback: '' }];

        setMetaSettings(prev => ({
          ...prev,
          ...sData,
          meta_app_secret: '',
          meta_default_access_token: '',
          default_variable_mapping: defaultMap,
          default_template_name: sData.default_template_name || ''
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
      const varMap = Array.isArray(form.variable_mapping) && form.variable_mapping.length > 0
        ? form.variable_mapping
        : (metaSettings.default_variable_mapping && metaSettings.default_variable_mapping.length > 0
            ? metaSettings.default_variable_mapping
            : [{ index: 1, type: 'customer_name', fallback: '' }]);

      setFormData({
        form_id: form.form_id || '',
        form_name: form.form_name || '',
        page_name: form.page_name || '',
        page_access_token: '',
        lead_source_id: form.lead_source_id || '',
        assigned_to: form.assigned_to || '',
        branch_id: form.branch_id || '',
        product_id: form.product_id || '',
        template_name: form.template_name || '',
        template_language: form.template_language || 'ar',
        variable_mapping: varMap,
        custom_variables: form.custom_variables || {}
      });
    } else {
      setEditingForm(null);
      setFormData({
        form_id: '',
        form_name: '',
        page_name: '',
        page_access_token: '',
        lead_source_id: leadSources.length > 0 ? leadSources[0].id : '',
        assigned_to: '',
        branch_id: branches.length > 0 ? branches[0].id : '',
        product_id: '',
        template_name: metaSettings.default_template_name || '',
        template_language: 'ar',
        variable_mapping: metaSettings.default_variable_mapping?.length > 0
          ? metaSettings.default_variable_mapping
          : [
              { index: 1, type: 'customer_name', fallback: '' },
              { index: 2, type: 'product_name', fallback: '' }
            ],
        custom_variables: {}
      });
    }
    setShowAddModal(true);
  };

  // Variable Mapping Helpers for Form Modal
  const handleAddVariable = () => {
    setFormData(prev => {
      const current = Array.isArray(prev.variable_mapping) ? prev.variable_mapping : [];
      const nextIndex = current.length + 1;
      const defaultType = nextIndex === 2 ? 'product_name' : (nextIndex === 3 ? 'product_price' : (nextIndex === 4 ? 'employee_name' : 'custom_text'));
      return {
        ...prev,
        variable_mapping: [...current, { index: nextIndex, type: defaultType, fallback: '', custom_value: '' }]
      };
    });
  };

  const handleRemoveVariable = (idx) => {
    setFormData(prev => {
      const current = Array.isArray(prev.variable_mapping) ? prev.variable_mapping : [];
      const updated = current.filter((_, i) => i !== idx).map((v, i) => ({ ...v, index: i + 1 }));
      return { ...prev, variable_mapping: updated };
    });
  };

  const handleUpdateVariable = (idx, field, value) => {
    setFormData(prev => {
      const current = Array.isArray(prev.variable_mapping) ? [...prev.variable_mapping] : [];
      if (!current[idx]) return prev;
      current[idx] = { ...current[idx], [field]: value };
      return { ...prev, variable_mapping: current };
    });
  };

  // Default Variable Mapping Helpers for Settings Modal
  const handleAddDefaultVariable = () => {
    setMetaSettings(prev => {
      const current = Array.isArray(prev.default_variable_mapping) ? prev.default_variable_mapping : [];
      const nextIndex = current.length + 1;
      const defaultType = nextIndex === 2 ? 'product_name' : (nextIndex === 3 ? 'product_price' : 'custom_text');
      return {
        ...prev,
        default_variable_mapping: [...current, { index: nextIndex, type: defaultType, fallback: '', custom_value: '' }]
      };
    });
  };

  const handleRemoveDefaultVariable = (idx) => {
    setMetaSettings(prev => {
      const current = Array.isArray(prev.default_variable_mapping) ? prev.default_variable_mapping : [];
      const updated = current.filter((_, i) => i !== idx).map((v, i) => ({ ...v, index: i + 1 }));
      return { ...prev, default_variable_mapping: updated };
    });
  };

  const handleUpdateDefaultVariable = (idx, field, value) => {
    setMetaSettings(prev => {
      const current = Array.isArray(prev.default_variable_mapping) ? [...prev.default_variable_mapping] : [];
      if (!current[idx]) return prev;
      current[idx] = { ...current[idx], [field]: value };
      return { ...prev, default_variable_mapping: current };
    });
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
      const { created, updated, whatsapp_sent } = res.data.data || {};
      let msg = `Successfully synced "${formName}": ${created || 0} new leads imported, ${updated || 0} updated`;
      if (whatsapp_sent > 0) {
        msg += ` | 📱 Sent ${whatsapp_sent} WhatsApp welcome message${whatsapp_sent > 1 ? 's' : ''}`;
      }
      toast.success(msg, { duration: 6000 });
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

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link
              to="/integrations/whatsapp"
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px',
                background: 'linear-gradient(135deg, #25D366, #128C7E)', color: 'white',
                borderRadius: '10px', fontWeight: 800, textDecoration: 'none', fontSize: '13px',
                boxShadow: '0 4px 12px rgba(37, 211, 102, 0.25)'
              }}
            >
              <MessageCircle size={16} /> WhatsApp Auto-Reply
            </Link>

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
            <table style={{ width: '100%', minWidth: '1050px', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Form Name & ID</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Linked Product</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>WhatsApp Template</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Lead Source</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Target Branch</th>
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

                      {/* Linked Product Column */}
                      <td style={{ padding: '14px 18px' }}>
                        {form.product_name ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <ShoppingBag size={14} color="#4f46e5" /> {form.product_name}
                            </span>
                            {form.product_price && (
                              <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 700 }}>
                                💰 {Number(form.product_price).toLocaleString()} EGP
                                {form.product_sku ? ` • SKU: ${form.product_sku}` : ''}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>— No product</span>
                        )}
                      </td>

                      {/* WhatsApp Template & Variables Column */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{
                            fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
                            background: form.template_name ? '#eff6ff' : '#f8fafc',
                            color: form.template_name ? '#1d4ed8' : '#475569',
                            border: `1px solid ${form.template_name ? '#bfdbfe' : '#e2e8f0'}`,
                            display: 'inline-flex', alignItems: 'center', gap: '5px', width: 'fit-content'
                          }}>
                            <MessageCircle size={12} /> {form.template_name || 'Default Template'}
                          </span>
                          {Array.isArray(form.variable_mapping) && form.variable_mapping.length > 0 && (
                            <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                              {form.variable_mapping.map((v, i) => (
                                <span key={i} title={`Variable {${v.index || i + 1}}: ${v.type}`} style={{ fontSize: '10px', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '1px 5px', borderRadius: '4px', color: '#334155', fontWeight: 700, fontFamily: 'monospace' }}>
                                  {`{${v.index || i + 1}}`}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ padding: '4px 10px', borderRadius: '12px', background: '#f1f5f9', color: '#334155', fontSize: '12px', fontWeight: 700 }}>
                          {form.lead_source_name || 'Meta Lead Ads'}
                        </span>
                      </td>

                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ padding: '4px 10px', borderRadius: '12px', background: '#e0f2fe', color: '#0369a1', fontSize: '12px', fontWeight: 700 }}>
                          🏢 {form.branch_name || 'Main Branch'}
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
            <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                    {editingForm ? 'Edit Meta Form Configuration' : 'Add Meta Lead Ads Form ID'}
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                    ربط الإعلان بمنتج محدد وتخصيص متغيرات قالب واتساب تلقائياً
                  </p>
                </div>
                <button onClick={() => setShowAddModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
              </div>

              <form onSubmit={handleSaveForm} style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

                {/* 🛍️ Linked Product Section */}
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1.5px solid #e2e8f0' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#1e293b', marginBottom: '6px' }}>
                    🛍️ المنتج الترويجي المرتبط بالإعلان (Linked Product / Offer)
                  </label>
                  <select
                    value={formData.product_id || ''}
                    onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                    style={{ ...inputStyle, background: 'white' }}
                  >
                    <option value="">بدون منتج محدد (عام / Not Product Specific)</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.selling_price ? `— (${Number(p.selling_price).toLocaleString()} EGP)` : ''} {p.sku ? `[${p.sku}]` : ''}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', display: 'block', lineHeight: 1.4 }}>
                    💡 عند اختيار منتج، يمكنك استخدام متغيرات اسمه وسعره وكوده ({'{2}'}, {'{3}'}...) في قالب واتساب أدناه ليتم توجيه الإعلان للمنتج مباشرة.
                  </span>
                </div>

                {/* 💬 Template Overrides */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      💬 قالب واتساب المخصص للإعلان
                    </label>
                    <input
                      type="text"
                      placeholder={metaSettings.default_template_name || 'واتساب الافتراضي'}
                      value={formData.template_name || ''}
                      onChange={(e) => setFormData({ ...formData, template_name: e.target.value })}
                      style={inputStyle}
                      list="meta-templates-list"
                    />
                    <datalist id="meta-templates-list">
                      {whatsappTemplates.map(t => (
                        <option key={t.id || t.name} value={t.name}>{t.name} ({t.language})</option>
                      ))}
                    </datalist>
                    <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                      اتركه فارغاً لاستخدام القالب الافتراضي للمؤسسة.
                    </span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      🌐 لغة القالب (Language)
                    </label>
                    <select
                      value={formData.template_language || 'ar'}
                      onChange={(e) => setFormData({ ...formData, template_language: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="ar">العربية — Arabic (ar)</option>
                      <option value="ar_SA">العربية (السعودية) — (ar_SA)</option>
                      <option value="ar_EG">العربية (مصر) — (ar_EG)</option>
                      <option value="en_US">English (US) — (en_US)</option>
                      <option value="en">English — (en)</option>
                    </select>
                  </div>
                </div>

                {/* ⚡ Variable Mapping Builder for this form */}
                <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={16} color="#4f46e5" /> ربط متغيرات القالب (Template Variables Mapping)
                      </h4>
                      <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                        حدد دلالة كل متغير في نص القالب ({'{1}'}, {'{2}'}, {'{3}'}...) لملئه تلقائياً من السيستم.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddVariable}
                      style={{
                        padding: '6px 12px', background: '#eef2ff', color: '#4338ca',
                        border: '1px solid #c7d2fe', borderRadius: '8px', fontSize: '11px',
                        fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                      }}
                    >
                      <Plus size={13} /> إضافة متغير {'{' + (formData.variable_mapping.length + 1) + '}'}
                    </button>
                  </div>

                  {/* Variable Rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {formData.variable_mapping.map((v, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '13px', color: '#4f46e5', minWidth: '32px' }}>
                          {`{${idx + 1}}`}
                        </span>
                        <select
                          value={v.type}
                          onChange={(e) => handleUpdateVariable(idx, 'type', e.target.value)}
                          style={{ ...inputStyle, padding: '7px 10px', fontSize: '12px', flex: 1.2 }}
                        >
                          <option value="customer_name">👤 اسم العميل (Customer Name)</option>
                          <option value="product_name">🛍️ اسم المنتج المرتبط (Product Name)</option>
                          <option value="product_price">💰 سعر المنتج (Product Price)</option>
                          <option value="product_sku">🏷️ كود المنتج (Product SKU)</option>
                          <option value="product_description">📝 وصف المنتج (Product Description)</option>
                          <option value="employee_name">👔 اسم الموظف المسؤول (Assigned Rep)</option>
                          <option value="employee_phone">📞 هاتف الموظف (Rep Phone)</option>
                          <option value="employee_email">✉️ بريد الموظف (Rep Email)</option>
                          <option value="customer_phone">📱 هاتف العميل (Customer Phone)</option>
                          <option value="customer_company">🏢 شركة العميل (Customer Company)</option>
                          <option value="customer_city">📍 مدينة / عنوان العميل (Customer City)</option>
                          <option value="branch_name">🏢 اسم الفرع (Branch Name)</option>
                          <option value="form_name">📋 اسم النموذج الإعلاني (Form Name)</option>
                          <option value="campaign_name">📢 اسم الحملة الإعلانية (Campaign Name)</option>
                          <option value="custom_text">✏️ نص مخصص / كود خصم (Custom Text)</option>
                        </select>

                        {v.type === 'custom_text' ? (
                          <input
                            type="text"
                            placeholder="أدخل النص المخصص..."
                            value={v.custom_value || ''}
                            onChange={(e) => handleUpdateVariable(idx, 'custom_value', e.target.value)}
                            style={{ ...inputStyle, padding: '7px 10px', fontSize: '12px', flex: 1 }}
                          />
                        ) : (
                          <input
                            type="text"
                            placeholder="قيمة بديلة إذا لم تتوفر..."
                            value={v.fallback || ''}
                            onChange={(e) => handleUpdateVariable(idx, 'fallback', e.target.value)}
                            style={{ ...inputStyle, padding: '7px 10px', fontSize: '12px', flex: 1 }}
                            title="تُرسل في حال كانت القيمة الأساسية فارغة"
                          />
                        )}

                        {formData.variable_mapping.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveVariable(idx)}
                            style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer' }}
                            title="حذف المتغير"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Live Preview Box */}
                  <div style={{ marginTop: '10px', padding: '10px 12px', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0', fontSize: '11px', color: '#065f46', lineHeight: 1.5 }}>
                    <strong>معاينة محتوى المتغيرات عند الإرسال:</strong>
                    <div style={{ marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {formData.variable_mapping.map((v, i) => {
                        let sample = 'أحمد محمد';
                        if (v.type === 'product_name') sample = products.find(p => String(p.id) === String(formData.product_id))?.name || 'اسم المنتج';
                        else if (v.type === 'product_price') sample = `${products.find(p => String(p.id) === String(formData.product_id))?.selling_price || '500'} EGP`;
                        else if (v.type === 'product_sku') sample = products.find(p => String(p.id) === String(formData.product_id))?.sku || 'SKU-001';
                        else if (v.type === 'employee_name') sample = users.find(u => String(u.id) === String(formData.assigned_to))?.name || 'فريق المبيعات';
                        else if (v.type === 'employee_phone') sample = '01099887766';
                        else if (v.type === 'branch_name') sample = branches.find(b => String(b.id) === String(formData.branch_id))?.name || 'الفرع الرئيسي';
                        else if (v.type === 'custom_text') sample = v.custom_value || 'خصم 20%';
                        else if (v.type === 'customer_phone') sample = '01012345678';
                        else if (v.type === 'form_name') sample = formData.form_name || 'إعلان فيسبوك';
                        return (
                          <span key={i} style={{ background: 'white', padding: '2px 8px', borderRadius: '4px', border: '1px solid #bbf7d0', fontFamily: 'monospace' }}>
                            <strong>{`{${i + 1}}`}</strong>: {sample}
                          </span>
                        );
                      })}
                    </div>
                  </div>
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
                    🏢 Target Branch (Leads will be routed to this branch)
                  </label>
                  <select
                    value={formData.branch_id}
                    onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Default Branch / Headquarters</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                    Ensures leads synced from this form belong to the selected branch and organization.
                  </span>
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
            <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                    إعدادات Meta وربط المتغيرات الافتراضية
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                    بيانات الربط مع Meta Developers وضبط المتغيرات الافتراضية لقوالب واتساب
                  </p>
                </div>
                <button onClick={() => setShowSettingsModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
              </div>

              <form onSubmit={handleSaveGlobalSettings} style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {/* ⚡ Default Variable Mapping Section */}
                <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={16} color="#4f46e5" /> المتغيرات الافتراضية لقوالب واتساب (Default Variables)
                      </h4>
                      <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                        تُطبق تلقائياً على أي نموذج أو إعلان لا يحتوي على تخصيص يدوي للمتغيرات.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddDefaultVariable}
                      style={{
                        padding: '6px 12px', background: '#eef2ff', color: '#4338ca',
                        border: '1px solid #c7d2fe', borderRadius: '8px', fontSize: '11px',
                        fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                      }}
                    >
                      <Plus size={13} /> إضافة متغير {'{' + ((metaSettings.default_variable_mapping || []).length + 1) + '}'}
                    </button>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      اسم القالب الافتراضي في واتساب (Default Template Name)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. welcome_new_lead"
                      value={metaSettings.default_template_name || ''}
                      onChange={(e) => setMetaSettings({ ...metaSettings, default_template_name: e.target.value })}
                      style={{ ...inputStyle, background: 'white' }}
                    />
                  </div>

                  {/* Variable Rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(metaSettings.default_variable_mapping || []).map((v, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '13px', color: '#4f46e5', minWidth: '32px' }}>
                          {`{${idx + 1}}`}
                        </span>
                        <select
                          value={v.type}
                          onChange={(e) => handleUpdateDefaultVariable(idx, 'type', e.target.value)}
                          style={{ ...inputStyle, padding: '7px 10px', fontSize: '12px', flex: 1.2 }}
                        >
                          <option value="customer_name">👤 اسم العميل (Customer Name)</option>
                          <option value="product_name">🛍️ اسم المنتج المرتبط (Product Name)</option>
                          <option value="product_price">💰 سعر المنتج (Product Price)</option>
                          <option value="product_sku">🏷️ كود المنتج (Product SKU)</option>
                          <option value="employee_name">👔 اسم الموظف المسؤول (Assigned Rep)</option>
                          <option value="employee_phone">📞 هاتف الموظف (Rep Phone)</option>
                          <option value="customer_phone">📱 هاتف العميل (Customer Phone)</option>
                          <option value="customer_company">🏢 شركة العميل (Customer Company)</option>
                          <option value="branch_name">🏢 اسم الفرع (Branch Name)</option>
                          <option value="form_name">📋 اسم النموذج الإعلاني (Form Name)</option>
                          <option value="custom_text">✏️ نص مخصص (Custom Text)</option>
                        </select>

                        {v.type === 'custom_text' ? (
                          <input
                            type="text"
                            placeholder="أدخل النص..."
                            value={v.custom_value || ''}
                            onChange={(e) => handleUpdateDefaultVariable(idx, 'custom_value', e.target.value)}
                            style={{ ...inputStyle, padding: '7px 10px', fontSize: '12px', flex: 1 }}
                          />
                        ) : (
                          <input
                            type="text"
                            placeholder="قيمة بديلة..."
                            value={v.fallback || ''}
                            onChange={(e) => handleUpdateDefaultVariable(idx, 'fallback', e.target.value)}
                            style={{ ...inputStyle, padding: '7px 10px', fontSize: '12px', flex: 1 }}
                          />
                        )}

                        {(metaSettings.default_variable_mapping || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveDefaultVariable(idx)}
                            style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer' }}
                            title="حذف المتغير"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

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
                    Save Settings
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
