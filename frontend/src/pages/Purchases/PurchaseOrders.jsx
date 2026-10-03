import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { 
  FileText, Plus, Search, Trash2, Calendar, Building, 
  CheckCircle2, XCircle, AlertCircle, Clock, ChevronRight, X,
  ShieldCheck, User, Filter, ArrowUpRight, DollarSign,
  Package, Edit3, Send, Truck, Printer, Eye, Award, ExternalLink
} from 'lucide-react';
import WarehouseSubNav from '../../components/Warehouse/WarehouseSubNav';
import { useAuth } from '../../context/AuthContext';

const PurchaseOrders = () => {
  const { user } = useAuth();
  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  const [orders, setOrders] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [awardedQuotations, setAwardedQuotations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [warehouseFilter, setWarehouseFilter] = useState('all');

  // Modals & Drawers
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createRoute, setCreateRoute] = useState('quotation'); // 'quotation' or 'direct'
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [submittingAction, setSubmittingAction] = useState(false);

  // Cancel Modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelTargetId, setCancelTargetId] = useState(null);

  // Route A Form (from quotation)
  const [routeAForm, setRouteAForm] = useState({
    rfq_id: '',
    vendor_quotation_id: '',
    warehouse_id: '',
    expected_delivery_date: '',
    notes: ''
  });
  const [selectedQuotePreview, setSelectedQuotePreview] = useState(null);

  // Route B Form (Direct PO)
  const emptyDirectForm = {
    vendor_id: '',
    warehouse_id: '',
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    payment_terms: 'Cash on Delivery (نقدًا عند الاستلام)',
    shipping_terms: 'Delivered to Warehouse (تسليم مخزن العميل)',
    shipping_cost: 0,
    notes: '',
    items: [
      { product_id: '', quantity: 1, unit_price: 0, discount_pct: 0, tax_pct: 14 }
    ]
  };
  const [directForm, setDirectForm] = useState(emptyDirectForm);

  // Fetch purchase orders
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (vendorFilter !== 'all') params.vendor_id = vendorFilter;
      if (warehouseFilter !== 'all') params.warehouse_id = warehouseFilter;
      if (searchTerm) params.search = searchTerm;

      const res = await api.get('/purchase-orders', { params });
      setOrders(res.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  };

  // Fetch auxiliary data
  const fetchAuxData = async () => {
    try {
      const [wRes, vRes, pRes, rfqRes] = await Promise.all([
        api.get('/inventory/warehouses'),
        api.get('/vendors'),
        api.get('/products'),
        api.get('/rfqs')
      ]);

      const whList = wRes.data?.data || [];
      setWarehouses(whList);
      setVendors(vRes.data?.data || []);
      setProducts(pRes.data?.data || []);

      if (whList.length > 0) {
        setRouteAForm(prev => ({ ...prev, warehouse_id: prev.warehouse_id || whList[0].id }));
        setDirectForm(prev => ({ ...prev, warehouse_id: prev.warehouse_id || whList[0].id }));
      }

      // Filter awarded RFQs with selected quotation
      const rfqs = rfqRes.data?.data || [];
      const awarded = [];
      for (const rfq of rfqs) {
        if (rfq.status === 'awarded') {
          try {
            const compRes = await api.get(`/rfqs/${rfq.id}/compare`);
            const quotes = compRes.data?.data?.quotations || [];
            const selectedQ = quotes.find(q => q.selection_status === 'selected');
            if (selectedQ) {
              awarded.push({
                rfq_id: rfq.id,
                rfq_number: rfq.rfq_number,
                quotation_id: selectedQ.id,
                quotation_number: selectedQ.quotation_number,
                vendor_id: selectedQ.vendor_id,
                vendor_name: selectedQ.vendor_name,
                total_amount: selectedQ.total_amount,
                payment_terms: selectedQ.payment_terms,
                warranty_terms: selectedQ.warranty_terms,
                delivery_time_days: selectedQ.delivery_time_days,
                items: selectedQ.items || []
              });
            }
          } catch (e) {
            // ignore
          }
        }
      }
      setAwardedQuotations(awarded);
    } catch (err) {
      console.warn('Failed to load auxiliary procurement data');
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter, vendorFilter, warehouseFilter]);

  useEffect(() => {
    fetchAuxData();
  }, []);

  // Filtered orders list by search
  const filteredOrders = orders.filter(po => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      po.po_number?.toLowerCase().includes(term) ||
      po.vendor_name?.toLowerCase().includes(term) ||
      po.warehouse_name?.toLowerCase().includes(term) ||
      po.rfq_number?.toLowerCase().includes(term) ||
      po.notes?.toLowerCase().includes(term)
    );
  });

  // KPI Calculations
  const totalCommitment = orders
    .filter(po => po.status !== 'cancelled')
    .reduce((sum, po) => sum + parseFloat(po.total_amount || 0), 0);

  const draftCount = orders.filter(po => po.status === 'draft').length;
  const approvedCount = orders.filter(po => po.status === 'approved').length;
  const sentCount = orders.filter(po => po.status === 'sent_to_vendor').length;

  // View Details Drawer
  const handleOpenDetail = async (id) => {
    try {
      const res = await api.get(`/purchase-orders/${id}`);
      setSelectedOrder(res.data?.data || null);
      setShowDetailDrawer(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load order details');
    }
  };

  // State Transitions
  const handleApprove = async (id) => {
    if (!isManagerOrAdmin) {
      toast.error('Only managers or administrators can approve purchase orders.');
      return;
    }
    setSubmittingAction(true);
    try {
      const res = await api.post(`/purchase-orders/${id}/approve`);
      toast.success(res.data?.message || 'Purchase Order Approved');
      fetchOrders();
      if (selectedOrder && selectedOrder.id === id) {
        handleOpenDetail(id);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Approval failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleSendToVendor = async (id) => {
    if (!isManagerOrAdmin) {
      toast.error('Only managers or administrators can send purchase orders to vendors.');
      return;
    }
    setSubmittingAction(true);
    try {
      const res = await api.post(`/purchase-orders/${id}/send`);
      toast.success(res.data?.message || 'Purchase Order Dispatched to Vendor');
      fetchOrders();
      if (selectedOrder && selectedOrder.id === id) {
        handleOpenDetail(id);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send to vendor');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleOpenCancelModal = (id) => {
    setCancelTargetId(id);
    setCancelReason('');
    setShowCancelModal(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancelTargetId) return;
    setSubmittingAction(true);
    try {
      const res = await api.post(`/purchase-orders/${cancelTargetId}/cancel`, {
        reason: cancelReason
      });
      toast.success(res.data?.message || 'Purchase Order Cancelled');
      setShowCancelModal(false);
      fetchOrders();
      if (selectedOrder && selectedOrder.id === cancelTargetId) {
        handleOpenDetail(cancelTargetId);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cancellation failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Route A: Awarded Quotation Selection Change
  const handleQuoteSelect = (quoteId) => {
    const found = awardedQuotations.find(q => String(q.quotation_id) === String(quoteId));
    if (found) {
      setRouteAForm(prev => ({
        ...prev,
        rfq_id: found.rfq_id,
        vendor_quotation_id: found.quotation_id,
        expected_delivery_date: found.delivery_time_days ? 
          new Date(Date.now() + found.delivery_time_days * 86400000).toISOString().split('T')[0] : prev.expected_delivery_date
      }));
      setSelectedQuotePreview(found);
    } else {
      setRouteAForm(prev => ({ ...prev, rfq_id: '', vendor_quotation_id: '' }));
      setSelectedQuotePreview(null);
    }
  };

  // Submit Route A
  const handleCreateRouteA = async (e) => {
    e.preventDefault();
    if (!routeAForm.vendor_quotation_id || !routeAForm.rfq_id) {
      toast.error('Please select an awarded quotation');
      return;
    }
    if (!routeAForm.warehouse_id) {
      toast.error('Please select a delivery warehouse');
      return;
    }

    setSubmittingAction(true);
    try {
      const res = await api.post('/purchase-orders', routeAForm);
      toast.success(res.data?.message || 'Purchase order created successfully');
      setShowCreateModal(false);
      setRouteAForm({
        rfq_id: '',
        vendor_quotation_id: '',
        warehouse_id: warehouses[0]?.id || '',
        expected_delivery_date: '',
        notes: ''
      });
      setSelectedQuotePreview(null);
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create purchase order');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Direct PO Line Items Operations
  const handleDirectItemChange = (index, field, value) => {
    const updated = [...directForm.items];
    updated[index][field] = value;
    setDirectForm({ ...directForm, items: updated });
  };

  const handleAddDirectItem = () => {
    setDirectForm({
      ...directForm,
      items: [
        ...directForm.items,
        { product_id: '', quantity: 1, unit_price: 0, discount_pct: 0, tax_pct: 14 }
      ]
    });
  };

  const handleRemoveDirectItem = (index) => {
    if (directForm.items.length <= 1) {
      toast.error('Direct Purchase Order must have at least one item');
      return;
    }
    const updated = directForm.items.filter((_, i) => i !== index);
    setDirectForm({ ...directForm, items: updated });
  };

  // Direct PO Math Computation
  const computeDirectTotals = () => {
    let subtotal = 0;
    let discountAmount = 0;
    let taxAmount = 0;

    directForm.items.forEach(item => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unit_price) || 0;
      const discPct = parseFloat(item.discount_pct) || 0;
      const taxPct = parseFloat(item.tax_pct) || 0;

      const gross = qty * price;
      const disc = gross * (discPct / 100);
      const net = gross - disc;
      const tax = net * (taxPct / 100);

      subtotal += net;
      discountAmount += disc;
      taxAmount += tax;
    });

    const shipping = parseFloat(directForm.shipping_cost) || 0;
    const total = subtotal + taxAmount + shipping;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discountAmount: Math.round(discountAmount * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      shippingCost: Math.round(shipping * 100) / 100,
      totalAmount: Math.round(total * 100) / 100
    };
  };

  const directTotals = computeDirectTotals();

  // Submit Route B
  const handleCreateRouteB = async (e) => {
    e.preventDefault();
    if (!isManagerOrAdmin) {
      toast.error('Only managers or administrators can create direct purchase orders.');
      return;
    }
    if (!directForm.vendor_id) {
      toast.error('Please select a vendor');
      return;
    }
    if (!directForm.warehouse_id) {
      toast.error('Please select a warehouse');
      return;
    }
    for (let i = 0; i < directForm.items.length; i++) {
      const it = directForm.items[i];
      if (!it.product_id) {
        toast.error(`Please select a product for line ${i + 1}`);
        return;
      }
      if (parseFloat(it.quantity) <= 0) {
        toast.error(`Quantity must be greater than zero on line ${i + 1}`);
        return;
      }
    }

    setSubmittingAction(true);
    try {
      const res = await api.post('/purchase-orders', directForm);
      toast.success(res.data?.message || 'Direct Purchase Order created successfully');
      setShowCreateModal(false);
      setDirectForm(emptyDirectForm);
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create direct purchase order');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'draft':
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
            background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a'
          }}>
            <Clock size={13} /> مسودة (Draft)
          </span>
        );
      case 'approved':
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
            background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd'
          }}>
            <CheckCircle2 size={13} /> معتمد (Approved)
          </span>
        );
      case 'sent_to_vendor':
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
            background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0'
          }}>
            <Send size={13} /> مُرسل للمورد (Sent)
          </span>
        );
      case 'cancelled':
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
            background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0'
          }}>
            <XCircle size={13} /> مُلغى (Cancelled)
          </span>
        );
      default:
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
            background: '#f1f5f9', color: '#475569'
          }}>
            {status}
          </span>
        );
    }
  };

  return (
    <div style={{ padding: '0 0 40px 0', background: '#f8fafc', minHeight: '100vh', direction: 'ltr' }}>
      <WarehouseSubNav />

      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '0 24px' }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: '16px', marginBottom: '24px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                color: 'white', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center'
              }}>
                <FileText size={22} />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>
                  Purchase Orders
                </h1>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
                  أوامر الشراء والالتزامات التعاقدية مع الموردين (Contractual Commitments)
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setRouteAForm(prev => ({
                ...prev,
                warehouse_id: warehouses[0]?.id || '',
                expected_delivery_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
              }));
              setShowCreateModal(true);
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
              color: 'white', padding: '10px 20px', borderRadius: '10px',
              border: 'none', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(14, 165, 233, 0.35)', transition: 'all 0.2s'
            }}
          >
            <Plus size={18} /> New Purchase Order
          </button>
        </div>

        {/* KPI Summary Cards */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px', marginBottom: '24px'
        }}>
          <div style={{
            background: 'white', padding: '18px', borderRadius: '14px',
            border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Total Orders</span>
              <FileText size={18} color="#0284c7" />
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>{orders.length}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>إجمالي أوامر الشراء المسجلة</div>
          </div>

          <div style={{
            background: 'white', padding: '18px', borderRadius: '14px',
            border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Draft (مسودات)</span>
              <Clock size={18} color="#f59e0b" />
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#b45309' }}>{draftCount}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>بانتظار الاعتماد الإداري</div>
          </div>

          <div style={{
            background: 'white', padding: '18px', borderRadius: '14px',
            border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Approved (معتمد)</span>
              <CheckCircle2 size={18} color="#0284c7" />
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#0369a1' }}>{approvedCount}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>جاهز للإرسال إلى المورد</div>
          </div>

          <div style={{
            background: 'white', padding: '18px', borderRadius: '14px',
            border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Sent to Vendor (مرسل)</span>
              <Send size={18} color="#10b981" />
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#15803d' }}>{sentCount}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>التزام رسمي بانتظار التوريد</div>
          </div>

          <div style={{
            padding: '18px', borderRadius: '14px',
            border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0369a1' }}>Total Commitment</span>
              <DollarSign size={18} color="#0369a1" />
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>
              {totalCommitment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '14px', color: '#64748b' }}>EGP</span>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>قيمة الالتزامات التعاقدية القائمة</div>
          </div>
        </div>

        {/* Filter Bar */}
        <div style={{
          background: 'white', padding: '16px 20px', borderRadius: '14px',
          border: '1px solid #e2e8f0', marginBottom: '20px',
          display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between'
        }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
            {[
              { id: 'all', label: 'All Orders' },
              { id: 'draft', label: 'Draft' },
              { id: 'approved', label: 'Approved' },
              { id: 'sent_to_vendor', label: 'Sent to Vendor' },
              { id: 'cancelled', label: 'Cancelled' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                style={{
                  padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                  background: statusFilter === tab.id ? '#0284c7' : '#f1f5f9',
                  color: statusFilter === tab.id ? 'white' : '#64748b'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Vendor Filter */}
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                fontSize: '13px', background: 'white', color: '#334155'
              }}
            >
              <option value="all">All Vendors (كل الموردين)</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>

            {/* Warehouse Filter */}
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                fontSize: '13px', background: 'white', color: '#334155'
              }}
            >
              <option value="all">All Warehouses (المخازن)</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>

            {/* Search Box */}
            <div style={{ position: 'relative', minWidth: '220px' }}>
              <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <input
                type="text"
                placeholder="Search PO#, Vendor, RFQ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px 8px 34px', borderRadius: '8px',
                  border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none'
                }}
              />
            </div>
          </div>
        </div>

        {/* Orders Table */}
        <div style={{
          background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0',
          overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
        }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
              <Clock size={32} style={{ animation: 'spin 1.5s linear infinite', marginBottom: '12px' }} />
              <div>Loading Purchase Orders...</div>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
              <FileText size={48} strokeWidth={1.5} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
              <h3 style={{ margin: 0, color: '#475569', fontSize: '16px' }}>No Purchase Orders Found</h3>
              <p style={{ margin: '6px 0 16px 0', fontSize: '13px' }}>
                لا توجد أوامر شراء مطابقة للمعايير المحددة. يمكنك إنشاء أمر شراء من عرض سعر معتمد أو أمر مباشر.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  background: '#0284c7', color: 'white', padding: '8px 16px',
                  borderRadius: '8px', border: 'none', fontWeight: 600, fontSize: '13px', cursor: 'pointer'
                }}
              >
                <Plus size={16} /> New Purchase Order
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                    <th style={{ padding: '14px 16px' }}>PO Number</th>
                    <th style={{ padding: '14px 16px' }}>Order Date</th>
                    <th style={{ padding: '14px 16px' }}>Source</th>
                    <th style={{ padding: '14px 16px' }}>Vendor</th>
                    <th style={{ padding: '14px 16px' }}>Warehouse</th>
                    <th style={{ padding: '14px 16px', textAlign: 'right' }}>Total (EGP)</th>
                    <th style={{ padding: '14px 16px', textAlign: 'center' }}>Items</th>
                    <th style={{ padding: '14px 16px', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '14px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(po => (
                    <tr
                      key={po.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                    >
                      <td style={{ padding: '14px 16px', fontWeight: 800, color: '#0284c7' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileText size={16} color="#0284c7" />
                          <span>{po.po_number}</span>
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px', color: '#475569' }}>
                        <div>{new Date(po.order_date).toLocaleDateString()}</div>
                        {po.expected_delivery_date && (
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                            Exp: {new Date(po.expected_delivery_date).toLocaleDateString()}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        {po.po_source === 'awarded_quotation' ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                            padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700
                          }}>
                            <Award size={12} /> Awarded Quotation
                            {po.rfq_number && ` (${po.rfq_number})`}
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0',
                            padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700
                          }}>
                            Direct PO
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#1e293b' }}>
                        <div>{po.vendor_name || 'N/A'}</div>
                        {po.vendor_phone && (
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>{po.vendor_phone}</div>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px', color: '#475569' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Building size={14} color="#94a3b8" />
                          <span>{po.warehouse_name || 'Default'}</span>
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                        {parseFloat(po.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'center', color: '#475569' }}>
                        <span style={{
                          background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px',
                          fontWeight: 700, fontSize: '12px'
                        }}>
                          {po.items_count} items
                        </span>
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                          Rcvd: {parseFloat(po.total_received_qty || 0).toFixed(0)} / {parseFloat(po.total_ordered_qty || 0).toFixed(0)}
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        {renderStatusBadge(po.status)}
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button
                            onClick={() => handleOpenDetail(po.id)}
                            title="View PO Details"
                            style={{
                              background: '#f1f5f9', color: '#0284c7', border: 'none',
                              padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, fontSize: '12px'
                            }}
                          >
                            <Eye size={14} /> View
                          </button>

                          {po.status === 'draft' && isManagerOrAdmin && (
                            <button
                              onClick={() => handleApprove(po.id)}
                              disabled={submittingAction}
                              title="Approve Purchase Order"
                              style={{
                                background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd',
                                padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, fontSize: '12px'
                              }}
                            >
                              <CheckCircle2 size={14} /> Approve
                            </button>
                          )}

                          {po.status === 'approved' && isManagerOrAdmin && (
                            <button
                              onClick={() => handleSendToVendor(po.id)}
                              disabled={submittingAction}
                              title="Send Purchase Order to Vendor"
                              style={{
                                background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0',
                                padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, fontSize: '12px'
                              }}
                            >
                              <Send size={14} /> Send
                            </button>
                          )}

                          {(po.status === 'draft' || po.status === 'approved') && (
                            <button
                              onClick={() => handleOpenCancelModal(po.id)}
                              title="Cancel Purchase Order"
                              style={{
                                background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca',
                                padding: '6px 8px', borderRadius: '6px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center'
                              }}
                            >
                              <XCircle size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* CREATE PO MODAL */}
      {showCreateModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', maxWidth: '840px', width: '100%',
            maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
                  Create Purchase Order / إنشاء أمر شراء
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                  Select route: generate contractually from an awarded quotation or direct entry.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: '#f1f5f9', border: 'none', padding: '6px', borderRadius: '8px', cursor: 'pointer' }}
              >
                <X size={20} color="#64748b" />
              </button>
            </div>

            {/* Route Selection Tabs */}
            <div style={{
              display: 'flex', gap: '8px', marginBottom: '20px', padding: '4px',
              background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0'
            }}>
              <button
                type="button"
                onClick={() => setCreateRoute('quotation')}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  background: createRoute === 'quotation' ? '#0284c7' : 'transparent',
                  color: createRoute === 'quotation' ? 'white' : '#64748b'
                }}
              >
                <Award size={16} /> Route A: From Awarded Quotation (المسار الموصى به)
              </button>

              <button
                type="button"
                onClick={() => setCreateRoute('direct')}
                disabled={!isManagerOrAdmin}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  border: 'none', cursor: isManagerOrAdmin ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  background: createRoute === 'direct' ? '#0284c7' : 'transparent',
                  color: createRoute === 'direct' ? 'white' : '#64748b',
                  opacity: isManagerOrAdmin ? 1 : 0.6
                }}
              >
                <FileText size={16} /> Route B: Direct Purchase Order {!isManagerOrAdmin && '(Admin/Mgr only)'}
              </button>
            </div>

            {/* ROUTE A FORM */}
            {createRoute === 'quotation' && (
              <form onSubmit={handleCreateRouteA}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Select Awarded Quotation * (عروض الأسعار المعتمدة)
                    </label>
                    <select
                      value={routeAForm.vendor_quotation_id}
                      onChange={(e) => handleQuoteSelect(e.target.value)}
                      required
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                        border: '1px solid #cbd5e1', fontSize: '13px'
                      }}
                    >
                      <option value="">-- Choose an Awarded Quotation --</option>
                      {awardedQuotations.map(q => (
                        <option key={q.quotation_id} value={q.quotation_id}>
                          {q.rfq_number} - {q.vendor_name} | {parseFloat(q.total_amount).toFixed(2)} EGP ({q.quotation_number})
                        </option>
                      ))}
                    </select>
                    {awardedQuotations.length === 0 && (
                      <div style={{ fontSize: '12px', color: '#b45309', marginTop: '6px' }}>
                        ⚠️ لا توجد عروض أسعار معتمدة حالياً. يمكنك اعتماد عرض سعر في شاشة RFQs & Bids أولاً.
                      </div>
                    )}
                  </div>
                </div>

                {selectedQuotePreview && (
                  <div style={{
                    background: '#f0f9ff', padding: '14px', borderRadius: '10px',
                    border: '1px solid #bae6fd', marginBottom: '16px'
                  }}>
                    <div style={{ fontWeight: 700, color: '#0369a1', fontSize: '13px', marginBottom: '6px' }}>
                      Commercial Terms Snapshot (الملخص التجاري):
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '12px', color: '#334155' }}>
                      <div><strong>Vendor:</strong> {selectedQuotePreview.vendor_name}</div>
                      <div><strong>Total Amount:</strong> {parseFloat(selectedQuotePreview.total_amount).toFixed(2)} EGP</div>
                      <div><strong>Payment Terms:</strong> {selectedQuotePreview.payment_terms || 'Standard'}</div>
                      <div><strong>Warranty/Delivery:</strong> {selectedQuotePreview.warranty_terms || 'Standard'}</div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Delivery Warehouse * (مخزن الاستلام)
                    </label>
                    <select
                      value={routeAForm.warehouse_id}
                      onChange={(e) => setRouteAForm({ ...routeAForm, warehouse_id: e.target.value })}
                      required
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                        border: '1px solid #cbd5e1', fontSize: '13px'
                      }}
                    >
                      {warehouses.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Expected Delivery Date (تاريخ التوريد المتوقع)
                    </label>
                    <input
                      type="date"
                      value={routeAForm.expected_delivery_date}
                      onChange={(e) => setRouteAForm({ ...routeAForm, expected_delivery_date: e.target.value })}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                        border: '1px solid #cbd5e1', fontSize: '13px'
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Notes & Special Instructions (ملاحظات أمر الشراء)
                  </label>
                  <textarea
                    rows={2}
                    value={routeAForm.notes}
                    onChange={(e) => setRouteAForm({ ...routeAForm, notes: e.target.value })}
                    placeholder="Enter any additional instructions for the vendor..."
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: '8px',
                      border: '1px solid #cbd5e1', fontSize: '13px'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    style={{
                      padding: '10px 18px', borderRadius: '8px', border: '1px solid #cbd5e1',
                      background: 'white', color: '#64748b', fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingAction || !routeAForm.vendor_quotation_id}
                    style={{
                      padding: '10px 22px', borderRadius: '8px', border: 'none',
                      background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                      color: 'white', fontWeight: 700, cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(14,165,233,0.3)'
                    }}
                  >
                    {submittingAction ? 'Creating...' : 'Create Purchase Order (Draft)'}
                  </button>
                </div>
              </form>
            )}

            {/* ROUTE B FORM (DIRECT PO) */}
            {createRoute === 'direct' && (
              <form onSubmit={handleCreateRouteB}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Vendor * (المورد)
                    </label>
                    <select
                      value={directForm.vendor_id}
                      onChange={(e) => setDirectForm({ ...directForm, vendor_id: e.target.value })}
                      required
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                        border: '1px solid #cbd5e1', fontSize: '13px'
                      }}
                    >
                      <option value="">-- Select Vendor --</option>
                      {vendors.map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Warehouse * (المخزن المستلم)
                    </label>
                    <select
                      value={directForm.warehouse_id}
                      onChange={(e) => setDirectForm({ ...directForm, warehouse_id: e.target.value })}
                      required
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                        border: '1px solid #cbd5e1', fontSize: '13px'
                      }}
                    >
                      {warehouses.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Order Date * (تاريخ الأمر)
                    </label>
                    <input
                      type="date"
                      value={directForm.order_date}
                      onChange={(e) => setDirectForm({ ...directForm, order_date: e.target.value })}
                      required
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                        border: '1px solid #cbd5e1', fontSize: '13px'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Expected Delivery Date (تاريخ التوريد المتوقع)
                    </label>
                    <input
                      type="date"
                      value={directForm.expected_delivery_date}
                      onChange={(e) => setDirectForm({ ...directForm, expected_delivery_date: e.target.value })}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                        border: '1px solid #cbd5e1', fontSize: '13px'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Payment Terms (شروط الدفع)
                    </label>
                    <input
                      type="text"
                      value={directForm.payment_terms}
                      onChange={(e) => setDirectForm({ ...directForm, payment_terms: e.target.value })}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: '8px',
                        border: '1px solid #cbd5e1', fontSize: '12px'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Shipping Terms (شروط الشحن)
                    </label>
                    <input
                      type="text"
                      value={directForm.shipping_terms}
                      onChange={(e) => setDirectForm({ ...directForm, shipping_terms: e.target.value })}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: '8px',
                        border: '1px solid #cbd5e1', fontSize: '12px'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Shipping Cost (مصاريف الشحن EGP)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={directForm.shipping_cost}
                      onChange={(e) => setDirectForm({ ...directForm, shipping_cost: e.target.value })}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: '8px',
                        border: '1px solid #cbd5e1', fontSize: '12px'
                      }}
                    />
                  </div>
                </div>

                {/* Direct Items List */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                      Items & Pricing * (الأصناف والأسعار التعاقدية)
                    </label>
                    <button
                      type="button"
                      onClick={handleAddDirectItem}
                      style={{
                        background: '#eff6ff', color: '#0284c7', border: '1px solid #bae6fd',
                        padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '4px'
                      }}
                    >
                      <Plus size={14} /> Add Line Item
                    </button>
                  </div>

                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
                    {directForm.items.map((it, idx) => (
                      <div key={idx} style={{
                        display: 'grid', gridTemplateColumns: '3fr 1fr 1.5fr 1fr 1fr 40px',
                        gap: '8px', alignItems: 'center', marginBottom: idx < directForm.items.length - 1 ? '8px' : 0
                      }}>
                        <select
                          value={it.product_id}
                          onChange={(e) => handleDirectItemChange(idx, 'product_id', e.target.value)}
                          required
                          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                        >
                          <option value="">-- Select Product --</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.sku || p.unit || 'Item'})</option>
                          ))}
                        </select>

                        <input
                          type="number"
                          step="0.001"
                          min="0.001"
                          placeholder="Qty"
                          value={it.quantity}
                          onChange={(e) => handleDirectItemChange(idx, 'quantity', e.target.value)}
                          required
                          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                        />

                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Unit Price"
                          value={it.unit_price}
                          onChange={(e) => handleDirectItemChange(idx, 'unit_price', e.target.value)}
                          required
                          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                        />

                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          placeholder="Disc %"
                          value={it.discount_pct}
                          onChange={(e) => handleDirectItemChange(idx, 'discount_pct', e.target.value)}
                          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                        />

                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Tax %"
                          value={it.tax_pct}
                          onChange={(e) => handleDirectItemChange(idx, 'tax_pct', e.target.value)}
                          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                        />

                        <button
                          type="button"
                          onClick={() => handleRemoveDirectItem(idx)}
                          style={{
                            background: '#fee2e2', border: 'none', color: '#b91c1c',
                            borderRadius: '6px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Direct Financial Summary */}
                <div style={{
                  background: '#f8fafc', padding: '12px 16px', borderRadius: '10px',
                  border: '1px solid #e2e8f0', marginBottom: '16px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                    <span>Net Subtotal (الأساس الخاضع للضريبة):</span>
                    <span>{directTotals.subtotal.toFixed(2)} EGP</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                    <span>Total Discount (إجمالي الخصم):</span>
                    <span>- {directTotals.discountAmount.toFixed(2)} EGP</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                    <span>Total Tax (ضريبة القيمة المضافة):</span>
                    <span>+ {directTotals.taxAmount.toFixed(2)} EGP</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
                    <span>Shipping (الشحن):</span>
                    <span>+ {directTotals.shippingCost.toFixed(2)} EGP</span>
                  </div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 800,
                    color: '#0f172a', borderTop: '1px solid #cbd5e1', paddingTop: '6px'
                  }}>
                    <span>Grand Total (الإجمالي النهائي):</span>
                    <span style={{ color: '#0284c7' }}>{directTotals.totalAmount.toFixed(2)} EGP</span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    style={{
                      padding: '10px 18px', borderRadius: '8px', border: '1px solid #cbd5e1',
                      background: 'white', color: '#64748b', fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingAction}
                    style={{
                      padding: '10px 22px', borderRadius: '8px', border: 'none',
                      background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                      color: 'white', fontWeight: 700, cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(14,165,233,0.3)'
                    }}
                  >
                    {submittingAction ? 'Creating...' : 'Create Direct PO (Draft)'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* DETAIL DRAWER */}
      {showDetailDrawer && selectedOrder && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(3px)',
          display: 'flex', justifyContent: 'flex-end', zIndex: 1100
        }}>
          <div style={{
            background: 'white', width: '100%', maxWidth: '750px', height: '100%',
            overflowY: 'auto', padding: '28px', display: 'flex', flexDirection: 'column',
            boxShadow: '-10px 0 25px -5px rgba(0,0,0,0.1)'
          }}>
            {/* Drawer Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
                    {selectedOrder.po_number}
                  </h2>
                  {renderStatusBadge(selectedOrder.status)}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                  Ordered on {new Date(selectedOrder.order_date).toLocaleDateString()}
                  {selectedOrder.approved_by_name && ` • Approved by ${selectedOrder.approved_by_name}`}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => window.print()}
                  title="Print Purchase Order"
                  style={{
                    background: '#f8fafc', border: '1px solid #cbd5e1', padding: '8px 12px',
                    borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                    fontSize: '13px', fontWeight: 600, color: '#334155'
                  }}
                >
                  <Printer size={15} /> Print
                </button>
                <button
                  onClick={() => setShowDetailDrawer(false)}
                  style={{ background: '#f1f5f9', border: 'none', padding: '6px', borderRadius: '8px', cursor: 'pointer' }}
                >
                  <X size={20} color="#64748b" />
                </button>
              </div>
            </div>

            {/* Vendor & Warehouse Info Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Vendor / المورد
                </div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                  {selectedOrder.vendor_name}
                </div>
                <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                  {selectedOrder.vendor_phone && <div>📞 {selectedOrder.vendor_phone}</div>}
                  {selectedOrder.vendor_email && <div>✉️ {selectedOrder.vendor_email}</div>}
                  {selectedOrder.vendor_tax_no && <div>Tax ID: {selectedOrder.vendor_tax_no}</div>}
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Delivery Warehouse / مخزن الاستلام
                </div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                  {selectedOrder.warehouse_name}
                </div>
                <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                  <div>Exp Delivery: {selectedOrder.expected_delivery_date ? new Date(selectedOrder.expected_delivery_date).toLocaleDateString() : 'Immediate'}</div>
                  <div>Source: {selectedOrder.po_source === 'awarded_quotation' ? `Quotation ${selectedOrder.quotation_number || ''}` : 'Direct PO'}</div>
                </div>
              </div>
            </div>

            {/* Commercial Terms */}
            <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '20px', fontSize: '12px' }}>
              <div style={{ fontWeight: 700, color: '#334155', marginBottom: '4px' }}>Commercial Terms (الشروط التجارية):</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', color: '#475569' }}>
                <div><strong>Payment Terms:</strong> {selectedOrder.payment_terms || 'Standard Terms'}</div>
                <div><strong>Shipping Terms:</strong> {selectedOrder.shipping_terms || 'Standard Delivery'}</div>
              </div>
              {selectedOrder.notes && (
                <div style={{ marginTop: '6px', color: '#64748b' }}>
                  <strong>Notes:</strong> {selectedOrder.notes}
                </div>
              )}
            </div>

            {/* Items Table */}
            <div style={{ marginBottom: '20px', flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a', marginBottom: '8px' }}>
                Contractual Items ({selectedOrder.items?.length || 0})
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#475569', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>Product</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Ordered</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Received</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Price</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Tax</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items?.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px', fontWeight: 600, color: '#1e293b' }}>
                        <div>{it.product_name}</div>
                        {it.sku && <div style={{ fontSize: '10px', color: '#94a3b8' }}>SKU: {it.sku}</div>}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center', fontWeight: 700 }}>
                        {parseFloat(it.quantity).toFixed(2)} {it.unit || ''}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <span style={{
                          background: '#f1f5f9', color: '#64748b', padding: '2px 6px',
                          borderRadius: '4px', fontWeight: 700, fontSize: '11px'
                        }}>
                          {parseFloat(it.received_quantity || 0).toFixed(2)} (GRN Pending)
                        </span>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>
                        {parseFloat(it.unit_price).toFixed(2)}
                        {parseFloat(it.discount_pct || 0) > 0 && (
                          <div style={{ fontSize: '10px', color: '#b45309' }}>-{it.discount_pct}%</div>
                        )}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', color: '#64748b' }}>
                        {it.tax_pct}%
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                        {parseFloat(it.subtotal).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Summary */}
            <div style={{
              background: '#f8fafc', padding: '16px', borderRadius: '12px',
              border: '1px solid #e2e8f0', marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>
                <span>Net Subtotal:</span>
                <span>{parseFloat(selectedOrder.subtotal || 0).toFixed(2)} EGP</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>
                <span>Discount:</span>
                <span>- {parseFloat(selectedOrder.discount_amount || 0).toFixed(2)} EGP</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>
                <span>VAT / Tax:</span>
                <span>+ {parseFloat(selectedOrder.tax_amount || 0).toFixed(2)} EGP</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>
                <span>Shipping Cost:</span>
                <span>+ {parseFloat(selectedOrder.shipping_cost || 0).toFixed(2)} EGP</span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 800,
                color: '#0f172a', borderTop: '1px solid #cbd5e1', paddingTop: '8px'
              }}>
                <span>Total Commitment:</span>
                <span style={{ color: '#0284c7' }}>{parseFloat(selectedOrder.total_amount || 0).toFixed(2)} EGP</span>
              </div>
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
              {selectedOrder.status === 'draft' && isManagerOrAdmin && (
                <button
                  onClick={() => handleApprove(selectedOrder.id)}
                  disabled={submittingAction}
                  style={{
                    background: '#0284c7', color: 'white', padding: '10px 18px',
                    borderRadius: '8px', border: 'none', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <CheckCircle2 size={16} /> Approve PO
                </button>
              )}

              {selectedOrder.status === 'approved' && isManagerOrAdmin && (
                <button
                  onClick={() => handleSendToVendor(selectedOrder.id)}
                  disabled={submittingAction}
                  style={{
                    background: '#15803d', color: 'white', padding: '10px 18px',
                    borderRadius: '8px', border: 'none', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <Send size={16} /> Send to Vendor
                </button>
              )}

              {(selectedOrder.status === 'draft' || selectedOrder.status === 'approved') && (
                <button
                  onClick={() => handleOpenCancelModal(selectedOrder.id)}
                  style={{
                    background: '#fee2e2', color: '#b91c1c', padding: '10px 14px',
                    borderRadius: '8px', border: '1px solid #fecaca', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                  }}
                >
                  Cancel Order
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CANCEL REASON MODAL */}
      {showCancelModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '20px'
        }}>
          <div style={{
            background: 'white', borderRadius: '14px', maxWidth: '440px', width: '100%',
            padding: '20px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: 800, color: '#b91c1c' }}>
              Cancel Purchase Order / إلغاء أمر الشراء
            </h3>
            <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#64748b' }}>
              Please state the reason for cancelling this purchase order. This action cannot be reversed.
            </p>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Vendor out of stock, budget reallocation..."
              style={{
                width: '100%', padding: '8px 12px', borderRadius: '8px',
                border: '1px solid #cbd5e1', fontSize: '13px', marginBottom: '16px'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                style={{
                  padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1',
                  background: 'white', color: '#64748b', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={submittingAction}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: 'none',
                  background: '#b91c1c', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer'
                }}
              >
                {submittingAction ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrders;
