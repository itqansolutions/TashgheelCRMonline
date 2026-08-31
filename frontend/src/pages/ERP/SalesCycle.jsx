import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Truck, FileText, CheckCircle2, Package, Plus, Trash2, X, Eye, ArrowRight, DollarSign, Calendar, User } from 'lucide-react';

const SalesCycle = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    customer_id: '',
    quotation_id: '',
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery: '',
    currency: 'EGP',
    notes: '',
    items: [
      { product_id: '', description: '', quantity: 1, unit_price: 0, subtotal: 0 }
    ]
  });

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await api.get('/erp/sales/orders');
      setOrders(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load Sales Orders');
    } finally {
      setLoading(false);
    }
  };

  const fetchDropdownData = async () => {
    try {
      const [cRes, pRes, qRes] = await Promise.all([
        api.get('/customers').catch(() => ({ data: { data: [] } })),
        api.get('/products').catch(() => ({ data: { data: [] } })),
        api.get('/quotations').catch(() => ({ data: { data: [] } }))
      ]);
      setCustomers(cRes.data?.data || []);
      setProducts(pRes.data?.data || []);
      setQuotations(qRes.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch dropdown dependencies', err);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchDropdownData();
  }, []);

  const handleOpenCreate = () => {
    setFormData({
      customer_id: customers.length > 0 ? String(customers[0].id) : '',
      quotation_id: '',
      order_date: new Date().toISOString().split('T')[0],
      expected_delivery: '',
      currency: 'EGP',
      notes: '',
      items: [
        { product_id: products.length > 0 ? String(products[0].id) : '', description: '', quantity: 1, unit_price: products.length > 0 ? parseFloat(products[0].price || 0) : 0, subtotal: products.length > 0 ? parseFloat(products[0].price || 0) : 0 }
      ]
    });
    setShowCreateModal(true);
  };

  const handleQuotationSelect = (quotationId) => {
    if (!quotationId) {
      setFormData(prev => ({ ...prev, quotation_id: '' }));
      return;
    }
    const quote = quotations.find(q => String(q.id) === String(quotationId));
    if (quote) {
      let quoteItems = [];
      if (Array.isArray(quote.items) && quote.items.length > 0) {
        quoteItems = quote.items.map(it => ({
          product_id: it.product_id ? String(it.product_id) : '',
          description: it.description || it.product_name || '',
          quantity: Number(it.quantity || 1),
          unit_price: Number(it.unit_price || it.price || 0),
          subtotal: Number(it.quantity || 1) * Number(it.unit_price || it.price || 0)
        }));
      } else {
        quoteItems = [
          { product_id: '', description: quote.notes || 'Items from quotation', quantity: 1, unit_price: Number(quote.total_amount || 0), subtotal: Number(quote.total_amount || 0) }
        ];
      }

      setFormData(prev => ({
        ...prev,
        quotation_id: String(quote.id),
        customer_id: String(quote.client_id || prev.customer_id),
        notes: `Imported from Quotation #QT-${quote.id}. ${quote.notes || ''}`.trim(),
        items: quoteItems
      }));
      toast.success(`Imported details from Quotation #QT-${quote.id}`);
    }
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;

    if (field === 'product_id') {
      const prod = products.find(p => String(p.id) === String(value));
      if (prod) {
        newItems[index].unit_price = parseFloat(prod.price || 0);
        newItems[index].description = prod.name || '';
      }
    }

    const qty = parseFloat(newItems[index].quantity || 0);
    const price = parseFloat(newItems[index].unit_price || 0);
    newItems[index].subtotal = qty * price;

    setFormData({ ...formData, items: newItems });
  };

  const addItemRow = () => {
    const defaultProd = products[0];
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        {
          product_id: defaultProd ? String(defaultProd.id) : '',
          description: defaultProd ? defaultProd.name : '',
          quantity: 1,
          unit_price: defaultProd ? parseFloat(defaultProd.price || 0) : 0,
          subtotal: defaultProd ? parseFloat(defaultProd.price || 0) : 0
        }
      ]
    });
  };

  const removeItemRow = (index) => {
    if (formData.items.length === 1) return toast.error('Order must have at least one line item');
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };

  const calculateTotal = () => {
    return formData.items.reduce((acc, item) => acc + (parseFloat(item.subtotal) || 0), 0);
  };

  const handleCreateOrderSubmit = async (e) => {
    e.preventDefault();
    if (!formData.customer_id) return toast.error('Please select a customer');
    if (!formData.items || formData.items.length === 0) return toast.error('At least one item is required');

    setSubmitting(true);
    try {
      await api.post('/erp/sales/orders', {
        ...formData,
        customer_id: parseInt(formData.customer_id),
        quotation_id: formData.quotation_id ? parseInt(formData.quotation_id) : null,
        items: formData.items.map(it => ({
          product_id: it.product_id ? parseInt(it.product_id) : null,
          description: it.description,
          quantity: parseFloat(it.quantity) || 1,
          unit_price: parseFloat(it.unit_price) || 0
        }))
      });

      toast.success('Sales Order created successfully!');
      setShowCreateModal(false);
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create sales order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmOrder = async (orderId) => {
    try {
      await api.put(`/erp/sales/orders/${orderId}/confirm`);
      toast.success('Sales Order confirmed!');
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to confirm order');
    }
  };

  const handleConvertToInvoice = async (orderId) => {
    try {
      const res = await api.post(`/erp/sales/orders/${orderId}/to-invoice`);
      toast.success('Converted to Invoice successfully!');
      fetchOrders();
      if (res.data?.data?.id) {
        navigate(`/finance/invoice-preview/${res.data.data.id}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to convert to invoice');
    }
  };

  const handleViewOrder = (order) => {
    setSelectedOrder(order);
    setShowViewModal(true);
  };

  const modalStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '16px'
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px',
    fontSize: '13px', fontWeight: 600, outline: 'none', background: '#f8fafc', boxSizing: 'border-box'
  };

  const labelStyle = {
    display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px'
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <ShoppingBag size={28} style={{ color: '#10b981' }} /> Sales Orders & Fulfillment Cycle
          </h1>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px', margin: '4px 0 0 0' }}>
            Manage sales orders, convert quotations, and issue commercial invoices
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
            background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white',
            border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(16,185,129,0.25)', fontSize: '13px'
          }}
        >
          <Plus size={18} /> Create Sales Order
        </button>
      </div>

      {/* Orders Table */}
      <div style={{ backgroundColor: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>Loading Sales Orders...</div>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <ShoppingBag size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>No Sales Orders Found</h3>
            <p style={{ color: '#64748b', margin: '0 0 20px 0', fontSize: '14px' }}>Create a new sales order or import from an approved quotation.</p>
            <button
              onClick={handleOpenCreate}
              style={{ padding: '10px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={16} /> Create First Sales Order
            </button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '14px 18px', fontWeight: 800 }}>Order No</th>
                <th style={{ padding: '14px 18px', fontWeight: 800 }}>Customer</th>
                <th style={{ padding: '14px 18px', fontWeight: 800 }}>Date</th>
                <th style={{ padding: '14px 18px', fontWeight: 800 }}>Total Amount</th>
                <th style={{ padding: '14px 18px', fontWeight: 800 }}>Status</th>
                <th style={{ padding: '14px 18px', fontWeight: 800 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontWeight: '800', color: '#10b981' }}>
                    {order.number || order.order_number || `SO-${order.id}`}
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: '700', color: '#1e293b' }}>
                    {order.customer_name || `Customer #${order.customer_id}`}
                  </td>
                  <td style={{ padding: '14px 18px', color: '#64748b' }}>
                    {order.order_date ? new Date(order.order_date).toLocaleDateString() : 'N/A'}
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: '800', color: '#0f172a' }}>
                    {Number(order.total_amount || 0).toLocaleString()} {order.currency || 'EGP'}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '800',
                      backgroundColor: order.status === 'confirmed' ? '#dcfce7' : order.status === 'delivered' ? '#e0e7ff' : order.status === 'invoiced' ? '#f3e8ff' : '#fef3c7',
                      color: order.status === 'confirmed' ? '#166534' : order.status === 'delivered' ? '#3730a3' : order.status === 'invoiced' ? '#7e22ce' : '#92400e'
                    }}>
                      {order.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleViewOrder(order)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px',
                          backgroundColor: '#f1f5f9', color: '#475569', border: 'none',
                          borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer'
                        }}
                      >
                        <Eye size={13} /> View
                      </button>

                      {order.status === 'draft' && (
                        <button
                          onClick={() => handleConfirmOrder(order.id)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px',
                            backgroundColor: '#10b981', color: 'white', border: 'none',
                            borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer'
                          }}
                        >
                          <CheckCircle2 size={13} /> Confirm
                        </button>
                      )}

                      {order.status !== 'invoiced' && (
                        <button
                          onClick={() => handleConvertToInvoice(order.id)}
                          title="Convert this Sales Order into an official Tax Invoice"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px',
                            backgroundColor: '#8b5cf6', color: 'white', border: 'none',
                            borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer'
                          }}
                        >
                          <FileText size={13} /> Convert to Invoice
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Sales Order Modal */}
      {showCreateModal && (
        <div style={modalStyle}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
              <h3 style={{ margin: 0, fontWeight: 800, fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShoppingBag size={20} /> Create New Sales Order
              </h3>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateOrderSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Header options */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>Customer *</label>
                  <select
                    value={formData.customer_id}
                    onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                    style={inputStyle}
                    required
                  >
                    <option value="">Select customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.phone || c.email || 'No contact'})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Import from Quotation (Optional)</label>
                  <select
                    value={formData.quotation_id}
                    onChange={(e) => handleQuotationSelect(e.target.value)}
                    style={{ ...inputStyle, background: formData.quotation_id ? '#ecfdf5' : '#f8fafc', borderColor: formData.quotation_id ? '#10b981' : '#e2e8f0' }}
                  >
                    <option value="">None (Custom Order)</option>
                    {quotations.map((q) => (
                      <option key={q.id} value={q.id}>
                        QT-{q.id} — {q.client_name || 'Client'} (${parseFloat(q.total_amount || 0).toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Order Date *</label>
                  <input
                    type="date"
                    value={formData.order_date}
                    onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                    style={inputStyle}
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>Expected Delivery Date</label>
                  <input
                    type="date"
                    value={formData.expected_delivery}
                    onChange={(e) => setFormData({ ...formData, expected_delivery: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Line items section */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ ...labelStyle, fontSize: '13px', fontWeight: 800, margin: 0 }}>Order Line Items</label>
                  <button
                    type="button"
                    onClick={addItemRow}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', borderRadius: '8px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    <Plus size={14} /> Add Line Item
                  </button>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                        <th style={{ padding: '10px 12px', fontWeight: 700 }}>Product / Service</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700 }}>Description</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, width: '90px' }}>Qty</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, width: '120px' }}>Unit Price</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, width: '110px' }}>Subtotal</th>
                        <th style={{ padding: '10px 12px', width: '40px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.items.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px' }}>
                            <select
                              value={item.product_id}
                              onChange={(e) => handleItemChange(idx, 'product_id', e.target.value)}
                              style={{ ...inputStyle, padding: '6px 10px', fontSize: '12px' }}
                            >
                              <option value="">Custom Item</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name} ({p.sku || 'Item'})</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="text"
                              placeholder="Description..."
                              value={item.description}
                              onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                              style={{ ...inputStyle, padding: '6px 10px', fontSize: '12px' }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                              style={{ ...inputStyle, padding: '6px 10px', fontSize: '12px' }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="number"
                              step="0.01"
                              value={item.unit_price}
                              onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)}
                              style={{ ...inputStyle, padding: '6px 10px', fontSize: '12px' }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: 800, color: '#10b981' }}>
                            ${(parseFloat(item.subtotal) || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => removeItemRow(idx)}
                              style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Total Bar */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '16px', marginTop: '12px', padding: '12px 18px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748b' }}>Order Grand Total:</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: '#10b981' }}>
                    ${calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 2 })} {formData.currency}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label style={labelStyle}>Order Notes & Delivery Instructions</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Special instructions, shipping address, or contract details..."
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', color: '#475569', fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer' }}
                >
                  {submitting ? 'Creating Order...' : 'Create Sales Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Order Details Modal */}
      {showViewModal && selectedOrder && (
        <div style={modalStyle}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '640px', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '18px 24px', background: '#1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
              <div>
                <h3 style={{ margin: 0, fontWeight: 800, fontSize: '16px' }}>
                  Sales Order #{selectedOrder.number || selectedOrder.order_number || selectedOrder.id}
                </h3>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Customer: {selectedOrder.customer_name}</span>
              </div>
              <button onClick={() => setShowViewModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', background: '#f8fafc', padding: '14px', borderRadius: '12px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Status</span>
                  <div style={{ fontWeight: 800, color: '#10b981', marginTop: '2px' }}>{selectedOrder.status?.toUpperCase()}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Order Date</span>
                  <div style={{ fontWeight: 800, color: '#1e293b', marginTop: '2px' }}>{new Date(selectedOrder.order_date).toLocaleDateString()}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Total Value</span>
                  <div style={{ fontWeight: 800, color: '#10b981', marginTop: '2px' }}>${parseFloat(selectedOrder.total_amount || 0).toLocaleString()} {selectedOrder.currency || 'EGP'}</div>
                </div>
              </div>

              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 800, color: '#475569' }}>Line Items</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px' }}>Product</th>
                        <th style={{ padding: '8px 12px' }}>Qty</th>
                        <th style={{ padding: '8px 12px' }}>Unit Price</th>
                        <th style={{ padding: '8px 12px' }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items.map((it, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{it.product_name || it.description || 'Item'}</td>
                          <td style={{ padding: '8px 12px' }}>{it.quantity}</td>
                          <td style={{ padding: '8px 12px' }}>${parseFloat(it.unit_price || 0).toLocaleString()}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 800, color: '#10b981' }}>${parseFloat(it.subtotal || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedOrder.notes && (
                <div style={{ fontSize: '13px', color: '#64748b' }}>
                  <strong>Notes:</strong> {selectedOrder.notes}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                {selectedOrder.status !== 'invoiced' && (
                  <button
                    onClick={() => {
                      setShowViewModal(false);
                      handleConvertToInvoice(selectedOrder.id);
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                  >
                    <FileText size={14} /> Convert to Invoice
                  </button>
                )}
                <button
                  onClick={() => setShowViewModal(false)}
                  style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', color: '#475569' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesCycle;
