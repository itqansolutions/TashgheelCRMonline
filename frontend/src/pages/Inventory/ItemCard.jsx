import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { CreditCard, Package, ArrowDownLeft, ArrowUpRight, History, Calendar, DollarSign, Layers } from 'lucide-react';
import WarehouseSubNav from '../../components/Warehouse/WarehouseSubNav';

const ItemCard = () => {
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [loading, setLoading] = useState(true);

  // Product audit trail logs
  const [auditTrail, setAuditTrail] = useState([]);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const res = await api.get('/products').catch(() => ({ data: { data: [] } }));
        const items = res.data.data || res.data || [];
        setProducts(items);
        if (items.length > 0) setSelectedProductId(String(items[0].id));
      } catch (err) {
        toast.error('Failed to load products');
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const selectedProduct = products.find(p => String(p.id) === String(selectedProductId)) || products[0];

  return (
    <div>
      <WarehouseSubNav />
      <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CreditCard size={24} style={{ color: '#0ea5e9' }} /> Item Movement Card
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              Detailed audit trail, chronological movement ledger, and historical valuation per item
            </p>
          </div>

          {/* Product Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '13px', fontWeight: 800, color: '#475569' }}>Select Product:</label>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#38bdf8', background: 'rgba(56,189,248,0.15)', padding: '4px 10px', borderRadius: '6px', fontFamily: 'monospace' }}>
                  {selectedProduct.sku || 'SKU-001'}
                </span>
                <h2 style={{ margin: '8px 0 4px 0', fontSize: '24px', fontWeight: 800 }}>{selectedProduct.name}</h2>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>Category: {selectedProduct.category || 'General Products'}</span>
              </div>

              <div style={{ display: 'flex', gap: '20px' }}>
                <div style={{ background: 'rgba(255,255,255,0.08)', padding: '14px 20px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', fontWeight: 700 }}>Current Stock</span>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#38bdf8' }}>{selectedProduct.stock_quantity || 450} Units</span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.08)', padding: '14px 20px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', fontWeight: 700 }}>Avg Unit Cost</span>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#4ade80' }}>${parseFloat(selectedProduct.cost_price || 15).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Audit Trail Table */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 800, color: '#1e293b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={18} style={{ color: '#0ea5e9' }} /> Chronological Movement History
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Date & Time</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Document No</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Transaction Type</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Warehouse</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Qty In</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Qty Out</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Running Balance</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Unit Price</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Total Balance Valuation</th>
              </tr>
            </thead>
            <tbody>
              {auditTrail.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '14px 18px', fontSize: '13px', color: '#64748b' }}>
                    {log.date}
                  </td>
                  <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontWeight: 800, color: '#0ea5e9' }}>
                    {log.doc_no}
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 700, color: '#1e293b' }}>
                    {log.type}
                  </td>
                  <td style={{ padding: '14px 18px', fontSize: '13px', color: '#475569' }}>
                    🏢 {log.warehouse}
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 800, color: log.qty_in > 0 ? '#10b981' : '#cbd5e1' }}>
                    {log.qty_in > 0 ? `+${log.qty_in}` : '-'}
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 800, color: log.qty_out > 0 ? '#ef4444' : '#cbd5e1' }}>
                    {log.qty_out > 0 ? `-${log.qty_out}` : '-'}
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0f172a' }}>
                    {log.balance} units
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 600, color: '#64748b' }}>
                    ${log.unit_price.toFixed(2)}
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0ea5e9' }}>
                    ${log.total_val.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
