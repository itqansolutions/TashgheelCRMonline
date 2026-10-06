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
import SalesSubNav from '../components/Sales/SalesSubNav';
import { useAuth } from '../context/AuthContext';

const Deals = () => {
  const { user, hasFinancialPermission } = useAuth();
  const { deals, fetchDeals, customers, fetchCustomers, products, fetchProducts, users, fetchUsers, templateConfig, loading } = useData();
  const isRealEstate = user?.template_name === 'real_estate';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabParam = searchParams.get('tab') || 'all';
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState(null);
  const [reUnits, setReUnits] = useState([]);
  const [viewMode, setViewMode] = useState(isRealEstate ? 'table' : 'kanban');
  const [dealContract, setDealContract] = useState(null);
  const [contractLoading, setContractLoading] = useState(false);
  const [installments, setInstallments] = useState([]);
  const [installmentSummary, setInstallmentSummary] = useState(null);
  const [showScheduleGenerator, setShowScheduleGenerator] = useState(false);
  const [scheduleConfig, setScheduleConfig] = useState({
    down_payment: 0,
    number_of_installments: 4,
    frequency: 'quarterly',
    start_date: new Date().toISOString().split('T')[0]
  });
  const [commissions, setCommissions] = useState([]);
  const [commissionSummary, setCommissionSummary] = useState(null);
  const [showCommissionForm, setShowCommissionForm] = useState(false);
  const [commissionForm, setCommissionForm] = useState({
    beneficiary_type: 'internal_agent',
    beneficiary_name: '',
    commission_type: 'percentage',
    rate: 2.5,
    calculated_amount: 0,
    trigger_event: 'contract_signing',
    notes: ''
  });
  const [cancellationRecord, setCancellationRecord] = useState(null);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelFormData, setCancelFormData] = useState({
    reason: '',
    deduction_amount: 0,
    unit_action: 'release'
  });
  const [dealHandover, setDealHandover] = useState(null);
  const [showHandoverForm, setShowHandoverForm] = useState(false);
  const [handoverFormData, setHandoverFormData] = useState({
    scheduled_date: '',
    snagging_notes: ''
  });

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

  const fetchInstallments = async (contractId) => {
    if (!contractId) {
      setInstallments([]);
      setInstallmentSummary(null);
      return;
    }
    try {
      const res = await api.get(`/re-installments?contract_id=${contractId}`);
      setInstallments(res.data.data || []);
      setInstallmentSummary(res.data.summary || null);
    } catch (err) {
      console.error('Failed to fetch installments:', err);
      setInstallments([]);
      setInstallmentSummary(null);
    }
  };

  const fetchDealContract = async (dealId) => {
    if (!dealId) {
      setDealContract(null);
      setInstallments([]);
      setInstallmentSummary(null);
      return;
    }
    setContractLoading(true);
    try {
      const res = await api.get(`/re-contracts?deal_id=${dealId}`);
      if (res.data.data && res.data.data.length > 0) {
        const contract = res.data.data[0];
        setDealContract(contract);
        fetchInstallments(contract.id);
      } else {
        setDealContract(null);
        setInstallments([]);
        setInstallmentSummary(null);
      }
    } catch (err) {
      console.error('Failed to fetch deal contract:', err);
      setDealContract(null);
      setInstallments([]);
      setInstallmentSummary(null);
    } finally {
      setContractLoading(false);
    }
  };

  const handleGenerateSchedule = async () => {
    if (!dealContract?.id) return;
    try {
      const res = await api.post('/re-installments/generate-schedule', {
        contract_id: dealContract.id,
        down_payment: Number(scheduleConfig.down_payment) || 0,
        number_of_installments: parseInt(scheduleConfig.number_of_installments) || 4,
        frequency: scheduleConfig.frequency,
        start_date: scheduleConfig.start_date || new Date().toISOString().split('T')[0]
      });
      toast.success(res.data.message || 'Schedule generated successfully');
      setShowScheduleGenerator(false);
      fetchInstallments(dealContract.id);
      fetchDealContract(editingDeal.id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate schedule');
    }
  };

  const handlePayInstallment = async (installmentId, defaultAmount) => {
    const payAmt = window.prompt('Enter payment amount in EGP:', defaultAmount);
    if (!payAmt) return;
    try {
      const res = await api.post(`/re-installments/${installmentId}/pay`, {
        amount: parseFloat(payAmt),
        payment_date: new Date().toISOString().split('T')[0],
        notes: 'Payment recorded via Deal CRM'
      });
      toast.success(res.data.message || 'Payment recorded');
      fetchInstallments(dealContract.id);
      fetchDealContract(editingDeal.id);
      fetchDeals(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payment failed');
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

  const handleUpdateContractStatus = async (contractId, nextStatus) => {
    try {
      const res = await api.patch(`/re-contracts/${contractId}/status`, { status: nextStatus });
      toast.success(res.data.message || `Contract status updated to ${nextStatus}`);
      if (editingDeal?.id) {
        fetchDealContract(editingDeal.id);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update contract status');
    }
  };

  const fetchCommissions = async (dealId) => {
    if (!dealId) {
      setCommissions([]);
      setCommissionSummary(null);
      return;
    }
    try {
      const res = await api.get(`/re-commissions?deal_id=${dealId}`);
      setCommissions(res.data.data || []);
      setCommissionSummary(res.data.summary || null);
    } catch (err) {
      console.error('Failed to fetch commissions:', err);
      setCommissions([]);
      setCommissionSummary(null);
    }
  };

  const handleCreateCommission = async () => {
    if (!editingDeal?.id) return;
    try {
      const baseVal = editingDeal.value || formData.value || 0;
      const res = await api.post('/re-commissions', {
        deal_id: editingDeal.id,
        contract_id: dealContract?.id || null,
        beneficiary_type: commissionForm.beneficiary_type,
        beneficiary_name: commissionForm.beneficiary_name || user?.name || 'Agent',
        commission_type: commissionForm.commission_type,
        rate: Number(commissionForm.rate) || 0,
        base_amount: baseVal,
        calculated_amount: commissionForm.commission_type === 'fixed' 
          ? Number(commissionForm.calculated_amount)
          : undefined,
        trigger_event: commissionForm.trigger_event || 'contract_signing',
        notes: commissionForm.notes
      });
      toast.success(res.data.message || 'Commission created');
      setShowCommissionForm(false);
      fetchCommissions(editingDeal.id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create commission');
    }
  };

  const handleUpdateCommissionStatus = async (commissionId, newStatus) => {
    try {
      const res = await api.patch(`/re-commissions/${commissionId}/status`, { status: newStatus });
      toast.success(res.data.message || `Commission ${newStatus}`);
      fetchCommissions(editingDeal.id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update commission');
    }
  };

  const handlePayCommission = async (commissionId, defaultAmt) => {
    const payAmt = window.prompt('Enter commission payout amount in EGP:', defaultAmt);
    if (!payAmt) return;
    try {
      const res = await api.post(`/re-commissions/${commissionId}/pay`, {
        amount: parseFloat(payAmt),
        payment_date: new Date().toISOString().split('T')[0]
      });
      toast.success(res.data.message || 'Commission paid');
      fetchCommissions(editingDeal.id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payout failed');
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

  const fetchHandover = async (dealId) => {
    if (!dealId) {
      setDealHandover(null);
      return;
    }
    try {
      const res = await api.get(`/re-handovers?deal_id=${dealId}`);
      if (res.data.data && res.data.data.length > 0) {
        setDealHandover(res.data.data[0]);
      } else {
        setDealHandover(null);
      }
    } catch (err) {
      console.error('Failed to fetch handover:', err);
      setDealHandover(null);
    }
  };

  const handleCreateHandover = async () => {
    if (!editingDeal?.id) return;
    try {
      const res = await api.post('/re-handovers', {
        deal_id: editingDeal.id,
        scheduled_date: handoverFormData.scheduled_date || new Date().toISOString().split('T')[0],
        snagging_notes: handoverFormData.snagging_notes
      });
      toast.success(res.data.message || 'Handover milestone scheduled');
      setShowHandoverForm(false);
      fetchHandover(editingDeal.id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to schedule handover');
    }
  };

  const handleUpdateHandoverStatus = async (handoverId, newStatus) => {
    try {
      const res = await api.patch(`/re-handovers/${handoverId}/status`, {
        status: newStatus
      });
      toast.success(res.data.message || `Handover status: ${newStatus}`);
      fetchHandover(editingDeal.id);
      if (isRealEstate) fetchReUnits();
      fetchDeals(false);
      if (editingDeal?.id) fetchDealContract(editingDeal.id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update handover status');
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
        fetchCommissions(deal.id);
        fetchCancellation(deal.id);
        fetchHandover(deal.id);
      }
    } else {
      setEditingDeal(null);
      setDealContract(null);
      setCommissions([]);
      setCommissionSummary(null);
      setCancellationRecord(null);
      setShowCancelForm(false);
      setDealHandover(null);
      setShowHandoverForm(false);
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
      <SalesSubNav />
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
          <h2 style={{ fontSize: '24px', fontWeight: '800' }}>
            {activeTabParam === 'installments' ? 'Installments & Payment Plans' :
             activeTabParam === 'contracts' ? 'Sales Contracts' :
             activeTabParam === 'reservations' ? 'Unit Reservations' :
             activeTabParam === 'commissions' ? 'Agent Commissions' :
             activeTabParam === 'handover' ? 'Unit Handovers' :
             'Sales Pipeline'}
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            {activeTabParam === 'installments' ? 'Manage payment schedules, dues, and collections across sales deals.' :
             activeTabParam === 'contracts' ? 'Formal sales contracts and document lifecycle tracking.' :
             activeTabParam === 'reservations' ? 'Reserved units and down-payment tracking.' :
             activeTabParam === 'commissions' ? 'Internal and external broker commission balances.' :
             activeTabParam === 'handover' ? 'Delivery checklists and unit key handovers.' :
             'Track your deals from discovery to closing.'}
          </p>
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

      {/* Real Estate Sales Tabs Navigation Bar */}
      {isRealEstate && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
          {[
            { id: 'all', label: 'All Deals', icon: <Handshake size={15} /> },
            { id: 'reservations', label: 'Reservations', icon: <CheckCircle2 size={15} /> },
            { id: 'contracts', label: 'Contracts', icon: <FileText size={15} /> },
            { id: 'installments', label: 'Installments', icon: <CreditCard size={15} /> },
            { id: 'commissions', label: 'Commissions', icon: <Award size={15} /> },
            { id: 'handover', label: 'Handover', icon: <Key size={15} /> },
          ].map(tab => {
            const isActive = (activeTabParam === tab.id) || (activeTabParam === 'all' && tab.id === 'all');
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id === 'all') {
                    setSearchParams({});
                  } else {
                    setSearchParams({ tab: tab.id });
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: isActive ? '1px solid var(--primary)' : '1px solid #e2e8f0',
                  background: isActive ? 'var(--primary)' : 'white',
                  color: isActive ? 'white' : '#64748b',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 2px 8px rgba(79,70,229,0.2)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {(() => {
        let displayedDeals = deals || [];
        if (isRealEstate && activeTabParam !== 'all') {
          if (activeTabParam === 'reservations') {
            displayedDeals = displayedDeals.filter(d => d.unit_status === 'Reserved' || (d.pipeline_stage || '').toLowerCase().includes('reser') || (d.pipeline_stage || '').toLowerCase().includes('interest'));
          } else if (activeTabParam === 'contracts') {
            displayedDeals = displayedDeals.filter(d => d.unit_status === 'Sold' || ['negotiation', 'won', 'closed'].includes((d.pipeline_stage || '').toLowerCase()));
          } else if (activeTabParam === 'installments') {
            displayedDeals = displayedDeals.filter(d => d.unit_id || d.value > 0);
          } else if (activeTabParam === 'commissions') {
            displayedDeals = displayedDeals.filter(d => d.value > 0);
          } else if (activeTabParam === 'handover') {
            displayedDeals = displayedDeals.filter(d => d.unit_id && ['won', 'closed'].includes((d.pipeline_stage || '').toLowerCase()));
          }
        }

        return viewMode === 'table' ? (
          <DataTable 
            title={activeTabParam !== 'all' ? `Deals (${activeTabParam.toUpperCase()})` : "Active CRM Opportunities"}
            columns={columns.filter(Boolean)}
            data={displayedDeals}
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
            deals={displayedDeals}
            pipelineStages={templateConfig?.pipeline || ['discovery', 'proposal', 'negotiation', 'won', 'lost']}
            onEdit={handleOpenModal}
          />
        );
      })()}

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
          {isRealEstate && editingDeal?.unit_id && editingDeal?.pipeline_stage?.toLowerCase() !== 'won' && editingDeal?.pipeline_stage?.toLowerCase() !== 'lost' && (
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

          {/* Phase 2.2: Real Estate Sales Contract Lifecycle */}
          {isRealEstate && editingDeal?.unit_id && (
            <div style={{ gridColumn: 'span 2', background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: '12px', padding: '18px', marginTop: '6px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
                  <FileText size={18} color="#2563eb" /> Real Estate Contract
                </h4>
                {dealContract ? (
                  <div style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    background: dealContract.status === 'Completed' ? '#dcfce7' : dealContract.status === 'Cancelled' ? '#fee2e2' : dealContract.status === 'Active' ? '#dbeafe' : dealContract.status === 'Signed' ? '#fef3c7' : '#f1f5f9',
                    color: dealContract.status === 'Completed' ? '#15803d' : dealContract.status === 'Cancelled' ? '#b91c1c' : dealContract.status === 'Active' ? '#1d4ed8' : dealContract.status === 'Signed' ? '#b45309' : '#475569',
                    border: '1px solid currentColor'
                  }}>
                    {dealContract.status}
                  </div>
                ) : (
                  <span style={{ fontSize: '11px', color: '#64748b' }}>No contract generated</span>
                )}
              </div>

              {contractLoading ? (
                <div style={{ fontSize: '12px', color: '#64748b', padding: '10px 0' }}>Loading contract details...</div>
              ) : dealContract ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px', fontSize: '12px' }}>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontWeight: 600 }}>Contract Number:</span>
                      <span style={{ fontWeight: 800, color: '#1e293b' }}>{dealContract.contract_number}</span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontWeight: 600 }}>Contract Value:</span>
                      <span style={{ fontWeight: 800, color: '#1e293b' }}>{Number(dealContract.contract_value).toLocaleString()} EGP</span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontWeight: 600 }}>Down Payment / Remaining:</span>
                      <span style={{ fontWeight: 800, color: '#166534' }}>{Number(dealContract.down_payment).toLocaleString()} EGP</span>
                      <span style={{ color: '#64748b', fontSize: '11px' }}> / {Number(dealContract.remaining_amount).toLocaleString()} EGP</span>
                    </div>
                  </div>

                  {/* Lifecycle transition controls */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid #e2e8f0', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      Lifecycle: <strong style={{ color: '#0f172a' }}>{dealContract.status}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {dealContract.status === 'Draft' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateContractStatus(dealContract.id, 'Generated')}
                          style={{ padding: '6px 14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Generate Formal Document
                        </button>
                      )}
                      {dealContract.status === 'Generated' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateContractStatus(dealContract.id, 'Signed')}
                          style={{ padding: '6px 14px', background: '#d97706', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Mark as Signed
                        </button>
                      )}
                      {dealContract.status === 'Signed' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateContractStatus(dealContract.id, 'Active')}
                          style={{ padding: '6px 14px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Activate Contract
                        </button>
                      )}
                      {dealContract.status === 'Active' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateContractStatus(dealContract.id, 'Completed')}
                          style={{ padding: '6px 14px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Mark as Completed
                        </button>
                      )}
                      {['Draft', 'Generated', 'Signed', 'Active'].includes(dealContract.status) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Are you sure you want to cancel this contract?')) {
                              handleUpdateContractStatus(dealContract.id, 'Cancelled');
                            }
                          }}
                          style={{ padding: '6px 12px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Cancel Contract
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Phase 2.3: Installments & Payment Schedule */}
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                        Payment Schedule ({installments.length} Installments)
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowScheduleGenerator(!showScheduleGenerator)}
                        style={{ padding: '4px 10px', background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        {showScheduleGenerator ? 'Close Plan Generator' : installments.length > 0 ? 'Regenerate Schedule' : '+ Generate Payment Plan'}
                      </button>
                    </div>

                    {/* Schedule Generator Form */}
                    {showScheduleGenerator && (
                      <div style={{ background: '#f8fafc', border: '1px dashed #94a3b8', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '10px' }}>
                          <div>
                            <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>Down Payment (EGP)</label>
                            <input 
                              type="number" 
                              value={scheduleConfig.down_payment} 
                              onChange={(e) => setScheduleConfig({ ...scheduleConfig, down_payment: e.target.value })} 
                              style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>Number of Installments</label>
                            <input 
                              type="number" 
                              min="1" 
                              max="120"
                              value={scheduleConfig.number_of_installments} 
                              onChange={(e) => setScheduleConfig({ ...scheduleConfig, number_of_installments: e.target.value })} 
                              style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>Frequency</label>
                            <select 
                              value={scheduleConfig.frequency} 
                              onChange={(e) => setScheduleConfig({ ...scheduleConfig, frequency: e.target.value })}
                              style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                            >
                              <option value="monthly">Monthly</option>
                              <option value="quarterly">Quarterly</option>
                              <option value="semi-annual">Semi-Annual</option>
                              <option value="annual">Annual</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>Start Date</label>
                            <input 
                              type="date" 
                              value={scheduleConfig.start_date} 
                              onChange={(e) => setScheduleConfig({ ...scheduleConfig, start_date: e.target.value })} 
                              style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleGenerateSchedule}
                          style={{ padding: '6px 14px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Generate & Save Plan
                        </button>
                      </div>
                    )}

                    {/* Installments Table */}
                    {installments.length > 0 ? (
                      <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                        <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                              <th style={{ padding: '6px 8px' }}>#</th>
                              <th style={{ padding: '6px 8px' }}>Type</th>
                              <th style={{ padding: '6px 8px' }}>Due Date</th>
                              <th style={{ padding: '6px 8px' }}>Amount</th>
                              <th style={{ padding: '6px 8px' }}>Paid</th>
                              <th style={{ padding: '6px 8px' }}>Status</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {installments.map((inst) => {
                              const remaining = Math.max(0, Number(inst.amount) - Number(inst.paid_amount));
                              return (
                                <tr key={inst.id} style={{ borderBottom: '1px solid #f1f5f9', background: inst.status === 'Paid' ? '#f0fdf4' : inst.is_overdue ? '#fef2f2' : 'white' }}>
                                  <td style={{ padding: '6px 8px', fontWeight: 700 }}>{inst.installment_number}</td>
                                  <td style={{ padding: '6px 8px', textTransform: 'capitalize' }}>{inst.installment_type?.replace('_', ' ')}</td>
                                  <td style={{ padding: '6px 8px' }}>{inst.due_date ? inst.due_date.split('T')[0] : '-'}</td>
                                  <td style={{ padding: '6px 8px', fontWeight: 700 }}>{Number(inst.amount).toLocaleString()} EGP</td>
                                  <td style={{ padding: '6px 8px', color: '#16a34a' }}>{Number(inst.paid_amount).toLocaleString()} EGP</td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <span style={{
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontSize: '10px',
                                      fontWeight: 800,
                                      background: inst.status === 'Paid' ? '#dcfce7' : inst.status === 'Partially Paid' ? '#fef3c7' : inst.is_overdue ? '#fee2e2' : '#f1f5f9',
                                      color: inst.status === 'Paid' ? '#15803d' : inst.status === 'Partially Paid' ? '#b45309' : inst.is_overdue ? '#b91c1c' : '#64748b'
                                    }}>
                                      {inst.is_overdue && inst.status !== 'Paid' ? 'Overdue' : inst.status}
                                    </span>
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                    {inst.status !== 'Paid' && hasFinancialPermission?.('payment.create') && (
                                      <button
                                        type="button"
                                        onClick={() => handlePayInstallment(inst.id, remaining)}
                                        style={{ padding: '3px 8px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                                      >
                                        Pay
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', padding: '6px 0' }}>
                        No installment schedule created yet. Click above to generate schedule.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Ready to generate formal real estate sales contract.</span>
                  <button
                    type="button"
                    onClick={handleCreateContract}
                    style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <FileText size={14} /> Create Sales Contract
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Phase 2.4: Real Estate Commissions (Agent / Broker) */}
          {isRealEstate && editingDeal?.id && (
            <div style={{ gridColumn: 'span 2', background: '#fdfbf7', border: '2px solid #fed7aa', borderRadius: '12px', padding: '18px', marginTop: '6px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', color: '#9a3412' }}>
                  <Coins size={18} color="#ea580c" /> Sales Commissions
                </h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {commissionSummary && (
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#c2410c' }}>
                      Total: {commissionSummary.total_commissions.toLocaleString()} EGP (Paid: {commissionSummary.total_paid.toLocaleString()} EGP)
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowCommissionForm(!showCommissionForm)}
                    style={{ padding: '4px 10px', background: '#ffedd5', color: '#9a3412', border: '1px solid #fdba74', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {showCommissionForm ? 'Close' : '+ Add Commission'}
                  </button>
                </div>
              </div>

              {/* Commission Creation Form */}
              {showCommissionForm && (
                <div style={{ background: '#fff', border: '1px dashed #ea580c', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>Beneficiary Type</label>
                      <select 
                        value={commissionForm.beneficiary_type} 
                        onChange={(e) => setCommissionForm({ ...commissionForm, beneficiary_type: e.target.value })}
                        style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                      >
                        <option value="internal_agent">Internal Agent</option>
                        <option value="broker">External Broker</option>
                        <option value="agency">Agency / Partner</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>Beneficiary Name</label>
                      <input 
                        type="text" 
                        placeholder="Agent / Broker Name"
                        value={commissionForm.beneficiary_name} 
                        onChange={(e) => setCommissionForm({ ...commissionForm, beneficiary_name: e.target.value })} 
                        style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>Calculation</label>
                      <select 
                        value={commissionForm.commission_type} 
                        onChange={(e) => setCommissionForm({ ...commissionForm, commission_type: e.target.value })}
                        style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                      >
                        <option value="percentage">Percentage (%)</option>
                        <option value="fixed">Fixed Amount (EGP)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>
                        {commissionForm.commission_type === 'percentage' ? 'Rate (%)' : 'Amount (EGP)'}
                      </label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={commissionForm.commission_type === 'percentage' ? commissionForm.rate : commissionForm.calculated_amount} 
                        onChange={(e) => {
                          if (commissionForm.commission_type === 'percentage') {
                            setCommissionForm({ ...commissionForm, rate: e.target.value });
                          } else {
                            setCommissionForm({ ...commissionForm, calculated_amount: e.target.value });
                          }
                        }} 
                        style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>Trigger Event</label>
                      <select 
                        value={commissionForm.trigger_event} 
                        onChange={(e) => setCommissionForm({ ...commissionForm, trigger_event: e.target.value })}
                        style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                      >
                        <option value="contract_signing">Contract Signing</option>
                        <option value="down_payment">Down Payment</option>
                        <option value="installment_collection">Installment Collection</option>
                      </select>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateCommission}
                    style={{ padding: '6px 14px', background: '#ea580c', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Save Commission
                  </button>
                </div>
              )}

              {/* Commissions List */}
              {commissions.length > 0 ? (
                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #fed7aa', borderRadius: '8px', background: 'white' }}>
                  <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#fff7ed', color: '#9a3412', borderBottom: '1px solid #fed7aa' }}>
                        <th style={{ padding: '6px 8px' }}>Beneficiary</th>
                        <th style={{ padding: '6px 8px' }}>Type</th>
                        <th style={{ padding: '6px 8px' }}>Rate / Calc</th>
                        <th style={{ padding: '6px 8px' }}>Total Due</th>
                        <th style={{ padding: '6px 8px' }}>Paid</th>
                        <th style={{ padding: '6px 8px' }}>Status</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissions.map((comm) => {
                        const unpaid = Math.max(0, Number(comm.calculated_amount) - Number(comm.paid_amount));
                        return (
                          <tr key={comm.id} style={{ borderBottom: '1px solid #ffedd5' }}>
                            <td style={{ padding: '6px 8px', fontWeight: 700, color: '#1e293b' }}>{comm.beneficiary_name}</td>
                            <td style={{ padding: '6px 8px', textTransform: 'capitalize', color: '#64748b' }}>{comm.beneficiary_type?.replace('_', ' ')}</td>
                            <td style={{ padding: '6px 8px' }}>{comm.commission_type === 'percentage' ? `${comm.rate}%` : 'Fixed'}</td>
                            <td style={{ padding: '6px 8px', fontWeight: 700, color: '#9a3412' }}>{Number(comm.calculated_amount).toLocaleString()} EGP</td>
                            <td style={{ padding: '6px 8px', color: '#16a34a' }}>{Number(comm.paid_amount).toLocaleString()} EGP</td>
                            <td style={{ padding: '6px 8px' }}>
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 800,
                                background: comm.status === 'Paid' ? '#dcfce7' : (comm.status === 'Approved' || comm.status === 'Earned') ? '#dbeafe' : comm.status === 'Clawback' ? '#fee2e2' : comm.status === 'Cancelled' ? '#f1f5f9' : '#fef3c7',
                                color: comm.status === 'Paid' ? '#15803d' : (comm.status === 'Approved' || comm.status === 'Earned') ? '#1d4ed8' : comm.status === 'Clawback' ? '#b91c1c' : comm.status === 'Cancelled' ? '#64748b' : '#b45309'
                              }}>
                                {comm.status}
                              </span>
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                {comm.status === 'Pending' && (
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateCommissionStatus(comm.id, 'Approved')}
                                    style={{ padding: '2px 6px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                                  >
                                    Approve
                                  </button>
                                )}
                                {(comm.status === 'Approved' || comm.status === 'Earned' || comm.status === 'Partially Paid') && unpaid > 0 && hasFinancialPermission?.('payment.create') && (
                                  <button
                                    type="button"
                                    onClick={() => handlePayCommission(comm.id, unpaid)}
                                    style={{ padding: '2px 6px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                                  >
                                    Pay
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: '#9a3412', fontStyle: 'italic', padding: '6px 0' }}>
                  No commissions recorded for this deal yet. Click '+ Add Commission' to set up agent or broker fee.
                </div>
              )}
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

          {/* Phase 2.6: Handover Lightweight Milestone */}
          {isRealEstate && editingDeal?.unit_id && (
            <div style={{ gridColumn: 'span 2', background: '#f0fdfa', border: '2px solid #99f6e4', borderRadius: '12px', padding: '16px', marginTop: '6px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: dealHandover || showHandoverForm ? '12px' : 0 }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', color: '#0f766e' }}>
                  <Building2 size={16} color="#0d9488" /> Unit Delivery & Handover Milestone
                </h4>
                {dealHandover ? (
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    background: dealHandover.status === 'Handed Over' ? '#ccfbf1' : '#f1f5f9',
                    color: dealHandover.status === 'Handed Over' ? '#0f766e' : '#475569',
                    border: '1px solid currentColor'
                  }}>
                    {dealHandover.status}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowHandoverForm(!showHandoverForm)}
                    style={{ padding: '4px 10px', background: '#ccfbf1', color: '#0f766e', border: '1px solid #5eead4', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {showHandoverForm ? 'Close' : '+ Schedule Handover'}
                  </button>
                )}
              </div>

              {/* Handover Details */}
              {dealHandover && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '11px', marginBottom: '10px' }}>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontWeight: 600 }}>Scheduled Date:</span>
                      <strong style={{ color: '#1e293b' }}>{dealHandover.scheduled_date ? dealHandover.scheduled_date.split('T')[0] : 'Not Scheduled'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontWeight: 600 }}>Actual Delivery:</span>
                      <strong style={{ color: dealHandover.actual_handover_date ? '#0f766e' : '#94a3b8' }}>
                        {dealHandover.actual_handover_date ? dealHandover.actual_handover_date.split('T')[0] : 'Pending Delivery'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontWeight: 600 }}>Key & Clearance:</span>
                      <strong style={{ color: dealHandover.keys_handed_over ? '#0f766e' : '#64748b' }}>
                        {dealHandover.keys_handed_over ? 'Keys & Certificate Issued' : 'Pending Clearance'}
                      </strong>
                    </div>
                  </div>
                  {dealHandover.snagging_notes && (
                    <div style={{ fontSize: '11px', color: '#475569', marginBottom: '10px', background: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid #ccfbf1' }}>
                      <strong>Snagging / Punch List Notes:</strong> {dealHandover.snagging_notes}
                    </div>
                  )}

                  {/* Handover lifecycle transitions */}
                  {dealHandover.status !== 'Handed Over' && (
                    <div style={{ display: 'flex', gap: '8px', paddingTop: '8px', borderTop: '1px solid #ccfbf1' }}>
                      {dealHandover.status === 'Scheduled' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateHandoverStatus(dealHandover.id, 'Inspection')}
                          style={{ padding: '5px 12px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Start Inspection
                        </button>
                      )}
                      {dealHandover.status === 'Inspection' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateHandoverStatus(dealHandover.id, 'Ready for Delivery')}
                          style={{ padding: '5px 12px', background: '#0d9488', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Mark Ready for Delivery
                        </button>
                      )}
                      {['Scheduled', 'Inspection', 'Ready for Delivery'].includes(dealHandover.status) && (
                        <button
                          type="button"
                          onClick={() => handleUpdateHandoverStatus(dealHandover.id, 'Handed Over')}
                          style={{ padding: '5px 12px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Complete Handover & Release Keys
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Handover Scheduling Form */}
              {!dealHandover && showHandoverForm && (
                <div style={{ background: '#fff', border: '1px dashed #0d9488', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>Target Delivery Date</label>
                      <input
                        type="date"
                        value={handoverFormData.scheduled_date}
                        onChange={(e) => setHandoverFormData({ ...handoverFormData, scheduled_date: e.target.value })}
                        style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>Inspection / Snagging Notes</label>
                      <input
                        type="text"
                        placeholder="Any client punch list notes or pending finishing touch..."
                        value={handoverFormData.snagging_notes}
                        onChange={(e) => setHandoverFormData({ ...handoverFormData, snagging_notes: e.target.value })}
                        style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateHandover}
                    style={{ padding: '6px 14px', background: '#0d9488', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Confirm Handover Schedule
                  </button>
                </div>
              )}
            </div>
          )}

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
                                              disabled={!hasFinancialPermission?.('payment.create')}
                                          />
                                          {hasFinancialPermission?.('payment.create') && (
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
                                          )}
                                      </div>
                                  </div>
                                  <div className="form-group" style={{ marginBottom: 0 }}>
                                      <label style={{ fontSize: '12px' }}>Next Installment Date</label>
                                        <input 
                                            type="date" 
                                            className="ap-input"
                                            disabled={!hasFinancialPermission?.('payment.create')}
                                            defaultValue={editingDeal.next_payment_date ? new Date(editingDeal.next_payment_date).toISOString().split('T')[0] : ''}
                                            onChange={async (e) => {
                                                if (!hasFinancialPermission?.('payment.create')) return;
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
