import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { CreditCard, Package, ArrowDownLeft, ArrowUpRight, History, Calendar, DollarSign, Layers } from 'lucide-react';
import WarehouseSubNav from '../../components/Warehouse/WarehouseSubNav';
import { useLanguage } from '../../context/LanguageContext';

const ItemCard = () => {
  const { t, isRTL } = useLanguage();
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [loading, setLoading] = useState(true);
  const [cardLoading, setCardLoading] = useState(false);

  // Product audit trail logs + summary (from ledger)
  const [auditTrail, setAuditTrail] = useState([]);
  const [card, setCard] = useState(null);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const res = await api.get('/products').catch(() => ({ data: { data: [] } }));
        const items = res.data.data || res.data || [];
        setProducts(items);
        if (items.length > 0) setSelectedProductId(String(items[0].id));
      } catch (err) {
        toast.error(t('inventory.itemCard.loadProductsError'));
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  useEffect(() => {
    if (!selectedProductId) return;
    let cancelled = false;
    const fetchCard = async () => {
      setCardLoading(true);
      try {
        const res = await api.get(`/inventory/item-card/${selectedProductId}`);
        if (cancelled) return;
        const data = res.data.data;
        setCard(data);
        // Newest first for display; running balance was computed chronologically
        setAuditTrail([...(data.movements || [])].reverse());
      } catch (err) {
        if (cancelled) return;
        setCard(null);
        setAuditTrail([]);
        toast.error(t('inventory.itemCard.loadError'));
      } finally {
        if (!cancelled) setCardLoading(false);
      }
    };
    fetchCard();
    return () => { cancelled = true; };
  }, [selectedProductId]);

  const selectedProduct = products.find(p => String(p.id) === String(selectedProductId));
  const isService = card && card.is_inventory_item === false;
  const currencyLabel = t('common.currency', 'EGP');

  const fmtNum = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
  const fmtMoney = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <WarehouseSubNav />
      <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CreditCard size={24} style={{ color: '#0ea5e9' }} /> {t('inventory.itemCard.title')}
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              {t('inventory.itemCard.subtitle')}
            </p>
          </div>

          {/* Product Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '13px', fontWeight: 800, color: '#475569' }}>{t('inventory.itemCard.selectProduct')}</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              style={{ padding: '10px 16px', borderRadius: '10px', border: '1.5px solid #0ea5e9', fontWeight: 700, outline: 'none', background: '#f0f9ff', color: '#0369a1', fontSize: '14px' }}
            >
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku || p.id})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Item Overview Header Card */}
        {selectedProduct && (
          <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: 'white', padding: '24px', borderRadius: '20px', marginBottom: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <span className="num-en" style={{ fontSize: '12px', fontWeight: 800, color: '#38bdf8', background: 'rgba(56,189,248,0.15)', padding: '4px 10px', borderRadius: '6px', fontFamily: 'monospace' }}>
                  {selectedProduct.sku || '—'}
                </span>
                <h2 style={{ margin: '8px 0 4px 0', fontSize: '24px', fontWeight: 800 }}>{selectedProduct.name}</h2>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                  {t('inventory.itemCard.category', { category: selectedProduct.category || '—' })}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <div style={{ background: 'rgba(255,255,255,0.08)', padding: '14px 20px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', fontWeight: 700 }}>{t('inventory.itemCard.currentStock')}</span>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#38bdf8' }}>
                    {cardLoading || !card ? '…' : isService ? t('inventory.itemCard.serviceNotStocked') : (
                      <>
                        <span className="num-en">{fmtNum(card.current_stock)}</span> {card.product?.unit || t('inventory.itemCard.unitsSuffix')}
                      </>
                    )}
                  </span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.08)', padding: '14px 20px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', fontWeight: 700 }}>{t('inventory.itemCard.productCost')}</span>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#4ade80' }}>
                    {cardLoading || !card ? '…' : (card.cost_price == null ? '—' : (
                      <>
                        <span className="num-en">{fmtMoney(card.cost_price)}</span> {currencyLabel}
                      </>
                    ))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Audit Trail Table */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 800, color: '#1e293b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={18} style={{ color: '#0ea5e9' }} /> {t('inventory.itemCard.historyTitle')}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: isRTL ? 'right' : 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.itemCard.columns.dateTime')}</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.itemCard.columns.docNo')}</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.itemCard.columns.transType')}</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.itemCard.columns.warehouse')}</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.itemCard.columns.qtyIn')}</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.itemCard.columns.qtyOut')}</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.itemCard.columns.runningBalance')}</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.itemCard.columns.unitCost')}</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.itemCard.columns.balanceValuation')}</th>
              </tr>
            </thead>
            <tbody>
              {auditTrail.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: '28px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                    {cardLoading ? t('inventory.itemCard.loading') : isService ? t('inventory.itemCard.noMovementsService') : t('inventory.itemCard.noMovements')}
                  </td>
                </tr>
              )}
              {auditTrail.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '14px 18px', fontSize: '13px', color: '#64748b' }}>
                    <span className="num-en">{log.date ? new Date(log.date).toLocaleString('en-GB') : '—'}</span>
                  </td>
                  <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontWeight: 800, color: '#0ea5e9' }}>
                    <span className="num-en">{log.doc_no}</span>
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 700, color: '#1e293b' }}>
                    {log.type}
                  </td>
                  <td style={{ padding: '14px 18px', fontSize: '13px', color: '#475569' }}>
                    🏢 {log.warehouse}
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 800, color: log.qty_in > 0 ? '#10b981' : '#cbd5e1' }}>
                    <span className="num-en">{log.qty_in > 0 ? `+${fmtNum(log.qty_in)}` : '-'}</span>
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 800, color: log.qty_out > 0 ? '#ef4444' : '#cbd5e1' }}>
                    <span className="num-en">{log.qty_out > 0 ? `-${fmtNum(log.qty_out)}` : '-'}</span>
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0f172a' }}>
                    <span className="num-en">{fmtNum(log.balance)}</span> {t('inventory.itemCard.unitsSuffix')}
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 600, color: '#64748b' }}>
                    {log.unit_price == null ? '—' : (
                      <>
                        <span className="num-en">{fmtMoney(log.unit_price)}</span> {currencyLabel}
                      </>
                    )}
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0ea5e9' }}>
                    {log.total_val == null ? '—' : (
                      <>
                        <span className="num-en">{fmtMoney(log.total_val)}</span> {currencyLabel}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ItemCard;
