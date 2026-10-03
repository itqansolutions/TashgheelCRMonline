import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { 
  FileText, Plus, Search, Trash2, Calendar, Building, 
  CheckCircle2, XCircle, AlertCircle, Clock, ChevronRight, X,
  ShieldCheck, User, Filter, ArrowUpRight, DollarSign,
  Package, Edit3, Send, Trophy, ExternalLink, HelpCircle,
  Truck, ArrowRight, Layers, FileCheck, Award
} from 'lucide-react';
import WarehouseSubNav from '../../components/Warehouse/WarehouseSubNav';
import { useAuth } from '../../context/AuthContext';

const RFQs = () => {
  const { user } = useAuth();
  const [rfqs, setRfqs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [approvedPrs, setApprovedPrs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals & Drawers
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRfq, setSelectedRfq] = useState(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [comparisonData, setComparisonData] = useState(null);
  const [showQuotationModal, setShowQuotationModal] = useState(false);
  const [showAddVendorModal, setShowAddVendorModal] = useState(false);
  const [showAwardModal, setShowAwardModal] = useState(false);
  const [targetQuotationToAward, setTargetQuotationToAward] = useState(null);
  const [awardNotes, setAwardNotes] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Create Mode: PR or Direct
  const [createMode, setCreateMode] = useState('from_pr'); // 'from_pr' or 'direct'
  const [selectedPrId, setSelectedPrId] = useState('');
  const [rfqForm, setRfqForm] = useState({
    issue_date: new Date().toISOString().split('T')[0],
    deadline_date: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
    notes: '',
    vendor_ids: [],
    items: [{ product_id: '', quantity: 1, target_specs: '' }]
  });

  // Quotation Entry Form State
  const [quotationForm, setQuotationForm] = useState({
    vendor_id: '',
    quotation_number: '',
    quotation_date: new Date().toISOString().split('T')[0],
    valid_until: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    currency: 'EGP',
    payment_terms: 'Net 30 Days',
    delivery_time_days: 7,
    warranty_terms: '1 Year Standard Warranty',
    shipping_cost: 0,
    selection_notes: '',
    items: []
  });

  const [newVendorIdToInvite, setNewVendorIdToInvite] = useState('');

  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  const fetchRfqs = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (searchTerm) params.search = searchTerm;

      const res = await api.get('/rfqs', { params });
      setRfqs(res.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load RFQs');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuxiliaryData = async () => {
    try {
      const [vRes, pRes, prRes] = await Promise.all([
        api.get('/vendors'),
        api.get('/products'),
        api.get('/purchase-requests', { params: { status: 'approved' } })
      ]);
      setVendors(vRes.data?.data || []);
      setProducts(pRes.data?.data || []);
      setApprovedPrs(prRes.data?.data || []);
    } catch (err) {
      console.warn('Failed to load auxiliary procurement data');
    }
  };

  useEffect(() => {
    fetchRfqs();
  }, [statusFilter]);

  useEffect(() => {
    fetchAuxiliaryData();
  }, []);

  const filteredRfqs = rfqs.filter(r => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.rfq_number?.toLowerCase().includes(term) ||
      r.purchase_request_number?.toLowerCase().includes(term) ||
      r.notes?.toLowerCase().includes(term) ||
      r.created_by_name?.toLowerCase().includes(term)
    );
  });

  // KPI Calculations
  const stats = {
    total: rfqs.length,
    sent: rfqs.filter(r => r.status === 'sent').length,
    received: rfqs.filter(r => r.status === 'quotes_received').length,
    awarded: rfqs.filter(r => r.status === 'awarded').length,
  };

  // Open Create RFQ Modal
  const handleOpenCreateModal = () => {
    fetchAuxiliaryData();
    setCreateMode('from_pr');
    setSelectedPrId('');
    setRfqForm({
      issue_date: new Date().toISOString().split('T')[0],
      deadline_date: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
      notes: '',
      vendor_ids: [],
      items: [{ product_id: products[0]?.id ? String(products[0].id) : '', quantity: 1, target_specs: '' }]
    });
    setShowCreateModal(true);
  };

  const handlePrSelectChange = (prId) => {
    setSelectedPrId(prId);
    const pr = approvedPrs.find(p => String(p.id) === String(prId));
    if (pr) {
      setRfqForm(prev => ({
        ...prev,
        notes: `Generated from Approved PR ${pr.request_number}. Department: ${pr.department || 'N/A'}`
      }));
    }
  };

  const handleToggleVendorInvite = (vendorId) => {
    setRfqForm(prev => {
      const exists = prev.vendor_ids.includes(vendorId);
      const updated = exists 
        ? prev.vendor_ids.filter(id => id !== vendorId)
        : [...prev.vendor_ids, vendorId];
      return { ...prev, vendor_ids: updated };
    });
  };

  const handleAddDirectItem = () => {
    setRfqForm(prev => ({
      ...prev,
      items: [...prev.items, { product_id: products[0]?.id ? String(products[0].id) : '', quantity: 1, target_specs: '' }]
    }));
  };

  const handleRemoveDirectItem = (idx) => {
    if (rfqForm.items.length === 1) {
      toast.error('RFQ must contain at least one item');
      return;
    }
    setRfqForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx)
    }));
  };

  const handleDirectItemChange = (idx, field, val) => {
    const updated = [...rfqForm.items];
    updated[idx][field] = val;
    setRfqForm(prev => ({ ...prev, items: updated }));
  };

  const handleCreateRfqSubmit = async (e, sendImmediately = false) => {
    e.preventDefault();
    if (createMode === 'from_pr' && !selectedPrId) {
      toast.error('Please select an Approved Purchase Request');
      return;
    }
    if (createMode === 'direct') {
      for (const it of rfqForm.items) {
        if (!it.product_id || parseFloat(it.quantity) <= 0) {
          toast.error('All direct items must have a valid product and positive quantity');
          return;
        }
      }
    }

    if (sendImmediately && rfqForm.vendor_ids.length === 0) {
      toast.error('Please invite at least one vendor before sending');
      return;
    }

    setSubmittingAction(true);
    try {
      const payload = {
        issue_date: rfqForm.issue_date,
        deadline_date: rfqForm.deadline_date,
        notes: rfqForm.notes,
        vendor_ids: rfqForm.vendor_ids
      };

      if (createMode === 'from_pr') {
        payload.purchase_request_id = selectedPrId;
      } else {
        payload.items = rfqForm.items;
      }

      const res = await api.post('/rfqs', payload);
      const newRfqId = res.data?.data?.id;
      toast.success('RFQ created successfully');

      if (sendImmediately && newRfqId) {
        await api.post(`/rfqs/${newRfqId}/send`);
        toast.success('RFQ marked as Sent to invited vendors!');
      }

      setShowCreateModal(false);
      fetchRfqs();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create RFQ');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Open RFQ Details
  const handleOpenDetail = async (rfqId) => {
    try {
      const res = await api.get(`/rfqs/${rfqId}`);
      setSelectedRfq(res.data?.data);
      setShowDetailDrawer(true);
    } catch (err) {
      toast.error('Failed to load RFQ details');
    }
  };

  // Send RFQ
  const handleSendRfq = async (rfqId) => {
    if (!window.confirm('Send this RFQ to invited vendors? Bids will be received against it.')) return;
    setSubmittingAction(true);
    try {
      await api.post(`/rfqs/${rfqId}/send`);
      toast.success('RFQ sent to vendors successfully');
      fetchRfqs();
      if (selectedRfq?.id === rfqId) handleOpenDetail(rfqId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send RFQ');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Cancel RFQ
  const handleCancelRfq = async (rfqId) => {
    if (!window.confirm('Cancel this RFQ? This action cannot be undone.')) return;
    setSubmittingAction(true);
    try {
      await api.post(`/rfqs/${rfqId}/cancel`);
      toast.success('RFQ cancelled');
      fetchRfqs();
      if (selectedRfq?.id === rfqId) handleOpenDetail(rfqId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel RFQ');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Invite Additional Vendor
  const handleAddVendor = async () => {
    if (!newVendorIdToInvite) {
      toast.error('Please select a vendor');
      return;
    }
    setSubmittingAction(true);
    try {
      await api.post(`/rfqs/${selectedRfq.id}/vendors`, { vendor_id: newVendorIdToInvite });
      toast.success('Vendor invited successfully');
      setShowAddVendorModal(false);
      setNewVendorIdToInvite('');
      handleOpenDetail(selectedRfq.id);
      fetchRfqs();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to invite vendor');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Remove Invited Vendor
  const handleRemoveVendor = async (vendorId) => {
    if (!window.confirm('Remove this vendor from the RFQ invitation list?')) return;
    setSubmittingAction(true);
    try {
      await api.delete(`/rfqs/${selectedRfq.id}/vendors/${vendorId}`);
      toast.success('Vendor removed');
      handleOpenDetail(selectedRfq.id);
      fetchRfqs();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove vendor');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Open Quotation Modal for a Vendor
  const handleOpenQuotationModal = (preselectedVendorId = '') => {
    if (!selectedRfq) return;
    const vendorId = preselectedVendorId || selectedRfq.vendors[0]?.vendor_id || '';
    
    // Prefill items with RFQ items
    const initialItems = selectedRfq.items.map(it => ({
      product_id: it.product_id,
      product_name: it.product_name,
      sku: it.sku,
      rfq_qty: parseFloat(it.quantity),
      quantity: parseFloat(it.quantity),
      unit_price: 0,
      discount_pct: 0,
      tax_pct: 14,
      subtotal: 0
    }));

    setQuotationForm({
      vendor_id: String(vendorId),
      quotation_number: '',
      quotation_date: new Date().toISOString().split('T')[0],
      valid_until: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      currency: 'EGP',
      payment_terms: 'Net 30 Days',
      delivery_time_days: 7,
      warranty_terms: '1 Year Warranty',
      shipping_cost: 0,
      selection_notes: '',
      items: initialItems
    });
    setShowQuotationModal(true);
  };

  const handleQuotationItemChange = (idx, field, val) => {
    const updated = [...quotationForm.items];
    updated[idx][field] = val;

    const qty = parseFloat(updated[idx].quantity) || 0;
    const price = parseFloat(updated[idx].unit_price) || 0;
    const disc = Math.min(100, Math.max(0, parseFloat(updated[idx].discount_pct) || 0));
    const tax = Math.max(0, parseFloat(updated[idx].tax_pct) || 0);

    const gross = qty * price;
    const net = gross * (1 - disc / 100);
    const lineTotal = net * (1 + tax / 100);

    updated[idx].subtotal = parseFloat(lineTotal.toFixed(2));
    setQuotationForm(prev => ({ ...prev, items: updated }));
  };

  const calculateQuotationTotals = () => {
    let subtotal = 0;
    let discount = 0;
    let tax = 0;
    for (const it of quotationForm.items) {
      const qty = parseFloat(it.quantity) || 0;
      const price = parseFloat(it.unit_price) || 0;
      const disc = Math.min(100, Math.max(0, parseFloat(it.discount_pct) || 0));
      const taxPct = Math.max(0, parseFloat(it.tax_pct) || 0);

      const gross = qty * price;
      const lineDisc = gross * (disc / 100);
      const net = gross - lineDisc;
      const lineTax = net * (taxPct / 100);

      subtotal += net;
      discount += lineDisc;
      tax += lineTax;
    }
    const shipping = parseFloat(quotationForm.shipping_cost) || 0;
    const total = subtotal + tax + shipping;

    return {
      subtotal: subtotal.toFixed(2),
      discount: discount.toFixed(2),
      tax: tax.toFixed(2),
      shipping: shipping.toFixed(2),
      total: total.toFixed(2)
    };
  };

  const handleSubmitQuotation = async (e) => {
    e.preventDefault();
    if (!quotationForm.vendor_id) {
      toast.error('Please select an invited vendor');
      return;
    }
    for (const it of quotationForm.items) {
      if (parseFloat(it.quantity) <= 0 || parseFloat(it.unit_price) < 0) {
        toast.error('All items must have valid quantity and non-negative price');
        return;
      }
    }

    setSubmittingAction(true);
    try {
      await api.post(`/rfqs/${selectedRfq.id}/quotations`, quotationForm);
      toast.success('Vendor quotation recorded successfully');
      setShowQuotationModal(false);
      handleOpenDetail(selectedRfq.id);
      fetchRfqs();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit vendor quotation');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Open Compare Modal
  const handleOpenCompare = async (rfqId) => {
    try {
      const res = await api.get(`/rfqs/${rfqId}/compare`);
      setComparisonData(res.data?.data);
      setShowCompareModal(true);
    } catch (err) {
      toast.error('Failed to load quotation comparison matrix');
    }
  };

  // Award Action
  const handlePromptAward = (quotation) => {
    if (!isManagerOrAdmin) {
      toast.error('Access Denied: Only managers and admins have permission to award quotations.');
      return;
    }
    setTargetQuotationToAward(quotation);
    setAwardNotes('');
    setShowAwardModal(true);
  };

  const handleConfirmAward = async () => {
    if (!targetQuotationToAward) return;
    setSubmittingAction(true);
    try {
      const rfqId = comparisonData?.rfq?.id || selectedRfq?.id;
      const res = await api.post(`/rfqs/${rfqId}/award`, {
        quotation_id: targetQuotationToAward.id,
        notes: awardNotes
      });
      toast.success(res.data?.message || 'Quotation awarded successfully!');
      setShowAwardModal(false);
      setShowCompareModal(false);
      fetchRfqs();
      if (selectedRfq?.id === rfqId) handleOpenDetail(rfqId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to award quotation');
    } finally {
      setSubmittingAction(false);
    }
  };

  const getStatusBadge = (s) => {
    const map = {
      draft:           { bg: '#f1f5f9', text: '#475569', label: 'Draft', icon: FileText },
      sent:            { bg: '#eff6ff', text: '#0284c7', label: 'Sent to Vendors', icon: Send },
      quotes_received: { bg: '#fff7ed', text: '#ea580c', label: 'Quotes Received', icon: Clock },
      awarded:         { bg: '#f0fdf4', text: '#16a34a', label: 'Awarded', icon: Trophy },
      closed:          { bg: '#f8fafc', text: '#64748b', label: 'Closed', icon: CheckCircle2 },
      cancelled:       { bg: '#fef2f2', text: '#dc2626', label: 'Cancelled', icon: XCircle }
    };
    const c = map[s] || map.draft;
    const Icon = c.icon;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        padding: '4px 10px', borderRadius: '16px', fontSize: '12px',
        fontWeight: 800, backgroundColor: c.bg, color: c.text
      }}>
        <Icon size={13} />
        {c.label}
      </span>
    );
  };

  return (
    <div style={{ padding: '0 0 40px 0', minHeight: '100vh', background: '#f8fafc' }}>
      <WarehouseSubNav />

      <div style={{ padding: '0 24px' }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '24px', flexWrap: 'wrap', gap: '16px'
        }}>
          <div>
            <h1 style={{
              fontSize: '24px', fontWeight: 800, color: '#0f172a',
              display: 'flex', alignItems: 'center', gap: '10px', margin: 0
            }}>
              <FileCheck size={26} color="#0284c7" />
              RFQs & Vendor Quotations
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
              Vendor solicitation, commercial bid evaluation & quotation comparison matrix (Phase 5B.2)
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleOpenCreateModal}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px',
                borderRadius: '10px', background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: 'white', border: 'none', fontWeight: 700, fontSize: '14px',
                cursor: 'pointer', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)',
                transition: 'all 0.2s'
              }}
            >
              <Plus size={18} />
              New RFQ
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px', marginBottom: '24px'
        }}>
          <div style={{
            background: 'white', borderRadius: '14px', padding: '18px 20px',
            border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Total RFQs
              </span>
              <div style={{ padding: '8px', background: '#f0f9ff', borderRadius: '10px', color: '#0284c7' }}>
                <Layers size={18} />
              </div>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', marginTop: '10px' }}>
              {stats.total}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Procurement solicitations
            </div>
          </div>

          <div style={{
            background: 'white', borderRadius: '14px', padding: '18px 20px',
            border: '1px solid #e0f2fe', boxShadow: '0 2px 8px rgba(2, 132, 199, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase' }}>
                Sent (Awaiting Bids)
              </span>
              <div style={{ padding: '8px', background: '#f0f9ff', borderRadius: '10px', color: '#0284c7' }}>
                <Send size={18} />
              </div>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#0284c7', marginTop: '10px' }}>
              {stats.sent}
            </div>
            <div style={{ fontSize: '12px', color: '#0369a1', marginTop: '4px' }}>
              Open with vendors
            </div>
          </div>

          <div style={{
            background: 'white', borderRadius: '14px', padding: '18px 20px',
            border: '1px solid #ffedd5', boxShadow: '0 2px 8px rgba(234, 88, 12, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#c2410c', textTransform: 'uppercase' }}>
                Quotes Received
              </span>
              <div style={{ padding: '8px', background: '#fff7ed', borderRadius: '10px', color: '#ea580c' }}>
                <Clock size={18} />
              </div>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#ea580c', marginTop: '10px' }}>
              {stats.received}
            </div>
            <div style={{ fontSize: '12px', color: '#9a3412', marginTop: '4px' }}>
              Ready for comparison & award
            </div>
          </div>

          <div style={{
            background: 'white', borderRadius: '14px', padding: '18px 20px',
            border: '1px solid #dcfce7', boxShadow: '0 2px 8px rgba(22, 163, 74, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>
                Awarded Quotations
              </span>
              <div style={{ padding: '8px', background: '#f0fdf4', borderRadius: '10px', color: '#16a34a' }}>
                <Trophy size={18} />
              </div>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#16a34a', marginTop: '10px' }}>
              {stats.awarded}
            </div>
            <div style={{ fontSize: '12px', color: '#15803d', marginTop: '4px' }}>
              Ready for PO (Phase 5B.3)
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{
          background: 'white', borderRadius: '14px', padding: '16px 20px',
          border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px'
        }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All RFQs' },
              { id: 'quotes_received', label: 'Quotes Received' },
              { id: 'sent', label: 'Sent' },
              { id: 'awarded', label: 'Awarded' },
              { id: 'draft', label: 'Drafts' },
              { id: 'cancelled', label: 'Cancelled' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                style={{
                  padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  border: statusFilter === tab.id ? '1px solid #0284c7' : '1px solid #e2e8f0',
                  background: statusFilter === tab.id ? '#f0f9ff' : 'white',
                  color: statusFilter === tab.id ? '#0284c7' : '#64748b',
                  cursor: 'pointer', transition: 'all 0.15s'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search by RFQ #, PR #, notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px 8px 36px', borderRadius: '8px',
                border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none'
              }}
            />
          </div>
        </div>

        {/* RFQs Table */}
        <div style={{
          background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0',
          overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
        }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
              Loading RFQs...
            </div>
          ) : filteredRfqs.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <FileCheck size={40} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#334155', margin: 0 }}>
                No RFQs found
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '6px 0 16px' }}>
                Create a new RFQ from an approved Purchase Request or directly.
              </p>
              <button
                onClick={handleOpenCreateModal}
                style={{
                  padding: '8px 16px', borderRadius: '8px', background: '#0284c7',
                  color: 'white', border: 'none', fontWeight: 600, fontSize: '13px', cursor: 'pointer'
                }}
              >
                Create RFQ
              </button>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>RFQ #</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>Source</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>Issue / Deadline</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>Invited Vendors</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>Quotations</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRfqs.map(rfq => (
                  <tr
                    key={rfq.id}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background 0.15s',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                    onClick={() => handleOpenDetail(rfq.id)}
                  >
                    <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0284c7' }}>
                      {rfq.rfq_number}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      {rfq.purchase_request_number ? (
                        <div>
                          <span style={{
                            padding: '3px 8px', borderRadius: '6px', fontSize: '11px',
                            fontWeight: 700, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0'
                          }}>
                            PR: {rfq.purchase_request_number}
                          </span>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                            Dept: {rfq.pr_department || 'General'}
                          </div>
                        </div>
                      ) : (
                        <span style={{
                          padding: '3px 8px', borderRadius: '6px', fontSize: '11px',
                          fontWeight: 700, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0'
                        }}>
                          Direct RFQ
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 18px', color: '#334155' }}>
                      <div>{rfq.issue_date ? new Date(rfq.issue_date).toLocaleDateString() : '—'}</div>
                      <div style={{ fontSize: '11px', color: '#ef4444' }}>
                        Due: {rfq.deadline_date ? new Date(rfq.deadline_date).toLocaleDateString() : 'No deadline'}
                      </div>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>
                        {rfq.vendors_count} vendor(s)
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      {rfq.status === 'awarded' && rfq.awarded_vendor_name ? (
                        <div>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '3px 8px', borderRadius: '6px', fontSize: '11px',
                            fontWeight: 700, background: '#f0fdf4', color: '#15803d'
                          }}>
                            <Trophy size={11} /> {rfq.awarded_vendor_name}
                          </span>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                            {parseFloat(rfq.awarded_amount || 0).toLocaleString()} EGP
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontWeight: 600, color: '#475569' }}>
                          {rfq.quotations_count} bid(s) received
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      {getStatusBadge(rfq.status)}
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        {rfq.status === 'draft' && (
                          <button
                            onClick={() => handleSendRfq(rfq.id)}
                            title="Send to Vendors"
                            style={{
                              padding: '6px 10px', borderRadius: '6px', border: 'none',
                              background: '#0284c7', color: 'white', fontWeight: 700, fontSize: '12px',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                          >
                            <Send size={12} /> Send
                          </button>
                        )}

                        {rfq.quotations_count > 0 && (
                          <button
                            onClick={() => handleOpenCompare(rfq.id)}
                            title="Compare Quotations"
                            style={{
                              padding: '6px 10px', borderRadius: '6px', border: '1px solid #0284c7',
                              background: '#f0f9ff', color: '#0284c7', fontWeight: 700, fontSize: '12px',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                          >
                            <Award size={13} /> Compare ({rfq.quotations_count})
                          </button>
                        )}

                        <button
                          onClick={() => handleOpenDetail(rfq.id)}
                          style={{
                            padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0',
                            background: '#f8fafc', color: '#64748b', cursor: 'pointer'
                          }}
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* CREATE RFQ MODAL */}
      {showCreateModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 1100, padding: '20px'
        }}>
          <div style={{
            background: 'white', width: '100%', maxWidth: '850px', maxHeight: '90vh',
            borderRadius: '16px', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc'
            }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Create Request for Quotation (RFQ)
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                  Solicit bids from multiple suppliers for procurement.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={(e) => handleCreateRfqSubmit(e, false)} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                {/* Generation Mode Selector */}
                <div style={{
                  display: 'flex', gap: '12px', marginBottom: '20px', background: '#f1f5f9',
                  padding: '6px', borderRadius: '10px'
                }}>
                  <button
                    type="button"
                    onClick={() => setCreateMode('from_pr')}
                    style={{
                      flex: 1, padding: '9px 14px', borderRadius: '8px', border: 'none',
                      fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                      background: createMode === 'from_pr' ? 'white' : 'transparent',
                      color: createMode === 'from_pr' ? '#0284c7' : '#64748b',
                      boxShadow: createMode === 'from_pr' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                    }}
                  >
                    From Approved Purchase Request
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateMode('direct')}
                    style={{
                      flex: 1, padding: '9px 14px', borderRadius: '8px', border: 'none',
                      fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                      background: createMode === 'direct' ? 'white' : 'transparent',
                      color: createMode === 'direct' ? '#0284c7' : '#64748b',
                      boxShadow: createMode === 'direct' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                    }}
                  >
                    Direct RFQ (Authorized)
                  </button>
                </div>

                {/* PR Selector if Mode = from_pr */}
                {createMode === 'from_pr' && (
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Approved Purchase Request *
                    </label>
                    <select
                      value={selectedPrId}
                      onChange={(e) => handlePrSelectChange(e.target.value)}
                      required
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                        fontSize: '13px', background: 'white'
                      }}
                    >
                      <option value="">Select an Approved Purchase Request...</option>
                      {approvedPrs.map(pr => (
                        <option key={pr.id} value={pr.id}>
                          {pr.request_number} — {pr.department || 'General'} (Needed by: {pr.required_date ? new Date(pr.required_date).toLocaleDateString() : 'Immediate'})
                        </option>
                      ))}
                    </select>
                    {approvedPrs.length === 0 && (
                      <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#ea580c' }}>
                        No approved Purchase Requests found. Approve a request in the Purchase Requests tab first, or use Direct RFQ.
                      </p>
                    )}
                  </div>
                )}

                {/* Dates & Notes */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Issue Date *
                    </label>
                    <input
                      type="date"
                      value={rfqForm.issue_date}
                      onChange={(e) => setRfqForm(prev => ({ ...prev, issue_date: e.target.value }))}
                      required
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Bid Submission Deadline
                    </label>
                    <input
                      type="date"
                      value={rfqForm.deadline_date}
                      onChange={(e) => setRfqForm(prev => ({ ...prev, deadline_date: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Notes / Instructions for Bidders
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Please quote inclusive of delivery to Central Warehouse..."
                    value={rfqForm.notes}
                    onChange={(e) => setRfqForm(prev => ({ ...prev, notes: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>

                {/* Direct Items entry if Mode = direct */}
                {createMode === 'direct' && (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                        Direct Line Items
                      </h3>
                      <button
                        type="button"
                        onClick={handleAddDirectItem}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                          borderRadius: '6px', background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd',
                          fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        <Plus size={14} /> Add Product
                      </button>
                    </div>

                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Product *</th>
                            <th style={{ padding: '10px 14px', textAlign: 'center', width: '120px', fontWeight: 700 }}>Quantity</th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Target Specs / Notes</th>
                            <th style={{ padding: '10px 14px', textAlign: 'center', width: '50px' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {rfqForm.items.map((it, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '8px 14px' }}>
                                <select
                                  value={it.product_id}
                                  onChange={(e) => handleDirectItemChange(idx, 'product_id', e.target.value)}
                                  required
                                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                                >
                                  <option value="">Select product...</option>
                                  {products.map(p => (
                                    <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: '8px 14px' }}>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="any"
                                  value={it.quantity}
                                  onChange={(e) => handleDirectItemChange(idx, 'quantity', e.target.value)}
                                  style={{ width: '100%', padding: '7px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', textAlign: 'center' }}
                                />
                              </td>
                              <td style={{ padding: '8px 14px' }}>
                                <input
                                  type="text"
                                  placeholder="e.g. Grade A, ISO certified..."
                                  value={it.target_specs}
                                  onChange={(e) => handleDirectItemChange(idx, 'target_specs', e.target.value)}
                                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                                />
                              </td>
                              <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDirectItem(idx)}
                                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Vendors Selection */}
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', margin: '0 0 10px' }}>
                    Invite Vendors for Bidding
                  </h3>
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: '10px', maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0',
                    borderRadius: '10px', padding: '12px'
                  }}>
                    {vendors.map(v => {
                      const isSelected = rfqForm.vendor_ids.includes(v.id);
                      return (
                        <div
                          key={v.id}
                          onClick={() => handleToggleVendorInvite(v.id)}
                          style={{
                            padding: '10px 12px', borderRadius: '8px', border: isSelected ? '1px solid #0284c7' : '1px solid #e2e8f0',
                            background: isSelected ? '#f0f9ff' : 'white', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            style={{ cursor: 'pointer' }}
                          />
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{v.name}</div>
                            {v.phone && <div style={{ fontSize: '11px', color: '#64748b' }}>{v.phone}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                    {rfqForm.vendor_ids.length} vendor(s) selected. You can also invite additional vendors later.
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{
                padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
                display: 'flex', justifyContent: 'flex-end', gap: '10px'
              }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1',
                    background: 'white', color: '#475569', fontWeight: 600, fontSize: '13px', cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  style={{
                    padding: '9px 18px', borderRadius: '8px', border: '1px solid #0284c7',
                    background: 'white', color: '#0284c7', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                  }}
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  disabled={submittingAction}
                  onClick={(e) => handleCreateRfqSubmit(e, true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '9px 20px', borderRadius: '8px', border: 'none',
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                  }}
                >
                  <Send size={14} />
                  Save & Send to Vendors
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RFQ DETAIL DRAWER */}
      {showDetailDrawer && selectedRfq && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'flex-end',
          zIndex: 1100
        }}>
          <div style={{
            background: 'white', width: '100%', maxWidth: '780px', height: '100%',
            boxShadow: '-10px 0 25px rgba(0,0,0,0.1)', display: 'flex',
            flexDirection: 'column', overflow: 'hidden'
          }}>
            {/* Drawer Header */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    {selectedRfq.rfq_number}
                  </h2>
                  {getStatusBadge(selectedRfq.status)}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Created on {new Date(selectedRfq.created_at).toLocaleString()} by {selectedRfq.created_by_name || 'System'}
                </div>
              </div>
              <button
                onClick={() => setShowDetailDrawer(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {/* Source Info Card */}
              <div style={{
                background: '#f8fafc', padding: '16px', borderRadius: '12px',
                border: '1px solid #e2e8f0', marginBottom: '20px',
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px'
              }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    Requisition Source
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                    {selectedRfq.purchase_request_number ? `PR: ${selectedRfq.purchase_request_number}` : 'Direct Procurement RFQ'}
                  </div>
                  {selectedRfq.pr_department && (
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Dept: {selectedRfq.pr_department}</div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    Issue Date
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                    {selectedRfq.issue_date ? new Date(selectedRfq.issue_date).toLocaleDateString() : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    Bid Deadline
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626', marginTop: '2px' }}>
                    {selectedRfq.deadline_date ? new Date(selectedRfq.deadline_date).toLocaleDateString() : 'Open'}
                  </div>
                </div>
              </div>

              {selectedRfq.notes && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    Instructions / Notes
                  </div>
                  <div style={{ padding: '10px 14px', background: '#f1f5f9', borderRadius: '8px', fontSize: '13px', color: '#334155' }}>
                    {selectedRfq.notes}
                  </div>
                </div>
              )}

              {/* Awarded Banner if awarded */}
              {selectedRfq.status === 'awarded' && (
                <div style={{
                  padding: '16px', borderRadius: '12px', background: '#f0fdf4',
                  border: '1px solid #bbf7d0', marginBottom: '24px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#15803d', fontWeight: 800, fontSize: '14px' }}>
                    <Trophy size={18} /> RFQ Awarded
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#166534' }}>
                    Quotation has been successfully awarded! This selected bid is locked and marked as <strong>Ready for Purchase Order Generation (Phase 5B.3)</strong>.
                  </p>
                </div>
              )}

              {/* Items Section */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>
                  Requested Line Items ({selectedRfq.items?.length || 0})
                </h3>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Product</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>Requested Qty</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Specifications</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRfq.items?.map(it => (
                        <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{it.product_name}</div>
                            {it.sku && <div style={{ fontSize: '11px', color: '#64748b' }}>SKU: {it.sku}</div>}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600 }}>
                            {parseFloat(it.quantity)} {it.unit || 'units'}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#475569' }}>
                            {it.target_specs || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Invited Vendors & Quotations */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    Invited Vendors & Bids ({selectedRfq.vendors?.length || 0})
                  </h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {selectedRfq.status !== 'awarded' && selectedRfq.status !== 'closed' && selectedRfq.status !== 'cancelled' && (
                      <>
                        <button
                          onClick={() => setShowAddVendorModal(true)}
                          style={{
                            padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1',
                            background: 'white', color: '#475569', fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                          }}
                        >
                          + Invite Vendor
                        </button>
                        <button
                          onClick={() => handleOpenQuotationModal()}
                          style={{
                            padding: '6px 12px', borderRadius: '6px', border: '1px solid #0284c7',
                            background: '#f0f9ff', color: '#0284c7', fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                          }}
                        >
                          + Record Quotation
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Vendor</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>Contact</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>Status</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRfq.vendors?.map(v => (
                        <tr key={v.vendor_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{v.vendor_name}</div>
                            {v.quotes_count > 0 ? (
                              <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>
                                ✓ Quotation Submitted
                              </div>
                            ) : (
                              <div style={{ fontSize: '11px', color: '#64748b' }}>Awaiting quotation</div>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', color: '#475569' }}>
                            <div>{v.contact_name || '—'}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>{v.phone || v.email || '—'}</div>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <span style={{
                              padding: '3px 8px', borderRadius: '6px', fontSize: '11px',
                              fontWeight: 700,
                              background: v.invitation_status === 'quoted' ? '#f0fdf4' : '#f8fafc',
                              color: v.invitation_status === 'quoted' ? '#16a34a' : '#64748b'
                            }}>
                              {v.invitation_status}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              {v.quotes_count === 0 && selectedRfq.status !== 'awarded' && (
                                <button
                                  onClick={() => handleOpenQuotationModal(v.vendor_id)}
                                  style={{
                                    padding: '5px 10px', borderRadius: '6px', border: '1px solid #bae6fd',
                                    background: '#f0f9ff', color: '#0284c7', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                                  }}
                                >
                                  + Quote
                                </button>
                              )}
                              {v.quotes_count === 0 && selectedRfq.status !== 'awarded' && (
                                <button
                                  onClick={() => handleRemoveVendor(v.vendor_id)}
                                  style={{
                                    background: 'none', border: 'none', color: '#ef4444',
                                    cursor: 'pointer', padding: '4px'
                                  }}
                                  title="Remove vendor"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Received Quotations List */}
              {selectedRfq.quotations?.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                      Received Commercial Quotations ({selectedRfq.quotations.length})
                    </h3>
                    <button
                      onClick={() => handleOpenCompare(selectedRfq.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
                        borderRadius: '8px', background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                        color: 'white', border: 'none', fontWeight: 700, fontSize: '12px',
                        cursor: 'pointer', boxShadow: '0 2px 8px rgba(2, 132, 199, 0.2)'
                      }}
                    >
                      <Award size={14} /> Open Comparison Matrix
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {selectedRfq.quotations.map(q => (
                      <div
                        key={q.id}
                        style={{
                          padding: '14px 16px', borderRadius: '10px',
                          border: q.selection_status === 'selected' ? '2px solid #16a34a' : '1px solid #e2e8f0',
                          background: q.selection_status === 'selected' ? '#f0fdf4' : 'white',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '14px' }}>
                              {q.vendor_name}
                            </span>
                            <span style={{ fontSize: '12px', color: '#64748b' }}>
                              Ref: {q.quotation_number}
                            </span>
                            {q.selection_status === 'selected' && (
                              <span style={{
                                padding: '3px 8px', borderRadius: '12px', fontSize: '11px',
                                fontWeight: 800, background: '#16a34a', color: 'white'
                              }}>
                                Selected / Awarded
                              </span>
                            )}
                            {q.selection_status === 'rejected' && (
                              <span style={{
                                padding: '3px 8px', borderRadius: '12px', fontSize: '11px',
                                fontWeight: 800, background: '#fef2f2', color: '#dc2626'
                              }}>
                                Rejected
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px', display: 'flex', gap: '16px' }}>
                            <span>Delivery: <strong>{q.delivery_time_days} days</strong></span>
                            <span>Terms: <strong>{q.payment_terms || 'Standard'}</strong></span>
                            <span>Items: <strong>{q.items_count} items</strong></span>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                            {parseFloat(q.total_amount).toLocaleString()} EGP
                          </div>
                          {selectedRfq.status !== 'awarded' && isManagerOrAdmin && (
                            <button
                              onClick={() => handlePromptAward(q)}
                              style={{
                                marginTop: '4px', padding: '5px 12px', borderRadius: '6px',
                                background: '#16a34a', color: 'white', border: 'none',
                                fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                              }}
                            >
                              Award Bid
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Contextual Bottom Actions */}
            <div style={{
              padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                {(selectedRfq.status === 'draft' || selectedRfq.status === 'sent' || selectedRfq.status === 'quotes_received') && (
                  <button
                    onClick={() => handleCancelRfq(selectedRfq.id)}
                    disabled={submittingAction}
                    style={{
                      background: 'none', border: 'none', color: '#dc2626',
                      fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: 0
                    }}
                  >
                    Cancel RFQ
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                {selectedRfq.status === 'draft' && (
                  <button
                    onClick={() => handleSendRfq(selectedRfq.id)}
                    disabled={submittingAction}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '9px 18px', borderRadius: '8px', border: 'none',
                      background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                      color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                    }}
                  >
                    <Send size={14} /> Send to Vendors
                  </button>
                )}

                {selectedRfq.quotations?.length > 0 && (
                  <button
                    onClick={() => handleOpenCompare(selectedRfq.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '9px 18px', borderRadius: '8px', border: 'none',
                      background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                      color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                    }}
                  >
                    <Award size={15} /> Compare & Award
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VENDOR QUOTATION ENTRY MODAL */}
      {showQuotationModal && selectedRfq && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 1200, padding: '20px'
        }}>
          <div style={{
            background: 'white', width: '100%', maxWidth: '900px', maxHeight: '92vh',
            borderRadius: '16px', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden'
          }}>
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc'
            }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Record Vendor Quotation (Bid)
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                  Enter commercial bid details received for {selectedRfq.rfq_number}.
                </p>
              </div>
              <button
                onClick={() => setShowQuotationModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitQuotation} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                {/* Vendor and Quote Meta */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Invited Vendor *
                    </label>
                    <select
                      value={quotationForm.vendor_id}
                      onChange={(e) => setQuotationForm(prev => ({ ...prev, vendor_id: e.target.value }))}
                      required
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    >
                      <option value="">Select Vendor...</option>
                      {selectedRfq.vendors?.map(v => (
                        <option key={v.vendor_id} value={v.vendor_id}>{v.vendor_name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Vendor Quotation #
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. QTE-2026-99"
                      value={quotationForm.quotation_number}
                      onChange={(e) => setQuotationForm(prev => ({ ...prev, quotation_number: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Quotation Date *
                    </label>
                    <input
                      type="date"
                      value={quotationForm.quotation_date}
                      onChange={(e) => setQuotationForm(prev => ({ ...prev, quotation_date: e.target.value }))}
                      required
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Valid Until
                    </label>
                    <input
                      type="date"
                      value={quotationForm.valid_until}
                      onChange={(e) => setQuotationForm(prev => ({ ...prev, valid_until: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>
                </div>

                {/* Commercial Terms */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Payment Terms
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Net 30, 50% Advance"
                      value={quotationForm.payment_terms}
                      onChange={(e) => setQuotationForm(prev => ({ ...prev, payment_terms: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Delivery Time (Days)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={quotationForm.delivery_time_days}
                      onChange={(e) => setQuotationForm(prev => ({ ...prev, delivery_time_days: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Warranty Terms
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 1 Year replacement"
                      value={quotationForm.warranty_terms}
                      onChange={(e) => setQuotationForm(prev => ({ ...prev, warranty_terms: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>
                </div>

                {/* Item Line Pricing */}
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>
                    Quoted Line Prices
                  </h3>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Product</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center', width: '100px', fontWeight: 700 }}>RFQ Qty</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center', width: '110px', fontWeight: 700 }}>Quoted Qty</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right', width: '130px', fontWeight: 700 }}>Unit Price</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center', width: '90px', fontWeight: 700 }}>Disc %</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center', width: '90px', fontWeight: 700 }}>Tax %</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right', width: '130px', fontWeight: 700 }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quotationForm.items.map((it, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 14px' }}>
                              <div style={{ fontWeight: 700, color: '#0f172a' }}>{it.product_name}</div>
                              {it.sku && <div style={{ fontSize: '11px', color: '#64748b' }}>SKU: {it.sku}</div>}
                            </td>
                            <td style={{ padding: '8px 14px', textAlign: 'center', color: '#64748b' }}>
                              {it.rfq_qty}
                            </td>
                            <td style={{ padding: '8px 14px' }}>
                              <input
                                type="number"
                                min="0.01"
                                step="any"
                                value={it.quantity}
                                onChange={(e) => handleQuotationItemChange(idx, 'quantity', e.target.value)}
                                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}
                              />
                            </td>
                            <td style={{ padding: '8px 14px' }}>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={it.unit_price}
                                onChange={(e) => handleQuotationItemChange(idx, 'unit_price', e.target.value)}
                                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ padding: '8px 14px' }}>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={it.discount_pct}
                                onChange={(e) => handleQuotationItemChange(idx, 'discount_pct', e.target.value)}
                                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}
                              />
                            </td>
                            <td style={{ padding: '8px 14px' }}>
                              <input
                                type="number"
                                min="0"
                                value={it.tax_pct}
                                onChange={(e) => handleQuotationItemChange(idx, 'tax_pct', e.target.value)}
                                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}
                              />
                            </td>
                            <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                              {it.subtotal.toLocaleString()} EGP
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Shipping & Final Summary */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '30px' }}>
                  <div style={{ width: '220px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Freight / Shipping Cost (EGP)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={quotationForm.shipping_cost}
                      onChange={(e) => setQuotationForm(prev => ({ ...prev, shipping_cost: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', textAlign: 'right' }}
                    />
                  </div>

                  <div style={{
                    width: '280px', padding: '14px 18px', background: '#f8fafc',
                    borderRadius: '10px', border: '1px solid #e2e8f0'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                      <span>Subtotal:</span>
                      <span>{calculateQuotationTotals().subtotal} EGP</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                      <span>Tax (VAT):</span>
                      <span>{calculateQuotationTotals().tax} EGP</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                      <span>Shipping:</span>
                      <span>{calculateQuotationTotals().shipping} EGP</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 800, color: '#0f172a', borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                      <span>Grand Total:</span>
                      <span>{calculateQuotationTotals().total} EGP</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{
                padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
                display: 'flex', justifyContent: 'flex-end', gap: '10px'
              }}>
                <button
                  type="button"
                  onClick={() => setShowQuotationModal(false)}
                  style={{
                    padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1',
                    background: 'white', color: '#475569', fontWeight: 600, fontSize: '13px', cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  style={{
                    padding: '9px 20px', borderRadius: '8px', border: 'none',
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
                  }}
                >
                  Save Vendor Quotation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUOTATION COMPARISON MATRIX MODAL */}
      {showCompareModal && comparisonData && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 1200, padding: '20px'
        }}>
          <div style={{
            background: 'white', width: '100%', maxWidth: '1100px', maxHeight: '92vh',
            borderRadius: '16px', display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Award size={22} color="#0284c7" />
                  <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Quotation Comparison Matrix
                  </h2>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#0284c7' }}>
                    ({comparisonData.rfq?.rfq_number})
                  </span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                  Side-by-side evaluation of vendor bids across price, delivery speed, and commercial terms.
                </p>
              </div>
              <button
                onClick={() => setShowCompareModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Matrix Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {comparisonData.quotations?.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <HelpCircle size={40} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
                  <p style={{ color: '#64748b' }}>No quotations have been received for this RFQ yet.</p>
                </div>
              ) : (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                        <th style={{ padding: '14px 16px', textAlign: 'left', minWidth: '220px', fontWeight: 800, color: '#334155' }}>
                          Evaluation Parameters
                        </th>
                        {comparisonData.quotations.map(q => {
                          const isLowest = parseFloat(q.total_amount) === comparisonData.benchmarks?.lowest_total;
                          const isFastest = q.delivery_time_days === comparisonData.benchmarks?.fastest_delivery_days;
                          return (
                            <th key={q.id} style={{ padding: '14px 16px', textAlign: 'center', minWidth: '220px', background: q.selection_status === 'selected' ? '#f0fdf4' : 'transparent' }}>
                              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                                {q.vendor_name}
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>
                                Ref: {q.quotation_number}
                              </div>
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginTop: '6px', flexWrap: 'wrap' }}>
                                {isLowest && (
                                  <span style={{ padding: '2px 6px', borderRadius: '10px', background: '#dcfce7', color: '#15803d', fontSize: '10px', fontWeight: 800 }}>
                                    Lowest Total
                                  </span>
                                )}
                                {isFastest && (
                                  <span style={{ padding: '2px 6px', borderRadius: '10px', background: '#e0f2fe', color: '#0284c7', fontSize: '10px', fontWeight: 800 }}>
                                    Fastest Delivery
                                  </span>
                                )}
                                {q.selection_status === 'selected' && (
                                  <span style={{ padding: '2px 6px', borderRadius: '10px', background: '#16a34a', color: 'white', fontSize: '10px', fontWeight: 800 }}>
                                    🏆 Selected
                                  </span>
                                )}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Section: Commercial Totals */}
                      <tr style={{ background: '#f1f5f9' }}>
                        <td colSpan={comparisonData.quotations.length + 1} style={{ padding: '8px 16px', fontWeight: 800, color: '#475569', fontSize: '12px' }}>
                          FINANCIAL COMPARISON
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#334155' }}>Subtotal (Net)</td>
                        {comparisonData.quotations.map(q => (
                          <td key={q.id} style={{ padding: '12px 16px', textAlign: 'center', color: '#0f172a' }}>
                            {parseFloat(q.subtotal).toLocaleString()} EGP
                          </td>
                        ))}
                      </tr>
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#334155' }}>Tax / VAT</td>
                        {comparisonData.quotations.map(q => (
                          <td key={q.id} style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b' }}>
                            {parseFloat(q.tax_amount).toLocaleString()} EGP
                          </td>
                        ))}
                      </tr>
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#334155' }}>Shipping & Freight</td>
                        {comparisonData.quotations.map(q => (
                          <td key={q.id} style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b' }}>
                            {parseFloat(q.shipping_cost).toLocaleString()} EGP
                          </td>
                        ))}
                      </tr>
                      <tr style={{ borderBottom: '2px solid #cbd5e1', background: '#fafafa' }}>
                        <td style={{ padding: '14px 16px', fontWeight: 800, color: '#0f172a', fontSize: '14px' }}>
                          GRAND TOTAL
                        </td>
                        {comparisonData.quotations.map(q => {
                          const isLowest = parseFloat(q.total_amount) === comparisonData.benchmarks?.lowest_total;
                          return (
                            <td key={q.id} style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, fontSize: '16px', color: isLowest ? '#16a34a' : '#0f172a' }}>
                              {parseFloat(q.total_amount).toLocaleString()} EGP
                            </td>
                          );
                        })}
                      </tr>

                      {/* Section: Commercial Terms */}
                      <tr style={{ background: '#f1f5f9' }}>
                        <td colSpan={comparisonData.quotations.length + 1} style={{ padding: '8px 16px', fontWeight: 800, color: '#475569', fontSize: '12px' }}>
                          TERMS & CONDITIONS
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#334155' }}>Delivery Time</td>
                        {comparisonData.quotations.map(q => (
                          <td key={q.id} style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>
                            {q.delivery_time_days} Days
                          </td>
                        ))}
                      </tr>
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#334155' }}>Payment Terms</td>
                        {comparisonData.quotations.map(q => (
                          <td key={q.id} style={{ padding: '12px 16px', textAlign: 'center', color: '#475569' }}>
                            {q.payment_terms || 'Standard'}
                          </td>
                        ))}
                      </tr>
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#334155' }}>Warranty Terms</td>
                        {comparisonData.quotations.map(q => (
                          <td key={q.id} style={{ padding: '12px 16px', textAlign: 'center', color: '#475569' }}>
                            {q.warranty_terms || '—'}
                          </td>
                        ))}
                      </tr>
                      <tr style={{ borderBottom: '2px solid #cbd5e1' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#334155' }}>Quotation Validity</td>
                        {comparisonData.quotations.map(q => (
                          <td key={q.id} style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b' }}>
                            {q.valid_until ? new Date(q.valid_until).toLocaleDateString() : '—'}
                          </td>
                        ))}
                      </tr>

                      {/* Section: Line Item Unit Prices */}
                      <tr style={{ background: '#f1f5f9' }}>
                        <td colSpan={comparisonData.quotations.length + 1} style={{ padding: '8px 16px', fontWeight: 800, color: '#475569', fontSize: '12px' }}>
                          ITEM-BY-ITEM UNIT PRICE BREAKDOWN
                        </td>
                      </tr>
                      {comparisonData.rfq_items?.map(item => (
                        <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 16px' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.product_name}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Qty: {item.quantity} {item.unit || ''}</div>
                          </td>
                          {comparisonData.quotations.map(q => {
                            const qItem = q.items?.find(qi => qi.product_id === item.product_id);
                            return (
                              <td key={q.id} style={{ padding: '10px 16px', textAlign: 'center' }}>
                                {qItem ? (
                                  <div>
                                    <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                      {parseFloat(qItem.unit_price).toLocaleString()} EGP
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                                      Quoted Qty: {parseFloat(qItem.quantity)}
                                    </div>
                                  </div>
                                ) : (
                                  <span style={{ color: '#94a3b8' }}>Not Quoted</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}

                      {/* Action Row: Award Buttons */}
                      {comparisonData.rfq?.status !== 'awarded' && isManagerOrAdmin && (
                        <tr style={{ background: '#f8fafc' }}>
                          <td style={{ padding: '16px', fontWeight: 800, color: '#334155' }}>
                            Selection / Award Action
                          </td>
                          {comparisonData.quotations.map(q => (
                            <td key={q.id} style={{ padding: '16px', textAlign: 'center' }}>
                              <button
                                onClick={() => handlePromptAward(q)}
                                style={{
                                  padding: '8px 16px', borderRadius: '8px', border: 'none',
                                  background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                                  color: 'white', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
                                  boxShadow: '0 4px 10px rgba(22, 163, 74, 0.25)'
                                }}
                              >
                                🏆 Award Quotation
                              </button>
                            </td>
                          ))}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{
              padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
              display: 'flex', justifyContent: 'flex-end'
            }}>
              <button
                type="button"
                onClick={() => setShowCompareModal(false)}
                style={{
                  padding: '9px 18px', borderRadius: '8px', border: '1px solid #cbd5e1',
                  background: 'white', color: '#475569', fontWeight: 600, fontSize: '13px', cursor: 'pointer'
                }}
              >
                Close Comparison
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AWARD CONFIRMATION MODAL */}
      {showAwardModal && targetQuotationToAward && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 1300, padding: '20px'
        }}>
          <div style={{
            background: 'white', width: '100%', maxWidth: '520px',
            borderRadius: '16px', overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)'
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: '#f0fdf4' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#16a34a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trophy size={18} /> Confirm Quotation Award
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#166534' }}>
                You are awarding the RFQ to <strong>{targetQuotationToAward.vendor_name}</strong> for <strong>{parseFloat(targetQuotationToAward.total_amount).toLocaleString()} EGP</strong>.
              </p>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <div style={{
                background: '#f8fafc', padding: '12px 14px', borderRadius: '8px',
                border: '1px solid #e2e8f0', marginBottom: '16px', fontSize: '12px', color: '#475569'
              }}>
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
                  Procurement Concurrency Note:
                </div>
                Awarding this quotation will mark this bid as Selected, reject all other competing bids for this RFQ, and finalize this RFQ for Purchase Order generation in Phase 5B.3.
              </div>

              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Selection Justification / Award Notes (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Lowest total cost and fastest delivery time compliance..."
                value={awardNotes}
                onChange={(e) => setAwardNotes(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}
              />
            </div>

            <div style={{
              padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'flex-end', gap: '10px'
            }}>
              <button
                type="button"
                onClick={() => setShowAwardModal(false)}
                style={{
                  padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1',
                  background: 'white', color: '#475569', fontWeight: 600, fontSize: '13px', cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={handleConfirmAward}
                style={{
                  padding: '8px 18px', borderRadius: '8px', border: 'none',
                  background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                  color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                }}
              >
                Confirm & Award
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INVITE EXTRA VENDOR MODAL */}
      {showAddVendorModal && selectedRfq && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 1200, padding: '20px'
        }}>
          <div style={{
            background: 'white', width: '100%', maxWidth: '420px',
            borderRadius: '16px', overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Invite Vendor to RFQ
              </h3>
            </div>
            <div style={{ padding: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Select Vendor *
              </label>
              <select
                value={newVendorIdToInvite}
                onChange={(e) => setNewVendorIdToInvite(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              >
                <option value="">Select Vendor...</option>
                {vendors
                  .filter(v => !selectedRfq.vendors?.some(sv => sv.vendor_id === v.id))
                  .map(v => (
                    <option key={v.id} value={v.id}>{v.name} ({v.phone || 'No phone'})</option>
                  ))
                }
              </select>
            </div>
            <div style={{ padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setShowAddVendorModal(false)}
                style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', fontSize: '12px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                disabled={submittingAction}
                onClick={handleAddVendor}
                style={{ padding: '7px 16px', borderRadius: '6px', border: 'none', background: '#0284c7', color: 'white', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Send Invitation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RFQs;
