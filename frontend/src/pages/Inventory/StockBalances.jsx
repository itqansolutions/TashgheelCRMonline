import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Scale, Search, ArrowRightLeft, ClipboardCheck, Building, RefreshCw, X, AlertCircle } from 'lucide-react';
import WarehouseSubNav from '../../components/Warehouse/WarehouseSubNav';
import { useLanguage } from '../../context/LanguageContext';

const StockBalances = () => {
  const { t, isRTL } = useLanguage();
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
      toast.error(t('inventory.warehouses.loadError'));
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
      toast.error(t('inventory.balances.loading'));
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
      return toast.error(t('inventory.balances.transferModal.reqSourceDest'));
    }
    if (transferForm.from_warehouse_id === transferForm.to_warehouse_id) {
      return toast.error(t('inventory.balances.transferModal.destMustDiffer'));
    }
    const qty = parseFloat(transferForm.quantity);
    if (!qty || qty <= 0) {
      return toast.error(t('inventory.balances.transferModal.validQty'));
    }

    setTransferSubmitting(true);
    try {
      await api.post('/inventory/transfers', transferForm);
      toast.success(t('inventory.balances.transferModal.success'));
      setShowTransferModal(false);
      fetchStock(selectedWarehouseId);
    } catch (err) {
      toast.error(err.response?.data?.message || t('inventory.balances.transferModal.failed'));
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
      const formattedDate = new Date().toLocaleDateString('en-GB');
      const res = await api.post('/inventory/stock-take', {
        warehouse_id: parseInt(selectedWarehouseId),
        items: itemsPayload,
        notes: t('inventory.balances.stockTakeModal.defaultNotes', { date: formattedDate })
      });
      toast.success(res.data?.message || t('inventory.balances.stockTakeModal.success'));
      setShowStockTakeModal(false);
      fetchStock(selectedWarehouseId);
    } catch (err) {
      toast.error(err.response?.data?.message || t('inventory.balances.stockTakeModal.failed'));
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
  const currencyLabel = t('common.currency', 'EGP');

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
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <WarehouseSubNav />
      <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Scale size={24} style={{ color: '#0ea5e9' }} /> {t('inventory.balances.title')}
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              {t('inventory.balances.subtitle')}
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
              <ArrowRightLeft size={16} /> {t('inventory.balances.directTransfer')}
            </button>

            <button
              onClick={handleOpenStockTake}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px',
                background: '#f5f3ff', color: '#7c3aed', border: '1.5px solid #ddd6fe',
                borderRadius: '10px', fontWeight: 800, cursor: 'pointer'
              }}
            >
              <ClipboardCheck size={16} /> {t('inventory.balances.stockTaking')}
            </button>

            <button
              onClick={() => fetchStock(selectedWarehouseId)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
                background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1',
                borderRadius: '10px', fontWeight: 800, cursor: 'pointer'
              }}
              title={t('inventory.balances.refresh')}
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
              {t('inventory.balances.noWarehousesTitle')}
            </h3>
            <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 24px', lineHeight: 1.5 }}>
              {t('inventory.balances.noWarehousesDesc')}
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
              <Building size={16} /> {t('inventory.balances.goToWarehouses')}
            </a>
          </div>
        ) : (
          <>
            {/* Warehouse Selector & Search Bar */}
            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '280px' }}>
                <Building size={20} style={{ color: '#0ea5e9' }} />
                <label style={{ fontSize: '13px', fontWeight: 800, color: '#334155' }}>{t('inventory.balances.warehouse')}</label>
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
                  placeholder={t('inventory.balances.searchPlaceholder')}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ border: 'none', outline: 'none', width: '100%', fontSize: '14px', fontWeight: 600, color: '#1e293b' }}
                />
              </div>
            </div>

            {/* KPI Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>{t('inventory.balances.activeWarehouse')}</span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b' }}>{selectedWhObj?.name || '…'}</span>
                <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block' }}>{selectedWhObj?.location || t('inventory.balances.general')}</span>
              </div>

              <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>{t('inventory.balances.totalUnitsInStock')}</span>
                <span style={{ fontSize: '24px', fontWeight: 800, color: '#10b981' }}>
                  <span className="num-en">{totalQuantity.toLocaleString()}</span> {t('inventory.balances.units')}
                </span>
              </div>

              <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>{t('inventory.balances.totalValuation')}</span>
                <span style={{ fontSize: '24px', fontWeight: 800, color: '#0ea5e9' }}>
                  <span className="num-en">{totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> {currencyLabel}
                </span>
              </div>
            </div>

            {/* Table */}
            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
              {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>{t('inventory.balances.loading')}</div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                  <Scale size={44} style={{ opacity: 0.3, marginBottom: '12px' }} />
                  <p style={{ fontWeight: 700, margin: 0 }}>{t('inventory.balances.noProducts')}</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: isRTL ? 'right' : 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.balances.columns.productName')}</th>
                      <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.balances.columns.sku')}</th>
                      <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.balances.columns.unit')}</th>
                      <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.balances.columns.quantityOnHand')}</th>
                      <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.balances.columns.unitCost')}</th>
                      <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.balances.columns.totalValue')}</th>
                      <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>{t('inventory.balances.columns.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(item => (
                      <tr key={item.product_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '14px 18px', fontWeight: 800, color: '#1e293b' }}>
                          {item.product_name}
                        </td>
                        <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontSize: '13px', color: '#64748b' }}>
                          <span className="num-en">{item.sku || '—'}</span>
                        </td>
                        <td style={{ padding: '14px 18px', fontSize: '13px', color: '#475569' }}>
                          <span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>
                            {item.unit || t('inventory.products.piece')}
                          </span>
                        </td>
                        <td style={{ padding: '14px 18px', fontWeight: 900, fontSize: '15px', color: item.quantity > 0 ? '#10b981' : '#ef4444' }}>
                          <span className="num-en">{item.quantity.toLocaleString()}</span>
                        </td>
                        <td style={{ padding: '14px 18px', fontWeight: 700, color: '#475569' }}>
                          <span className="num-en">{item.cost_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> {currencyLabel}
                        </td>
                        <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0ea5e9' }}>
                          <span className="num-en">{item.total_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> {currencyLabel}
                        </td>
                        <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleOpenTransfer(item)}
                            style={{ padding: '6px 12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                          >
                            {t('inventory.balances.columns.transfer')}
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
          <div style={modalStyle} dir={isRTL ? 'rtl' : 'ltr'}>
            <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '500px', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                <h3 style={{ margin: 0, color: 'white', fontWeight: 800, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ArrowRightLeft size={20} /> {t('inventory.balances.transferModal.title')}
                </h3>
                <button onClick={() => setShowTransferModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleTransferSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>
                    {t('inventory.balances.transferModal.fromWarehouse')}
                  </label>
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
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>
                    {t('inventory.balances.transferModal.toWarehouse')}
                  </label>
                  <select
                    value={transferForm.to_warehouse_id}
                    onChange={e => setTransferForm({ ...transferForm, to_warehouse_id: e.target.value })}
                    style={inputStyle}
                    required
                  >
                    <option value="">{t('inventory.balances.transferModal.selectDestination')}</option>
                    {warehouses
                      .filter(w => String(w.id) !== String(transferForm.from_warehouse_id))
                      .map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>
                    {t('inventory.balances.transferModal.product')}
                  </label>
                  <select
                    value={transferForm.product_id}
                    onChange={e => setTransferForm({ ...transferForm, product_id: e.target.value })}
                    style={inputStyle}
                    required
                  >
                    <option value="">{t('inventory.balances.transferModal.selectProduct')}</option>
                    {stockItems.map(p => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.product_name} ({t('inventory.balances.transferModal.available', { qty: p.quantity, unit: p.unit || t('inventory.products.piece') })})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>
                    {t('inventory.balances.transferModal.quantity')}
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    placeholder={t('inventory.balances.transferModal.enterQuantity')}
                    value={transferForm.quantity}
                    onChange={e => setTransferForm({ ...transferForm, quantity: e.target.value })}
                    style={inputStyle}
                    className="num-en"
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>
                    {t('inventory.balances.transferModal.notes')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('inventory.balances.transferModal.notesPlaceholder')}
                    value={transferForm.notes}
                    onChange={e => setTransferForm({ ...transferForm, notes: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                  <button type="button" onClick={() => setShowTransferModal(false)} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>
                    {t('common.cancel')}
                  </button>
                  <button type="submit" disabled={transferSubmitting} style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: transferSubmitting ? 'not-allowed' : 'pointer', opacity: transferSubmitting ? 0.7 : 1 }}>
                    {transferSubmitting ? t('inventory.balances.transferModal.transferring') : t('inventory.balances.transferModal.confirmTransfer')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── STOCK TAKING / ADJUSTMENT MODAL ── */}
        {showStockTakeModal && (
          <div style={modalStyle} dir={isRTL ? 'rtl' : 'ltr'}>
            <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '750px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>
                <div>
                  <h3 style={{ margin: 0, color: 'white', fontWeight: 800, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ClipboardCheck size={20} /> {t('inventory.balances.stockTakeModal.title')}
                  </h3>
                  <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.8)', fontSize: '12px' }}>
                    {t('inventory.balances.stockTakeModal.warehouseSubtitle', { warehouse: selectedWhObj?.name || '' })}
                  </p>
                </div>
                <button onClick={() => setShowStockTakeModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleStockTakeSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: isRTL ? 'right' : 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '10px' }}>{t('inventory.balances.stockTakeModal.productCol')}</th>
                      <th style={{ padding: '10px' }}>{t('inventory.balances.stockTakeModal.systemQtyCol')}</th>
                      <th style={{ padding: '10px' }}>{t('inventory.balances.stockTakeModal.actualQtyCol')}</th>
                      <th style={{ padding: '10px' }}>{t('inventory.balances.stockTakeModal.diffCol')}</th>
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
                            <span className="num-en" style={{ display: 'block', fontSize: '11px', color: '#94a3b8' }}>
                              {item.sku || t('inventory.balances.stockTakeModal.noSku')}
                            </span>
                          </td>
                          <td style={{ padding: '10px', fontWeight: 700, color: '#64748b' }}>
                            <span className="num-en">{item.quantity}</span> {item.unit || t('inventory.products.piece')}
                          </td>
                          <td style={{ padding: '10px', width: '150px' }}>
                            <input
                              type="number"
                              step="any"
                              className="num-en"
                              value={stockTakeCounts[item.product_id] ?? item.quantity}
                              onChange={e => {
                                const val = e.target.value;
                                setStockTakeCounts(prev => ({ ...prev, [item.product_id]: val }));
                              }}
                              style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontWeight: 800, fontSize: '14px', outline: 'none' }}
                            />
                          </td>
                          <td style={{ padding: '10px', fontWeight: 800, color: diff > 0 ? '#10b981' : diff < 0 ? '#ef4444' : '#94a3b8' }}>
                            <span className="num-en">
                              {diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '0'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                  <button type="button" onClick={() => setShowStockTakeModal(false)} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>
                    {t('common.cancel')}
                  </button>
                  <button type="submit" disabled={stockTakeSubmitting} style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: stockTakeSubmitting ? 'not-allowed' : 'pointer', opacity: stockTakeSubmitting ? 0.7 : 1 }}>
                    {stockTakeSubmitting ? t('inventory.balances.stockTakeModal.applying') : t('inventory.balances.stockTakeModal.applyAdjustments')}
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
