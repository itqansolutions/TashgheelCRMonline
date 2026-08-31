import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Scale, Search, Filter, AlertTriangle, CheckCircle2, Building, RefreshCw } from 'lucide-react';
import WarehouseSubNav from '../../components/Warehouse/WarehouseSubNav';

const StockBalances = () => {
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('All Warehouses');

  const fetchStockBalances = async () => {
    setLoading(true);
    try {
      const res = await api.get('/products').catch(() => ({ data: { data: [] } }));
      const rawProducts = res.data.data || res.data || [];

      // Map to stock balance rows
      const mapped = rawProducts.map((p, idx) => ({
        id: p.id || idx + 1,
        sku: p.sku || `SKU-${100 + idx}`,
        product_name: p.name || 'Product',
        category: p.category || 'General',
        warehouse: p.warehouse_name || 'Main Warehouse',
        on_hand: parseInt(p.stock_quantity || p.quantity || 0),
        reserved: parseInt(p.reserved_quantity || 0),
        min_reorder: parseInt(p.min_reorder_level || 10),
        unit_cost: parseFloat(p.cost_price || p.price || 0),
      }));

      setBalances(mapped);
    } catch (err) {
      toast.error('Failed to load stock balances');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStockBalances();
  }, []);

  const filtered = balances.filter(b => {
    const matchesSearch = b.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          b.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesWh = selectedWarehouse === 'All Warehouses' || b.warehouse === selectedWarehouse;
    return matchesSearch && matchesWh;
  });

  const totalInventoryValuation = filtered.reduce((acc, b) => acc + (b.on_hand * b.unit_cost), 0);
  const lowStockCount = filtered.filter(b => b.on_hand <= b.min_reorder).length;

  return (
    <div>
      <WarehouseSubNav />
      <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Scale size={24} style={{ color: '#0284c7' }} /> Real-time Stock Balances
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              Live inventory levels, allocated stock, reorder thresholds, and warehouse valuation
            </p>
          </div>
          <button
            onClick={fetchStockBalances}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px',
              background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1',
              borderRadius: '10px', fontWeight: 800, cursor: 'pointer'
            }}
          >
            <RefreshCw size={16} /> Refresh Balances
          </button>
        </div>

        {/* KPI Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>Total Asset Valuation</span>
            <span style={{ fontSize: '24px', fontWeight: 800, color: '#0ea5e9' }}>${totalInventoryValuation.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>

          <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>Low Stock Reorder Alerts</span>
            <span style={{ fontSize: '24px', fontWeight: 800, color: lowStockCount > 0 ? '#ef4444' : '#10b981' }}>{lowStockCount} Items</span>
          </div>
        </div>

        {/* Filters */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
            <Search size={18} style={{ color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search product or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ border: 'none', outline: 'none', width: '100%', fontSize: '14px', fontWeight: 600, color: '#1e293b' }}
            />
          </div>

          <select
            value={selectedWarehouse}
            onChange={(e) => setSelectedWarehouse(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontWeight: 700, outline: 'none', background: '#f8fafc', fontSize: '13px' }}
          >
            <option value="All Warehouses">All Warehouses</option>
            <option value="Main Central Warehouse">Main Central Warehouse</option>
            <option value="Retail Branch Store">Retail Branch Store</option>
          </select>
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading balances...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>No matching stock balances</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>SKU</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Product Name</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Warehouse</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>On Hand</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Reserved</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Available</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Unit Cost</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Total Value</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Reorder Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const available = b.on_hand - b.reserved;
                  const isLow = b.on_hand <= b.min_reorder;
                  return (
                    <tr key={`${b.id}-${b.warehouse}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontWeight: 800, color: '#0ea5e9' }}>
                        {b.sku}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: '#1e293b' }}>
                        {b.product_name}
                      </td>
                      <td style={{ padding: '14px 18px', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>
                        🏢 {b.warehouse}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0f172a' }}>
                        {b.on_hand}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: '#f59e0b' }}>
                        {b.reserved}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: '#10b981' }}>
                        {available}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 600, color: '#64748b' }}>
                        ${b.unit_cost.toFixed(2)}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: '#1e293b' }}>
                        ${(b.on_hand * b.unit_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        {isLow ? (
                          <span style={{ padding: '4px 10px', background: '#fee2e2', color: '#b91c1c', borderRadius: '20px', fontSize: '11px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <AlertTriangle size={12} /> Low Stock (Min: {b.min_reorder})
                          </span>
                        ) : (
                          <span style={{ padding: '4px 10px', background: '#dcfce7', color: '#15803d', borderRadius: '20px', fontSize: '11px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={12} /> Optimal
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockBalances;
