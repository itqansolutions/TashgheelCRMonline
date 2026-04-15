import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Plus, Handshake, DollarSign, Calendar, Target, User, Receipt, ArrowRight, MapPin, Coins, Ruler, Building2, Layers, Zap } from 'lucide-react';
import DataTable from '../components/Common/DataTable';
import Modal from '../components/Common/Modal';

const Deals = () => {
  const { deals, fetchDeals, customers, fetchCustomers, products, fetchProducts, users, fetchUsers, templateConfig, loading } = useData();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState(null);
  const [reUnits, setReUnits] = useState([]);

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
    custom_fields: {}
  });

  const fetchReUnits = async () => {
      try {
          const res = await api.get('/api/re-units');
          setReUnits(res.data.data || []);
      } catch (err) { console.error('Failed to fetch units:', err); }
  };

  useEffect(() => {
    fetchDeals();
    fetchReUnits();
    if (customers.length === 0) fetchCustomers();
    if (products.length === 0) fetchProducts();
    if (users.length === 0) fetchUsers();
  }, []);

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
    const product = products.find(p => p.id === parseInt(productId));
    setFormData({
      ...formData,
      product_id: productId,
      value: product ? product.selling_price : formData.value
    });
  };

  const handleUnitChange = (unitId) => {
      const unit = reUnits.find(u => u.id === unitId);
      setFormData({
          ...formData,
          unit_id: unitId,
          value: unit ? unit.price : formData.value,
          title: unit ? `${unit.project_name} - Unit ${u.unit_number}` : formData.title
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
          {item.unit_id && (
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
    { 
      key: 'product_name', 
      label: 'Product',
      render: (val, item) => item.unit_id ? <span style={{ color: '#0ea5e9', fontWeight: 700 }}>Real Estate Unit</span> : (val || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>General Service</span>)
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
        <button label="add deal control" className="btn-add" onClick={() => handleOpenModal()}>
          <Plus size={20} />
          Create Deal
        </button>
      </div>

      <DataTable 
        title="Active Deals"
        columns={columns}
        data={deals}
        loading={loading}
        onEdit={handleOpenModal}
        onDelete={handleDelete}
        actions={(row) => (
          <button 
            title="Generate Invoice" 
            onClick={() => handleGenerateInvoice(row.id)}
            style={{ 
              padding: '6px', 
              borderRadius: '6px', 
              background: '#f0fdf4', 
              color: '#16a34a',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Receipt size={16} />
            <span style={{ fontSize: '12px', fontWeight: '600' }}>Bill</span>
          </button>
        )}
      />

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
                  {reUnits.filter(u => u.status === 'Available' || u.id === formData.unit_id).map(u => (
                      <option key={u.id} value={u.id}>
                          {u.project_name} | Unit {u.unit_number} ({u.area}m²) - {Number(u.price).toLocaleString()} EGP
                      </option>
                  ))}
              </select>
              <p style={{ fontSize: '11px', color: '#0284c7', marginTop: '6px' }}>Selecting a unit will automatically set the deal value and reserve the unit.</p>
          </div>

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

          <div className="form-group">
            <label>Select Product (Optional)</label>
            <select 
              value={formData.product_id}
              onChange={(e) => handleProductChange(e.target.value)}
              disabled={!!formData.unit_id}
            >
              <option value="">-- No Specific Product --</option>
              {(products || []).map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.selling_price} EGP)</option>
              ))}
            </select>
          </div>
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

          {/* PAYMENT SUMMARY MVP (Polish Sprint) */}
          {(editingDeal?.pipeline_stage?.toLowerCase() === 'won' || formData.pipeline_stage?.toLowerCase() === 'won') && editingDeal?.unit_id && (
              <div style={{ gridColumn: 'span 2', background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
                          <DollarSign size={18} color="#16a34a"/> 💰 PAYMENT SUMMARY
                      </h4>
                      <div style={{ 
                          fontSize: '11px', fontWeight: 900, padding: '4px 10px', borderRadius: '6px',
                          background: (editingDeal.payment_total - editingDeal.paid_amount) <= 0 ? '#dcfce7' : '#fef9c3',
                          color: (editingDeal.payment_total - editingDeal.paid_amount) <= 0 ? '#166534' : '#854d0e'
                      }}>
                          {(editingDeal.payment_total - editingDeal.paid_amount) <= 0 ? '✅ FULLY PAID' : '⏳ PAYMENT PENDING'}
                      </div>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                      <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Total Price</div>
                          <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--primary)' }}>{Number(editingDeal.payment_total || editingDeal.value).toLocaleString()} EGP</div>
                      </div>
                      <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Paid So Far</div>
                          <div style={{ fontSize: '18px', fontWeight: 900, color: '#16a34a' }}>{Number(editingDeal.paid_amount || 0).toLocaleString()} EGP</div>
                      </div>
                      <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Remaining</div>
                          <div style={{ fontSize: '18px', fontWeight: 900, color: '#dc2626' }}>{Number((editingDeal.payment_total || editingDeal.value) - (editingDeal.paid_amount || 0)).toLocaleString()} EGP</div>
                      </div>
                  </div>

                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div className="form-group">
                          <label style={{ fontSize: '12px' }}>Update Paid Amount</label>
                          <input 
                              type="number" 
                              placeholder="Add payment..."
                              className="ap-input"
                              onBlur={async (e) => {
                                  if (!e.target.value) return;
                                  try {
                                      // Note: In real app, search for the payment ID first or use a dedicated endpoint
                                      const payRes = await api.get(`/api/re-payments/deal/${editingDeal.id}`);
                                      if (payRes.data.data) {
                                          await api.put(`/api/re-payments/${payRes.data.data.id}`, { paid_amount: e.target.value });
                                          toast.success('Payment updated');
                                          fetchDeals(false);
                                      }
                                  } catch (err) { toast.error('Update failed'); }
                              }}
                          />
                      </div>
                      <div className="form-group">
                          <label style={{ fontSize: '12px' }}>Next Due Date</label>
                          <input 
                              type="date" 
                              className="ap-input"
                              defaultValue={editingDeal.next_payment_date ? new Date(editingDeal.next_payment_date).toISOString().split('T')[0] : ''}
                              onChange={async (e) => {
                                  try {
                                      const payRes = await api.get(`/api/re-payments/deal/${editingDeal.id}`);
                                      if (payRes.data.data) {
                                          await api.put(`/api/re-payments/${payRes.data.data.id}`, { next_payment_date: e.target.value });
                                          toast.success('Due date updated');
                                          fetchDeals(false);
                                      }
                                  } catch (err) { toast.error('Update failed'); }
                              }}
                          />
                      </div>
                  </div>
              </div>
          )}
        </form>
      </Modal>
    </div>
  );
};

export default Deals;
