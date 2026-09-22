import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Scale, Search, ArrowRightLeft, ClipboardCheck, Building, RefreshCw, X, AlertCircle } from 'lucide-react';
import WarehouseSubNav from '../../components/Warehouse/WarehouseSubNav';

const StockBalances = () => {
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Transfer Modal State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferForm, setTransferForm] = useState({
    from_warehouse_id: '',
    to_warehouse_id: '',
    product_id: '',
    quantity: '',
    notes: '',
  });

  // Stock Take Modal State
  const [showStockTakeModal, setShowStockTakeModal] = useState(false);
  const [stockTakeSubmitting, setStockTakeSubmitting] = useState(false);
  const [stockTakeCounts, setStockTakeCounts] = useState({}); // { [productId]: actualQty }

  // 1. Fetch Warehouses
  const fetchWarehouses = async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/warehouses');
      const whs = res.data?.data || [];
      setWarehouses(whs);
      if (whs.length > 0) {
        const initialId = selectedWarehouseId && whs.some(w => String(w.id) === String(selectedWarehouseId))
          ? selectedWarehouseId
          : String(whs[0].id);
        setSelectedWarehouseId(initialId);
        fetchStock(initialId);
      } else {
        setStockItems([]);
        setLoading(false);
      }
    } catch (err) {
      toast.error('Failed to load warehouses');
      setLoading(false);
    }
  };

  // 2. Fetch Stock for Selected Warehouse
  const fetchStock = async (whId) => {
    const id = whId || selectedWarehouseId;
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get(`/inventory/warehouses/${id}/stock`);
      setStockItems(res.data?.data || []);
    } catch (err) {
      toast.error('Failed to load warehouse stock');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarehouses();
  }, []);

  // Open Transfer Modal
  const handleOpenTransfer = (preselectedProduct = null) => {
    const otherWh = warehouses.find(w => String(w.id) !== String(selectedWarehouseId));
    setTransferForm({
      from_warehouse_id: selectedWarehouseId,
      to_warehouse_id: otherWh ? String(otherWh.id) : '',
      product_id: preselectedProduct ? String(preselectedProduct.product_id) : (stockItems[0]?.product_id ? String(stockItems[0].product_id) : ''),
      quantity: '',
      notes: '',
    });
    setShowTransferModal(true);
  };

  // Submit Transfer
  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    if (!transferForm.from_warehouse_id || !transferForm.to_warehouse_id) {
      return toast.error('Source and destination warehouses are required');
    }
    if (transferForm.from_warehouse_id === transferForm.to_warehouse_id) {
      return toast.error('Destination must be different from source warehouse');
    }
    const qty = parseFloat(transferForm.quantity);
    if (!qty || qty <= 0) {
      return toast.error('Please enter a valid quantity greater than 0');
    }

    setTransferSubmitting(true);
    try {
      await api.post('/inventory/transfers', transferForm);
      toast.success('Stock transferred successfully!');
      setShowTransferModal(false);
      fetchStock(selectedWarehouseId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transfer failed');
    } finally {
      setTransferSubmitting(false);
    }
  };

  // Open Stock Take Modal
  const handleOpenStockTake = () => {
    const initialCounts = {};
    stockItems.forEach(item => {
      initialCounts[item.product_id] = item.quantity;
    });
    setStockTakeCounts(initialCounts);
    setShowStockTakeModal(true);
  };

  // Submit Stock Take
  const handleStockTakeSubmit = async (e) => {
    e.preventDefault();
    const itemsPayload = Object.keys(stockTakeCounts).map(prodId => ({
      product_id: parseInt(prodId),
      actual_quantity: parseFloat(stockTakeCounts[prodId] || 0)
    }));

    setStockTakeSubmitting(true);
    try {
      const res = await api.post('/inventory/stock-take', {
        warehouse_id: parseInt(selectedWarehouseId),
        items: itemsPayload,
        notes: `Physical Stock Count on ${new Date().toLocaleDateString()}`
      });
      toast.success(res.data?.message || 'Stock adjustments applied!');
      setShowStockTakeModal(false);
      fetchStock(selectedWarehouseId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Stock count adjustment failed');
    } finally {
      setStockTakeSubmitting(false);
    }
  };

  const filtered = stockItems.filter(item => 
    (item.product_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.sku || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalValuation = filtered.reduce((acc, item) => acc + (item.total_value || 0), 0);
  const totalQuantity = filtered.reduce((acc, item) => acc + (item.quantity || 0), 0);

  const selectedWhObj = warehouses.find(w => String(w.id) === String(selectedWarehouseId));

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
              <Scale size={24} style={{ color: '#0ea5e9' }} /> Warehouse Stock Balances
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              Live inventory levels, valuation, direct transfers, and physical stock taking
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={() => handleOpenTransfer()}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px',
                background: '#f0fdf4', color: '#16a34a', border: '1.5px solid #bbf7d0',
                borderRadius: '10px', fontWeight: 800, cursor: 'pointer'
              }}
            >
              <ArrowRightLeft size={16} /> Direct Transfer
            </button>

            <button
              onClick={handleOpenStockTake}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px',
                background: '#f5f3ff', color: '#7c3aed', border: '1.5px solid #ddd6fe',
                borderRadius: '10px', fontWeight: 800, cursor: 'pointer'
              }}
            >
              <ClipboardCheck size={16} /> Stock Taking
            </button>

            <button
              onClick={() => fetchStock(selectedWarehouseId)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
                background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1',
                borderRadius: '10px', fontWeight: 800, cursor: 'pointer'
              }}
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {warehouses.length === 0 && !loading ? (
          <div style={{
            background: 'white',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            padding: '60px 24px',
            textAlign: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
            maxWidth: '560px',
            margin: '40px auto'
          }}>
            <div style={{ width: '64px', height: '64px', background: '#f0f9ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#0ea5e9' }}>
              <Building size={32} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
              No Warehouses Found
            </h3>
            <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 24px', lineHeight: 1.5 }}>
              Please create at least one warehouse first to manage inventory levels, stock transfers, and physical stock counts.
            </p>
            <a
              href="/inventory/warehouses"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                color: 'white',
                borderRadius: '10px',
                fontWeight: 800,
                textDecoration: 'none',
                fontSize: '14px',
                boxShadow: '0 4px 12px rgba(14, 165, 233, 0.3)'
              }}
            >
              <Building size={16} /> Go to Warehouses
            </a>
          </div>
        ) : (
          <>
            {/* Warehouse Selector & Search Bar */}
            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '280px' }}>
                <Building size={20} style={{ color: '#0ea5e9' }} />
                <label style={{ fontSize: '13px', fontWeight: 800, color: '#334155' }}>Warehouse:</label>
                <select
                  value={selectedWarehouseId}
                  onChange={e => {
                    const newId = e.target.value;
                    setSelectedWarehouseId(newId);
                    fetchStock(newId);
                  }}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #0ea5e9', fontWeight: 700, outline: 'none', background: '#f0f9ff', color: '#0369a1', fontSize: '14px' }}
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name} {w.code ? `(${w.code})` : ''}</option>
                  ))}
                </select>
              </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
            <Search size={18} style={{ color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search product name or SKU..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ border: 'none', outline: 'none', width: '100%', fontSize: '14px', fontWeight: 600, color: '#1e293b' }}
            />
          </div>
        </div>

        {/* KPI Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>Active Warehouse</span>
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b' }}>{selectedWhObj?.name || 'Loading...'}</span>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>{selectedWhObj?.location || 'General'}</span>
          </div>

          <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>Total Units in Stock</span>
            <span style={{ fontSize: '24px', fontWeight: 800, color: '#10b981' }}>{totalQuantity.toLocaleString()} Units</span>
          </div>

          <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>Total Stock Valuation (Cost)</span>
            <span style={{ fontSize: '24px', fontWeight: 800, color: '#0ea5e9' }}>{totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP</span>
          </div>
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading stock balances...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
              <Scale size={44} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <p style={{ fontWeight: 700, margin: 0 }}>No products found in this warehouse</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Product Name</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>SKU</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Unit</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Quantity on Hand</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Unit Cost</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Total Value</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.product_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 18px', fontWeight: 800, color: '#1e293b' }}>
                      {item.product_name}
                    </td>
                    <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontSize: '13px', color: '#64748b' }}>
                      {item.sku || '—'}
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: '13px', color: '#475569' }}>
                      <span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>
                        {item.unit || 'piece'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 900, fontSize: '15px', color: item.quantity > 0 ? '#10b981' : '#ef4444' }}>
                      {item.quantity.toLocaleString()}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: '#475569' }}>
                      {item.cost_price.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0ea5e9' }}>
                      {item.total_value.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleOpenTransfer(item)}
                        style={{ padding: '6px 12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                      >
                        Transfer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </>
        )}

        {/* ── TRANSFER MODAL ── */}
        {showTransferModal && (
          <div style={modalStyle}>
            <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '500px', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                <h3 style={{ margin: 0, color: 'white', fontWeight: 800, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ArrowRightLeft size={20} /> Direct Warehouse Transfer
                </h3>
                <button onClick={() => setShowTransferModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleTransferSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>Source Warehouse (From) *</label>
                  <select
                    value={transferForm.from_warehouse_id}
                    onChange={e => setTransferForm({ ...transferForm, from_warehouse_id: e.target.value })}
                    style={inputStyle}
                    required
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>Destination Warehouse (To) *</label>
                  <select
                    value={transferForm.to_warehouse_id}
                    onChange={e => setTransferForm({ ...transferForm, to_warehouse_id: e.target.value })}
                    style={inputStyle}
                    required
                  >
                    <option value="">Select Destination...</option>
                    {warehouses
                      .filter(w => String(w.id) !== String(transferForm.from_warehouse_id))
                      .map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>Product to Move *</label>
                  <select
                    value={transferForm.product_id}
                    onChange={e => setTransferForm({ ...transferForm, product_id: e.target.value })}
                    style={inputStyle}
                    required
                  >
                    <option value="">Select Product...</option>
                    {stockItems.map(p => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.product_name} (Available: {p.quantity} {p.unit})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>Quantity to Transfer *</label>
                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    placeholder="Enter quantity..."
                    value={transferForm.quantity}
                    onChange={e => setTransferForm({ ...transferForm, quantity: e.target.value })}
                    style={inputStyle}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>Notes / Reason (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Branch replenishment"
                    value={transferForm.notes}
                    onChange={e => setTransferForm({ ...transferForm, notes: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                  <button type="button" onClick={() => setShowTransferModal(false)} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={transferSubmitting} style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: transferSubmitting ? 'not-allowed' : 'pointer', opacity: transferSubmitting ? 0.7 : 1 }}>
                    {transferSubmitting ? 'Transferring...' : 'Confirm Transfer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── STOCK TAKING / ADJUSTMENT MODAL ── */}
        {showStockTakeModal && (
          <div style={modalStyle}>
            <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '750px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>
                <div>
                  <h3 style={{ margin: 0, color: 'white', fontWeight: 800, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ClipboardCheck size={20} /> Stock Taking & Physical Count
                  </h3>
                  <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.8)', fontSize: '12px' }}>
                    Warehouse: <strong>{selectedWhObj?.name}</strong>. Enter actual counted quantities to auto-apply adjustments.
                  </p>
                </div>
                <button onClick={() => setShowStockTakeModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleStockTakeSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '10px' }}>Product</th>
                      <th style={{ padding: '10px' }}>System Qty</th>
                      <th style={{ padding: '10px' }}>Actual Counted Qty</th>
                      <th style={{ padding: '10px' }}>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockItems.map(item => {
                      const actual = parseFloat(stockTakeCounts[item.product_id] ?? item.quantity);
                      const diff = actual - item.quantity;
                      return (
                        <tr key={item.product_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px', fontWeight: 700 }}>
                            {item.product_name}
                            <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8' }}>{item.sku || 'No SKU'}</span>
                          </td>
                          <td style={{ padding: '10px', fontWeight: 700, color: '#64748b' }}>
                            {item.quantity} {item.unit}
                          </td>
                          <td style={{ padding: '10px', width: '150px' }}>
                            <input
                              type="number"
                              step="any"
                              value={stockTakeCounts[item.product_id] ?? item.quantity}
                              onChange={e => {
                                const val = e.target.value;
                                setStockTakeCounts(prev => ({ ...prev, [item.product_id]: val }));
                              }}
                              style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontWeight: 800, fontSize: '14px', outline: 'none' }}
                            />
                          </td>
                          <td style={{ padding: '10px', fontWeight: 800, color: diff > 0 ? '#10b981' : diff < 0 ? '#ef4444' : '#94a3b8' }}>
                            {diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '0'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                  <button type="button" onClick={() => setShowStockTakeModal(false)} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={stockTakeSubmitting} style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: stockTakeSubmitting ? 'not-allowed' : 'pointer', opacity: stockTakeSubmitting ? 0.7 : 1 }}>
                    {stockTakeSubmitting ? 'Applying Adjustments...' : 'Apply Stock Adjustments'}
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

export default StockBalances;
