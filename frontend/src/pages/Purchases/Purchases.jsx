import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { ShoppingCart, Plus, Search, Trash2, Calendar, Building, Truck, X, FileText } from 'lucide-react';
import WarehouseSubNav from '../../components/Warehouse/WarehouseSubNav';

const Purchases = () => {
  const [purchases, setPurchases] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New Purchase Form State
  const emptyForm = {
    vendor_id: '',
    warehouse_id: '',
    invoice_date: new Date().toISOString().split('T')[0],
    notes: '',
    items: [
      { product_id: '', quantity: 1, unit_price: 0, unit: 'piece', subtotal: 0 }
    ]
  };
  const [form, setForm] = useState(emptyForm);

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const res = await api.get('/purchases');
      setPurchases(res.data?.data || []);
    } catch (err) {
      toast.error('Failed to load purchases');
    } finally {
      setLoading(false);
    }
  };

  const fetchDependencies = async () => {
    try {
      const [vRes, wRes, pRes] = await Promise.all([
        api.get('/vendors'),
        api.get('/inventory/warehouses'),
        api.get('/products')
      ]);
      setVendors(vRes.data?.data || []);
      setWarehouses(wRes.data?.data || []);
      setProducts(pRes.data?.data || []);
    } catch (err) {
      console.warn('Failed to load auxiliary data');
    }
  };

  useEffect(() => {
    fetchPurchases();
    fetchDependencies();
  }, []);

  const handleOpenModal = () => {
    setForm({
      vendor_id: vendors[0]?.id ? String(vendors[0].id) : '',
      warehouse_id: warehouses[0]?.id ? String(warehouses[0].id) : '',
      invoice_date: new Date().toISOString().split('T')[0],
      notes: '',
      items: [
        {
          product_id: products[0]?.id ? String(products[0].id) : '',
          quantity: 1,
          unit_price: products[0]?.cost_price || 0,
          unit: products[0]?.unit || 'piece',
          subtotal: (products[0]?.cost_price || 0) * 1
        }
      ]
    });
    setShowModal(true);
  };

  const handleProductChange = (index, productId) => {
    const p = products.find(prod => String(prod.id) === String(productId));
    setForm(prev => {
      const newItems = [...prev.items];
      const cost = p ? parseFloat(p.cost_price || 0) : 0;
      const unit = p ? (p.unit || 'piece') : 'piece';
      const qty = parseFloat(newItems[index].quantity || 1);
      newItems[index] = {
        ...newItems[index],
        product_id: productId,
        unit_price: cost,
        unit,
        subtotal: qty * cost
      };
      return { ...prev, items: newItems };
    });
  };

  const handleItemChange = (index, field, value) => {
    setForm(prev => {
      const newItems = [...prev.items];
      const item = { ...newItems[index], [field]: value };
      const qty = parseFloat(field === 'quantity' ? value : item.quantity) || 0;
      const price = parseFloat(field === 'unit_price' ? value : item.unit_price) || 0;
      item.subtotal = qty * price;
      newItems[index] = item;
      return { ...prev, items: newItems };
    });
  };

  const addItemRow = () => {
    const firstProd = products[0];
    setForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product_id: firstProd ? String(firstProd.id) : '',
          quantity: 1,
          unit_price: firstProd ? parseFloat(firstProd.cost_price || 0) : 0,
          unit: firstProd ? (firstProd.unit || 'piece') : 'piece',
          subtotal: firstProd ? parseFloat(firstProd.cost_price || 0) : 0
        }
      ]
    }));
  };

  const removeItemRow = (index) => {
    if (form.items.length <= 1) return toast.error('Purchase must have at least one product');
    setForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const totalPurchaseAmount = form.items.reduce((acc, it) => acc + (parseFloat(it.subtotal) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.vendor_id) return toast.error('Please select a supplier');
    if (!form.warehouse_id) return toast.error('Please select a warehouse');
    if (form.items.length === 0) return toast.error('Please add at least one product');

    setSubmitting(true);
    try {
      await api.post('/purchases', {
        ...form,
        vendor_id: parseInt(form.vendor_id),
        warehouse_id: parseInt(form.warehouse_id),
        items: form.items.map(it => ({
          product_id: parseInt(it.product_id),
          quantity: parseFloat(it.quantity),
          unit_price: parseFloat(it.unit_price)
        }))
      });
      toast.success('Purchase Invoice created & stock received!');
      setShowModal(false);
      fetchPurchases();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save purchase');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = purchases.filter(p =>
    (p.invoice_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.vendor_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.warehouse_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const modalStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '16px'
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px',
    fontSize: '14px', fontWeight: 600, outline: 'none', background: '#f8fafc', boxSizing: 'border-box'
  };

  return (
    <div>
      <WarehouseSubNav />
      <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShoppingCart size={24} style={{ color: '#0ea5e9' }} /> Purchase Invoices
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              Record purchases from suppliers, automatically update warehouse stock, and track payable debt
            </p>
          </div>

          <button
            onClick={handleOpenModal}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: 'white',
              border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(14,165,233,0.25)'
            }}
          >
            <Plus size={18} /> New Purchase Invoice
          </button>
        </div>

        {/* Search */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '14px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Search size={18} style={{ color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search by invoice number, supplier or warehouse..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '14px', fontWeight: 600, color: '#1e293b' }}
          />
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading purchases...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
              <ShoppingCart size={44} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <p style={{ fontWeight: 700, margin: 0 }}>No purchase invoices recorded yet</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Invoice #</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Date</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Supplier / Vendor</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Warehouse</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Total Amount</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Paid</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Balance</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontWeight: 800, color: '#0ea5e9' }}>
                      {p.invoice_number}
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: '13px', color: '#64748b' }}>
                      {p.invoice_date ? new Date(p.invoice_date).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: '#1e293b' }}>
                      {p.vendor_name}
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: '13px', color: '#475569' }}>
                      🏢 {p.warehouse_name}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 800, color: '#1e293b' }}>
                      {parseFloat(p.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: '#10b981' }}>
                      {parseFloat(p.paid_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 800, color: parseFloat(p.balance) > 0 ? '#ef4444' : '#10b981' }}>
                      {parseFloat(p.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                        background: p.status === 'paid' ? '#dcfce7' : p.status === 'partial' ? '#fef3c7' : '#fee2e2',
                        color: p.status === 'paid' ? '#15803d' : p.status === 'partial' ? '#b45309' : '#b91c1c',
                        textTransform: 'uppercase'
                      }}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal: New Purchase Invoice */}
        {showModal && (
          <div style={modalStyle}>
            <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '780px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
                <h3 style={{ margin: 0, color: 'white', fontWeight: 800, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShoppingCart size={20} /> Create Purchase Invoice
                </h3>
                <button onClick={() => setShowModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>Supplier / Vendor *</label>
                    <select
                      value={form.vendor_id}
                      onChange={e => setForm({ ...form, vendor_id: e.target.value })}
                      style={inputStyle}
                      required
                    >
                      <option value="">Select Vendor...</option>
                      {vendors.map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>Receiving Warehouse *</label>
                    <select
                      value={form.warehouse_id}
                      onChange={e => setForm({ ...form, warehouse_id: e.target.value })}
                      style={inputStyle}
                      required
                    >
                      <option value="">Select Warehouse...</option>
                      {warehouses.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>Invoice Date *</label>
                    <input
                      type="date"
                      value={form.invoice_date}
                      onChange={e => setForm({ ...form, invoice_date: e.target.value })}
                      style={inputStyle}
                      required
                    />
                  </div>
                </div>

                {/* Products Table */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontWeight: 800, fontSize: '14px', color: '#1e293b' }}>Purchased Products</label>
                    <button
                      type="button"
                      onClick={addItemRow}
                      style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Plus size={14} /> Add Product Line
                    </button>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', textAlign: 'left' }}>
                        <th style={{ padding: '8px', width: '35%' }}>Product</th>
                        <th style={{ padding: '8px', width: '15%' }}>Unit</th>
                        <th style={{ padding: '8px', width: '15%' }}>Quantity</th>
                        <th style={{ padding: '8px', width: '15%' }}>Unit Cost</th>
                        <th style={{ padding: '8px', width: '15%' }}>Subtotal</th>
                        <th style={{ padding: '8px', width: '5%' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px' }}>
                            <select
                              value={item.product_id}
                              onChange={e => handleProductChange(idx, e.target.value)}
                              style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600 }}
                              required
                            >
                              <option value="">Select...</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: '8px' }}>
                            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{item.unit || 'piece'}</span>
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input
                              type="number"
                              step="any"
                              min="0.001"
                              value={item.quantity}
                              onChange={e => handleItemChange(idx, 'quantity', e.target.value)}
                              style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 700 }}
                              required
                            />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={item.unit_price}
                              onChange={e => handleItemChange(idx, 'unit_price', e.target.value)}
                              style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 700 }}
                              required
                            />
                          </td>
                          <td style={{ padding: '8px', fontWeight: 800, color: '#0ea5e9' }}>
                            {item.subtotal.toFixed(2)} EGP
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => removeItemRow(idx)}
                              style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Total Summary */}
                <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#475569' }}>Total Purchase Invoice:</span>
                  <span style={{ fontSize: '22px', fontWeight: 900, color: '#0ea5e9' }}>
                    {totalPurchaseAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>Notes (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Supplier Invoice reference or terms"
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                  <button type="button" onClick={() => setShowModal(false)} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting} style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
                    {submitting ? 'Recording...' : 'Save & Receive Stock'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Purchases;
