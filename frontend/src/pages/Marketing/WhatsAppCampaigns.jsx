import React, { useState, useEffect, useMemo } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Send, Users, MessageSquare, Filter, Search, CheckSquare, Square,
  RefreshCw, CheckCircle2, XCircle, Clock, ChevronRight, Eye, AlertCircle,
  Sparkles, Layers, ShieldCheck, ArrowRight, ExternalLink, Globe
} from 'lucide-react';
import IntegrationsSubNav from '../../components/Integrations/IntegrationsSubNav';
import { useData } from '../../context/DataContext';

const WhatsAppCampaigns = () => {
  const { customers, fetchCustomers, customerClassifications, fetchCustomerClassifications } = useData();

  // Campaign creation state
  const [campaignName, setCampaignName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedLang, setSelectedLang] = useState('en');
  const [customParam, setCustomParam] = useState('');

  // Meta templates
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Audience filtering & selection
  const [searchQuery, setSearchQuery] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('all');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState(new Set());

  // Campaign execution
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // Campaign history
  const [campaigns, setCampaigns] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  // Details Modal
  const [viewingCampaign, setViewingCampaign] = useState(null);
  const [campaignDetails, setCampaignDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Initial load
  useEffect(() => {
    fetchCustomers();
    if (!customerClassifications || customerClassifications.length === 0) {
      fetchCustomerClassifications();
    }
    loadTemplates();
    loadCampaigns();
  }, []);

  // Fetch approved templates from Meta
  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await api.get('/whatsapp/templates');
      const data = res.data?.data || [];
      // Filter for approved templates only
      const approved = data.filter(t => t.status?.toUpperCase() === 'APPROVED');
      setTemplates(approved.length > 0 ? approved : data);
      if (approved.length > 0 && !selectedTemplate) {
        setSelectedTemplate(approved[0].name);
        setSelectedLang(approved[0].language || 'en');
      }
    } catch (err) {
      console.warn('Could not auto-load templates:', err.message);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Fetch past campaigns
  const loadCampaigns = async () => {
    setLoadingCampaigns(true);
    try {
      const res = await api.get('/whatsapp/campaigns');
      setCampaigns(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load campaigns:', err);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  // Filtered customers for audience selection
  const filteredCustomers = useMemo(() => {
    const list = (customers || []).filter(c => c.entity_type === 'customer' || !c.entity_type);
    return list.filter(c => {
      // Classification filter
      if (classificationFilter !== 'all') {
        if (classificationFilter === 'unclassified') {
          if (c.classification_id) return false;
        } else if (String(c.classification_id) !== String(classificationFilter)) {
          return false;
        }
      }

      // Search query (Name, Phone, Company)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = c.name?.toLowerCase().includes(q);
        const matchesPhone = c.phone?.toLowerCase().includes(q);
        const matchesCompany = c.company_name?.toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesCompany) return false;
      }

      return true;
    });
  }, [customers, classificationFilter, searchQuery]);

  // Select / Deselect All
  const handleSelectAll = () => {
    if (selectedCustomerIds.size === filteredCustomers.length && filteredCustomers.length > 0) {
      setSelectedCustomerIds(new Set());
    } else {
      setSelectedCustomerIds(new Set(filteredCustomers.map(c => c.id)));
    }
  };

  const toggleCustomer = (id) => {
    setSelectedCustomerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Update language when template changes
  const handleTemplateChange = (tmplName) => {
    setSelectedTemplate(tmplName);
    const tmpl = templates.find(t => t.name === tmplName);
    if (tmpl) {
      setSelectedLang(tmpl.language || 'en');
    }
  };

  // Active template preview
  const activeTemplateObj = useMemo(() => {
    return templates.find(t => t.name === selectedTemplate) || null;
  }, [templates, selectedTemplate]);

  // Launch Campaign
  const handleLaunchCampaign = async (e) => {
    e.preventDefault();

    if (!campaignName.trim()) {
      return toast.error('Please enter a campaign name');
    }
    if (!selectedTemplate) {
      return toast.error('Please select a pre-approved Meta WhatsApp template');
    }
    if (selectedCustomerIds.size === 0) {
      return toast.error('Please select at least one customer to receive the campaign');
    }

    setSending(true);
    setSendResult(null);

    const targetCustomerIds = Array.from(selectedCustomerIds);
    try {
      const res = await api.post('/whatsapp/campaigns/send', {
        name: campaignName.trim(),
        template_name: selectedTemplate,
        language_code: selectedLang,
        customer_ids: targetCustomerIds,
        filter_criteria: {
          classification: classificationFilter,
          query: searchQuery
        },
        custom_param: customParam.trim() || null
      });

      toast.success(res.data?.message || 'Campaign broadcasted successfully!');
      setSendResult(res.data?.data || null);
      // Reset form
      setCampaignName('');
      setSelectedCustomerIds(new Set());
      loadCampaigns();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to dispatch WhatsApp campaign';
      toast.error(msg, { duration: 6000 });
    } finally {
      setSending(false);
    }
  };

  // View Campaign Delivery Logs
  const handleViewDetails = async (camp) => {
    setViewingCampaign(camp);
    setLoadingDetails(true);
    try {
      const res = await api.get(`/whatsapp/campaigns/${camp.id}`);
      setCampaignDetails(res.data?.data || null);
    } catch (err) {
      toast.error('Failed to load campaign logs');
    } finally {
      setLoadingDetails(false);
    }
  };

  return (
    <div style={{ paddingBottom: '60px' }}>
      <IntegrationsSubNav />

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 24px' }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '24px', flexWrap: 'wrap', gap: '16px'
        }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <MessageSquare size={28} color="#10b981" /> WhatsApp Campaigns
            </h1>
            <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>
              Broadcast pre-approved Meta WhatsApp templates to customers filtered by classification.
            </p>
          </div>

          <button
            onClick={() => {
              loadTemplates();
              loadCampaigns();
              toast.success('Refreshed templates and campaigns');
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px',
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px',
              fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer'
            }}
          >
            <RefreshCw size={15} /> Refresh Data
          </button>
        </div>

        {/* Campaign Creation Card */}
        <div style={{
          background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)', overflow: 'hidden', marginBottom: '32px'
        }}>
          <div style={{
            padding: '18px 24px', background: 'linear-gradient(135deg, #059669, #10b981)',
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Sparkles size={20} />
              <span style={{ fontWeight: 800, fontSize: '16px' }}>Create New Broadcast Campaign</span>
            </div>
            <span style={{ fontSize: '12px', background: 'rgba(255,255,255,0.2)', padding: '4px 10px', borderRadius: '20px', fontWeight: 700 }}>
              Official Meta Cloud API
            </span>
          </div>

          <form onSubmit={handleLaunchCampaign} style={{ padding: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '24px' }}>
              {/* Step 1: Campaign info */}
              <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <span style={{
                    width: '24px', height: '24px', borderRadius: '50%', background: '#10b981',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', fontWeight: 800
                  }}>1</span>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', margin: 0 }}>Campaign & Template</h3>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Campaign Name *
                  </label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="e.g. Ramadan Offer, VIP Announcement..."
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: '10px',
                      border: '1px solid #cbd5e1', fontSize: '14px'
                    }}
                    required
                  />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Meta Approved Template *
                  </label>
                  {loadingTemplates ? (
                    <div style={{ fontSize: '13px', color: '#64748b' }}>Fetching templates from Meta...</div>
                  ) : (
                    <select
                      value={selectedTemplate}
                      onChange={(e) => handleTemplateChange(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: '10px',
                        border: '1px solid #cbd5e1', fontSize: '14px', background: 'white'
                      }}
                    >
                      <option value="">Select a template</option>
                      {templates.map(t => (
                        <option key={t.id || t.name} value={t.name}>
                          {t.name} ({t.language || 'any'}) - {t.category || 'General'}
                        </option>
                      ))}
                    </select>
                  )}
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                    Must match an approved template on your Meta Business Account.
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Template Language
                    </label>
                    <input
                      type="text"
                      value={selectedLang}
                      onChange={(e) => setSelectedLang(e.target.value)}
                      placeholder="e.g. ar, en, en_US"
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: '10px',
                        border: '1px solid #cbd5e1', fontSize: '14px'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      اسم بديل (اختياري - في حال لم يكن للعميل اسم)
                    </label>
                    <input
                      type="text"
                      value={customParam}
                      onChange={(e) => setCustomParam(e.target.value)}
                      placeholder="افتراضياً: رقم هاتف العميل"
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: '10px',
                        border: '1px solid #cbd5e1', fontSize: '14px'
                      }}
                    />
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                      إذا كان للعميل اسم مسجل سيتم استخدامه دائماً، وإلا سيتم استخدام هذا البديل أو رقم هاتفه.
                    </div>
                  </div>
                </div>

                {/* Template Preview Card */}
                {activeTemplateObj && (
                  <div style={{ background: '#ecfdf5', borderRadius: '10px', padding: '14px', border: '1px solid #a7f3d0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#065f46', marginBottom: '6px' }}>
                      <Globe size={14} /> Preview: {activeTemplateObj.name} ({activeTemplateObj.language})
                    </div>
                    <div style={{ fontSize: '13px', color: '#047857', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                      {activeTemplateObj.components?.find(c => c.type === 'BODY')?.text || 'Template content loaded from Meta.'}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2: Audience Filter */}
              <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '24px', height: '24px', borderRadius: '50%', background: '#10b981',
                      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: 800
                    }}>2</span>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', margin: 0 }}>Filter & Select Audience</h3>
                  </div>

                  <span style={{
                    fontSize: '12px', fontWeight: 800, padding: '4px 10px', borderRadius: '20px',
                    background: selectedCustomerIds.size > 0 ? '#10b981' : '#e2e8f0',
                    color: selectedCustomerIds.size > 0 ? 'white' : '#64748b'
                  }}>
                    {selectedCustomerIds.size} selected
                  </span>
                </div>

                {/* Filters */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Filter by Classification
                    </label>
                    <select
                      value={classificationFilter}
                      onChange={(e) => setClassificationFilter(e.target.value)}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: '8px',
                        border: '1px solid #cbd5e1', fontSize: '13px', background: 'white'
                      }}
                    >
                      <option value="all">All Classifications</option>
                      {(customerClassifications || []).map(cls => (
                        <option key={cls.id} value={cls.id}>{cls.name}</option>
                      ))}
                      <option value="unclassified">Unclassified</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Search Customers
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search name, phone..."
                        style={{
                          width: '100%', padding: '8px 12px 8px 30px', borderRadius: '8px',
                          border: '1px solid #cbd5e1', fontSize: '13px'
                        }}
                      />
                      <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    </div>
                  </div>
                </div>

                {/* Select All Action Bar */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', background: '#e2e8f0', borderRadius: '8px', marginBottom: '8px'
                }}>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '12px', fontWeight: 800, color: '#334155',
                      display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                  >
                    {selectedCustomerIds.size === filteredCustomers.length && filteredCustomers.length > 0 ? (
                      <CheckSquare size={16} color="#10b981" />
                    ) : (
                      <Square size={16} />
                    )}
                    Select All Filtered ({filteredCustomers.length})
                  </button>

                  {selectedCustomerIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedCustomerIds(new Set())}
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Clear Selection
                    </button>
                  )}
                </div>

                {/* Recipient Selection List */}
                <div style={{
                  flex: 1, maxHeight: '220px', overflowY: 'auto', background: 'white',
                  borderRadius: '8px', border: '1px solid #cbd5e1', padding: '6px'
                }}>
                  {filteredCustomers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '13px' }}>
                      No customers match your criteria
                    </div>
                  ) : (
                    filteredCustomers.map(cust => {
                      const isSelected = selectedCustomerIds.has(cust.id);
                      const cls = (customerClassifications || []).find(c => c.id === cust.classification_id);
                      return (
                        <div
                          key={cust.id}
                          onClick={() => toggleCustomer(cust.id)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '8px 10px', borderRadius: '6px', cursor: 'pointer',
                            background: isSelected ? '#ecfdf5' : 'transparent',
                            borderBottom: '1px solid #f1f5f9', transition: 'all 0.15s'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isSelected ? (
                              <CheckSquare size={16} color="#10b981" />
                            ) : (
                              <Square size={16} color="#94a3b8" />
                            )}
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                                {cust.name}
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>
                                {cust.phone || 'No phone number'}
                              </div>
                            </div>
                          </div>

                          {cls && (
                            <span style={{
                              fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                              background: `${cls.color || '#6366f1'}15`, color: cls.color || '#6366f1'
                            }}>
                              {cls.name}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Launch Action */}
            <div style={{
              display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
              gap: '16px', borderTop: '1px solid #f1f5f9', paddingTop: '16px'
            }}>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                Total Target Audience: <strong style={{ color: '#1e293b' }}>{selectedCustomerIds.size} recipients</strong>
              </div>

              <button
                type="submit"
                disabled={sending || selectedCustomerIds.size === 0}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 28px',
                  background: selectedCustomerIds.size === 0 ? '#94a3b8' : 'linear-gradient(135deg, #059669, #10b981)',
                  color: 'white', border: 'none', borderRadius: '12px', fontSize: '14px',
                  fontWeight: 800, cursor: selectedCustomerIds.size === 0 || sending ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 14px rgba(16,185,129,0.3)', transition: 'all 0.2s'
                }}
              >
                {sending ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" /> Broadcasting...
                  </>
                ) : (
                  <>
                    <Send size={18} /> Send Campaign Now
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Send Result Banner */}
        {sendResult && (
          <div style={{
            background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px',
            padding: '16px 20px', marginBottom: '28px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <CheckCircle2 size={24} color="#16a34a" />
              <div>
                <div style={{ fontWeight: 800, color: '#15803d', fontSize: '15px' }}>
                  Campaign Broadcast Completed!
                </div>
                <div style={{ fontSize: '13px', color: '#166534' }}>
                  Successfully sent: <strong>{sendResult.successfulCount}</strong> | Failed: <strong>{sendResult.failedCount}</strong>
                </div>
              </div>
            </div>
            <button
              onClick={() => setSendResult(null)}
              style={{ background: 'none', border: 'none', color: '#15803d', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Campaign History Table */}
        <div style={{
          background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)', overflow: 'hidden'
        }}>
          <div style={{
            padding: '16px 24px', borderBottom: '1px solid #e2e8f0',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                Campaign History & Delivery Logs
              </h2>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Track previous broadcasts and delivery results
              </span>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Campaign Name', 'Template Used', 'Language', 'Total Recipients', 'Delivery Status', 'Date Created', 'Action'].map(h => (
                    <th key={h} style={{ padding: '12px 18px', fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingCampaigns ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                      Loading campaign history...
                    </td>
                  </tr>
                ) : campaigns.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '14px' }}>
                      No WhatsApp campaigns dispatched yet. Launch your first broadcast above!
                    </td>
                  </tr>
                ) : (
                  campaigns.map(camp => (
                    <tr key={camp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: '#1e293b', fontSize: '14px' }}>
                        {camp.name}
                      </td>
                      <td style={{ padding: '14px 18px', color: '#475569', fontSize: '13px' }}>
                        <code style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', fontSize: '12px' }}>
                          {camp.template_name}
                        </code>
                      </td>
                      <td style={{ padding: '14px 18px', color: '#64748b', fontSize: '13px' }}>
                        {camp.language_code}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: '#1e293b', fontSize: '13px' }}>
                        {camp.total_recipients}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            background: '#ecfdf5', color: '#059669', padding: '3px 8px',
                            borderRadius: '6px', fontSize: '12px', fontWeight: 800
                          }}>
                            ✓ {camp.successful_count || 0}
                          </span>
                          {(camp.failed_count > 0) && (
                            <span style={{
                              background: '#fef2f2', color: '#dc2626', padding: '3px 8px',
                              borderRadius: '6px', fontSize: '12px', fontWeight: 800
                            }}>
                              ✕ {camp.failed_count}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px', color: '#64748b', fontSize: '13px' }}>
                        {new Date(camp.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <button
                          onClick={() => handleViewDetails(camp)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                            background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px',
                            fontSize: '12px', fontWeight: 700, color: '#334155', cursor: 'pointer'
                          }}
                        >
                          <Eye size={14} /> View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Campaign Details Modal */}
        {viewingCampaign && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
          }}>
            <div style={{
              background: 'white', borderRadius: '16px', width: '100%', maxWidth: '800px',
              maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
            }}>
              <div style={{
                padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between', background: '#059669', color: 'white'
              }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>
                    Campaign Delivery Details: {viewingCampaign.name}
                  </h3>
                  <span style={{ fontSize: '12px', opacity: 0.9 }}>
                    Template: {viewingCampaign.template_name} ({viewingCampaign.language_code})
                  </span>
                </div>
                <button
                  onClick={() => {
                    setViewingCampaign(null);
                    setCampaignDetails(null);
                  }}
                  style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontWeight: 800 }}
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                {loadingDetails ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading delivery log...</div>
                ) : !campaignDetails ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>Failed to load campaign log</div>
                ) : (
                  <div>
                    {/* Summary row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                      <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total Recipients</div>
                        <div style={{ fontSize: '20px', fontWeight: 900, color: '#1e293b' }}>{campaignDetails.campaign?.total_recipients}</div>
                      </div>
                      <div style={{ background: '#ecfdf5', padding: '12px', borderRadius: '10px', border: '1px solid #a7f3d0', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#065f46', fontWeight: 700, textTransform: 'uppercase' }}>Successfully Sent</div>
                        <div style={{ fontSize: '20px', fontWeight: 900, color: '#059669' }}>{campaignDetails.campaign?.successful_count}</div>
                      </div>
                      <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '10px', border: '1px solid #fecaca', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#991b1b', fontWeight: 700, textTransform: 'uppercase' }}>Failed Dispatches</div>
                        <div style={{ fontSize: '20px', fontWeight: 900, color: '#dc2626' }}>{campaignDetails.campaign?.failed_count}</div>
                      </div>
                    </div>

                    {/* Recipients table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          {['Customer', 'Phone Number', 'Status', 'Message ID / Error'].map(h => (
                            <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(campaignDetails.recipients || []).map(r => (
                          <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                              {r.customer_name || 'Customer'}
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: '13px', color: '#64748b' }}>
                              {r.phone}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{
                                background: r.status === 'sent' ? '#dcfce7' : '#fee2e2',
                                color: r.status === 'sent' ? '#16a34a' : '#dc2626',
                                padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800
                              }}>
                                {r.status === 'sent' ? 'Delivered' : 'Failed'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: '12px', color: r.status === 'sent' ? '#64748b' : '#dc2626' }}>
                              {r.message_id ? `ID: ${r.message_id.slice(0, 18)}...` : (r.error_message || '—')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppCampaigns;
