import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { 
  ClipboardList, Plus, Search, Trash2, Calendar, Building, 
  CheckCircle2, XCircle, AlertCircle, Clock, ChevronRight, X,
  FileText, ShieldCheck, User, Filter, ArrowUpRight, DollarSign,
  Package, Edit3, Send
} from 'lucide-react';
import WarehouseSubNav from '../../components/Warehouse/WarehouseSubNav';
import { useAuth } from '../../context/AuthContext';

const PurchaseRequests = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Modals & Drawers
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);

  // Form State
  const emptyForm = {
    warehouse_id: '',
    department: '',
    required_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    priority: 'normal',
    notes: '',
    items: [
      { product_id: '', quantity: 1, estimated_unit_price: 0, unit: 'piece', subtotal: 0 }
    ]
  };
  const [form, setForm] = useState(emptyForm);

  const isApprover = user?.role === 'admin' || user?.role === 'manager';

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (priorityFilter !== 'all') params.priority = priorityFilter;
      if (searchTerm) params.search = searchTerm;

      const res = await api.get('/purchase-requests', { params });
      setRequests(res.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load purchase requests');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuxData = async () => {
    try {
      const [wRes, pRes] = await Promise.all([
        api.get('/inventory/warehouses'),
        api.get('/products')
      ]);
      setWarehouses(wRes.data?.data || []);
      setProducts(pRes.data?.data || []);
    } catch (err) {
      console.warn('Failed to load warehouses or products');
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter, priorityFilter]);

  useEffect(() => {
    fetchAuxData();
  }, []);

  // Recalculate filtered requests on search term change
  const filteredRequests = requests.filter(req => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      req.request_number?.toLowerCase().includes(term) ||
      req.department?.toLowerCase().includes(term) ||
      req.requester_name?.toLowerCase().includes(term) ||
      req.warehouse_name?.toLowerCase().includes(term) ||
      req.notes?.toLowerCase().includes(term)
    );
  });

  // Calculate summary metrics
  const stats = {
    total: requests.length,
    submitted: requests.filter(r => r.status === 'submitted').length,
    approved: requests.filter(r => r.status === 'approved').length,
    drafts: requests.filter(r => r.status === 'draft').length,
    totalEstimatedPending: requests
      .filter(r => r.status === 'submitted')
      .reduce((sum, r) => sum + parseFloat(r.estimated_total || 0), 0)
  };

  const handleOpenCreateModal = () => {
    setIsEditing(false);
    setEditId(null);
    setForm({
      warehouse_id: warehouses[0]?.id ? String(warehouses[0].id) : '',
      department: user?.department || '',
      required_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      priority: 'normal',
      notes: '',
      items: [
        {
          product_id: products[0]?.id ? String(products[0].id) : '',
          quantity: 1,
          estimated_unit_price: products[0]?.cost_price || 0,
          unit: products[0]?.unit || 'piece',
          subtotal: (products[0]?.cost_price || 0) * 1
        }
      ]
    });
    setShowCreateModal(true);
  };

  const handleOpenEditModal = async (reqId) => {
    try {
      const res = await api.get(`/purchase-requests/${reqId}`);
      const data = res.data?.data;
      if (!data) return;

      setIsEditing(true);
      setEditId(reqId);
      setForm({
        warehouse_id: data.warehouse_id ? String(data.warehouse_id) : '',
        department: data.department || '',
        required_date: data.required_date ? data.required_date.split('T')[0] : '',
        priority: data.priority || 'normal',
        notes: data.notes || '',
        items: data.items?.map(i => ({
          product_id: String(i.product_id),
          quantity: parseFloat(i.quantity) || 1,
          estimated_unit_price: parseFloat(i.estimated_unit_price) || 0,
          unit: i.unit || 'piece',
          subtotal: (parseFloat(i.quantity) || 1) * (parseFloat(i.estimated_unit_price) || 0)
        })) || []
      });
      setShowCreateModal(true);
    } catch (err) {
      toast.error('Failed to load request for editing');
    }
  };

  const handleOpenDetail = async (reqId) => {
    try {
      const res = await api.get(`/purchase-requests/${reqId}`);
      setSelectedRequest(res.data?.data);
      setShowDetailDrawer(true);
    } catch (err) {
      toast.error('Failed to load request details');
    }
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...form.items];
    updated[index][field] = value;

    if (field === 'product_id') {
      const p = products.find(prod => String(prod.id) === String(value));
      if (p) {
        updated[index].estimated_unit_price = p.cost_price || 0;
        updated[index].unit = p.unit || 'piece';
      }
    }

    const qty = parseFloat(updated[index].quantity) || 0;
    const price = parseFloat(updated[index].estimated_unit_price) || 0;
    updated[index].subtotal = qty * price;

    setForm(prev => ({ ...prev, items: updated }));
  };

  const handleAddItem = () => {
    const defaultProduct = products[0];
    setForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product_id: defaultProduct ? String(defaultProduct.id) : '',
          quantity: 1,
          estimated_unit_price: defaultProduct?.cost_price || 0,
          unit: defaultProduct?.unit || 'piece',
          subtotal: defaultProduct?.cost_price || 0
        }
      ]
    }));
  };

  const handleRemoveItem = (index) => {
    if (form.items.length === 1) {
      toast.error('Purchase request must have at least one item');
      return;
    }
    setForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const totalEstimatedForm = form.items.reduce((sum, it) => sum + (parseFloat(it.subtotal) || 0), 0);

  const handleSubmitForm = async (e, autoSubmit = false) => {
    e.preventDefault();
    if (!form.warehouse_id) {
      toast.error('Please select a target warehouse');
      return;
    }
    if (form.items.length === 0) {
      toast.error('Please add at least one line item');
      return;
    }
    for (const it of form.items) {
      if (!it.product_id) {
        toast.error('Each row must have a selected product');
        return;
      }
      if (parseFloat(it.quantity) <= 0) {
        toast.error('Quantity must be greater than zero');
        return;
      }
    }

    setSubmittingAction(true);
    try {
      let reqId = editId;
      if (isEditing) {
        await api.put(`/purchase-requests/${editId}`, form);
        toast.success('Purchase request updated successfully');
      } else {
        const res = await api.post('/purchase-requests', form);
        reqId = res.data?.data?.id;
        toast.success('Draft purchase request created');
      }

      if (autoSubmit && reqId) {
        await api.post(`/purchase-requests/${reqId}/submit`);
        toast.success('Submitted for approval!');
      }

      setShowCreateModal(false);
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save purchase request');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Actions
  const handleSubmitForApproval = async (id) => {
    if (!window.confirm('Submit this request for approval? It will be locked for review.')) return;
    setSubmittingAction(true);
    try {
      await api.post(`/purchase-requests/${id}/submit`);
      toast.success('Purchase request submitted for approval');
      fetchRequests();
      if (selectedRequest?.id === id) {
        handleOpenDetail(id);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit request');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleApprove = async (id) => {
    if (!window.confirm('Approve this purchase request? This authorizes the procurement team to proceed.')) return;
    setSubmittingAction(true);
    try {
      await api.post(`/purchase-requests/${id}/approve`);
      toast.success('Purchase request approved successfully');
      fetchRequests();
      if (selectedRequest?.id === id) {
        handleOpenDetail(id);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve request');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleRejectPrompt = (id) => {
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleConfirmReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Please specify a reason for rejection');
      return;
    }
    const id = selectedRequest?.id;
    if (!id) return;

    setSubmittingAction(true);
    try {
      await api.post(`/purchase-requests/${id}/reject`, { rejection_reason: rejectionReason });
      toast.success('Purchase request rejected');
      setShowRejectModal(false);
      fetchRequests();
      handleOpenDetail(id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject request');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleCancelRequest = async (id) => {
    if (!window.confirm('Cancel this purchase request? This action cannot be undone.')) return;
    setSubmittingAction(true);
    try {
      await api.post(`/purchase-requests/${id}/cancel`);
      toast.success('Purchase request cancelled');
      fetchRequests();
      if (selectedRequest?.id === id) {
        handleOpenDetail(id);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel request');
    } finally {
      setSubmittingAction(false);
    }
  };

  const getPriorityBadge = (p) => {
    const map = {
      urgent: { bg: '#fef2f2', text: '#ef4444', label: 'Urgent', border: '#fecaca' },
      high:   { bg: '#fffbeb', text: '#d97706', label: 'High', border: '#fde68a' },
      normal: { bg: '#eff6ff', text: '#2563eb', label: 'Normal', border: '#bfdbfe' },
      low:    { bg: '#f8fafc', text: '#64748b', label: 'Low', border: '#e2e8f0' }
    };
    const c = map[p] || map.normal;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        padding: '3px 8px', borderRadius: '12px', fontSize: '11px',
        fontWeight: 700, backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}`
      }}>
        {c.label}
      </span>
    );
  };

  const getStatusBadge = (s) => {
    const map = {
      draft:            { bg: '#f1f5f9', text: '#475569', label: 'Draft', icon: FileText },
      submitted:        { bg: '#fff7ed', text: '#ea580c', label: 'Pending Approval', icon: Clock },
      approved:         { bg: '#f0fdf4', text: '#16a34a', label: 'Approved', icon: CheckCircle2 },
      rejected:         { bg: '#fef2f2', text: '#dc2626', label: 'Rejected', icon: XCircle },
      cancelled:        { bg: '#f8fafc', text: '#94a3b8', label: 'Cancelled', icon: AlertCircle },
      converted_to_rfq: { bg: '#faf5ff', text: '#9333ea', label: 'In RFQ', icon: ArrowUpRight },
    };
    const c = map[s] || map.draft;
    const IconComponent = c.icon;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        padding: '4px 10px', borderRadius: '16px', fontSize: '12px',
        fontWeight: 800, backgroundColor: c.bg, color: c.text
      }}>
        <IconComponent size={13} />
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
              <ClipboardList size={26} color="#0284c7" />
              Purchase Requests & Approvals
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
              Internal department requisition workflow & approval gateway (Phase 5B.1)
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
              New Purchase Request
            </button>
          </div>
        </div>

        {/* KPI Summary Cards */}
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
                Total Requests
              </span>
              <div style={{ padding: '8px', background: '#f0f9ff', borderRadius: '10px', color: '#0284c7' }}>
                <ClipboardList size={18} />
              </div>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', marginTop: '10px' }}>
              {stats.total}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              All internal requisitions
            </div>
          </div>

          <div style={{
            background: 'white', borderRadius: '14px', padding: '18px 20px',
            border: '1px solid #ffedd5', boxShadow: '0 2px 8px rgba(234, 88, 12, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#c2410c', textTransform: 'uppercase' }}>
                Pending Review
              </span>
              <div style={{ padding: '8px', background: '#fff7ed', borderRadius: '10px', color: '#ea580c' }}>
                <Clock size={18} />
              </div>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#ea580c', marginTop: '10px' }}>
              {stats.submitted}
            </div>
            <div style={{ fontSize: '12px', color: '#9a3412', marginTop: '4px' }}>
              Awaiting manager approval
            </div>
          </div>

          <div style={{
            background: 'white', borderRadius: '14px', padding: '18px 20px',
            border: '1px solid #dcfce7', boxShadow: '0 2px 8px rgba(22, 163, 74, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>
                Approved
              </span>
              <div style={{ padding: '8px', background: '#f0fdf4', borderRadius: '10px', color: '#16a34a' }}>
                <CheckCircle2 size={18} />
              </div>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#16a34a', marginTop: '10px' }}>
              {stats.approved}
            </div>
            <div style={{ fontSize: '12px', color: '#15803d', marginTop: '4px' }}>
              Ready for procurement
            </div>
          </div>

          <div style={{
            background: 'white', borderRadius: '14px', padding: '18px 20px',
            border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Est. Pending Demand
              </span>
              <div style={{ padding: '8px', background: '#f8fafc', borderRadius: '10px', color: '#475569' }}>
                <DollarSign size={18} />
              </div>
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginTop: '10px' }}>
              {stats.totalEstimatedPending.toLocaleString()} <span style={{ fontSize: '13px', fontWeight: 600 }}>EGP</span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              In approval pipeline
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div style={{
          background: 'white', borderRadius: '14px', padding: '16px 20px',
          border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px'
        }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All Requests' },
              { id: 'submitted', label: 'Pending Approval' },
              { id: 'draft', label: 'Drafts' },
              { id: 'approved', label: 'Approved' },
              { id: 'converted_to_rfq', label: 'In RFQ' },
              { id: 'rejected', label: 'Rejected' },
              { id: 'cancelled', label: 'Cancelled' },
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

          {/* Search & Priority Filter */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                fontSize: '13px', color: '#334155', outline: 'none', background: 'white'
              }}
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>

            <div style={{ position: 'relative', width: '240px' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search requests..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px 8px 36px', borderRadius: '8px',
                  border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none'
                }}
              />
            </div>
          </div>
        </div>

        {/* Requests Table */}
        <div style={{
          background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0',
          overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
        }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
              Loading purchase requests...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <ClipboardList size={40} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#334155', margin: 0 }}>
                No purchase requests found
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '6px 0 16px' }}>
                Create a new request to initiate department procurement.
              </p>
              <button
                onClick={handleOpenCreateModal}
                style={{
                  padding: '8px 16px', borderRadius: '8px', background: '#0284c7',
                  color: 'white', border: 'none', fontWeight: 600, fontSize: '13px', cursor: 'pointer'
                }}
              >
                Create Request
              </button>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>Request #</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>Requester & Dept</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>Warehouse</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>Required Date</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>Priority</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>Items / Est. Total</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map(req => (
                  <tr
                    key={req.id}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background 0.15s',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                    onClick={() => handleOpenDetail(req.id)}
                  >
                    <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0284c7' }}>
                      {req.request_number}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{req.requester_name || 'System User'}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{req.department || 'General'}</div>
                    </td>
                    <td style={{ padding: '14px 18px', color: '#334155' }}>
                      {req.warehouse_name || 'Default Warehouse'}
                    </td>
                    <td style={{ padding: '14px 18px', color: '#475569' }}>
                      {req.required_date ? new Date(req.required_date).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      {getPriorityBadge(req.priority)}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>
                        {parseFloat(req.estimated_total || 0).toLocaleString()} EGP
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {req.items_count || 1} line item(s)
                      </div>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      {getStatusBadge(req.status)}
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        {req.status === 'draft' && (
                          <>
                            <button
                              onClick={() => handleOpenEditModal(req.id)}
                              title="Edit Draft"
                              style={{
                                padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1',
                                background: 'white', color: '#475569', cursor: 'pointer'
                              }}
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={() => handleSubmitForApproval(req.id)}
                              title="Submit for Approval"
                              style={{
                                padding: '6px 10px', borderRadius: '6px', border: 'none',
                                background: '#0284c7', color: 'white', fontWeight: 700, fontSize: '12px',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                              }}
                            >
                              <Send size={12} /> Submit
                            </button>
                          </>
                        )}

                        {req.status === 'submitted' && isApprover && (
                          <>
                            <button
                              onClick={() => handleApprove(req.id)}
                              title="Approve Request"
                              style={{
                                padding: '6px 10px', borderRadius: '6px', border: 'none',
                                background: '#16a34a', color: 'white', fontWeight: 700, fontSize: '12px',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                              }}
                            >
                              <CheckCircle2 size={13} /> Approve
                            </button>
                            <button
                              onClick={() => { setSelectedRequest(req); handleRejectPrompt(req.id); }}
                              title="Reject Request"
                              style={{
                                padding: '6px 10px', borderRadius: '6px', border: 'none',
                                background: '#dc2626', color: 'white', fontWeight: 700, fontSize: '12px',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                              }}
                            >
                              <XCircle size={13} /> Reject
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => handleOpenDetail(req.id)}
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

      {/* CREATE / EDIT MODAL */}
      {showCreateModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 1100, padding: '20px'
        }}>
          <div style={{
            background: 'white', width: '100%', maxWidth: '850px', maxHeight: '90vh',
            borderRadius: '16px', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc'
            }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  {isEditing ? 'Edit Purchase Request' : 'Create Purchase Request'}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                  Specify needed materials and estimated budget requirements.
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
            <form onSubmit={(e) => handleSubmitForm(e, false)} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                {/* Header Information */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Target Warehouse *
                    </label>
                    <select
                      value={form.warehouse_id}
                      onChange={(e) => setForm(prev => ({ ...prev, warehouse_id: e.target.value }))}
                      required
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                        fontSize: '13px', background: 'white', color: '#0f172a'
                      }}
                    >
                      <option value="">Select Warehouse</option>
                      {warehouses.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Department
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Production, IT"
                      value={form.department}
                      onChange={(e) => setForm(prev => ({ ...prev, department: e.target.value }))}
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                        fontSize: '13px', outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Required By Date
                    </label>
                    <input
                      type="date"
                      value={form.required_date}
                      onChange={(e) => setForm(prev => ({ ...prev, required_date: e.target.value }))}
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                        fontSize: '13px', outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Priority
                    </label>
                    <select
                      value={form.priority}
                      onChange={(e) => setForm(prev => ({ ...prev, priority: e.target.value }))}
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                        fontSize: '13px', background: 'white', color: '#0f172a'
                      }}
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                {/* Justification / Notes */}
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Purpose / Business Justification
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Briefly state why this purchase is needed..."
                    value={form.notes}
                    onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                      fontSize: '13px', outline: 'none', resize: 'vertical'
                    }}
                  />
                </div>

                {/* Line Items Section */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                      Requested Products / Items
                    </h3>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                        borderRadius: '6px', background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd',
                        fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      <Plus size={14} /> Add Line Item
                    </button>
                  </div>

                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Product *</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center', width: '110px', fontWeight: 700 }}>Quantity</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center', width: '90px', fontWeight: 700 }}>Unit</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right', width: '130px', fontWeight: 700 }}>Est. Unit Price</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right', width: '130px', fontWeight: 700 }}>Est. Subtotal</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center', width: '50px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.items.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 14px' }}>
                              <select
                                value={item.product_id}
                                onChange={(e) => handleItemChange(idx, 'product_id', e.target.value)}
                                required
                                style={{
                                  width: '100%', padding: '7px 10px', borderRadius: '6px',
                                  border: '1px solid #cbd5e1', fontSize: '13px', background: 'white'
                                }}
                              >
                                <option value="">Select product...</option>
                                {products.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} {p.sku ? `(${p.sku})` : ''}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={{ padding: '8px 14px' }}>
                              <input
                                type="number"
                                min="0.01"
                                step="any"
                                value={item.quantity}
                                onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                                style={{
                                  width: '100%', padding: '7px 8px', borderRadius: '6px',
                                  border: '1px solid #cbd5e1', fontSize: '13px', textAlign: 'center'
                                }}
                              />
                            </td>
                            <td style={{ padding: '8px 14px' }}>
                              <input
                                type="text"
                                value={item.unit}
                                onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                                style={{
                                  width: '100%', padding: '7px 8px', borderRadius: '6px',
                                  border: '1px solid #cbd5e1', fontSize: '13px', textAlign: 'center'
                                }}
                              />
                            </td>
                            <td style={{ padding: '8px 14px' }}>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={item.estimated_unit_price}
                                onChange={(e) => handleItemChange(idx, 'estimated_unit_price', e.target.value)}
                                style={{
                                  width: '100%', padding: '7px 8px', borderRadius: '6px',
                                  border: '1px solid #cbd5e1', fontSize: '13px', textAlign: 'right'
                                }}
                              />
                            </td>
                            <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                              {(parseFloat(item.subtotal) || 0).toLocaleString()} EGP
                            </td>
                            <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                style={{
                                  background: 'none', border: 'none', color: '#ef4444',
                                  cursor: 'pointer', padding: '4px'
                                }}
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
              </div>

              {/* Modal Footer */}
              <div style={{
                padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>Estimated Budget:</span>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                    {totalEstimatedForm.toLocaleString()} EGP
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
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
                    onClick={(e) => handleSubmitForm(e, true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '9px 20px', borderRadius: '8px', border: 'none',
                      background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                      color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
                    }}
                  >
                    <Send size={14} />
                    Save & Submit for Approval
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL / APPROVAL DRAWER */}
      {showDetailDrawer && selectedRequest && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'flex-end',
          zIndex: 1100
        }}>
          <div style={{
            background: 'white', width: '100%', maxWidth: '650px', height: '100%',
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
                    {selectedRequest.request_number}
                  </h2>
                  {getStatusBadge(selectedRequest.status)}
                  {getPriorityBadge(selectedRequest.priority)}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Created on {new Date(selectedRequest.created_at).toLocaleString()}
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
              {/* Requester & Location Meta */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px',
                background: '#f8fafc', padding: '16px', borderRadius: '12px', marginBottom: '20px',
                border: '1px solid #e2e8f0'
              }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    Requester
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                    {selectedRequest.requester_name || 'System User'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569' }}>
                    Dept: {selectedRequest.department || 'Not specified'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    Target Warehouse
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                    {selectedRequest.warehouse_name || 'Default Warehouse'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569' }}>
                    Needed by: {selectedRequest.required_date ? new Date(selectedRequest.required_date).toLocaleDateString() : 'Immediate'}
                  </div>
                </div>
              </div>

              {/* Purpose & Justification */}
              {selectedRequest.notes && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Business Justification
                  </div>
                  <div style={{
                    padding: '12px 16px', background: '#f1f5f9', borderRadius: '8px',
                    fontSize: '13px', color: '#334155', lineHeight: 1.5
                  }}>
                    {selectedRequest.notes}
                  </div>
                </div>
              )}

              {/* Rejection Alert if rejected */}
              {selectedRequest.status === 'rejected' && (
                <div style={{
                  marginBottom: '24px', padding: '14px 16px', background: '#fef2f2',
                  border: '1px solid #fecaca', borderRadius: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626', fontWeight: 700, fontSize: '13px' }}>
                    <XCircle size={16} /> Request Rejected
                  </div>
                  <div style={{ fontSize: '12px', color: '#991b1b', marginTop: '4px' }}>
                    <strong>Reason:</strong> {selectedRequest.rejection_reason || 'No reason specified'}
                  </div>
                  {selectedRequest.approved_at && (
                    <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '4px' }}>
                      Decision made at: {new Date(selectedRequest.approved_at).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              {/* Approval Info if approved */}
              {selectedRequest.status === 'approved' && (
                <div style={{
                  marginBottom: '24px', padding: '14px 16px', background: '#f0fdf4',
                  border: '1px solid #bbf7d0', borderRadius: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontWeight: 700, fontSize: '13px' }}>
                    <CheckCircle2 size={16} /> Request Approved
                  </div>
                  <div style={{ fontSize: '12px', color: '#166534', marginTop: '4px' }}>
                    Authorized by <strong>{selectedRequest.approver_name || 'Manager'}</strong> on {new Date(selectedRequest.approved_at).toLocaleString()}.
                  </div>
                </div>
              )}

              {/* Items Breakdown */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>
                  Requested Line Items ({selectedRequest.items?.length || 0})
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Item</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>Quantity</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>Est. Unit Price</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRequest.items?.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.product_name}</div>
                            {item.sku && <div style={{ fontSize: '11px', color: '#64748b' }}>SKU: {item.sku}</div>}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600 }}>
                            {parseFloat(item.quantity)} {item.unit || 'unit'}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: '#475569' }}>
                            {parseFloat(item.estimated_unit_price || 0).toLocaleString()} EGP
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                            {parseFloat(item.estimated_subtotal || 0).toLocaleString()} EGP
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{
                  display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
                  gap: '12px', marginTop: '14px', padding: '12px 16px', background: '#f8fafc',
                  borderRadius: '8px', border: '1px solid #e2e8f0'
                }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>Total Estimated Budget:</span>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                    {parseFloat(selectedRequest.estimated_total || 0).toLocaleString()} EGP
                  </span>
                </div>
              </div>
            </div>

            {/* Contextual Action Bar at bottom of Drawer */}
            <div style={{
              padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                {(selectedRequest.status === 'draft' || selectedRequest.status === 'submitted') && (
                  <button
                    onClick={() => handleCancelRequest(selectedRequest.id)}
                    disabled={submittingAction}
                    style={{
                      background: 'none', border: 'none', color: '#dc2626',
                      fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: 0
                    }}
                  >
                    Cancel Request
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                {selectedRequest.status === 'draft' && (
                  <>
                    <button
                      onClick={() => {
                        setShowDetailDrawer(false);
                        handleOpenEditModal(selectedRequest.id);
                      }}
                      style={{
                        padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1',
                        background: 'white', color: '#475569', fontWeight: 600, fontSize: '13px', cursor: 'pointer'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleSubmitForApproval(selectedRequest.id)}
                      disabled={submittingAction}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '9px 18px', borderRadius: '8px', border: 'none',
                        background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                        color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                      }}
                    >
                      <Send size={14} /> Submit for Approval
                    </button>
                  </>
                )}

                {selectedRequest.status === 'submitted' && isApprover && (
                  <>
                    <button
                      onClick={() => handleRejectPrompt(selectedRequest.id)}
                      disabled={submittingAction}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '9px 16px', borderRadius: '8px', border: '1px solid #fecaca',
                        background: '#fef2f2', color: '#dc2626', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                      }}
                    >
                      <XCircle size={15} /> Reject
                    </button>
                    <button
                      onClick={() => handleApprove(selectedRequest.id)}
                      disabled={submittingAction}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '9px 20px', borderRadius: '8px', border: 'none',
                        background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                        color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
                      }}
                    >
                      <CheckCircle2 size={15} /> Approve Request
                    </button>
                  </>
                )}

                {selectedRequest.status === 'approved' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#16a34a', fontSize: '13px', fontWeight: 700 }}>
                    <CheckCircle2 size={16} /> Ready for RFQ / Direct PO
                  </div>
                )}

                {selectedRequest.status === 'converted_to_rfq' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#9333ea', fontSize: '13px', fontWeight: 700 }}>
                    <ArrowUpRight size={16} /> Converted to RFQ — Locked for Procurement
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {showRejectModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 1200, padding: '20px'
        }}>
          <div style={{
            background: 'white', width: '100%', maxWidth: '480px',
            borderRadius: '16px', overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: '#fef2f2' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#dc2626', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <XCircle size={18} /> Reject Purchase Request
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#991b1b' }}>
                Please provide the requester with clear feedback explaining the rejection.
              </p>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Rejection Reason *
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Budget exceeded, items already available in warehouse..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none'
                }}
              />
            </div>

            <div style={{
              padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'flex-end', gap: '10px'
            }}>
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                style={{
                  padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1',
                  background: 'white', color: '#475569', fontWeight: 600, fontSize: '13px', cursor: 'pointer'
                }}
              >
                Back
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={handleConfirmReject}
                style={{
                  padding: '8px 18px', borderRadius: '8px', border: 'none',
                  background: '#dc2626', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                }}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseRequests;
