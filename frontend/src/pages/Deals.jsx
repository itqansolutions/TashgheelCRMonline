import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useData } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';
import { Plus, Handshake, DollarSign, Calendar, Target, User, Receipt, ArrowRight, MapPin, Coins, Ruler, Building2, Layers, Zap, Clock, AlertCircle, FileText, CheckCircle2, XCircle, CreditCard, Award, Key, ExternalLink } from 'lucide-react';
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
  const routeParams = useParams();

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
  // Deal Modal Tabs State: 'overview' | 'customer' | 'unit' | 'contract' | 'followup'
  const [activeDealTab, setActiveDealTab] = useState('overview');
  // Deal Finance & Milestones In-Context Sub-Tabs: 'contract' | 'installments' | 'commissions' | 'handover'
  const [activeRelatedTab, setActiveRelatedTab] = useState('contract');
  const [dealInstallments, setDealInstallments] = useState(null);
  const [installmentsLoading, setInstallmentsLoading] = useState(false);
  const [dealCommissions, setDealCommissions] = useState(null);
  const [commissionsLoading, setCommissionsLoading] = useState(false);
  const [dealHandover, setDealHandover] = useState(null);
  const [handoverLoading, setHandoverLoading] = useState(false);
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

  const fetchDealInstallments = async (dealId) => {
    if (!dealId) { setDealInstallments(null); return; }
    setInstallmentsLoading(true);
    try {
      const res = await api.get(`/re-installments?deal_id=${dealId}`);
      setDealInstallments(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch deal installments:', err);
      setDealInstallments([]);
    } finally {
      setInstallmentsLoading(false);
    }
  };

  const fetchDealCommissions = async (dealId) => {
    if (!dealId) { setDealCommissions(null); return; }
    setCommissionsLoading(true);
    try {
      const res = await api.get(`/re-commissions?deal_id=${dealId}`);
      setDealCommissions({
        items: res.data.data || [],
        summary: res.data.summary || {}
      });
    } catch (err) {
      console.error('Failed to fetch deal commissions:', err);
      setDealCommissions({ items: [], summary: {} });
    } finally {
      setCommissionsLoading(false);
    }
  };

  const fetchDealHandover = async (dealId) => {
    if (!dealId) { setDealHandover(null); return; }
    setHandoverLoading(true);
    try {
      const res = await api.get(`/re-handovers?deal_id=${dealId}`);
      setDealHandover(res.data.data && res.data.data.length > 0 ? res.data.data[0] : null);
    } catch (err) {
      console.error('Failed to fetch deal handover:', err);
      setDealHandover(null);
    } finally {
      setHandoverLoading(false);
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
    setActiveDealTab('overview');
    setActiveRelatedTab('contract');
    if (deal) {
      setEditingDeal(deal);
      setDealContract(null);
      setCancellationRecord(null);
      setShowCancelForm(false);
      setDealSla(null);
      setShowReassignModal(false);
      setDealInstallments(null);
      setDealCommissions(null);
      setDealHandover(null);
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
        fetchDealInstallments(deal.id);
        fetchDealCommissions(deal.id);
        fetchDealHandover(deal.id);
      }
    } else {
      setEditingDeal(null);
      setDealContract(null);
      setCancellationRecord(null);
      setShowCancelForm(false);
      setDealSla(null);
      setShowReassignModal(false);
      setActiveRelatedTab('contract');
      setDealInstallments(null);
      setDealCommissions(null);
      setDealHandover(null);
      setFormData({ 
        title: '', 
        value: 0, 
        pipeline_stage: templateConfig?.pipeline?.[0] || '', 
        client_id: '', 
        product_id: '', 
        assigned_to: user?.id || '',
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
    setActiveDealTab('overview');
    setActiveRelatedTab('contract');
    setDealInstallments(null);
    setDealCommissions(null);
    setDealHandover(null);
    openedByQueryParamRef.current = null;
    if (routeParams?.id) {
      navigate('/deals', { replace: true });
    } else if (searchParams.get('deal_id')) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('deal_id');
        return next;
      }, { replace: true });
    }
  };

  // Handle direct navigation or deep-link to deal (?deal_id=X or /deals/:id)
  useEffect(() => {
    const dealIdParam = searchParams.get('deal_id') || routeParams?.id;

    // If deal_id was cleared/not present in URL (e.g. browser Back button pressed)
    if (!dealIdParam) {
      if (openedByQueryParamRef.current && isModalOpen) {
        openedByQueryParamRef.current = null;
        setIsModalOpen(false);
        setEditingDeal(null);
      }
      return;
    }

    // If this deal was already opened by this URL parameter, do not re-run and overwrite user's form edits
    if (openedByQueryParamRef.current === String(dealIdParam)) {
      return;
    }

    // If this deal is already open, record ref and avoid redundant work
    if (editingDeal && String(editingDeal.id) === String(dealIdParam) && isModalOpen) {
      openedByQueryParamRef.current = String(dealIdParam);
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
        if (routeParams?.id) {
          navigate('/deals', { replace: true });
        } else {
          setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.delete('deal_id');
            return next;
          }, { replace: true });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [searchParams, routeParams?.id, deals, loading]);

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
      const unit = (reUnits || []).find(u => String(u.id) === String(unitId));
      const prevUnit = (reUnits || []).find(u => String(u.id) === String(formData.unit_id));
      const shouldUpdatePrice = unit && Number(unit.price || 0) > 0 && (
          !formData.value ||
          Number(formData.value) === 0 ||
          (prevUnit && Number(formData.value) === Number(prevUnit.price))
      );
      let nextTitle = formData.title;
      if ((!editingDeal || !formData.title) && unit) {
          nextTitle = `${unit.project_name || ''} - Unit ${unit.unit_number || ''}`.trim();
      } else if (unit && nextTitle && nextTitle.startsWith('Property Finder:') && !nextTitle.includes(' - ')) {
          nextTitle = `${nextTitle} - ${unit.unit_number || unit.name}`;
      }
      setFormData({
          ...formData,
          unit_id: unitId,
          value: shouldUpdatePrice ? unit.price : formData.value,
          title: nextTitle,
          custom_fields: {
              ...formData.custom_fields,
              project: unit?.project_name || formData.custom_fields?.project || ''
          }
      });
  };

  const handleStageChange = async (deal, nextStage) => {
    if (!deal || !nextStage) return;
    if (!hasDealPermission('deal.update_stage')) {
      return toast.error(t('deals.noPermissionStage', 'You do not have permission to change deal stages.'));
    }
    try {
      await api.patch(`/deals/${deal.id}/status`, { pipeline_stage: nextStage });
      toast.success(
        isRTL
          ? `تم نقل الصفقة إلى "${getStageLabel(nextStage)}"`
          : `Moved deal to ${getStageLabel(nextStage)}`
      );
      fetchDeals(false);
      if (isRealEstate) fetchReUnits();
    } catch (err) {
      toast.error(err.response?.data?.message || t('deals.failedToSave', 'Failed to update deal stage'));
    }
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

  const handleReserveUnit = async (dealId) => {
    try {
      const res = await api.post(`/deals/${dealId}/reserve-unit`);
      toast.success(
        isRTL
          ? 'تم حجز الوحدة العقارية لهذه الصفقة لمدة 48 ساعة بنجاح'
          : (res.data?.message || 'Unit reserved for 48 hours')
      );
      fetchDeals(false);
      if (isRealEstate) fetchReUnits();
      if (editingDeal && editingDeal.id === dealId && res.data?.data) {
        setEditingDeal(prev => ({
          ...prev,
          ...res.data.data
        }));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || (isRTL ? 'تعذر حجز الوحدة العقارية' : 'Failed to reserve unit'));
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
          <div 
            onClick={() => handleOpenModal(item)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
            title={isRTL ? 'اضغط لفتح كارت تفاصيل الصفقة' : 'Click to open deal details card'}
          >
            <div style={{ padding: '6px', borderRadius: '6px', background: '#fff7ed', color: '#f59e0b' }}>
              <Handshake size={14} />
            </div>
            <span style={{ fontWeight: '700', color: 'var(--primary)' }}>{val}</span>
          </div>

          {/* REAL ESTATE UNIT BADGE */}
          {isRealEstate && item.unit_id && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', [isRTL ? 'marginRight' : 'marginLeft']: '30px', marginTop: '4px' }}>
                   <div
                        data-stop-propagation="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/units-registry?unit_id=${item.unit_id}`);
                        }}
                        title={isRTL ? 'اضغط لعرض بطاقة الوحدة الشاملة وجميع العملاء والصفقات المرتبطة' : 'Click to open Unit Overview Card'}
                        style={{ 
                          display: 'flex', alignItems: 'center', gap: '6px', 
                          fontSize: '11px', color: '#0ea5e9', background: '#f0f9ff',
                          padding: '2px 10px', borderRadius: '6px', border: '1px solid #bae6fd',
                          fontWeight: 800, cursor: 'pointer'
                        }}
                   >
                        <Building2 size={12} /> {item.unit_project} • {t('deals.unitProject', 'Unit')} <span className="num-en">{item.unit_number}</span>
                        {item.unit_name && item.unit_name !== item.unit_number ? <span>({item.unit_name})</span> : null}
                   </div>
                   
                   {/* RESERVATION STATUS / EXPIRATION BADGE */}
                   {String(item.unit_status || '').toLowerCase() === 'reserved' && item.unit_reservation_expires_at && (
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

          {/* PROPERTY FINDER UNLINKED FALLBACK BADGE */}
          {!item.unit_id && item.source_type === 'property_finder' && (item.custom_fields?.pf_listing_reference || item.custom_fields?.pf_listing_id || item.custom_fields?.pf_project_id) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', [isRTL ? 'marginRight' : 'marginLeft']: '30px', marginTop: '4px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '11px', color: '#b45309', background: '#fffbeb',
                padding: '2px 10px', borderRadius: '6px', border: '1px solid #fde68a',
                fontWeight: 700
              }}>
                <Building2 size={12} />
                <span>
                  Property Finder {item.custom_fields?.lead_type === 'project' ? 'Project' : 'Listing'}:{' '}
                  <span className="num-en">{item.custom_fields?.pf_listing_reference || item.custom_fields?.pf_listing_id || item.custom_fields?.pf_project_id}</span>
                </span>
              </div>
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
      render: (val, item) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontWeight: '700', color: 'var(--primary)' }}>
            <span className="num-en">{Number(val || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}
          </span>
          {Number(val || 0) === 0 && item.unit_price && (
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              {t('deals.unitListPrice', 'Unit Price')}: <span className="num-en">{Number(item.unit_price).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}
            </span>
          )}
        </div>
      )
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
      key: 'next_action',
      label: t('deals.nextActionRequired', 'Next Action'),
      render: (val, item) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxWidth: '180px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: val ? '#0f172a' : '#94a3b8' }}>
            {val || '—'}
          </span>
          {item.expected_close_date && (
            <span style={{ fontSize: '10px', color: '#64748b' }}>
              <span className="num-en">{item.expected_close_date.split('T')[0]}</span>
            </span>
          )}
        </div>
      )
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

  const selectedCustomer = (customers || []).find(c => String(c.id) === String(formData.client_id));
  const selectedUnit = (reUnits || []).find(u => String(u.id) === String(formData.unit_id));

  const dealTabs = [
    { id: 'overview', label: isRTL ? 'نظرة عامة' : 'Overview', icon: <Layers size={14} /> },
    { id: 'customer', label: isRTL ? 'العميل' : 'Customer', icon: <User size={14} />, badge: formData.client_id ? '✓' : null },
    { id: 'unit', label: isRealEstate ? (isRTL ? 'الوحدة والحجز' : 'Unit & Reservation') : (isRTL ? 'المنتج' : 'Product'), icon: isRealEstate ? <Building2 size={14} /> : <Layers size={14} />, badge: isRealEstate && formData.unit_id ? '✓' : null },
    ...(isRealEstate && editingDeal ? [{ id: 'contract', label: isRTL ? 'العقد والتحصيلات' : 'Contract & Collections', icon: <CreditCard size={14} />, badge: dealContract ? dealContract.status : null }] : []),
    { id: 'followup', label: isRTL ? 'المتابعة' : 'Follow-up', icon: <Clock size={14} />, badge: formData.next_action ? '•' : null }
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
          onRowClick={handleOpenModal}
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
          onStageChange={handleStageChange}
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
        <div style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
          {/* 5 Simplified Deal Workspace Tabs */}
          <div style={{
            display: 'flex',
            gap: '8px',
            borderBottom: '2px solid #e2e8f0',
            paddingBottom: '10px',
            marginBottom: '18px',
            overflowX: 'auto',
            alignItems: 'center'
          }}>
            {dealTabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveDealTab(tab.id)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: activeDealTab === tab.id ? '1px solid #0284c7' : '1px solid #e2e8f0',
                  background: activeDealTab === tab.id ? '#0284c7' : '#f8fafc',
                  color: activeDealTab === tab.id ? 'white' : '#475569',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge && (
                  <span style={{
                    padding: '1px 6px',
                    borderRadius: '999px',
                    fontSize: '10px',
                    fontWeight: 800,
                    background: activeDealTab === tab.id ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
                    color: activeDealTab === tab.id ? 'white' : '#0f172a'
                  }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="form-grid">
            {/* TAB 1: OVERVIEW (نظرة عامة) */}
            {activeDealTab === 'overview' && (
              <>
                {isDealLocked && (
                  <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '8px', background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', fontWeight: 700 }}>
                    <AlertCircle size={16} />
                    {isFinalDealStage
                      ? t('deals.dealLockedFinalStage', 'This deal is {stage}...').replace('{stage}', getStageLabel(editingDeal?.pipeline_stage))
                      : t('deals.dealLockedContract', 'This deal has an active contract ({contractNumber})...').replace('{contractNumber}', dealContract?.contract_number)}
                    {isRealEstate && ` ${t('deals.dealLockedReversalHint', 'Use "Cancel Deal & Refund" to reverse it.')}`}
                  </div>
                )}

                {/* Deal SLA Status Card */}
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

                {/* Quick Summary Context Badges */}
                <div style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                  <div 
                    onClick={() => setActiveDealTab('customer')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                      <User size={15} color="#4f46e5" />
                      <div>
                        <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>{t('deals.customer', 'Customer')}</span>
                        <strong style={{ color: '#0f172a' }}>{selectedCustomer?.name || editingDeal?.client_name || (isRTL ? 'غير محدد' : 'Unassigned')}</strong>
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 700 }}>
                      {formData.client_id ? (isRTL ? 'تعديل ←' : 'Change →') : (isRTL ? '+ تحديد' : '+ Select')}
                    </span>
                  </div>

                  {isRealEstate ? (
                    <div 
                      onClick={() => setActiveDealTab('unit')}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0f9ff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #bae6fd', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                        <Building2 size={15} color="#0284c7" />
                        <div>
                          <span style={{ color: '#0369a1', fontSize: '11px', display: 'block' }}>{t('deals.unit', 'Unit')}</span>
                          <strong style={{ color: '#0369a1' }}>
                            {selectedUnit ? `${selectedUnit.project_name || ''} Unit ${selectedUnit.unit_number}` : (editingDeal?.unit_number ? `Unit ${editingDeal.unit_number}` : (isRTL ? 'غير مربوطة' : 'None'))}
                          </strong>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 700 }}>
                        {formData.unit_id ? (isRTL ? 'الحجز ←' : 'Reservation →') : (isRTL ? '+ ربط' : '+ Link')}
                      </span>
                    </div>
                  ) : (
                    <div 
                      onClick={() => setActiveDealTab('followup')}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                        <Clock size={15} color="#16a34a" />
                        <div>
                          <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>{t('deals.nextAction', 'Next Action')}</span>
                          <strong style={{ color: '#0f172a' }}>{formData.next_action || (isRTL ? 'لا يوجد إجراء' : 'None')}</strong>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 700 }}>
                        {isRTL ? 'المتابعة ←' : 'Follow-up →'}
                      </span>
                    </div>
                  )}
                </div>

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

                <div className="form-group">
                  <label>{t('deals.dealValue', 'Deal Value ({currency})').replace('{currency}', t('common.currency', 'EGP'))}</label>
                  <input 
                    type="number" 
                    value={formData.value}
                    onChange={(e) => setFormData({...formData, value: e.target.value})}
                    disabled={isDetailsDisabled}
                  />
                  {editingDeal && Number(formData.value || 0) === 0 && (editingDeal.unit_price || editingDeal.unit_price === 0) && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0f9ff', border: '1px solid #bae6fd', padding: '4px 8px', borderRadius: '6px' }}>
                      <span>{t('deals.unitPriceNotice', 'Listed Unit Price')}: <strong className="num-en">{Number(editingDeal.unit_price).toLocaleString('en-US')}</strong> {t('common.currency', 'EGP')}</span>
                      {!isDetailsDisabled && (
                        <button 
                          type="button" 
                          onClick={() => setFormData(prev => ({...prev, value: editingDeal.unit_price}))} 
                          style={{ background: '#0284c7', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          {t('deals.copyUnitPrice', 'Use Unit Price')}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label>{t('deals.dealOwner', 'Deal Owner')}</label>
                  <select 
                    value={formData.assigned_to}
                    disabled={isReassignDisabled}
                    onChange={(e) => setFormData({...formData, assigned_to: e.target.value})}
                  >
                    <option value="">{t('deals.unassignedOption', '-- Unassigned --')}</option>
                    {(users || []).map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} {user && String(u.id) === String(user.id) ? `(${t('deals.currentUserBadge', 'Current User / Me')})` : `(${u.role})`}
                      </option>
                    ))}
                  </select>
                </div>

                {!isRealEstate && (
                  <div className="form-group">
                    <label>{t('deals.winProbability', 'Win Probability (%)')}</label>
                    <input type="number" min="0" max="100" value={formData.probability} disabled={isDetailsDisabled} onChange={(e) => setFormData({...formData, probability: parseInt(e.target.value) || 0})} />
                  </div>
                )}

                {/* Dynamic Template Fields */}
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

                {/* Deal Cancellation & Refund Management */}
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
              </>
            )}

            {/* TAB 2: CUSTOMER (العميل) */}
            {activeDealTab === 'customer' && (
              <div style={{ gridColumn: 'span 2' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <User size={18} color="#4f46e5" />
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>
                        {t('deals.linkToCustomer', 'Link to Customer')}
                      </h4>
                    </div>
                    {formData.client_id && (
                      <button
                        type="button"
                        onClick={() => window.open(`/customers?customer360=${formData.client_id}`, '_blank')}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        <ExternalLink size={12} /> {t('customers.customer360', 'Customer 360')}
                      </button>
                    )}
                  </div>

                  <div className="form-group" style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: 700, fontSize: '13px' }}>
                      {t('deals.selectCustomer', 'Select Customer')}
                    </label>
                    <select 
                      value={formData.client_id}
                      disabled={isDetailsDisabled}
                      onChange={(e) => setFormData({...formData, client_id: e.target.value})}
                      required
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: 'white' }}
                    >
                      <option value="">{t('deals.selectCustomer', '-- Select Customer --')}</option>
                      {formData.client_id && !(customers || []).some(c => String(c.id) === String(formData.client_id)) && (
                        <option value={formData.client_id}>
                          {editingDeal?.client_name || `Customer #${formData.client_id}`} ({t('deals.currentCustomer', 'Current Linked Customer')})
                        </option>
                      )}
                      {(customers || []).map(c => (
                        <option key={c.id} value={c.id}>{c.name} {c.company_name ? `(${c.company_name})` : ''}</option>
                      ))}
                    </select>
                  </div>

                  {formData.client_id ? (
                    <div style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '16px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '12px' }}>
                        <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                          <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>{isRTL ? 'اسم العميل' : 'Customer Name'}</span>
                          <strong style={{ fontSize: '14px', color: '#0f172a' }}>{editingDeal?.client_name || selectedCustomer?.name}</strong>
                        </div>
                        {(editingDeal?.client_company || selectedCustomer?.company_name) && (
                          <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>{isRTL ? 'الشركة / المؤسسة' : 'Company'}</span>
                            <strong style={{ color: '#0f172a' }}>{editingDeal?.client_company || selectedCustomer?.company_name}</strong>
                          </div>
                        )}
                        {(editingDeal?.client_phone || selectedCustomer?.phone) && (
                          <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>{isRTL ? 'رقم الهاتف' : 'Phone'}</span>
                            <strong className="num-en" style={{ color: '#0f172a' }}>{editingDeal?.client_phone || selectedCustomer?.phone}</strong>
                          </div>
                        )}
                        {selectedCustomer?.email && (
                          <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>{isRTL ? 'البريد الإلكتروني' : 'Email'}</span>
                            <strong style={{ color: '#0f172a' }}>{selectedCustomer.email}</strong>
                          </div>
                        )}
                      </div>
                      <div style={{ marginTop: '12px', padding: '8px 12px', background: '#eff6ff', borderRadius: '6px', fontSize: '11px', color: '#1e40af' }}>
                        {isRTL
                          ? 'يمكنك الانتقال إلى Customer 360 للاطلاع على الملف الكامل والصفقات الأخرى والمستندات المسجلة.'
                          : 'Open Customer 360 to view complete customer profile, other deals, and registered documents.'}
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '12px', background: 'white', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                      {isRTL ? 'يرجى اختيار عميل من القائمة أعلاه لحفظ الصفقة بنجاح.' : 'Please select a customer from the dropdown above to save the deal.'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: UNIT & RESERVATION (الوحدة والحجز) */}
            {activeDealTab === 'unit' && (
              <div style={{ gridColumn: 'span 2' }}>
                {isRealEstate ? (
                  <div>
                    <div className="unit-select-card" style={{ marginBottom: '14px' }}>
                      <label style={{ color: '#0369a1', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <Building2 size={16} /> {t('deals.selectPropertyUnit', 'SELECT PROPERTY UNIT (REAL ESTATE)')}
                      </label>
                      {!editingDeal?.unit_id && editingDeal?.source_type === 'property_finder' && (editingDeal?.custom_fields?.pf_listing_reference || editingDeal?.custom_fields?.pf_listing_id || editingDeal?.custom_fields?.pf_project_id) && (
                        <div style={{ fontSize: '11px', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '6px 10px', borderRadius: '6px', marginBottom: '8px', fontWeight: 700 }}>
                          Property Finder {editingDeal.custom_fields?.lead_type === 'project' ? 'Project' : 'Listing'} ID:{' '}
                          <span className="num-en">{editingDeal.custom_fields?.pf_listing_reference || editingDeal.custom_fields?.pf_listing_id || editingDeal.custom_fields?.pf_project_id}</span>
                        </div>
                      )}
                      {editingDeal?.unit_id && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px' }}>
                          <Building2 size={16} color="#0284c7" />
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '13px', color: '#0369a1' }}>
                              {editingDeal.unit_project ? `${editingDeal.unit_project} • ` : ''}{t('deals.unitProject', 'Unit')} <span className="num-en">{editingDeal.unit_number || editingDeal.unit_name || editingDeal.unit_id}</span>
                            </div>
                            {editingDeal.unit_price && (
                              <div style={{ fontSize: '11px', color: '#64748b' }}>
                                {t('deals.unitPriceNotice', 'Listed Price')}: <span className="num-en">{Number(editingDeal.unit_price).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      <select 
                        className="ap-input" 
                        style={{ border: '1px solid #0ea5e9', width: '100%', padding: '10px', borderRadius: '8px', fontSize: '13px', background: 'white' }}
                        value={formData.unit_id} 
                        disabled={isDetailsDisabled || Boolean(editingDeal?.unit_id && (String(editingDeal?.unit_status || '').toLowerCase() === 'reserved' || editingDeal?.custom_fields?.is_unit_reservation || isDealLocked))}
                        onChange={(e) => handleUnitChange(e.target.value)}
                      >
                        <option value="">{t('deals.selectAvailableUnit', '-- Select Available Unit --')}</option>
                        {formData.unit_id && !(reUnits || []).some(u => String(u.id) === String(formData.unit_id)) && (
                          <option value={formData.unit_id}>
                            {editingDeal?.unit_project ? `${editingDeal.unit_project} | ` : ''}Unit {editingDeal?.unit_number || formData.unit_id} ({t('deals.currentUnit', 'Current Linked Unit')})
                          </option>
                        )}
                        {(reUnits || []).filter(u => String(u.status || '').toLowerCase() === 'available' || String(u.id) === String(formData.unit_id)).map(u => (
                          <option key={u.id} value={u.id}>
                            {u.project_name} | Unit {u.unit_number}{u.name && u.name !== u.unit_number ? ` (${u.name})` : ''} ({u.area_sqm || u.area || 0}m²) - {Number(u.price).toLocaleString('en-US')} {t('common.currency', 'EGP')}
                          </option>
                        ))}
                      </select>
                      <p style={{ fontSize: '11px', color: '#0284c7', marginTop: '6px' }}>
                        {isRTL 
                          ? 'ربط الوحدة يحدد قيمة الصفقة تلقائياً ويتيح التنافس بين عدة صفقات وعملاء دون تجميدها إلا عند الحجز الصريح.'
                          : t('deals.unitAutoValueHint', 'Selecting a unit will set the deal value. The unit remains available for other prospects until explicitly reserved.')}
                      </p>
                    </div>

                    {/* Unit Reservation & Extension Management Card */}
                    {editingDeal?.unit_id && !['won', 'closed'].includes(editingDeal?.pipeline_stage?.toLowerCase()) && editingDeal?.pipeline_stage?.toLowerCase() !== 'lost' && (
                      <div style={{ background: '#f0fdf4', border: '2px solid #bbf7d0', borderRadius: '12px', padding: '18px', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', color: '#166534' }}>
                            <Building2 size={18} color="#16a34a"/> {t('deals.unitReservationStatus', 'Unit Reservation Status')}
                          </h4>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => {
                                handleCloseModal();
                                navigate(`/units-registry?unit_id=${editingDeal.unit_id}`);
                              }}
                              style={{
                                padding: '4px 10px',
                                background: '#0284c7',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Layers size={12} /> {isRTL ? 'بطاقة الوحدة الشاملة' : 'Unit Overview Card'}
                            </button>
                            <div style={{ padding: '4px 10px', background: '#dcfce7', color: '#15803d', borderRadius: '6px', fontSize: '11px', fontWeight: 800, border: '1px solid #86efac' }}>
                              {getReservationStatusLabel(editingDeal.unit_status || 'Available')}
                            </div>
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
                              {editingDeal.unit_reservation_expires_at ? <span className="num-en">{new Date(editingDeal.unit_reservation_expires_at).toLocaleString('en-GB')}</span> : (String(editingDeal.unit_status || '').toLowerCase() === 'reserved' ? t('deals.active', 'Active') : (isRTL ? 'متاحة (غير محجوزة)' : 'Available (Not Reserved)'))}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid #dcfce7', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 700 }}>
                            {String(editingDeal.unit_status || '').toLowerCase() === 'reserved'
                              ? (editingDeal.unit_reservation_extension_count > 0 
                                  ? t('deals.extendedTimes', 'Extended {count} time(s)').replace('{count}', editingDeal.unit_reservation_extension_count) 
                                  : t('deals.activeReservation', 'Active Reservation'))
                              : (isRTL ? 'الوحدة متاحة لعروض متعددة — يمكنك تأكيد الحجز لمدة 48 ساعة عند الجدية' : 'Unit is available for multi-deal inquiries — reserve explicitly when buyer commits')}
                          </span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {String(editingDeal.unit_status || '').toLowerCase() !== 'reserved' && (
                              <button
                                type="button"
                                onClick={() => handleReserveUnit(editingDeal.id)}
                                style={{ padding: '6px 14px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                <Clock size={12} /> {isRTL ? 'حجز الوحدة (48 ساعة)' : 'Reserve Unit (48h)'}
                              </button>
                            )}
                            {String(editingDeal.unit_status || '').toLowerCase() === 'reserved' && canExtendSla && (
                              <>
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
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="form-group" style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <label style={{ fontWeight: 700, fontSize: '13px', display: 'block', marginBottom: '8px' }}>{t('deals.selectProductOptional', 'Select Product (Optional)')}</label>
                    <select 
                      value={formData.product_id}
                      disabled={isDetailsDisabled}
                      onChange={(e) => handleProductChange(e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: 'white' }}
                    >
                      <option value="">{t('deals.noSpecificProduct', '-- No Specific Product --')}</option>
                      {(products || []).map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({Number(p.selling_price || 0).toLocaleString('en-US')} {t('common.currency', 'EGP')})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: CONTRACT & COLLECTIONS (العقد والتحصيلات) */}
            {activeDealTab === 'contract' && isRealEstate && editingDeal?.id && (
              <div style={{ gridColumn: 'span 2' }}>
                <div style={{ background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={18} color="#2563eb" />
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                        {isRTL ? 'العقد والتحصيلات والعمولات' : 'Contract, Collections & Commissions'}
                      </h4>
                    </div>
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

                  {/* Sub-Tabs: Contract, Installments, Commissions, Handover */}
                  <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '14px', overflowX: 'auto' }}>
                    {[
                      { id: 'contract', label: t('deals.relatedLinks.contract', 'Contract'), icon: <FileText size={13} />, count: dealContract ? 1 : 0 },
                      { id: 'installments', label: t('deals.relatedLinks.installments', 'Installments'), icon: <CreditCard size={13} />, count: (dealInstallments || []).length },
                      { id: 'commissions', label: t('deals.relatedLinks.commissions', 'Commissions'), icon: <Award size={13} />, count: (dealCommissions?.items || []).length },
                      { id: 'handover', label: t('deals.relatedLinks.handover', 'Handover'), icon: <Key size={13} />, count: dealHandover ? 1 : 0 },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveRelatedTab(tab.id)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: activeRelatedTab === tab.id ? '1px solid #2563eb' : '1px solid #e2e8f0',
                          background: activeRelatedTab === tab.id ? '#2563eb' : 'white',
                          color: activeRelatedTab === tab.id ? 'white' : '#475569',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {tab.icon}
                        <span>{tab.label}</span>
                        {tab.count !== undefined && tab.count > 0 && (
                          <span style={{
                            padding: '1px 5px',
                            borderRadius: '999px',
                            fontSize: '10px',
                            background: activeRelatedTab === tab.id ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
                            color: activeRelatedTab === tab.id ? 'white' : '#1e293b'
                          }}>
                            {tab.count}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* SUB-TAB 1: CONTRACT */}
                  {activeRelatedTab === 'contract' && (
                    <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontWeight: 800, fontSize: '13px', color: '#1e293b' }}>
                          {dealContract ? (
                            <span>{t('deals.relatedLinks.contract', 'Contract')}: <span className="num-en">{dealContract.contract_number}</span></span>
                          ) : (
                            <span>{t('deals.noContractYet', 'No contract yet for this deal')}</span>
                          )}
                        </div>
                        {dealContract && (
                          <button
                            type="button"
                            onClick={() => window.open(`/contracts?deal_id=${editingDeal.id}`, '_blank')}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                          >
                            <ExternalLink size={12} /> {isRTL ? 'فتح صفحة العقود' : 'Open Contracts Page'}
                          </button>
                        )}
                      </div>

                      {dealContract ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', fontSize: '12px' }}>
                          <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '6px' }}>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>{t('deals.status', 'Status')}</span>
                            <strong style={{ color: '#0f172a' }}>{getContractStatusLabel(dealContract.status)}</strong>
                          </div>
                          <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '6px' }}>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>{t('deals.contractValue', 'Contract Value')}</span>
                            <strong style={{ color: '#0f172a' }}><span className="num-en">{Number(dealContract.contract_value || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}</strong>
                          </div>
                          <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '6px' }}>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>{t('deals.downPayment', 'Down Payment')}</span>
                            <strong style={{ color: '#16a34a' }}><span className="num-en">{Number(dealContract.down_payment || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}</strong>
                          </div>
                          <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '6px' }}>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>{t('deals.remainingAmount', 'Remaining')}</span>
                            <strong style={{ color: '#dc2626' }}><span className="num-en">{Number(dealContract.remaining_amount || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}</strong>
                          </div>
                          {dealContract.start_date && (
                            <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '6px' }}>
                              <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>{isRTL ? 'تاريخ البدء' : 'Start Date'}</span>
                              <span className="num-en">{dealContract.start_date.split('T')[0]}</span>
                            </div>
                          )}
                          {dealContract.end_date && (
                            <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '6px' }}>
                              <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>{isRTL ? 'تاريخ الانتهاء' : 'End Date'}</span>
                              <span className="num-en">{dealContract.end_date.split('T')[0]}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '16px' }}>
                          <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
                            {isRTL ? 'لا يوجد عقد صادر لهذه الصفقة حتى الآن. يمكنك إنشاء عقد مبيعات بالبيانات المحددة.' : 'No contract has been issued for this deal yet. You can originate a sales contract using current deal details.'}
                          </p>
                          {editingDeal?.unit_id && (
                            <button
                              type="button"
                              onClick={handleCreateContract}
                              style={{ padding: '8px 18px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                            >
                              <FileText size={14} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} /> {t('deals.createSalesContract', 'Create Sales Contract')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* SUB-TAB 2: INSTALLMENTS */}
                  {activeRelatedTab === 'installments' && (
                    <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontWeight: 800, fontSize: '13px', color: '#1e293b' }}>
                          {t('deals.relatedLinks.installments', 'Installments & Payment Schedule')}
                        </div>
                        <button
                          type="button"
                          onClick={() => window.open(`/installments?deal_id=${editingDeal.id}`, '_blank')}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          <ExternalLink size={12} /> {isRTL ? 'فتح صفحة الأقساط' : 'Open Installments Page'}
                        </button>
                      </div>

                      {installmentsLoading ? (
                        <div style={{ textAlign: 'center', padding: '14px', color: '#64748b', fontSize: '12px' }}>{t('common.loading', 'Loading installments...')}</div>
                      ) : (dealInstallments || []).length > 0 ? (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: isRTL ? 'right' : 'left' }}>
                                <th style={{ padding: '6px 8px' }}>#</th>
                                <th style={{ padding: '6px 8px' }}>{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                                <th style={{ padding: '6px 8px' }}>{isRTL ? 'القيمة' : 'Amount'}</th>
                                <th style={{ padding: '6px 8px' }}>{isRTL ? 'المدفوع' : 'Paid'}</th>
                                <th style={{ padding: '6px 8px' }}>{isRTL ? 'الحالة' : 'Status'}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(dealInstallments || []).slice(0, 5).map(inst => (
                                <tr key={inst.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '6px 8px', fontWeight: 700 }}>{inst.installment_number}</td>
                                  <td style={{ padding: '6px 8px' }}><span className="num-en">{inst.due_date ? inst.due_date.split('T')[0] : '—'}</span></td>
                                  <td style={{ padding: '6px 8px', fontWeight: 700 }}><span className="num-en">{Number(inst.amount).toLocaleString('en-US')}</span></td>
                                  <td style={{ padding: '6px 8px', color: '#16a34a' }}><span className="num-en">{Number(inst.paid_amount || 0).toLocaleString('en-US')}</span></td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <span style={{
                                      padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800,
                                      background: inst.status === 'Paid' ? '#dcfce7' : inst.is_overdue ? '#fee2e2' : '#fef3c7',
                                      color: inst.status === 'Paid' ? '#15803d' : inst.is_overdue ? '#b91c1c' : '#b45309'
                                    }}>
                                      {inst.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {(dealInstallments || []).length > 5 && (
                            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
                              {isRTL ? `عرض 5 من إجمالي ${dealInstallments.length} قسط. افتح صفحة الأقساط للمزيد.` : `Showing 5 of ${dealInstallments.length} installments. Open page for full list.`}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontSize: '12px' }}>
                          {isRTL ? 'لم يتم إنشاء جدول أقساط لهذه الصفقة بعد.' : 'No installments generated yet for this deal.'}
                        </div>
                      )}
                    </div>
                  )}

                  {/* SUB-TAB 3: COMMISSIONS */}
                  {activeRelatedTab === 'commissions' && (
                    <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontWeight: 800, fontSize: '13px', color: '#1e293b' }}>
                          {t('deals.relatedLinks.commissions', 'Broker & Agent Commissions')}
                        </div>
                        <button
                          type="button"
                          onClick={() => window.open(`/commissions?deal_id=${editingDeal.id}`, '_blank')}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          <ExternalLink size={12} /> {isRTL ? 'فتح صفحة العمولات' : 'Open Commissions Page'}
                        </button>
                      </div>

                      {commissionsLoading ? (
                        <div style={{ textAlign: 'center', padding: '14px', color: '#64748b', fontSize: '12px' }}>{t('common.loading', 'Loading commissions...')}</div>
                      ) : (dealCommissions?.items || []).length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {(dealCommissions.items || []).map(comm => (
                            <div key={comm.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                              <div>
                                <strong style={{ color: '#1e293b' }}>{comm.beneficiary_name}</strong>
                                <span style={{ fontSize: '11px', color: '#64748b', marginInlineStart: '6px' }}>({comm.beneficiary_type})</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontWeight: 800, color: '#0f172a' }}>
                                  <span className="num-en">{Number(comm.calculated_amount).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}
                                </span>
                                <span style={{
                                  padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800,
                                  background: comm.status === 'Paid' ? '#dcfce7' : comm.status === 'Approved' ? '#dbeafe' : '#fef3c7',
                                  color: comm.status === 'Paid' ? '#15803d' : comm.status === 'Approved' ? '#1d4ed8' : '#b45309'
                                }}>
                                  {comm.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontSize: '12px' }}>
                          {isRTL ? 'لا توجد عمولات مسجلة لهذه الصفقة بعد.' : 'No commissions recorded for this deal yet.'}
                        </div>
                      )}
                    </div>
                  )}

                  {/* SUB-TAB 4: HANDOVER */}
                  {activeRelatedTab === 'handover' && (
                    <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontWeight: 800, fontSize: '13px', color: '#1e293b' }}>
                          {t('deals.relatedLinks.handover', 'Unit Handover & Inspection Milestone')}
                        </div>
                        <button
                          type="button"
                          onClick={() => window.open(`/handover?deal_id=${editingDeal.id}`, '_blank')}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#faf5ff', color: '#7e22ce', border: '1px solid #e9d5ff', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          <ExternalLink size={12} /> {isRTL ? 'فتح صفحة التسليم' : 'Open Handover Page'}
                        </button>
                      </div>

                      {handoverLoading ? (
                        <div style={{ textAlign: 'center', padding: '14px', color: '#64748b', fontSize: '12px' }}>{t('common.loading', 'Loading handover details...')}</div>
                      ) : dealHandover ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', fontSize: '12px' }}>
                          <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '6px' }}>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>{isRTL ? 'حالة التسليم' : 'Status'}</span>
                            <strong style={{ color: dealHandover.status === 'Handed Over' ? '#16a34a' : '#7c3aed' }}>{dealHandover.status}</strong>
                          </div>
                          <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '6px' }}>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>{isRTL ? 'الموعد المحدد' : 'Scheduled Date'}</span>
                            <strong className="num-en">{dealHandover.scheduled_date ? dealHandover.scheduled_date.split('T')[0] : '—'}</strong>
                          </div>
                          <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '6px' }}>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>{isRTL ? 'تسليم المفاتيح' : 'Keys Delivered'}</span>
                            <span style={{ color: dealHandover.keys_handed_over ? '#16a34a' : '#64748b', fontWeight: 700 }}>
                              {dealHandover.keys_handed_over ? (isRTL ? 'تم التسليم ✓' : 'Yes ✓') : (isRTL ? 'معلق' : 'No')}
                            </span>
                          </div>
                          <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '6px' }}>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>{isRTL ? 'شهادة المخالصة' : 'Clearance Certificate'}</span>
                            <span style={{ color: dealHandover.clearance_certificate ? '#16a34a' : '#64748b', fontWeight: 700 }}>
                              {dealHandover.clearance_certificate ? (isRTL ? 'معتمدة ✓' : 'Certified ✓') : (isRTL ? 'معلق' : 'No')}
                            </span>
                          </div>
                          {dealHandover.snagging_notes && (
                            <div style={{ gridColumn: '1 / -1', background: '#f8fafc', padding: '8px 10px', borderRadius: '6px' }}>
                              <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>{isRTL ? 'ملاحظات المعاينة الفنية' : 'Snagging Notes'}</span>
                              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#1e293b' }}>{dealHandover.snagging_notes}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontSize: '12px' }}>
                          {isRTL ? 'لم يتم جدولة محضر تسليم لهذه الصفقة بعد.' : 'No handover milestone scheduled yet for this deal.'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 5: FOLLOW-UP (المتابعة) */}
            {activeDealTab === 'followup' && (
              <div style={{ gridColumn: 'span 2' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', alignItems: 'flex-start' }}>
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0369a1', fontWeight: 800, fontSize: '13px', marginBottom: '6px' }}>
                        <Clock size={15} /> {t('deals.nextActionRequired', 'Next Action Required')}
                      </label>
                      <input 
                        type="text" 
                        placeholder={t('deals.nextActionPlaceholder', 'e.g. Call client to discuss proposal, send contract draft, site visit follow-up')} 
                        value={formData.next_action} 
                        disabled={isDetailsDisabled} 
                        onChange={(e) => setFormData({...formData, next_action: e.target.value})} 
                        style={{ background: 'white', width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontWeight: 700, fontSize: '13px', color: '#334155', display: 'block', marginBottom: '6px' }}>
                        {t('deals.expectedCloseDate', 'Target Close / Follow-up Date')}
                      </label>
                      <input 
                        type="date" 
                        value={formData.expected_close_date} 
                        disabled={isDetailsDisabled} 
                        onChange={(e) => setFormData({...formData, expected_close_date: e.target.value})} 
                        style={{ background: 'white', width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Site Visit Details */}
                {(formData.pipeline_stage?.toLowerCase() === 'site visit' || formData.custom_fields?.visit_date) && (
                  <div style={{ background: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
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

                {/* Activity Timeline */}
                {editingDeal && (
                  <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', marginBottom: '16px' }}>
                      {t('deals.dealActivityTimeline', 'Deal Activity Timeline')}
                    </h3>
                    <ActivityTimeline
                      entityType="deal"
                      entityId={editingDeal.id}
                      canLog={hasDealPermission('deal.log_activity')}
                      onActivityCreated={(act) => {
                        fetchDeals(false);
                        fetchDealSla(editingDeal.id);
                        if (act?.updated_deal_stage) {
                          setFormData(prev => ({ ...prev, pipeline_stage: act.updated_deal_stage }));
                          setEditingDeal(prev => prev ? ({ ...prev, pipeline_stage: act.updated_deal_stage }) : prev);
                          toast.success(
                            isRTL
                              ? `تم نقل الصفقة تلقائياً إلى مرحلة "${getStageLabel(act.updated_deal_stage)}"`
                              : `Deal automatically moved to "${getStageLabel(act.updated_deal_stage)}"`
                          );
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </form>
        </div>
      </Modal>
      </div>
    </div>
  );
};

export default Deals;
