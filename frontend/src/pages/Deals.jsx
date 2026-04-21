import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Plus, Handshake, DollarSign, Calendar, Target, User, Receipt, ArrowRight, MapPin, Coins, Ruler, Building2, Layers, Zap, Clock, AlertCircle } from 'lucide-react';
import DataTable from '../components/Common/DataTable';
import KanbanBoard from '../components/Deals/KanbanBoard';
import Modal from '../components/Common/Modal';
import { useAuth } from '../context/AuthContext';

const Deals = () => {
  const { user } = useAuth();
  const { deals, fetchDeals, customers, fetchCustomers, products, fetchProducts, users, fetchUsers, templateConfig, loading } = useData();
  const isRealEstate = user?.template_name === 'real_estate';
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState(null);
  const [reUnits, setReUnits] = useState([]);
  const [viewMode, setViewMode] = useState(isRealEstate ? 'table' : 'kanban');

  // Helper to map icon names to Lucide components (Polish Sprint)
  const getFieldIcon = (iconName) => {
    const icons = {
      'Building2': Building2,
      'MapPin': MapPin,
      'Coins': Coins,
      'Ruler': Ruler,
      'Layers': Layers,
      'Zap': Zap
    };
    const Icon = icons[iconName] || Target;
    return <Icon size={12} />;
  };
  
  const [formData, setFormData] = useState({
    title: '',
    value: 0,
    pipeline_stage: '',
    client_id: '',
    product_id: '',
    assigned_to: '',
    unit_id: '',
    probability: 0,
    expected_close_date: '',
    next_action: '',
    custom_fields: {}
  });

  const fetchReUnits = async () => {
      try {
          const res = await api.get('/re-units');
          setReUnits(res.data.data || []);
      } catch (err) { console.error('Failed to fetch units:', err); }
  };

  useEffect(() => {
    fetchDeals();
    if (isRealEstate) fetchReUnits();
    if (customers.length === 0) fetchCustomers();
    if (products.length === 0) fetchProducts();
    if (users.length === 0) fetchUsers();
  }, [isRealEstate]);

  // Initialize pipeline stage once template config is loaded
  useEffect(() => {
    if (templateConfig?.pipeline?.length > 0 && !formData.pipeline_stage) {
      setFormData(prev => ({ ...prev, pipeline_stage: templateConfig.pipeline[0] }));
    }
  }, [templateConfig]);

  const handleOpenModal = (deal = null) => {
    if (deal) {
      setEditingDeal(deal);
      setFormData({
        title: deal.title || '',
        value: deal.value || 0,
        pipeline_stage: deal.pipeline_stage || (templateConfig?.pipeline?.[0] || ''),
        client_id: deal.client_id || '',
        product_id: deal.product_id || '',
        assigned_to: deal.assigned_to || '',
        unit_id: deal.unit_id || '',
        probability: deal.probability || 0,
        expected_close_date: deal.expected_close_date ? deal.expected_close_date.split('T')[0] : '',
        next_action: deal.next_action || '',
        custom_fields: deal.custom_fields || {}
      });
    } else {
      setEditingDeal(null);
      setFormData({ 
        title: '', 
        value: 0, 
        pipeline_stage: templateConfig?.pipeline?.[0] || '', 
        client_id: '', 
        product_id: '', 
        assigned_to: '',
        unit_id: '',
        probability: 0,
        expected_close_date: '',
        next_action: '',
        custom_fields: {} 
      });
    }
    setIsModalOpen(true);
  };

  const handleCustomFieldChange = (key, value) => {
    setFormData({
      ...formData,
      custom_fields: {
        ...formData.custom_fields,
        [key]: value
      }
    });
  };

  const handleProductChange = (productId) => {
    const product = (products || []).find(p => p.id === parseInt(productId));
    setFormData({
      ...formData,
      product_id: productId,
      value: product ? product.selling_price : formData.value
    });
  };

  const handleUnitChange = (unitId) => {
      const unit = (reUnits || []).find(u => u.id === unitId);
      setFormData({
          ...formData,
          unit_id: unitId,
          value: unit ? unit.price : formData.value,
          title: unit ? `${unit.project_name} - Unit ${unit.unit_number}` : formData.title
      });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.client_id) return toast.error('Please select a customer');

    try {
      if (editingDeal) {
        await api.put(`/deals/${editingDeal.id}`, formData);
        toast.success('Deal updated');
      } else {
        await api.post('/deals', formData);
        toast.success('Deal created');
      }
      fetchDeals(false);
      fetchReUnits(); // Refresh availability
      setIsModalOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save deal');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this deal?')) {
      try {
        await api.delete(`/deals/${id}`);
        toast.success('Deal deleted');
        fetchDeals(false);
        fetchReUnits();
      } catch (err) {
        toast.error('Failed to delete');
      }
    }
  };

  const handleGenerateInvoice = async (dealId) => {
    if (window.confirm('Generate an invoice for this deal? This will mark the deal as Won.')) {
      try {
        await api.post(`/finance/invoices/from-deal/${dealId}`);
        toast.success('Invoice generated successfully');
        navigate('/finance');
      } catch (err) {
        toast.error('Failed to generate invoice');
      }
    }
  };

  const columns = [
    { 
      key: 'title', 
      label: 'Deal Title',
      render: (val, item) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ padding: '6px', borderRadius: '6px', background: '#fff7ed', color: '#f59e0b' }}>
              <Handshake size={14} />
            </div>
            <span style={{ fontWeight: '600' }}>{val}</span>
          </div>

          {/* REAL ESTATE UNIT BADGE */}
          {isRealEstate && item.unit_id && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginLeft: '30px', marginTop: '4px' }}>
                   <div style={{ 
                        display: 'flex', alignItems: 'center', gap: '6px', 
                        fontSize: '11px', color: '#0ea5e9', background: '#f0f9ff',
                        padding: '2px 10px', borderRadius: '6px', border: '1px solid #bae6fd',
                        fontWeight: 800
                   }}>
                        <Building2 size={12} /> {item.unit_project} • Unit {item.unit_number}
                   </div>
                   
                   {/* PAYMENT PROXIMITY ALERT */}
                   {item.payment_status === 'Pending' && item.next_payment_date && (
                       (() => {
                           const today = new Date();
                           const dueDate = new Date(item.next_payment_date);
                           const diff = (dueDate - today) / (1000 * 60 * 60 * 24);
                           if (diff <= 7 && diff >= -1) {
                               return (
                                   <div style={{ 
                                       display: 'flex', alignItems: 'center', gap: '6px', 
                                       fontSize: '11px', color: '#dc2626', background: '#fef2f2',
                                       padding: '2px 10px', borderRadius: '6px', border: '1px solid #fecaca',
                                       fontWeight: 800, animation: 'pulse 2s infinite'
                                   }}>
                                       <Clock size={12} /> DUE SOON: {dueDate.toLocaleDateString()}
                                   </div>
                               );
                           }
                           return null;
                       })()
                   )}
              </div>
          )}

          {/* VISUAL CARDS FOR CUSTOM FIELDS (Polish Sprint) */}
          {item.custom_fields && Object.keys(item.custom_fields).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px', marginLeft: '30px' }}>
              {(templateConfig?.deal_fields || []).map(field => (
                item.custom_fields?.[field.key] && (
                  <div key={field.key} style={{ 
                    display: 'flex', alignItems: 'center', gap: '6px', 
                    fontSize: '11px', color: '#475569', background: '#f8fafc',
                    padding: '2px 10px', borderRadius: '6px', border: '1px solid #e2e8f0',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                  }}>
                    {getFieldIcon(field.icon)}
                    <span style={{ fontWeight: 600 }}>{item.custom_fields[field.key]}</span>
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      )
    },
    !isRealEstate && { 
      key: 'product_name', 
      label: 'Product',
      render: (val, item) => (val || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>General Service</span>)
    },
    { 
      key: 'value', 
      label: 'Value',
      render: (val) => <span style={{ fontWeight: '700', color: 'var(--primary)' }}>{val} EGP</span>
    },
    { 
      key: 'pipeline_stage', 
      label: 'Stage',
      render: (val) => {
        const colors = {
          discovery: '#eff6ff', proposal: '#fdf4ff', negotiation: '#fff7ed', won: '#f0fdf4', lost: '#fef2f2',
          lead: '#eff6ff', interested: '#fdf4ff', 'site visit': '#faf5ff', closed: '#f0fdf4'
        };
        const textColors = {
          discovery: '#2563eb', proposal: '#a21caf', negotiation: '#d97706', won: '#16a34a', lost: '#dc2626',
          lead: '#2563eb', interested: '#a21caf', 'site visit': '#7c3aed', closed: '#16a34a'
        };
        const normalizedVal = (val || '').toLowerCase();
        return (
          <span className="status-badge" style={{ background: colors[normalizedVal] || '#f1f5f9', color: textColors[normalizedVal] || '#475569' }}>
            {val || 'Unknown'}
          </span>
        );
      }
    },
    { 
      key: 'client_name', 
      label: 'Customer',
      render: (val, item) => item.client_name || 'Unassigned'
    },
    { 
      key: 'assigned_to_name', 
      label: 'Deal Owner',
      render: (val) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <User size={14} style={{ opacity: 0.6 }} />
          <span>{val || 'Unassigned'}</span>
        </div>
      )
    }
  ];

  return (
    <div className="deals-page">
      <style>{`
        .btn-add { background: var(--primary); color: white; padding: 10px 20px; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-weight: 600; transition: background 0.2s; }
        .btn-add:hover { background-color: var(--primary-hover); }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .form-group { margin-bottom: 16px; }
        .form-group.full { grid-column: span 2; }
        .form-group label { display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; }
        .form-group input, .form-group select { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; background: var(--bg-main); outline: none; }
        .btn-cancel { background: #f1f5f9; color: var(--text-muted); padding: 10px 20px; border-radius: 8px; font-weight: 600; }
        .btn-save { background: var(--primary); color: white; padding: 10px 20px; border-radius: 8px; font-weight: 600; }
        .industry-tag { background: #f1f5f9; color: #475569; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; margin-bottom: 8px; border: 1px solid #e2e8f0; }
        .unit-select-card { border: 1px solid #bae6fd; background: #f0f9ff; padding: 12px; borderRadius: 8px; margin-bottom: 16px; grid-column: span 2; }
      `}</style>

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <div className="industry-tag" style={{ background: templateConfig?.name === 'Real Estate' ? '#4f46e5' : '#f1f5f9', color: templateConfig?.name === 'Real Estate' ? 'white' : '#475569', border: 'none' }}>
            {templateConfig?.name === 'Real Estate' ? <Zap size={14} /> : <Target size={14} />}
            {templateConfig?.name?.toUpperCase() || 'GENERAL'} MODE
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: '800' }}>Sales Pipeline</h2>
          <p style={{ color: 'var(--text-muted)' }}>Track your deals from discovery to closing.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                <button onClick={() => setViewMode('kanban')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: viewMode === 'kanban' ? 'white' : 'transparent', color: viewMode === 'kanban' ? 'var(--primary)' : '#64748b', fontWeight: 700, boxShadow: viewMode === 'kanban' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: 'all 0.2s' }}>
                    Kanban
                </button>
                <button onClick={() => setViewMode('table')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: viewMode === 'table' ? 'white' : 'transparent', color: viewMode === 'table' ? 'var(--primary)' : '#64748b', fontWeight: 700, boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: 'all 0.2s' }}>
                    List
                </button>
            </div>
            <button label="add deal control" className="btn-add" onClick={() => handleOpenModal()}>
                <Plus size={20} />
                Create Deal
            </button>
        </div>
      </div>

      {viewMode === 'table' ? (
          <DataTable 
            title="Active CRM Opportunities"
            columns={columns.filter(Boolean)}
            data={deals || []}
            loading={loading}
            onEdit={handleOpenModal}
            onDelete={handleDelete}
            actions={(row) => (
              <button 
                title="Generate Invoice" 
                onClick={() => handleGenerateInvoice(row.id)}
                style={{ padding: '6px', borderRadius: '6px', background: '#f0fdf4', color: '#16a34a', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Receipt size={16} />
                <span style={{ fontSize: '12px', fontWeight: '600' }}>Bill</span>
              </button>
            )}
          />
      ) : (
          <KanbanBoard 
            deals={deals || []}
            pipelineStages={templateConfig?.pipeline || ['discovery', 'proposal', 'negotiation', 'won', 'lost']}
            onEdit={handleOpenModal}
          />
      )}

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={editingDeal ? 'Update Deal' : 'New Sales Deal'}
        footer={
          <>
            <button label="cancel addition" className="btn-cancel" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button label="save addition" className="btn-save" onClick={handleSubmit}>
              {editingDeal ? 'Update Deal' : 'Create Deal'}
            </button>
          </>
        }
      >
        <form className="form-grid">
          <div className="form-group full">
            <label>Deal Title</label>
            <input 
              type="text" 
              placeholder="e.g. Website Overhaul Project"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              required
            />
          </div>

          {/* REAL ESTATE UNIT SELECTOR */}
          {isRealEstate && (
            <div className="unit-select-card">
                <label style={{ color: '#0369a1', fontWeight: 800, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Building2 size={14} /> SELECT PROPERTY UNIT (REAL ESTATE)
                </label>
                <select 
                    className="ap-input" 
                    style={{ border: '1px solid #0ea5e9' }}
                    value={formData.unit_id} 
                    onChange={(e) => handleUnitChange(e.target.value)}
                >
                    <option value="">-- Select Available Unit --</option>
                    {(reUnits || []).filter(u => u.status === 'Available' || u.id === formData.unit_id).map(u => (
                        <option key={u.id} value={u.id}>
                            {u.project_name} | Unit {u.unit_number} ({u.area}m²) - {Number(u.price).toLocaleString()} EGP
                        </option>
                    ))}
                </select>
                <p style={{ fontSize: '11px', color: '#0284c7', marginTop: '6px' }}>Selecting a unit will automatically set the deal value and reserve the unit.</p>
            </div>
          )}

          {/* DYNAMIC TEMPLATE FIELDS (Polish Sprint) */}
          {(templateConfig?.deal_fields || []).map(field => (
            <div key={field.key} className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {getFieldIcon(field.icon)}
                {field.label || field.key.replace('_', ' ')}
              </label>
              <input 
                type={field.type || 'text'}
                placeholder={`Enter ${field.label || field.key.replace('_', ' ')}`}
                value={formData.custom_fields?.[field.key] || ''}
                onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
              />
            </div>
          ))}

          {!isRealEstate && (
            <div className="form-group">
                <label>Select Product (Optional)</label>
                <select 
                value={formData.product_id}
                onChange={(e) => handleProductChange(e.target.value)}
                >
                <option value="">-- No Specific Product --</option>
                {(products || []).map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.selling_price} EGP)</option>
                ))}
                </select>
            </div>
          )}
          
          <div className="form-group">
            <label>Link to Customer</label>
            <select 
              value={formData.client_id}
              onChange={(e) => setFormData({...formData, client_id: e.target.value})}
              required
            >
              <option value="">-- Select Customer --</option>
              {(customers || []).map(c => (
                <option key={c.id} value={c.id}>{c.name} {c.company_name ? `(${c.company_name})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Deal Value (EGP)</label>
            <input 
              type="number" 
              value={formData.value}
              onChange={(e) => setFormData({...formData, value: e.target.value})}
              disabled={!!formData.unit_id}
            />
          </div>
          <div className="form-group">
            <label>Pipeline Stage</label>
            <select 
              value={formData.pipeline_stage}
              onChange={(e) => setFormData({...formData, pipeline_stage: e.target.value})}
            >
              {(templateConfig?.pipeline || []).map(stage => (
                <option key={stage} value={stage}>{stage}</option>
              )) || (
                <>
                  <option value="discovery">Discovery</option>
                  <option value="won">Won</option>
                </>
              )}
            </select>
          </div>
          
          {/* Phase 2: Action Metrics */}
          {!isRealEstate && (
            <>
                <div className="form-group">
                    <label>Win Probability (%)</label>
                    <input type="number" min="0" max="100" value={formData.probability} onChange={(e) => setFormData({...formData, probability: parseInt(e.target.value) || 0})} />
                </div>
                <div className="form-group">
                    <label>Expected Close Date</label>
                    <input type="date" value={formData.expected_close_date} onChange={(e) => setFormData({...formData, expected_close_date: e.target.value})} />
                </div>
                <div className="form-group full">
                    <label>Next Action Required</label>
                    <input type="text" placeholder="e.g. Call client to discuss proposal" value={formData.next_action} onChange={(e) => setFormData({...formData, next_action: e.target.value})} />
                </div>
            </>
          )}

          <div className="form-group full">
            <label>Deal Owner</label>
            <select 
              value={formData.assigned_to}
              onChange={(e) => setFormData({...formData, assigned_to: e.target.value})}
            >
              <option value="">Me (Default)</option>
              {(users || []).map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          </div>

          {/* PAYMENT SUMMARY MVP (Phase 2 Upgrade) */}
          {isRealEstate && (editingDeal?.pipeline_stage?.toLowerCase() === 'won' || formData.pipeline_stage?.toLowerCase() === 'won') && editingDeal?.unit_id && (
              <div style={{ gridColumn: 'span 2', background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginTop: '10px' }}>
                  {(() => {
                      const totalValue = Number(editingDeal.payment_total || editingDeal.value || 0);
                      const paidValue = Number(editingDeal.paid_amount || 0);
                      const remainingValue = totalValue - paidValue;
                      const percentage = totalValue > 0 ? Math.min(100, (paidValue / totalValue) * 100).toFixed(1) : 0;
                      
                      let riskColor = '#3b82f6';
                      let riskText = 'On Track';
                      let riskBg = '#eff6ff';
                      
                      if (remainingValue <= 0) {
                          riskColor = '#10b981'; riskText = 'Fully Paid'; riskBg = '#dcfce7';
                      } else if (editingDeal.next_payment_date) {
                          const diffDays = Math.ceil((new Date(editingDeal.next_payment_date) - new Date()) / (1000 * 60 * 60 * 24));
                          if (diffDays < 0) {
                              riskColor = '#ef4444'; riskText = `OVERDUE (${Math.abs(diffDays)} Days)`; riskBg = '#fef2f2';
                          } else if (diffDays <= 7) {
                              riskColor = '#f59e0b'; riskText = `DUE IN ${diffDays} DAYS`; riskBg = '#fffbeb';
                          }
                      }

                      return (
                          <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
                                      <DollarSign size={18} color="#16a34a"/> Cash Flow Timeline
                                  </h4>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                      <div style={{ padding: '4px 12px', background: riskBg, color: riskColor, borderRadius: '8px', fontSize: '12px', fontWeight: 800, border: `1px solid ${riskColor}40` }}>
                                          <AlertCircle size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                          {riskText}
                                      </div>
                                  </div>
                              </div>
                              
                              {/* Central Progress Visualization */}
                              <div style={{ marginBottom: '24px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, marginBottom: '8px', color: '#64748b' }}>
                                      <span>Paid: {paidValue.toLocaleString()} EGP</span>
                                      <span style={{ color: 'var(--primary)', fontWeight: 900 }}>{percentage}% Collected</span>
                                      <span>Target: {totalValue.toLocaleString()} EGP</span>
                                  </div>
                                  <div style={{ width: '100%', height: '14px', background: '#e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                      <div style={{ width: `${percentage}%`, height: '100%', background: remainingValue <= 0 ? '#10b981' : 'var(--primary)', transition: 'width 0.5s ease-out' }}></div>
                                  </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                                  <div className="form-group" style={{ marginBottom: 0 }}>
                                      <label style={{ fontSize: '12px' }}>Log New Payment</label>
                                      <div style={{ display: 'flex', gap: '8px' }}>
                                          <input 
                                              type="number" 
                                              placeholder="Amount..."
                                              className="ap-input"
                                              style={{ flex: 1 }}
                                              id="new_payment_trigger"
                                          />
                                          <button 
                                              type="button"
                                              onClick={async () => {
                                                  const newAmt = document.getElementById('new_payment_trigger').value;
                                                  if (!newAmt) return;
                                                  try {
                                                      const payRes = await api.get(`/re-payments/deal/${editingDeal.id}`);
                                                      if (payRes.data.data) {
                                                          const updatedAmt = Number(payRes.data.data.paid_amount) + Number(newAmt);
                                                          await api.put(`/re-payments/${payRes.data.data.id}`, { paid_amount: updatedAmt });
                                                          toast.success(`Payment logged: +${newAmt} EGP`);
                                                          fetchDeals(false);
                                                          document.getElementById('new_payment_trigger').value = '';
                                                      }
                                                  } catch (err) { toast.error('Update failed'); }
                                              }}
                                              style={{ background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', padding: '0 16px', fontWeight: 700, cursor: 'pointer' }}
                                          >
                                              Add
                                          </button>
                                      </div>
                                  </div>
                                  <div className="form-group" style={{ marginBottom: 0 }}>
                                      <label style={{ fontSize: '12px' }}>Next Installment Date</label>
                                      <input 
                                          type="date" 
                                          className="ap-input"
                                          defaultValue={editingDeal.next_payment_date ? new Date(editingDeal.next_payment_date).toISOString().split('T')[0] : ''}
                                          onChange={async (e) => {
                                              try {
                                                  const payRes = await api.get(`/re-payments/deal/${editingDeal.id}`);
                                                  if (payRes.data.data) {
                                                      await api.put(`/re-payments/${payRes.data.data.id}`, { next_payment_date: e.target.value });
                                                      toast.success('Installment horizon updated');
                                                      fetchDeals(false);
                                                  }
                                              } catch (err) { toast.error('Update failed'); }
                                          }}
                                      />
                                  </div>
                              </div>
                          </>
                      );
                  })()}
              </div>
          )}
        </form>
      </Modal>
    </div>
  );
};

export default Deals;
