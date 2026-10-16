import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useData } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';
import { Plus, Handshake, DollarSign, Calendar, Target, User, Receipt, ArrowRight, MapPin, Coins, Ruler, Building2, Layers, Zap, Clock, AlertCircle, FileText, CheckCircle2, XCircle, CreditCard, Award, Key } from 'lucide-react';
import DataTable from '../components/Common/DataTable';
import KanbanBoard from '../components/Deals/KanbanBoard';
import Modal from '../components/Common/Modal';
import ActivityTimeline from '../components/Common/ActivityTimeline';
import { useAuth } from '../context/AuthContext';

const Deals = () => {
  const { t, isRTL } = useLanguage();
  const { user, hasFinancialPermission, hasDealPermission } = useAuth();
  const { deals, fetchDeals, customers, fetchCustomers, products, fetchProducts, users, fetchUsers, templateConfig, loading } = useData();
  const isRealEstate = user?.template_name === 'real_estate';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const getStageLabel = (stage) => {
    const raw = (stage || '').toLowerCase().replace(/[\s-]/g, '_');
    return t(`deals.stages.${raw}`, stage || 'Unknown');
  };

  const getReservationStatusLabel = (status) => {
    const raw = (status || '').toLowerCase();
    return t(`deals.reservationStatuses.${raw}`, status || t('deals.reservationStatuses.reserved', 'Reserved'));
  };

  const getContractStatusLabel = (status) => {
    const raw = (status || '').toLowerCase();
    return t(`deals.contractStatuses.${raw}`, status || 'Active');
  };

  const getRefundStatusLabel = (status) => {
    const raw = (status || '').toLowerCase();
    return t(`deals.refundStatuses.${raw}`, status || 'Pending');
  };

  const getVisitResultLabel = (result) => {
    const map = {
      'Scheduled': 'scheduled',
      'Completed - Highly Interested': 'completedInterested',
      'Completed - Considering Offer': 'completedConsidering',
      'Completed - Unit Unsuitable': 'completedUnsuitable',
      'Client Postponed': 'postponed',
      'Postponed': 'postponed',
      'Cancelled': 'cancelled',
      'Client No-Show': 'noShow',
      'No-Show': 'noShow'
    };
    const key = map[result] || result;
    return t(`deals.visitResults.${key}`, result);
  };
  // Legacy /deals?tab=X URLs → standalone workspaces (Deals no longer hosts inner tabs)
  const legacyTab = searchParams.get('tab');
  useEffect(() => {
    const map = { reservations: '/reservations', contracts: '/contracts', installments: '/installments', commissions: '/commissions', handover: '/handover', handovers: '/handover' };
    if (legacyTab && map[legacyTab]) navigate(map[legacyTab], { replace: true });
    else if (legacyTab) setSearchParams({}, { replace: true });
  }, [legacyTab]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState(null);
  const openedByQueryParamRef = useRef(null);
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
  // Batch F: Deal SLA Management
  const [isOverdueOnly, setIsOverdueOnly] = useState(false);
  const [dealSla, setDealSla] = useState(null);
  const [slaLoading, setSlaLoading] = useState(false);
  const [extendingSla, setExtendingSla] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignTargetId, setReassignTargetId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  // Deal Lock (mirrors backend): final stage (Closed/won) or a live contract freezes core commercial fields
  const isFinalDealStage = ['closed', 'won'].includes(String(editingDeal?.pipeline_stage || '').toLowerCase());
  const isDealLocked = !!editingDeal && (isFinalDealStage || (dealContract && dealContract.status !== 'Cancelled'));

  // Deal Permissions checks
  const canEditDetails = !editingDeal ? hasDealPermission('deal.edit_details') : hasDealPermission('deal.edit_details');
  const canUpdateStage = hasDealPermission('deal.update_stage');
  const canReassign = hasDealPermission('deal.reassign');
  const canDeleteDeal = hasDealPermission('deal.delete');
  const canExtendSla = hasDealPermission('deal.extend_sla');

  const isDetailsDisabled = isDealLocked || (!!editingDeal && !canEditDetails);
  const isStageDisabled = (isDealLocked && isFinalDealStage) || !canUpdateStage;
  const isReassignDisabled = isDealLocked || !canReassign;
  const canSaveModal = !editingDeal ? canEditDetails : (canEditDetails || canUpdateStage || canReassign);

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

  // Handle direct creation from Matching / external query params (?new=1&client_id=X&unit_id=Y)
  useEffect(() => {
    const paramNew = searchParams.get('new');
    const paramClientId = searchParams.get('client_id');
    const paramUnitId = searchParams.get('unit_id');

    if (paramNew === '1' || paramClientId || paramUnitId) {
      const targetUnit = (reUnits || []).find(u => String(u.id) === String(paramUnitId));
      setFormData(prev => ({
        ...prev,
        title: targetUnit 
          ? `${targetUnit.project_name} - Unit ${targetUnit.unit_number}` 
          : (paramUnitId ? `Deal for Unit ${paramUnitId.slice(0, 8)}` : prev.title || 'New Deal'),
        client_id: paramClientId || prev.client_id || '',
        unit_id: paramUnitId || prev.unit_id || '',
        value: targetUnit ? Number(targetUnit.price) : prev.value || 0,
        pipeline_stage: prev.pipeline_stage || (templateConfig?.pipeline?.[0] || 'Lead')
      }));
      setEditingDeal(null);
      setIsModalOpen(true);
      if (!paramUnitId || reUnits.length > 0) {
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, reUnits, templateConfig]);

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
      toast.success(res.data.message || t('deals.contractCreated', 'Contract created successfully'));
      fetchDealContract(editingDeal.id);
    } catch (err) {
      toast.error(err.response?.data?.message || t('deals.failedCreateContract', 'Failed to create contract'));
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
      toast.error(t('deals.enterCancellationReason', 'Please enter a cancellation reason'));
      return;
    }
    try {
      const res = await api.post('/re-cancellations', {
        deal_id: editingDeal.id,
        cancellation_reason: cancelFormData.reason,
        deduction_amount: parseFloat(cancelFormData.deduction_amount) || 0,
        unit_action: cancelFormData.unit_action
      });
      toast.success(res.data.message || t('deals.dealCancelledSuccess', 'Deal cancelled and unit released'));
      setShowCancelForm(false);
      fetchDeals(false);
      if (isRealEstate) fetchReUnits();
      fetchCancellation(editingDeal.id);
      fetchDealContract(editingDeal.id);
    } catch (err) {
      toast.error(err.response?.data?.message || t('deals.cancellationFailed', 'Cancellation failed'));
    }
  };

  const handleUpdateRefund = async (cancellationId, newStatus) => {
    try {
      const res = await api.patch(`/re-cancellations/${cancellationId}/refund`, {
        refund_status: newStatus
      });
      toast.success(res.data.message || t('deals.refundUpdated', 'Refund status updated'));
      fetchCancellation(editingDeal.id);
    } catch (err) {
      toast.error(err.response?.data?.message || t('deals.refundUpdateFailed', 'Refund update failed'));
    }
  };


  const fetchDealSla = async (dealId) => {
    if (!dealId) { setDealSla(null); return; }
    setSlaLoading(true);
    try {
      const res = await api.get(`/deals/${dealId}/sla`);
      setDealSla(res.data.data || null);
    } catch (err) {
      console.warn('Failed to fetch deal SLA:', err.message);
      setDealSla(null);
    } finally {
      setSlaLoading(false);
    }
  };

  const handleToggleOverdue = () => {
    const nextVal = !isOverdueOnly;
    setIsOverdueOnly(nextVal);
    fetchDeals(true, nextVal ? { overdue: 'true' } : {});
  };

  const handleExtendSla = async (dealId) => {
    const reason = window.prompt(t('deals.sla.extendReasonPrompt', 'Enter reason for extending the 48h SLA deadline:'));
    if (reason === null) return;
    const idempotencyKey = `sla_ext_${dealId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    setExtendingSla(true);
    try {
      const res = await api.post(`/deals/${dealId}/extend-sla`, { reason, idempotencyKey });
      toast.success(res.data?.message || t('deals.sla.extendSuccess', 'SLA extended by 48 hours.'));
      setDealSla(res.data?.sla || null);
      fetchDeals(false, isOverdueOnly ? { overdue: 'true' } : {});
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to extend SLA');
    } finally {
      setExtendingSla(false);
    }
  };

  const handleReassignDeal = async (dealId) => {
    if (!reassignTargetId) {
      toast.error(t('deals.sla.selectRepresentative', 'Please select a sales representative'));
      return;
    }
    try {
      const res = await api.post(`/deals/${dealId}/reassign`, {
        target_user_id: reassignTargetId,
        reason: reassignReason
      });
      toast.success(res.data?.message || t('deals.sla.reassignSuccess', 'Deal reassigned successfully.'));
      setDealSla(res.data?.sla || null);
      setShowReassignModal(false);
      setReassignTargetId('');
      setReassignReason('');
      fetchDeals(false, isOverdueOnly ? { overdue: 'true' } : {});
      setFormData(prev => ({ ...prev, assigned_to: reassignTargetId }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reassign deal');
    }
  };

  const handleOpenModal = (deal = null) => {
    if (deal) {
      setEditingDeal(deal);
      fetchDealSla(deal.id);
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
      setDealSla(null);
      setShowReassignModal(false);
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

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingDeal(null);
    setDealContract(null);
    setCancellationRecord(null);
    setShowCancelForm(false);
    setDealSla(null);
    setShowReassignModal(false);
    setReassignTargetId('');
    setReassignReason('');
    openedByQueryParamRef.current = null;
    if (searchParams.get('deal_id')) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('deal_id');
        return next;
      }, { replace: true });
    }
  };

  // Handle direct navigation or deep-link to deal (?deal_id=X)
  useEffect(() => {
    const dealIdParam = searchParams.get('deal_id');

    // If deal_id was cleared/not present in URL (e.g. browser Back button pressed)
    if (!dealIdParam) {
      if (openedByQueryParamRef.current && isModalOpen) {
        openedByQueryParamRef.current = null;
        setIsModalOpen(false);
        setEditingDeal(null);
      }
      return;
    }

    // If this deal is already open, avoid redundant work
    if (editingDeal && String(editingDeal.id) === String(dealIdParam) && isModalOpen) {
      return;
    }

    // 1. Check if the deal is already present in loaded deals
    const targetDeal = (deals || []).find(d => String(d.id) === String(dealIdParam));
    if (targetDeal) {
      openedByQueryParamRef.current = String(dealIdParam);
      handleOpenModal(targetDeal);
      return;
    }

    // 2. If DataContext is currently loading deals, wait for it to complete
    if (loading) return;

    // 3. If deals have finished loading and target wasn't found in list,
    // verify via backend endpoint (supports single-deal access, deep links, refresh)
    let isCancelled = false;
    api.get(`/deals/${dealIdParam}`)
      .then(res => {
        if (isCancelled) return;
        if (res.data?.status === 'success' && res.data.data) {
          openedByQueryParamRef.current = String(dealIdParam);
          handleOpenModal(res.data.data);
        } else {
          throw new Error('Deal not found');
        }
      })
      .catch(err => {
        if (isCancelled) return;
        console.warn('[Deals URL Navigation Notice] Requested deal is inaccessible or unauthorized');
        toast.error(t('deals.dealNotFoundOrUnauthorized', 'Deal not found or you do not have permission to view it.'));
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.delete('deal_id');
          return next;
        }, { replace: true });
      });

    return () => {
      isCancelled = true;
    };
  }, [searchParams, deals, loading, isModalOpen, editingDeal]);

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
    if (!formData.client_id) return toast.error(t('deals.selectCustomerReq', 'Please select a customer'));

    try {
      if (editingDeal) {
        await api.put(`/deals/${editingDeal.id}`, formData);
        toast.success(t('deals.dealUpdated', 'Deal updated'));
      } else {
        await api.post('/deals', formData);
        toast.success(t('deals.dealCreated', 'Deal created'));
      }
      fetchDeals(false);
      if (isRealEstate) fetchReUnits(); // Refresh availability
      handleCloseModal();
    } catch (err) {
      toast.error(err.response?.data?.message || t('deals.failedToSave', 'Failed to save deal'));
    }
  };

  const handleExtendReservation = async (dealId, hours) => {
    try {
      const res = await api.post(`/deals/${dealId}/extend-reservation`, { extension_hours: hours });
      toast.success(res.data.message || t('deals.reservationExtendedSuccess', 'Reservation extended by {hours} hours').replace('{hours}', hours));
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
      toast.error(err.response?.data?.message || t('deals.failedExtendReservation', 'Failed to extend reservation'));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('deals.confirmDelete', 'Delete this deal?'))) {
      try {
        await api.delete(`/deals/${id}`);
        toast.success(t('deals.dealDeleted', 'Deal deleted'));
        fetchDeals(false);
        if (isRealEstate) fetchReUnits();
      } catch (err) {
        toast.error(err.response?.data?.message || t('deals.failedToDelete', 'Failed to delete'));
      }
    }
  };

  const handleGenerateInvoice = async (dealId) => {
    if (window.confirm(t('deals.confirmGenerateInvoice', 'Generate an invoice for this deal? This will mark the deal as Won.'))) {
      try {
        await api.post(`/finance/invoices/from-deal/${dealId}`);
        toast.success(t('deals.invoiceGenerated', 'Invoice generated successfully'));
        navigate('/finance');
      } catch (err) {
        toast.error(t('deals.failedGenerateInvoice', 'Failed to generate invoice'));
      }
    }
  };

  const columns = [
    { 
      key: 'title', 
      label: t('deals.dealTitle', 'Deal Title'),
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', [isRTL ? 'marginRight' : 'marginLeft']: '30px', marginTop: '4px' }}>
                   <div style={{ 
                        display: 'flex', alignItems: 'center', gap: '6px', 
                        fontSize: '11px', color: '#0ea5e9', background: '#f0f9ff',
                        padding: '2px 10px', borderRadius: '6px', border: '1px solid #bae6fd',
                        fontWeight: 800
                   }}>
                        <Building2 size={12} /> {item.unit_project} • {t('deals.unitProject', 'Unit')} <span className="num-en">{item.unit_number}</span>
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
                            <Clock size={11} /> {new Date(item.unit_reservation_expires_at) < new Date() ? t('deals.expired', 'EXPIRED') : `${t('deals.expiresOn', 'Expires {date}').replace('{date}', new Date(item.unit_reservation_expires_at).toLocaleDateString('en-GB'))}`}
                            {item.unit_reservation_extension_count > 0 && <span style={{ opacity: 0.8 }}>(<span className="num-en">{item.unit_reservation_extension_count}</span>x)</span>}
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
                            <MapPin size={11} /> {t('deals.visit', 'Visit')}: <span className="num-en">{new Date(item.custom_fields.visit_date).toLocaleDateString('en-GB')}</span>
                            {item.custom_fields.visit_result ? ` • ${getVisitResultLabel(item.custom_fields.visit_result)}` : ''}
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
                                       <Clock size={12} /> {t('deals.dueSoon', 'DUE SOON')}: <span className="num-en">{dueDate.toLocaleDateString('en-GB')}</span>
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px', [isRTL ? 'marginRight' : 'marginLeft']: '30px' }}>
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
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', [isRTL ? 'marginRight' : 'marginLeft']: '30px', marginTop: '4px' }}>
                  {t('deals.convertedFromTask', 'Converted from Task')}
              </div>
          )}
        </div>
      )
    },
    !isRealEstate && { 
      key: 'product_name', 
      label: t('deals.product', 'Product'),
      render: (val, item) => (val || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>{t('deals.generalService', 'General Service')}</span>)
    },
    { 
      key: 'value', 
      label: t('deals.value', 'Value'),
      render: (val) => <span style={{ fontWeight: '700', color: 'var(--primary)' }}><span className="num-en">{Number(val || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}</span>
    },
    { 
      key: 'pipeline_stage', 
      label: t('deals.stage', 'Stage'),
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
            {getStageLabel(val)}
          </span>
        );
      }
    },
    { 
      key: 'client_name', 
      label: t('deals.customer', 'Customer'),
      render: (val, item) => item.client_name || t('deals.unassigned', 'Unassigned')
    },
    { 
      key: 'assigned_to_name', 
      label: t('deals.dealOwner', 'Deal Owner'),
      render: (val) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <User size={14} style={{ opacity: 0.6 }} />
          <span>{val || t('deals.unassigned', 'Unassigned')}</span>
        </div>
      )
    },
    { 
      key: 'is_overdue', 
      label: t('deals.sla.title', 'SLA Status'),
      render: (val, item) => {
        const isTerminal = ['won', 'lost', 'cancelled', 'closed'].includes(String(item.pipeline_stage || '').toLowerCase());
        if (isTerminal) {
          return (
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
              {t('deals.sla.terminalStatus', 'Closed')}
            </span>
          );
        }
        if (val || item.sla?.isOverdue) {
          return (
            <span style={{ 
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '2px 8px', borderRadius: '6px', fontSize: '11px',
              fontWeight: 800, background: '#fef2f2', color: '#dc2626',
              border: '1px solid #fecaca'
            }}>
              <AlertCircle size={12} />
              {t('deals.sla.overdueBadge', 'OVERDUE (>48h)')}
            </span>
          );
        }
        return (
          <span style={{ 
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '2px 8px', borderRadius: '6px', fontSize: '11px',
            fontWeight: 700, background: '#f0fdf4', color: '#16a34a',
            border: '1px solid #bbf7d0'
          }}>
            <Clock size={12} />
            {t('deals.sla.onTrackStatus', 'On Track').split('—')[0].trim()}
          </span>
        );
      }
    }
  ];

  return (
    <div>
      <div className="deals-page" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
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
            {templateConfig?.name === 'Real Estate' ? t('deals.realEstateMode', 'REAL ESTATE MODE') : t('deals.generalMode', 'GENERAL MODE')}
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: '800' }}>{t('deals.title', 'Deals')}</h2>
          <p style={{ color: 'var(--text-muted)' }}>{t('deals.subtitle', 'Track your deals from first contact to closing.')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {hasDealPermission('deal.view_overdue') && (
              <button 
                type="button"
                onClick={handleToggleOverdue} 
                style={{ 
                  padding: '6px 14px', 
                  borderRadius: '8px', 
                  border: isOverdueOnly ? '1px solid #ef4444' : '1px solid #cbd5e1', 
                  background: isOverdueOnly ? '#fef2f2' : 'white', 
                  color: isOverdueOnly ? '#dc2626' : '#64748b', 
                  fontWeight: 700, 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                <AlertCircle size={15} color={isOverdueOnly ? '#dc2626' : '#64748b'} />
                {t('deals.sla.filterOverdue', 'Overdue Deals (>48h)')}
              </button>
            )}
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                <button onClick={() => setViewMode('kanban')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: viewMode === 'kanban' ? 'white' : 'transparent', color: viewMode === 'kanban' ? 'var(--primary)' : '#64748b', fontWeight: 700, boxShadow: viewMode === 'kanban' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: 'all 0.2s' }}>
                    {t('deals.kanban', 'Kanban')}
                </button>
                <button onClick={() => setViewMode('table')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: viewMode === 'table' ? 'white' : 'transparent', color: viewMode === 'table' ? 'var(--primary)' : '#64748b', fontWeight: 700, boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: 'all 0.2s' }}>
                    {t('deals.list', 'List')}
                </button>
            </div>
            {canEditDetails && (
              <button label="add deal control" className="btn-add" onClick={() => handleOpenModal()}>
                  <Plus size={20} />
                  {t('deals.createDeal', 'Create Deal')}
              </button>
            )}
        </div>
      </div>

      {viewMode === 'table' ? (
        <DataTable 
          title={t('deals.title', 'Deals')}
          columns={columns.filter(Boolean)}
          data={deals || []}
          loading={loading}
          onEdit={handleOpenModal}
          onDelete={canDeleteDeal ? handleDelete : undefined}
          actions={(row) => (
            <button 
              title={t('deals.generateInvoice', 'Generate Invoice')} 
              onClick={() => handleGenerateInvoice(row.id)}
              style={{ padding: '6px', borderRadius: '6px', background: '#f0fdf4', color: '#16a34a', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Receipt size={16} />
              <span style={{ fontSize: '12px', fontWeight: '600' }}>{t('deals.bill', 'Bill')}</span>
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
        onClose={handleCloseModal}
        title={editingDeal ? t('deals.updateDeal', 'Update Deal') : t('deals.newSalesDeal', 'New Sales Deal')}
        footer={
          <>
            <button label="cancel addition" className="btn-cancel" onClick={handleCloseModal}>{t('common.cancel', 'Cancel')}</button>
            <button label="save addition" className="btn-save" onClick={handleSubmit} disabled={!canSaveModal} style={{ opacity: canSaveModal ? 1 : 0.5, cursor: canSaveModal ? 'pointer' : 'not-allowed' }}>
              {editingDeal ? t('deals.updateDeal', 'Update Deal') : t('deals.createDeal', 'Create Deal')}
            </button>
          </>
        }
      >
        <form className="form-grid" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
          {isDealLocked && (
            <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '8px', background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', fontWeight: 700 }}>
              <AlertCircle size={16} />
              {isFinalDealStage
                ? t('deals.dealLockedFinalStage', 'This deal is {stage}...').replace('{stage}', getStageLabel(editingDeal?.pipeline_stage))
                : t('deals.dealLockedContract', 'This deal has an active contract ({contractNumber})...').replace('{contractNumber}', dealContract?.contract_number)}
              {isRealEstate && ` ${t('deals.dealLockedReversalHint', 'Use "Cancel Deal & Refund" to reverse it.')}`}
            </div>
          )}

          {/* Batch F: Deal SLA Status Card */}
          {editingDeal && dealSla && (
            <div style={{
              gridColumn: 'span 2',
              background: dealSla.isOverdue ? '#fef2f2' : (dealSla.isTerminal ? '#f8fafc' : '#f0fdf4'),
              border: `1px solid ${dealSla.isOverdue ? '#fca5a5' : (dealSla.isTerminal ? '#e2e8f0' : '#86efac')}`,
              borderRadius: '12px',
              padding: '14px 16px',
              marginBottom: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={16} color={dealSla.isOverdue ? '#dc2626' : (dealSla.isTerminal ? '#64748b' : '#16a34a')} />
                  <span style={{ fontSize: '13px', fontWeight: 800, color: dealSla.isOverdue ? '#991b1b' : (dealSla.isTerminal ? '#475569' : '#166534') }}>
                    {dealSla.isTerminal
                      ? t('deals.sla.terminalStatus', 'Deal Finalized (SLA Inactive)')
                      : (dealSla.isOverdue
                          ? t('deals.sla.overdueStatus', 'Overdue by {hours}h (SLA Breached)').replace('{hours}', dealSla.overdueHours)
                          : t('deals.sla.onTrackStatus', 'SLA On Track — {hours}h remaining').replace('{hours}', dealSla.remainingHours)
                        )}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {canExtendSla && !dealSla.isTerminal && (
                    <button
                      type="button"
                      disabled={extendingSla}
                      onClick={() => handleExtendSla(editingDeal.id)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#0284c7',
                        color: 'white',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: extendingSla ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Plus size={13} />
                      {t('deals.sla.extendSlaBtn', '+48h Extend SLA')}
                    </button>
                  )}
                  {canReassign && (
                    <button
                      type="button"
                      onClick={() => setShowReassignModal(!showReassignModal)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        background: 'white',
                        color: '#334155',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <User size={13} />
                      {t('deals.sla.reassignBtn', 'Reassign Deal')}
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', fontSize: '11px', color: '#475569' }}>
                <div>
                  <span style={{ color: '#64748b' }}>{t('deals.sla.effectiveDeadline', 'Deadline: {date}').split(':')[0]}: </span>
                  <strong><span className="num-en">{new Date(dealSla.effectiveDeadline).toLocaleString('en-GB')}</span></strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>{t('deals.sla.lastFollowUp', 'Last follow-up: {date}').split(':')[0]}: </span>
                  <strong><span className="num-en">{new Date(dealSla.effectiveAnchor).toLocaleString('en-GB')}</span></strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>{t('deals.sla.extensionsCount', 'Extensions: {count}').split(':')[0]}: </span>
                  <strong>{dealSla.extensionCount > 0 ? t('deals.sla.extensionsCount', 'Extended {count} time(s)').replace('{count}', dealSla.extensionCount) : 0}</strong>
                </div>
                {dealSla.lastExtendedBy && (
                  <div>
                    <span style={{ color: '#64748b' }}>{t('deals.sla.lastExtendedBy', 'Last extended by: {name}').replace('{name}', dealSla.lastExtendedBy)}</span>
                  </div>
                )}
              </div>

              {dealSla.isOverdue && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={13} />
                  {t('deals.sla.overdueNotice', 'No impactful client interaction (call, meeting, completed task) recorded in the last 48 hours.')}
                </div>
              )}

              {/* Reassign Sub-Panel */}
              {showReassignModal && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>
                    {t('deals.sla.reassignModalTitle', 'Reassign Deal to Representative')}
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                    <select 
                      value={reassignTargetId} 
                      onChange={(e) => setReassignTargetId(e.target.value)}
                      style={{ padding: '6px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    >
                      <option value="">{t('deals.sla.selectRepresentative', '-- Select Representative --')}</option>
                      {(users || []).filter(u => String(u.id) !== String(editingDeal.assigned_to)).map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder={t('deals.sla.reassignReasonPlaceholder', 'Reason for reassignment...')}
                      value={reassignReason}
                      onChange={(e) => setReassignReason(e.target.value)}
                      style={{ padding: '6px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                    <button
                      type="button"
                      onClick={() => handleReassignDeal(editingDeal.id)}
                      style={{ padding: '6px 14px', background: '#4f46e5', color: 'white', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {t('common.confirm', 'Confirm')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="form-group full">
            <label>{t('deals.dealTitle', 'Deal Title')}</label>
            <input 
              type="text" 
              placeholder={t('deals.dealTitlePlaceholder', 'e.g. Website Overhaul Project')}
              value={formData.title}
              disabled={isDetailsDisabled}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              required
            />
          </div>

          {/* REAL ESTATE UNIT SELECTOR */}
          {isRealEstate && (
            <div className="unit-select-card">
                <label style={{ color: '#0369a1', fontWeight: 800, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Building2 size={14} /> {t('deals.selectPropertyUnit', 'SELECT PROPERTY UNIT (REAL ESTATE)')}
                </label>
                <select 
                    className="ap-input" 
                    style={{ border: '1px solid #0ea5e9' }}
                    value={formData.unit_id} 
                    disabled={!!editingDeal || isDetailsDisabled}
                    onChange={(e) => handleUnitChange(e.target.value)}
                >
                    <option value="">{t('deals.selectAvailableUnit', '-- Select Available Unit --')}</option>
                    {(reUnits || []).filter(u => u.status === 'Available' || String(u.id) === String(formData.unit_id)).map(u => (
                        <option key={u.id} value={u.id}>
                            {u.project_name} | Unit {u.unit_number} ({u.area}m²) - {Number(u.price).toLocaleString('en-US')} {t('common.currency', 'EGP')}
                        </option>
                    ))}
                </select>
                <p style={{ fontSize: '11px', color: '#0284c7', marginTop: '6px' }}>{t('deals.unitAutoValueHint', 'Selecting a unit will automatically set the deal value and reserve the unit.')}</p>
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
                disabled={isDetailsDisabled}
                onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
              />
            </div>
          ))}

          {!isRealEstate && (
            <div className="form-group">
                <label>{t('deals.selectProductOptional', 'Select Product (Optional)')}</label>
                <select 
                value={formData.product_id}
                disabled={isDetailsDisabled}
                onChange={(e) => handleProductChange(e.target.value)}
                >
                <option value="">{t('deals.noSpecificProduct', '-- No Specific Product --')}</option>
                {(products || []).map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({Number(p.selling_price || 0).toLocaleString('en-US')} {t('common.currency', 'EGP')})</option>
                ))}
                </select>
            </div>
          )}
          
          <div className="form-group">
            <label>{t('deals.linkToCustomer', 'Link to Customer')}</label>
            <select 
              value={formData.client_id}
              disabled={isDetailsDisabled}
              onChange={(e) => setFormData({...formData, client_id: e.target.value})}
              required
            >
              <option value="">{t('deals.selectCustomer', '-- Select Customer --')}</option>
              {(customers || []).map(c => (
                <option key={c.id} value={c.id}>{c.name} {c.company_name ? `(${c.company_name})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>{t('deals.dealValue', 'Deal Value ({currency})').replace('{currency}', t('common.currency', 'EGP'))}</label>
            <input 
              type="number" 
              value={formData.value}
              onChange={(e) => setFormData({...formData, value: e.target.value})}
              disabled={!!formData.unit_id || isDetailsDisabled}
            />
          </div>
          <div className="form-group">
            <label>{t('deals.pipelineStage', 'Pipeline Stage')}</label>
            <select 
              value={formData.pipeline_stage}
              disabled={isStageDisabled}
              onChange={(e) => setFormData({...formData, pipeline_stage: e.target.value})}
            >
              {(templateConfig?.pipeline || []).map(stage => (
                <option key={stage} value={stage}>{getStageLabel(stage)}</option>
              )) || (
                <>
                  <option value="discovery">{getStageLabel('discovery')}</option>
                  <option value="won">{getStageLabel('won')}</option>
                </>
              )}
            </select>
          </div>
          
          {/* Phase 2: Action Metrics */}
          {!isRealEstate && (
            <>
                <div className="form-group">
                    <label>{t('deals.winProbability', 'Win Probability (%)')}</label>
                    <input type="number" min="0" max="100" value={formData.probability} disabled={isDetailsDisabled} onChange={(e) => setFormData({...formData, probability: parseInt(e.target.value) || 0})} />
                </div>
                <div className="form-group">
                    <label>{t('deals.expectedCloseDate', 'Expected Close Date')}</label>
                    <input type="date" value={formData.expected_close_date} disabled={isDetailsDisabled} onChange={(e) => setFormData({...formData, expected_close_date: e.target.value})} />
                </div>
                <div className="form-group full">
                    <label>{t('deals.nextActionRequired', 'Next Action Required')}</label>
                    <input type="text" placeholder={t('deals.nextActionPlaceholder', 'e.g. Call client to discuss proposal')} value={formData.next_action} disabled={isDetailsDisabled} onChange={(e) => setFormData({...formData, next_action: e.target.value})} />
                </div>
            </>
          )}

          <div className="form-group full">
            <label>{t('deals.dealOwner', 'Deal Owner')}</label>
            <select 
              value={formData.assigned_to}
              disabled={isReassignDisabled}
              onChange={(e) => setFormData({...formData, assigned_to: e.target.value})}
            >
              <option value="">{t('deals.meDefault', 'Me (Default)')}</option>
              {(users || []).map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          </div>

          {/* Phase 3: Lightweight Site Visit Details */}
          {formData.pipeline_stage?.toLowerCase() === 'site visit' && (
            <div style={{ gridColumn: 'span 2', background: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: '12px', padding: '16px', marginBottom: '8px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#7e22ce', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <MapPin size={16} /> {t('deals.siteVisitInfo', 'Site Visit Information')}
              </h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>{t('deals.visitDateTime', 'Visit Date & Time')}</label>
                  <input 
                    type="datetime-local" 
                    value={formData.custom_fields?.visit_date || ''} 
                    onChange={(e) => handleCustomFieldChange('visit_date', e.target.value)} 
                  />
                </div>
                <div className="form-group">
                  <label>{t('deals.visitStatusResult', 'Visit Status / Result')}</label>
                  <select 
                    value={formData.custom_fields?.visit_result || 'Scheduled'} 
                    onChange={(e) => handleCustomFieldChange('visit_result', e.target.value)}
                  >
                    <option value="Scheduled">{t('deals.visitResults.scheduled', 'Scheduled')}</option>
                    <option value="Completed - Highly Interested">{t('deals.visitResults.completedInterested', 'Completed - Highly Interested')}</option>
                    <option value="Completed - Considering Offer">{t('deals.visitResults.completedConsidering', 'Completed - Considering Offer')}</option>
                    <option value="Completed - Unit Unsuitable">{t('deals.visitResults.completedUnsuitable', 'Completed - Unit Unsuitable')}</option>
                    <option value="Postponed">{t('deals.visitResults.postponed', 'Client Postponed')}</option>
                    <option value="Cancelled">{t('deals.visitResults.cancelled', 'Cancelled')}</option>
                    <option value="No-Show">{t('deals.visitResults.noShow', 'Client No-Show')}</option>
                  </select>
                </div>
                <div className="form-group full" style={{ marginBottom: 0 }}>
                  <label>{t('deals.visitFeedbackNotes', 'Visit Feedback & Notes')}</label>
                  <textarea 
                    rows="2"
                    placeholder={t('deals.visitFeedbackPlaceholder', 'Client impressions, preferences discussed during the site visit...')} 
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
                  <Building2 size={18} color="#16a34a"/> {t('deals.unitReservationStatus', 'Unit Reservation Status')}
                </h4>
                <div style={{ padding: '4px 10px', background: '#dcfce7', color: '#15803d', borderRadius: '6px', fontSize: '11px', fontWeight: 800, border: '1px solid #86efac' }}>
                  {getReservationStatusLabel(editingDeal.unit_status)}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px', fontSize: '12px' }}>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontWeight: 600 }}>{t('deals.linkedUnit', 'Linked Unit:')}</span>
                  <span style={{ fontWeight: 800, color: '#1e293b' }}>
                    {editingDeal.unit_project} • {t('deals.unitProject', 'Unit')} <span className="num-en">{editingDeal.unit_number}</span>
                  </span>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontWeight: 600 }}>{t('deals.reservationExpires', 'Reservation Expires:')}</span>
                  <span style={{ fontWeight: 800, color: editingDeal.unit_reservation_expires_at && new Date(editingDeal.unit_reservation_expires_at) < new Date() ? '#dc2626' : '#166534' }}>
                    {editingDeal.unit_reservation_expires_at ? <span className="num-en">{new Date(editingDeal.unit_reservation_expires_at).toLocaleString('en-GB')}</span> : t('deals.active', 'Active')}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid #dcfce7', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 700 }}>
                  {editingDeal.unit_reservation_extension_count > 0 
                    ? t('deals.extendedTimes', 'Extended {count} time(s)').replace('{count}', editingDeal.unit_reservation_extension_count) 
                    : t('deals.activeReservation', 'Active Reservation')}
                </span>
                {canExtendSla && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleExtendReservation(editingDeal.id, 24)}
                      style={{ padding: '6px 14px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {t('deals.extend24h', 'Extend +24h')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExtendReservation(editingDeal.id, 48)}
                      style={{ padding: '6px 14px', background: '#0d9488', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {t('deals.extend48h', 'Extend +48h')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Related Records – downstream workspaces originate from this Deal but live in their own pages */}
          {isRealEstate && editingDeal?.id && (
            <div style={{ gridColumn: 'span 2', background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginTop: '6px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
                  <FileText size={16} color="#2563eb" /> {t('deals.relatedRecords', 'Related Records')}
                </h4>
                {contractLoading ? (
                  <span style={{ fontSize: '11px', color: '#64748b' }}>{t('common.loading', 'Loading...')}</span>
                ) : dealContract ? (
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#1d4ed8' }}>
                    <span className="num-en">{dealContract.contract_number}</span> • {getContractStatusLabel(dealContract.status)}
                    {dealContract.expiry_state === 'expiring_soon' && ` • ${t('deals.expiresInDays', 'expires in {days}d').replace('{days}', dealContract.days_remaining)}`}
                    {dealContract.expiry_state === 'expired' && ` • ${t('deals.expired', 'EXPIRED')}`}
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', color: '#64748b' }}>{t('deals.noContractYet', 'No contract yet')}</span>
                )}
              </div>

              {!dealContract && !contractLoading && editingDeal?.unit_id && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>{t('deals.canOriginateContract', 'This deal can originate a sales contract.')}</span>
                  <button
                    type="button"
                    onClick={handleCreateContract}
                    style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <FileText size={14} /> {t('deals.createSalesContract', 'Create Sales Contract')}
                  </button>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {[
                  { label: t('deals.relatedLinks.contract', 'Contract'), path: '/contracts', icon: <FileText size={14} />, enabled: !!dealContract },
                  { label: t('deals.relatedLinks.installments', 'Installments'), path: '/installments', icon: <CreditCard size={14} />, enabled: !!dealContract },
                  { label: t('deals.relatedLinks.commissions', 'Commissions'), path: '/commissions', icon: <Award size={14} />, enabled: true },
                  { label: t('deals.relatedLinks.handover', 'Handover'), path: '/handover', icon: <Key size={14} />, enabled: !!editingDeal?.unit_id },
                ].map(link => (
                  <button
                    key={link.path}
                    type="button"
                    disabled={!link.enabled}
                    onClick={() => { handleCloseModal(); navigate(`${link.path}?deal_id=${editingDeal.id}`); }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', background: link.enabled ? 'white' : '#f1f5f9', color: link.enabled ? '#0f172a' : '#94a3b8', fontSize: '12px', fontWeight: 700, cursor: link.enabled ? 'pointer' : 'not-allowed' }}
                  >
                    {link.icon} {link.label} <ArrowRight size={12} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
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
                  {cancellationRecord ? t('deals.cancellationRefundAudit', 'Deal Cancellation & Refund Audit') : t('deals.cancellationUnitRelease', 'Cancellation & Unit Release')}
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
                    {t('deals.refundStatusLabel', 'Refund: {status}').replace('{status}', getRefundStatusLabel(cancellationRecord.refund_status))}
                  </span>
                ) : canDeleteDeal && editingDeal?.pipeline_stage?.toLowerCase() !== 'lost' && (
                  <button
                    type="button"
                    onClick={() => setShowCancelForm(!showCancelForm)}
                    style={{ padding: '4px 10px', background: showCancelForm ? '#f1f5f9' : '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {showCancelForm ? t('common.close', 'Close') : t('deals.cancelDealAndRefund', 'Cancel Deal & Refund')}
                  </button>
                )}
              </div>

              {/* Cancellation Details if already cancelled */}
              {cancellationRecord && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '11px', marginBottom: '10px' }}>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontWeight: 600 }}>{t('deals.totalCollected', 'Total Collected:')}</span>
                      <strong style={{ color: '#1e293b' }}><span className="num-en">{Number(cancellationRecord.total_paid_amount || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontWeight: 600 }}>{t('deals.penaltyDeduction', 'Penalty Deduction:')}</span>
                      <strong style={{ color: '#b91c1c' }}>-<span className="num-en">{Number(cancellationRecord.deduction_amount || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontWeight: 600 }}>{t('deals.refundableBalance', 'Refundable Balance:')}</span>
                      <strong style={{ color: '#047857' }}><span className="num-en">{Number(cancellationRecord.refundable_amount || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}</strong>
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#475569', marginBottom: '10px', background: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid #fecdd3' }}>
                    <strong>{t('deals.cancellationReasonLabel', 'Reason:')}</strong> {cancellationRecord.cancellation_reason}
                  </div>
                  {cancellationRecord.refund_status === 'Pending' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateRefund(cancellationRecord.id, 'Processed')}
                      style={{ padding: '6px 14px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {t('deals.markRefundProcessed', 'Mark Refund as Processed')}
                    </button>
                  )}
                </div>
              )}

              {/* Cancellation Form */}
              {!cancellationRecord && showCancelForm && (
                <div style={{ background: '#fff', border: '1px dashed #f87171', borderRadius: '8px', padding: '12px' }}>
                  <div className="form-group" style={{ marginBottom: '8px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#991b1b' }}>{t('deals.cancellationReasonReq', 'Cancellation Reason (Required)')}</label>
                    <textarea
                      rows="2"
                      placeholder={t('deals.cancellationReasonPlaceholder', 'Specify buyer withdrawal reason, financial default, or agreement...')}
                      value={cancelFormData.reason}
                      onChange={(e) => setCancelFormData({ ...cancelFormData, reason: e.target.value })}
                      style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>{t('deals.deductionPenalty', 'Deduction / Penalty ({currency})').replace('{currency}', t('common.currency', 'EGP'))}</label>
                      <input
                        type="number"
                        min="0"
                        value={cancelFormData.deduction_amount}
                        onChange={(e) => setCancelFormData({ ...cancelFormData, deduction_amount: e.target.value })}
                        style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>{t('deals.unitAction', 'Unit Action')}</label>
                      <select
                        value={cancelFormData.unit_action}
                        onChange={(e) => setCancelFormData({ ...cancelFormData, unit_action: e.target.value })}
                        style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                      >
                        <option value="release">{t('deals.releaseUnitAvailable', 'Release Unit to Available')}</option>
                        <option value="keep_reserved">{t('deals.keepUnitUnchanged', 'Keep Unit Status Unchanged')}</option>
                      </select>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleProcessCancellation}
                    style={{ padding: '6px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {t('deals.confirmCancellationProcess', 'Confirm Cancellation & Process')}
                  </button>
                </div>
              )}
            </div>
          )}
        </form>
        {editingDeal && (
          <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', marginBottom: '16px' }}>{t('deals.dealActivityTimeline', 'Deal Activity Timeline')}</h3>
            <ActivityTimeline entityType="deal" entityId={editingDeal.id} canLog={hasDealPermission('deal.log_activity')} />
          </div>
        )}
      </Modal>
      </div>
    </div>
  );
};

export default Deals;
