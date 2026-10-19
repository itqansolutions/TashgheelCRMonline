import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Truck, FileText, CheckCircle2, Package, Plus, Trash2, X, Eye, ArrowRight, DollarSign, Calendar, User } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import CustomerSearchSelect from '../../components/Common/CustomerSearchSelect';

const SalesCycle = () => {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [deals, setDeals] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeliverModal, setShowDeliverModal] = useState(false);
  const [deliverOrder, setDeliverOrder] = useState(null);
  const [deliveryFormData, setDeliveryFormData] = useState({
    warehouse_id: '',
    delivery_date: new Date().toISOString().split('T')[0],
    notes: '',
    items: []
  });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    customer_id: '',
    deal_id: '',
    quotation_id: '',
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery: '',
    currency: 'EGP',
    notes: '',
    items: [
      { product_id: '', description: '', quantity: 1, unit_price: 0, subtotal: 0 }
    ]
  });

  const currencyLabel = t('common.currency', 'EGP');

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await api.get('/erp/sales/orders');
      setOrders(res.data.data || []);
    } catch (err) {
      toast.error(t('sales.orders.toasts.loadOrdersError'));
    } finally {
      setLoading(false);
    }
  };

  const fetchDropdownData = async () => {
    try {
      const [cRes, pRes, qRes, dRes, wRes] = await Promise.all([
        api.get('/customers').catch(() => ({ data: { data: [] } })),
        api.get('/products').catch(() => ({ data: { data: [] } })),
        api.get('/quotations').catch(() => ({ data: { data: [] } })),
        api.get('/deals').catch(() => ({ data: { data: [] } })),
        api.get('/inventory/warehouses').catch(() => ({ data: { data: [] } }))
      ]);
      setCustomers(cRes.data?.data || []);
      setProducts(pRes.data?.data || []);
      setQuotations(qRes.data?.data || []);
      setDeals(dRes.data?.data || []);
      setWarehouses(wRes.data?.data || []);
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
      deal_id: '',
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
        deal_id: quote.deal_id ? String(quote.deal_id) : prev.deal_id,
        customer_id: String(quote.client_id || prev.customer_id),
        notes: `Imported from Quotation #QT-${quote.id}. ${quote.notes || ''}`.trim(),
        items: quoteItems
      }));
      toast.success(t('sales.orders.toasts.importedQuotation', { id: quote.id }));
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
    if (formData.items.length === 1) return toast.error(t('sales.orders.toasts.minOneItem'));
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
    if (!formData.customer_id) return toast.error(t('sales.orders.toasts.selectCustomerReq'));
    if (!formData.items || formData.items.length === 0) return toast.error(t('sales.orders.toasts.oneItemReq'));

    setSubmitting(true);
    try {
      await api.post('/erp/sales/orders', {
        ...formData,
        customer_id: parseInt(formData.customer_id),
        deal_id: formData.deal_id ? parseInt(formData.deal_id) : null,
        quotation_id: formData.quotation_id ? parseInt(formData.quotation_id) : null,
        items: formData.items.map(it => {
          const prod = it.product_id ? products.find(p => p.id === parseInt(it.product_id, 10)) : null;
          const itemType = it.item_type || (prod ? (prod.is_inventory_item ? 'inventory' : 'service') : 'service');
          return {
            product_id: it.product_id ? parseInt(it.product_id, 10) : null,
            item_type: itemType,
            description: (it.description || '').trim() || (itemType === 'service' ? 'Service Line Item' : 'Order Item'),
            quantity: parseFloat(it.quantity) || 1,
            unit_price: parseFloat(it.unit_price) || 0
          };
        })
      });

      toast.success(t('sales.orders.toasts.createdSuccess'));
      setShowCreateModal(false);
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || t('sales.orders.toasts.createError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmOrder = async (orderId) => {
    try {
      await api.put(`/erp/sales/orders/${orderId}/confirm`);
      toast.success(t('sales.orders.toasts.confirmedSuccess'));
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || t('sales.orders.toasts.confirmError'));
    }
  };

  const handleOpenDeliver = (order) => {
    setDeliverOrder(order);
    const orderItems = order.items || [];
    setDeliveryFormData({
      warehouse_id: warehouses.length > 0 ? String(warehouses[0].id) : '',
      delivery_date: new Date().toISOString().split('T')[0],
      notes: `Delivery for Sales Order #${order.number || order.order_number || order.id}`,
      items: orderItems.map(it => ({
        sales_order_item_id: it.id,
        product_id: it.product_id,
        product_name: it.product_name || it.description || 'Item',
        ordered_qty: Number(it.quantity || 1),
        quantity_delivered: Number(it.quantity || 1)
      }))
    });
    setShowDeliverModal(true);
  };

  const handleDeliverOrderSubmit = async (e) => {
    e.preventDefault();
    if (!deliverOrder) return;
    if (!deliveryFormData.warehouse_id) return toast.error(t('sales.orders.toasts.selectWarehouseFirst'));
    if (deliveryFormData.items.length === 0) return toast.error(t('sales.orders.toasts.noItemsToDeliver'));

    setSubmitting(true);
    try {
      // 1. Create Delivery Note
      const dnRes = await api.post('/sales/deliveries', {
        sales_order_id: deliverOrder.id,
        warehouse_id: deliveryFormData.warehouse_id,
        delivery_date: deliveryFormData.delivery_date,
        notes: deliveryFormData.notes,
        items: deliveryFormData.items.map(it => ({
          sales_order_item_id: it.sales_order_item_id,
          product_id: it.product_id,
          quantity_delivered: parseFloat(it.quantity_delivered) || 0
        }))
      });

      const createdDN = dnRes.data?.data;
      if (createdDN?.id) {
        // 2. Automatically confirm delivery note to execute authoritative Stock OUT
        await api.put(`/sales/deliveries/${createdDN.id}/confirm`);
        toast.success(t('sales.orders.toasts.deliveryCreatedAndConfirmed', { number: createdDN.number || '' }));
      } else {
        toast.success(t('sales.orders.toasts.deliveryCreated'));
      }

      setShowDeliverModal(false);
      setDeliverOrder(null);
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || t('sales.orders.toasts.deliveryFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConvertToInvoice = async (orderId) => {
    try {
      const res = await api.post(`/erp/sales/orders/${orderId}/to-invoice`);
      toast.success(t('sales.orders.toasts.convertedInvoiceSuccess'));
      fetchOrders();
      if (res.data?.data?.id) {
        navigate(`/finance/invoice-preview/${res.data.data.id}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || t('sales.orders.toasts.convertInvoiceFailed'));
    }
  };

  const handleViewOrder = (order) => {
    setSelectedOrder(order);
    setShowViewModal(true);
  };

  const formatStatus = (st) => {
    if (!st) return '—';
    const s = String(st).toLowerCase();
    if (s === 'confirmed') return t('sales.orders.statuses.confirmed');
    if (s === 'delivered') return t('sales.orders.statuses.delivered');
    if (s === 'invoiced') return t('sales.orders.statuses.invoiced');
    if (s === 'draft') return t('sales.orders.statuses.draft');
    if (s === 'cancelled') return t('sales.orders.statuses.cancelled');
    return st.toUpperCase();
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
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <ShoppingBag size={28} style={{ color: '#10b981' }} /> {t('sales.orders.title')}
          </h1>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px', margin: '4px 0 0 0' }}>
            {t('sales.orders.subtitle')}
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
          <Plus size={18} /> {t('sales.orders.createOrder')}
        </button>
      </div>

      {/* Orders Table */}
      <div style={{ backgroundColor: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>{t('sales.orders.loading')}</div>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <ShoppingBag size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{t('sales.orders.noOrdersTitle')}</h3>
            <p style={{ color: '#64748b', margin: '0 0 20px 0', fontSize: '14px' }}>{t('sales.orders.noOrdersDesc')}</p>
            <button
              onClick={handleOpenCreate}
              style={{ padding: '10px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={16} /> {t('sales.orders.createFirstOrder')}
            </button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: isRTL ? 'right' : 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '14px 18px', fontWeight: 800 }}>{t('sales.orders.columns.orderNo')}</th>
                <th style={{ padding: '14px 18px', fontWeight: 800 }}>{t('sales.orders.columns.customer')}</th>
                <th style={{ padding: '14px 18px', fontWeight: 800 }}>{t('sales.orders.columns.date')}</th>
                <th style={{ padding: '14px 18px', fontWeight: 800 }}>{t('sales.orders.columns.totalAmount')}</th>
                <th style={{ padding: '14px 18px', fontWeight: 800 }}>{t('sales.orders.columns.status')}</th>
                <th style={{ padding: '14px 18px', fontWeight: 800, textAlign: 'center' }}>{t('sales.orders.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontWeight: '800', color: '#10b981' }}>
                    <span className="num-en">{order.number || order.order_number || `SO-${order.id}`}</span>
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: '700', color: '#1e293b' }}>
                    {order.customer_name || `Customer #${order.customer_id}`}
                  </td>
                  <td style={{ padding: '14px 18px', color: '#64748b' }}>
                    <span className="num-en">{order.order_date ? new Date(order.order_date).toLocaleDateString('en-GB') : '—'}</span>
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: '800', color: '#0f172a' }}>
                    <span className="num-en">{Number(order.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> {currencyLabel}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '800',
                      backgroundColor: order.status === 'confirmed' ? '#dcfce7' : order.status === 'delivered' ? '#e0e7ff' : order.status === 'invoiced' ? '#f3e8ff' : '#fef3c7',
                      color: order.status === 'confirmed' ? '#166534' : order.status === 'delivered' ? '#3730a3' : order.status === 'invoiced' ? '#7e22ce' : '#92400e'
                    }}>
                      {formatStatus(order.status)}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleViewOrder(order)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px',
                          backgroundColor: '#f1f5f9', color: '#475569', border: 'none',
                          borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer'
                        }}
                      >
                        <Eye size={13} /> {t('sales.orders.actions.view')}
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
                          <CheckCircle2 size={13} /> {t('sales.orders.actions.confirm')}
                        </button>
                      )}

                      {order.status !== 'draft' && (
                        <button
                          onClick={() => handleOpenDeliver(order)}
                          title={t('sales.orders.actions.deliverTitle')}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px',
                            backgroundColor: '#0284c7', color: 'white', border: 'none',
                            borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer'
                          }}
                        >
                          <Truck size={13} /> {t('sales.orders.actions.deliver')}
                        </button>
                      )}

                      {order.status !== 'invoiced' && (
                        <button
                          onClick={() => handleConvertToInvoice(order.id)}
                          title={t('sales.orders.actions.convertTitle')}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px',
                            backgroundColor: '#8b5cf6', color: 'white', border: 'none',
                            borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer'
                          }}
                        >
                          <FileText size={13} /> {t('sales.orders.actions.convertToInvoice')}
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
        <div style={modalStyle} dir={isRTL ? 'rtl' : 'ltr'}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
              <h3 style={{ margin: 0, fontWeight: 800, fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShoppingBag size={20} /> {t('sales.orders.createModal.title')}
              </h3>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateOrderSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Header options */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>{t('sales.orders.createModal.customer')}</label>
                  <CustomerSearchSelect
                    customers={customers}
                    value={formData.customer_id}
                    onChange={(custId) => setFormData({ ...formData, customer_id: custId })}
                    placeholder={t('sales.orders.createModal.selectCustomer', 'اختر العميل (بحث بالاسم، رقم الموبايل أو الفئة)...')}
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>{t('sales.orders.createModal.deal')}</label>
                  <select
                    value={formData.deal_id}
                    onChange={(e) => setFormData({ ...formData, deal_id: e.target.value })}
                    style={{ ...inputStyle, background: formData.deal_id ? '#eff6ff' : '#f8fafc', borderColor: formData.deal_id ? '#3b82f6' : '#e2e8f0' }}
                  >
                    <option value="">{t('sales.orders.createModal.independentOrder')}</option>
                    {deals
                      .filter(d => !formData.customer_id || String(d.client_id) === String(formData.customer_id))
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title} ({parseFloat(d.value || 0).toLocaleString()} {currencyLabel})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>{t('sales.orders.createModal.quotation')}</label>
                  <select
                    value={formData.quotation_id}
                    onChange={(e) => handleQuotationSelect(e.target.value)}
                    style={{ ...inputStyle, background: formData.quotation_id ? '#ecfdf5' : '#f8fafc', borderColor: formData.quotation_id ? '#10b981' : '#e2e8f0' }}
                  >
                    <option value="">{t('sales.orders.createModal.customOrder')}</option>
                    {quotations.map((q) => (
                      <option key={q.id} value={q.id}>
                        QT-{q.id} — {q.client_name || 'Client'} ({parseFloat(q.total_amount || 0).toLocaleString()} {currencyLabel})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>{t('sales.orders.createModal.orderDate')}</label>
                  <input
                    type="date"
                    value={formData.order_date}
                    onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                    style={inputStyle}
                    className="num-en"
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>{t('sales.orders.createModal.expectedDelivery')}</label>
                  <input
                    type="date"
                    value={formData.expected_delivery}
                    onChange={(e) => setFormData({ ...formData, expected_delivery: e.target.value })}
                    style={inputStyle}
                    className="num-en"
                  />
                </div>
              </div>

              {/* Line items section */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ ...labelStyle, fontSize: '13px', fontWeight: 800, margin: 0 }}>{t('sales.orders.createModal.lineItemsTitle')}</label>
                  <button
                    type="button"
                    onClick={addItemRow}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', borderRadius: '8px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    <Plus size={14} /> {t('sales.orders.createModal.addLineItem')}
                  </button>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: isRTL ? 'right' : 'left' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '10px 12px', fontWeight: 700 }}>{t('sales.orders.createModal.productService')}</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700 }}>{t('sales.orders.createModal.description')}</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, width: '90px' }}>{t('sales.orders.createModal.qty')}</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, width: '120px' }}>{t('sales.orders.createModal.unitPrice')}</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, width: '110px' }}>{t('sales.orders.createModal.subtotal')}</th>
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
                              <option value="">{t('sales.orders.createModal.customItem')}</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name} ({p.sku || 'Item'})</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="text"
                              placeholder={t('sales.orders.createModal.descriptionPlaceholder')}
                              value={item.description}
                              onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                              style={{ ...inputStyle, padding: '6px 10px', fontSize: '12px' }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="number"
                              min="1"
                              className="num-en"
                              value={item.quantity}
                              onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                              style={{ ...inputStyle, padding: '6px 10px', fontSize: '12px' }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="number"
                              step="0.01"
                              className="num-en"
                              value={item.unit_price}
                              onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)}
                              style={{ ...inputStyle, padding: '6px 10px', fontSize: '12px' }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: 800, color: '#10b981' }}>
                            <span className="num-en">{(parseFloat(item.subtotal) || 0).toLocaleString()}</span> {currencyLabel}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => removeItemRow(idx)}
                              style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                              title={t('common.delete')}
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
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748b' }}>{t('sales.orders.createModal.grandTotal')}</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: '#10b981' }}>
                    <span className="num-en">{calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> {currencyLabel}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label style={labelStyle}>{t('sales.orders.createModal.notes')}</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder={t('sales.orders.createModal.notesPlaceholder')}
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
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer' }}
                >
                  {submitting ? t('sales.orders.createModal.creating') : t('sales.orders.createModal.createBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Order Details Modal */}
      {showViewModal && selectedOrder && (
        <div style={modalStyle} dir={isRTL ? 'rtl' : 'ltr'}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '640px', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '18px 24px', background: '#1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
              <div>
                <h3 style={{ margin: 0, fontWeight: 800, fontSize: '16px' }}>
                  {t('sales.orders.viewModal.title', { number: selectedOrder.number || selectedOrder.order_number || selectedOrder.id })}
                </h3>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  {t('sales.orders.viewModal.customer', { name: selectedOrder.customer_name })}
                </span>
              </div>
              <button onClick={() => setShowViewModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', background: '#f8fafc', padding: '14px', borderRadius: '12px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>{t('sales.orders.viewModal.status')}</span>
                  <div style={{ fontWeight: 800, color: '#10b981', marginTop: '2px' }}>{formatStatus(selectedOrder.status)}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>{t('sales.orders.viewModal.orderDate')}</span>
                  <div style={{ fontWeight: 800, color: '#1e293b', marginTop: '2px' }}>
                    <span className="num-en">{new Date(selectedOrder.order_date).toLocaleDateString('en-GB')}</span>
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>{t('sales.orders.viewModal.totalValue')}</span>
                  <div style={{ fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
                    <span className="num-en">{parseFloat(selectedOrder.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> {currencyLabel}
                  </div>
                </div>
              </div>

              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 800, color: '#475569' }}>{t('sales.orders.viewModal.lineItems')}</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', textAlign: isRTL ? 'right' : 'left' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '8px 12px' }}>{t('sales.orders.viewModal.product')}</th>
                        <th style={{ padding: '8px 12px' }}>{t('sales.orders.viewModal.qty')}</th>
                        <th style={{ padding: '8px 12px' }}>{t('sales.orders.viewModal.unitPrice')}</th>
                        <th style={{ padding: '8px 12px' }}>{t('sales.orders.viewModal.subtotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items.map((it, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{it.product_name || it.description || 'Item'}</td>
                          <td style={{ padding: '8px 12px' }}><span className="num-en">{it.quantity}</span></td>
                          <td style={{ padding: '8px 12px' }}><span className="num-en">{parseFloat(it.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> {currencyLabel}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 800, color: '#10b981' }}><span className="num-en">{parseFloat(it.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> {currencyLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedOrder.notes && (
                <div style={{ fontSize: '13px', color: '#64748b' }}>
                  <strong>{t('sales.orders.viewModal.notes')}</strong> {selectedOrder.notes}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                {selectedOrder.status !== 'draft' && (
                  <button
                    onClick={() => {
                      setShowViewModal(false);
                      handleOpenDeliver(selectedOrder);
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                  >
                    <Truck size={14} /> {t('sales.orders.viewModal.deliver')}
                  </button>
                )}
                {selectedOrder.status !== 'invoiced' && (
                  <button
                    onClick={() => {
                      setShowViewModal(false);
                      handleConvertToInvoice(selectedOrder.id);
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                  >
                    <FileText size={14} /> {t('sales.orders.viewModal.convertToInvoice')}
                  </button>
                )}
                <button
                  onClick={() => setShowViewModal(false)}
                  style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', color: '#475569' }}
                >
                  {t('sales.orders.viewModal.close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deliver / Dispatch Modal (Phase G-6 Delivery Note Creation) */}
      {showDeliverModal && deliverOrder && (
        <div style={modalStyle} dir={isRTL ? 'rtl' : 'ltr'}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg, #0284c7, #0369a1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
              <div>
                <h3 style={{ margin: 0, fontWeight: 800, fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Truck size={20} /> {t('sales.orders.deliverModal.title', { number: deliverOrder.number || deliverOrder.order_number || deliverOrder.id })}
                </h3>
                <span style={{ fontSize: '12px', color: '#e0f2fe' }}>
                  {t('sales.orders.deliverModal.customer', { name: deliverOrder.customer_name })}
                </span>
              </div>
              <button onClick={() => setShowDeliverModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleDeliverOrderSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>{t('sales.orders.deliverModal.sourceWarehouse')}</label>
                  <select
                    value={deliveryFormData.warehouse_id}
                    onChange={(e) => setDeliveryFormData({ ...deliveryFormData, warehouse_id: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="" disabled>{t('sales.orders.deliverModal.selectSourceWarehouse')}</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code || 'WH'})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>{t('sales.orders.deliverModal.deliveryDate')}</label>
                  <input
                    type="date"
                    value={deliveryFormData.delivery_date}
                    onChange={(e) => setDeliveryFormData({ ...deliveryFormData, delivery_date: e.target.value })}
                    style={inputStyle}
                    className="num-en"
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ ...labelStyle, fontSize: '13px', fontWeight: 800 }}>{t('sales.orders.deliverModal.itemsToDispatch')}</label>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: isRTL ? 'right' : 'left' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '10px 12px', fontWeight: 700 }}>{t('sales.orders.deliverModal.product')}</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, width: '100px' }}>{t('sales.orders.deliverModal.ordered')}</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, width: '130px' }}>{t('sales.orders.deliverModal.dispatchQty')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveryFormData.items.map((it, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>{it.product_name}</td>
                          <td style={{ padding: '10px 12px', color: '#64748b' }}>
                            <span className="num-en">{it.ordered_qty}</span>
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="number"
                              min="0.001"
                              step="any"
                              className="num-en"
                              value={it.quantity_delivered}
                              onChange={(e) => {
                                const newItems = [...deliveryFormData.items];
                                newItems[idx].quantity_delivered = e.target.value;
                                setDeliveryFormData({ ...deliveryFormData, items: newItems });
                              }}
                              style={{ ...inputStyle, padding: '6px 10px', fontSize: '12px' }}
                              required
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <label style={labelStyle}>{t('sales.orders.deliverModal.deliveryNotes')}</label>
                <textarea
                  rows="2"
                  value={deliveryFormData.notes}
                  onChange={(e) => setDeliveryFormData({ ...deliveryFormData, notes: e.target.value })}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  placeholder={t('sales.orders.deliverModal.deliveryNotesPlaceholder')}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowDeliverModal(false)}
                  style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '10px 22px',
                    background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 800,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
                  }}
                >
                  {submitting ? t('sales.orders.deliverModal.confirmingDispatch') : t('sales.orders.deliverModal.confirmDispatchBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesCycle;
