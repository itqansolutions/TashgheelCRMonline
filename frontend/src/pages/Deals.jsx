import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useData } from '../context/DataContext';
import api from '../services/api';
import { Plus, Handshake, DollarSign, Calendar, Target, User, Receipt, ArrowRight, MapPin, Coins, Ruler, Building2, Layers, Zap, Clock, AlertCircle, FileText, CheckCircle2, XCircle, CreditCard, Award, Key } from 'lucide-react';
import DataTable from '../components/Common/DataTable';
import KanbanBoard from '../components/Deals/KanbanBoard';
import Modal from '../components/Common/Modal';
import ActivityTimeline from '../components/Common/ActivityTimeline';
import { useAuth } from '../context/AuthContext';

const Deals = () => {
  const { user, hasFinancialPermission } = useAuth();
  const { deals, fetchDeals, customers, fetchCustomers, products, fetchProducts, users, fetchUsers, templateConfig, loading } = useData();
  const isRealEstate = user?.template_name === 'real_estate';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Legacy /deals?tab=X URLs → standalone workspaces (Deals no longer hosts inner tabs)
  const legacyTab = searchParams.get('tab');
  useEffect(() => {
    const map = { reservations: '/reservations', contracts: '/contracts', installments: '/installments', commissions: '/commissions', handover: '/handover', handovers: '/handover' };
    if (legacyTab && map[legacyTab]) navigate(map[legacyTab], { replace: true });
    else if (legacyTab) setSearchParams({}, { replace: true });
  }, [legacyTab]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState(null);
  const [reUnits, setReUnits] = useState([]);
  const [viewMode, setViewMode] = useState(isRealEstate ? 'table' : 'kanban');
  const [dealContract, setDealContract] = useState(null);
  const [contractLoading, setContractLoading] = useState(false);
  const [cancellationRecord, setCancellationRecord] = useState(null);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelFormData, setCancelFormData] = useState({
    reason: '',
    deduction_amount: 0,
    unit_action: 'release'
  });
  // Deal Lock (mirrors backend): final stage (Closed/won) or a live contract freezes core commercial fields
  const isFinalDealStage = ['closed', 'won'].includes(String(editingDeal?.pipeline_stage || '').toLowerCase());
  const isDealLocked = !!editingDeal && (isFinalDealStage || (dealContract && dealContract.status !== 'Cancelled'));

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
    source_type: '',
    source_id: '',
    custom_fields: {}
  });

  const fetchReUnits = async () => {
      if (!isRealEstate) return;
      try {
          const res = await api.get('/re-units');
          setReUnits(res.data.data || []);
      } catch (err) { console.error('Failed to fetch units:', err); }
  };

  useEffect(() => {
    fetchDeals();
    if (customers.length === 0) fetchCustomers();
    if (products.length === 0) fetchProducts();
    if (users.length === 0) fetchUsers();

    // Check for Task-to-Deal conversion
    const convertTask = localStorage.getItem('convert_task_to_deal');
    if (convertTask) {
        try {
            const task = JSON.parse(convertTask);
            setFormData(prev => ({
                ...prev,
                title: `Deal from: ${task.title}`,
                source_type: 'task',
                source_id: task.id,
                client_id: task.parent_type === 'customer' ? task.parent_id : '',
                assigned_to: task.assigned_to || ''
            }));
            setIsModalOpen(true);
            localStorage.removeItem('convert_task_to_deal');
        } catch (e) {
            console.error('Failed to parse conversion task', e);
        }
    }
  }, []);

  useEffect(() => {
    if (isRealEstate) {
      fetchReUnits();
    }
  }, [isRealEstate]);

  // Initialize pipeline stage once template config is loaded
  useEffect(() => {
    if (templateConfig?.pipeline?.length > 0 && !formData.pipeline_stage) {
      setFormData(prev => ({ ...prev, pipeline_stage: templateConfig.pipeline[0] }));
    }
  }, [templateConfig]);

  // Contract summary for the Related Records panel (full lifecycle lives in /contracts)
  const fetchDealContract = async (dealId) => {
    if (!dealId) { setDealContract(null); return; }
    setContractLoading(true);
    try {
      const res = await api.get(`/re-contracts?deal_id=${dealId}`);
      setDealContract(res.data.data && res.data.data.length > 0 ? res.data.data[0] : null);
    } catch (err) {
      console.error('Failed to fetch deal contract:', err);
      setDealContract(null);
    } finally {
      setContractLoading(false);
    }
  };

  const handleCreateContract = async () => {
    if (!editingDeal?.id) return;
    try {
      const res = await api.post('/re-contracts', {
        deal_id: editingDeal.id,
        customer_id: editingDeal.client_id || formData.client_id,
        unit_id: editingDeal.unit_id || formData.unit_id,
        contract_value: editingDeal.value || formData.value || 0,
        down_payment: 0,
        notes: `Sales contract for deal #${editingDeal.id}`
      });
      toast.success(res.data.message || 'Contract created successfully');
      fetchDealContract(editingDeal.id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create contract');
    }
  };

  const fetchCancellation = async (dealId) => {
    if (!dealId) {
      setCancellationRecord(null);
      return;
    }
    try {
      const res = await api.get(`/re-cancellations?deal_id=${dealId}`);
      if (res.data.data && res.data.data.length > 0) {
        setCancellationRecord(res.data.data[0]);
      } else {
        setCancellationRecord(null);
      }
    } catch (err) {
      console.error('Failed to fetch cancellation:', err);
      setCancellationRecord(null);
    }
  };

  const handleProcessCancellation = async () => {
    if (!editingDeal?.id) return;
    if (!cancelFormData.reason.trim()) {
      toast.error('Please enter a cancellation reason');
      return;
    }
    try {
      const res = await api.post('/re-cancellations', {
        deal_id: editingDeal.id,
        cancellation_reason: cancelFormData.reason,
        deduction_amount: parseFloat(cancelFormData.deduction_amount) || 0,
        unit_action: cancelFormData.unit_action
      });
      toast.success(res.data.message || 'Deal cancelled and unit released');
      setShowCancelForm(false);
      fetchDeals(false);
      if (isRealEstate) fetchReUnits();
      fetchCancellation(editingDeal.id);
      fetchDealContract(editingDeal.id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cancellation failed');
    }
  };

  const handleUpdateRefund = async (cancellationId, newStatus) => {
    try {
      const res = await api.patch(`/re-cancellations/${cancellationId}/refund`, {
        refund_status: newStatus
      });
      toast.success(res.data.message || 'Refund status updated');
      fetchCancellation(editingDeal.id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Refund update failed');
    }
  };


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
        source_type: deal.source_type || '',
        source_id: deal.source_id || '',
        custom_fields: deal.custom_fields || {}
      });
      if (isRealEstate) {
        fetchDealContract(deal.id);
        fetchCancellation(deal.id);
      }
    } else {
      setEditingDeal(null);
      setDealContract(null);
      setCancellationRecord(null);
      setShowCancelForm(false);
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
        source_type: '',
        source_id: '',
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
      if (isRealEstate) fetchReUnits(); // Refresh availability
      setIsModalOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save deal');
    }
  };

  const handleExtendReservation = async (dealId, hours) => {
    try {
      const res = await api.post(`/deals/${dealId}/extend-reservation`, { extension_hours: hours });
      toast.success(res.data.message || `Reservation extended by ${hours} hours`);
      fetchDeals(false);
      if (editingDeal && editingDeal.id === dealId) {
        setEditingDeal(prev => ({
          ...prev,
          unit_reservation_expires_at: res.data.data.reservation_expires_at,
          unit_reservation_extended_at: res.data.data.reservation_extended_at,
          unit_reservation_extension_count: res.data.data.reservation_extension_count
        }));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to extend reservation');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this deal?')) {
      try {
        await api.delete(`/deals/${id}`);
        toast.success('Deal deleted');
        fetchDeals(false);
        if (isRealEstate) fetchReUnits();
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to delete');
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
                   
                   {/* RESERVATION STATUS / EXPIRATION BADGE */}
                   {item.unit_status === 'Reserved' && item.unit_reservation_expires_at && (
                       <div style={{ 
                            display: 'flex', alignItems: 'center', gap: '4px', 
                            fontSize: '11px', 
                            color: new Date(item.unit_reservation_expires_at) < new Date() ? '#dc2626' : '#15803d', 
                            background: new Date(item.unit_reservation_expires_at) < new Date() ? '#fef2f2' : '#f0fdf4',
                            padding: '2px 8px', borderRadius: '6px', 
                            border: `1px solid ${new Date(item.unit_reservation_expires_at) < new Date() ? '#fecaca' : '#bbf7d0'}`,
                            fontWeight: 700
                       }}>
                            <Clock size={11} /> {new Date(item.unit_reservation_expires_at) < new Date() ? 'EXPIRED' : `Expires ${new Date(item.unit_reservation_expires_at).toLocaleDateString()}`}
                            {item.unit_reservation_extension_count > 0 && <span style={{ opacity: 0.8 }}>({item.unit_reservation_extension_count}x)</span>}
                       </div>
                   )}

                   {/* SITE VISIT BADGE */}
                   {item.custom_fields?.visit_date && (
                       <div style={{ 
                            display: 'flex', alignItems: 'center', gap: '4px', 
                            fontSize: '11px', color: '#7e22ce', background: '#faf5ff',
                            padding: '2px 8px', borderRadius: '6px', border: '1px solid #d8b4fe',
                            fontWeight: 700
                       }}>
                            <MapPin size={11} /> Visit: {new Date(item.custom_fields.visit_date).toLocaleDateString()}
                            {item.custom_fields.visit_result ? ` • ${item.custom_fields.visit_result}` : ''}
                       </div>
                   )}

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
          {item.source_type === 'task' && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', marginLeft: '30px', marginTop: '4px' }}>
                  Converted from Task
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
    <div>
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
          <h2 style={{ fontSize: '24px', fontWeight: '800' }}>Deals</h2>
          <p style={{ color: 'var(--text-muted)' }}>Track your deals from first contact to closing.</p>
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
          title="Deals"
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
          {isDealLocked && (
            <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '8px', background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', fontWeight: 700 }}>
              <AlertCircle size={16} />
              {isFinalDealStage
                ? `This deal is ${editingDeal?.pipeline_stage}. Customer, unit, value, owner and commercial terms are locked.`
                : `This deal has an active contract (${dealContract?.contract_number}). Customer, unit, value, owner and commercial terms are locked.`}
              {isRealEstate && ' Use "Cancel Deal & Refund" to reverse it.'}
            </div>
          )}
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
                    disabled={!!editingDeal}
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
                disabled={isDealLocked}
                onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
              />
            </div>
          ))}

          {!isRealEstate && (
            <div className="form-group">
                <label>Select Product (Optional)</label>
                <select 
                value={formData.product_id}
                disabled={isDealLocked}
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
              disabled={isDealLocked}
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
              disabled={!!formData.unit_id || isDealLocked}
            />
          </div>
          <div className="form-group">
            <label>Pipeline Stage</label>
            <select 
              value={formData.pipeline_stage}
              disabled={isDealLocked && isFinalDealStage}
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
              disabled={isDealLocked}
              onChange={(e) => setFormData({...formData, assigned_to: e.target.value})}
            >
              <option value="">Me (Default)</option>
              {(users || []).map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          </div>

          {/* Phase 3: Lightweight Site Visit Details */}
          {formData.pipeline_stage?.toLowerCase() === 'site visit' && (
            <div style={{ gridColumn: 'span 2', background: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: '12px', padding: '16px', marginBottom: '8px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#7e22ce', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <MapPin size={16} /> Site Visit Information
              </h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Visit Date & Time</label>
                  <input 
                    type="datetime-local" 
                    value={formData.custom_fields?.visit_date || ''} 
                    onChange={(e) => handleCustomFieldChange('visit_date', e.target.value)} 
                  />
                </div>
                <div className="form-group">
                  <label>Visit Status / Result</label>
                  <select 
                    value={formData.custom_fields?.visit_result || 'Scheduled'} 
                    onChange={(e) => handleCustomFieldChange('visit_result', e.target.value)}
                  >
                    <option value="Scheduled">Scheduled</option>
                    <option value="Completed - Highly Interested">Completed - Highly Interested</option>
                    <option value="Completed - Considering Offer">Completed - Considering Offer</option>
                    <option value="Completed - Unit Unsuitable">Completed - Unit Unsuitable</option>
                    <option value="Postponed">Client Postponed</option>
                    <option value="Cancelled">Cancelled</option>
                    <option value="No-Show">Client No-Show</option>
                  </select>
                </div>
                <div className="form-group full" style={{ marginBottom: 0 }}>
                  <label>Visit Feedback & Notes</label>
                  <textarea 
                    rows="2"
                    placeholder="Client impressions, preferences discussed during the site visit..." 
                    value={formData.custom_fields?.visit_notes || ''} 
                    onChange={(e) => handleCustomFieldChange('visit_notes', e.target.value)} 
                  />
                </div>
              </div>
            </div>
          )}

          {/* Phase 2: Unit Reservation & Extension Management */}
          {isRealEstate && editingDeal?.unit_id && !['won', 'closed'].includes(editingDeal?.pipeline_stage?.toLowerCase()) && editingDeal?.pipeline_stage?.toLowerCase() !== 'lost' && (
            <div style={{ gridColumn: 'span 2', background: '#f0fdf4', border: '2px solid #bbf7d0', borderRadius: '12px', padding: '18px', marginTop: '6px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', color: '#166534' }}>
                  <Building2 size={18} color="#16a34a"/> Unit Reservation Status
                </h4>
                <div style={{ padding: '4px 10px', background: '#dcfce7', color: '#15803d', borderRadius: '6px', fontSize: '11px', fontWeight: 800, border: '1px solid #86efac' }}>
                  {editingDeal.unit_status || 'Reserved'}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px', fontSize: '12px' }}>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontWeight: 600 }}>Linked Unit:</span>
                  <span style={{ fontWeight: 800, color: '#1e293b' }}>{editingDeal.unit_project} • Unit {editingDeal.unit_number}</span>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontWeight: 600 }}>Reservation Expires:</span>
                  <span style={{ fontWeight: 800, color: editingDeal.unit_reservation_expires_at && new Date(editingDeal.unit_reservation_expires_at) < new Date() ? '#dc2626' : '#166534' }}>
                    {editingDeal.unit_reservation_expires_at ? new Date(editingDeal.unit_reservation_expires_at).toLocaleString() : 'Active'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid #dcfce7', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 700 }}>
                  {editingDeal.unit_reservation_extension_count > 0 ? `Extended ${editingDeal.unit_reservation_extension_count} time(s)` : 'Active Reservation'}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleExtendReservation(editingDeal.id, 24)}
                    style={{ padding: '6px 14px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Extend +24h
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExtendReservation(editingDeal.id, 48)}
                    style={{ padding: '6px 14px', background: '#0d9488', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Extend +48h
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Related Records – downstream workspaces originate from this Deal but live in their own pages */}
          {isRealEstate && editingDeal?.id && (
            <div style={{ gridColumn: 'span 2', background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginTop: '6px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
                  <FileText size={16} color="#2563eb" /> Related Records
                </h4>
                {contractLoading ? (
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Loading…</span>
                ) : dealContract ? (
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#1d4ed8' }}>
                    {dealContract.contract_number} • {dealContract.status}
                    {dealContract.expiry_state === 'expiring_soon' && ` • expires in ${dealContract.days_remaining}d`}
                    {dealContract.expiry_state === 'expired' && ' • EXPIRED'}
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', color: '#64748b' }}>No contract yet</span>
                )}
              </div>

              {!dealContract && !contractLoading && editingDeal?.unit_id && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>This deal can originate a sales contract.</span>
                  <button
                    type="button"
                    onClick={handleCreateContract}
                    style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <FileText size={14} /> Create Sales Contract
                  </button>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {[
                  { label: 'Contract', path: '/contracts', icon: <FileText size={14} />, enabled: !!dealContract },
                  { label: 'Installments', path: '/installments', icon: <CreditCard size={14} />, enabled: !!dealContract },
                  { label: 'Commissions', path: '/commissions', icon: <Award size={14} />, enabled: true },
                  { label: 'Handover', path: '/handover', icon: <Key size={14} />, enabled: !!editingDeal?.unit_id },
                ].map(link => (
                  <button
                    key={link.path}
                    type="button"
                    disabled={!link.enabled}
                    onClick={() => { setIsModalOpen(false); navigate(`${link.path}?deal_id=${editingDeal.id}`); }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', background: link.enabled ? 'white' : '#f1f5f9', color: link.enabled ? '#0f172a' : '#94a3b8', fontSize: '12px', fontWeight: 700, cursor: link.enabled ? 'pointer' : 'not-allowed' }}
                  >
                    {link.icon} {link.label} <ArrowRight size={12} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Phase 2.5: Deal Cancellation & Refund Management */}
          {isRealEstate && editingDeal?.id && (
            <div style={{ gridColumn: 'span 2', background: cancellationRecord ? '#fff1f2' : '#f8fafc', border: `2px solid ${cancellationRecord ? '#fca5a5' : '#e2e8f0'}`, borderRadius: '12px', padding: '16px', marginTop: '6px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: cancellationRecord || showCancelForm ? '12px' : 0 }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', color: cancellationRecord ? '#9f1239' : '#475569' }}>
                  <AlertCircle size={16} color={cancellationRecord ? '#e11d48' : '#64748b'} />
                  {cancellationRecord ? 'Deal Cancellation & Refund Audit' : 'Cancellation & Unit Release'}
                </h4>
                {cancellationRecord ? (
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    background: cancellationRecord.refund_status === 'Processed' ? '#dcfce7' : cancellationRecord.refund_status === 'Pending' ? '#fef3c7' : '#f1f5f9',
                    color: cancellationRecord.refund_status === 'Processed' ? '#15803d' : cancellationRecord.refund_status === 'Pending' ? '#b45309' : '#475569'
                  }}>
                    Refund: {cancellationRecord.refund_status}
                  </span>
                ) : editingDeal?.pipeline_stage?.toLowerCase() !== 'lost' && (
                  <button
                    type="button"
                    onClick={() => setShowCancelForm(!showCancelForm)}
                    style={{ padding: '4px 10px', background: showCancelForm ? '#f1f5f9' : '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {showCancelForm ? 'Close' : 'Cancel Deal & Refund'}
                  </button>
                )}
              </div>

              {/* Cancellation Details if already cancelled */}
              {cancellationRecord && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '11px', marginBottom: '10px' }}>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontWeight: 600 }}>Total Collected:</span>
                      <strong style={{ color: '#1e293b' }}>{Number(cancellationRecord.total_paid_amount).toLocaleString()} EGP</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontWeight: 600 }}>Penalty Deduction:</span>
                      <strong style={{ color: '#b91c1c' }}>-{Number(cancellationRecord.deduction_amount).toLocaleString()} EGP</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontWeight: 600 }}>Refundable Balance:</span>
                      <strong style={{ color: '#047857' }}>{Number(cancellationRecord.refundable_amount).toLocaleString()} EGP</strong>
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#475569', marginBottom: '10px', background: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid #fecdd3' }}>
                    <strong>Reason:</strong> {cancellationRecord.cancellation_reason}
                  </div>
                  {cancellationRecord.refund_status === 'Pending' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateRefund(cancellationRecord.id, 'Processed')}
                      style={{ padding: '6px 14px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Mark Refund as Processed
                    </button>
                  )}
                </div>
              )}

              {/* Cancellation Form */}
              {!cancellationRecord && showCancelForm && (
                <div style={{ background: '#fff', border: '1px dashed #f87171', borderRadius: '8px', padding: '12px' }}>
                  <div className="form-group" style={{ marginBottom: '8px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#991b1b' }}>Cancellation Reason (Required)</label>
                    <textarea
                      rows="2"
                      placeholder="Specify buyer withdrawal reason, financial default, or agreement..."
                      value={cancelFormData.reason}
                      onChange={(e) => setCancelFormData({ ...cancelFormData, reason: e.target.value })}
                      style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>Deduction / Penalty (EGP)</label>
                      <input
                        type="number"
                        min="0"
                        value={cancelFormData.deduction_amount}
                        onChange={(e) => setCancelFormData({ ...cancelFormData, deduction_amount: e.target.value })}
                        style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>Unit Action</label>
                      <select
                        value={cancelFormData.unit_action}
                        onChange={(e) => setCancelFormData({ ...cancelFormData, unit_action: e.target.value })}
                        style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                      >
                        <option value="release">Release Unit to Available</option>
                        <option value="keep_reserved">Keep Unit Status Unchanged</option>
                      </select>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleProcessCancellation}
                    style={{ padding: '6px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Confirm Cancellation & Process
                  </button>
                </div>
              )}
            </div>
          )}
        </form>
        {editingDeal && (
          <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', marginBottom: '16px' }}>Deal Activity Timeline</h3>
            <ActivityTimeline entityType="deal" entityId={editingDeal.id} />
          </div>
        )}
      </Modal>
      </div>
    </div>
  );
};

export default Deals;
