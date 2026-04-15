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
    custom_fields: {}
  });

  useEffect(() => {
    fetchDeals();
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
      setIsModalOpen(false);
    } catch (err) {
      toast.error('Failed to save deal');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this deal?')) {
      try {
        await api.delete(`/deals/${id}`);
        toast.success('Deal deleted');
        fetchDeals(false);
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
      render: (val) => val || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>General Service</span>
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
        </form>
      </Modal>
    </div>
  );
};

export default Deals;
