import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { TrendingUp, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, DollarSign, Package, AlertCircle } from 'lucide-react';
import WarehouseSubNav from '../../components/Warehouse/WarehouseSubNav';

const TransactionImpact = () => {
  const [impactLogs, setImpactLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch transaction impact logs
    const fetchImpactLogs = async () => {
      setLoading(true);
      try {
        const res = await api.get('/accounting/journals').catch(() => ({ data: { data: [] } }));
        const journals = res.data.data || res.data || [];
        const logs = journals.map((j, i) => ({
          id: j.id || i + 1,
          type: 'JOURNAL',
          reference: j.entry_number || `JV-${j.id}`,
          product: j.description || 'General Inventory Movement',
          qty: '-',
          unit_cost: parseFloat(j.total_debit || 0),
          total_value: parseFloat(j.total_debit || 0),
          financial_account: 'General Ledger',
          date: j.entry_date ? new Date(j.entry_date).toLocaleDateString() : ''
        }));
        setImpactLogs(logs);
      } catch (err) {
        toast.error('Failed to load transaction impact data');
      } finally {
        setLoading(false);
      }
    };
    fetchImpactLogs();
  }, []);

  const totalInboundValue = impactLogs.filter(l => l.type === 'INBOUND').reduce((acc, l) => acc + l.total_value, 0);
  const totalOutboundValue = Math.abs(impactLogs.filter(l => l.type === 'OUTBOUND').reduce((acc, l) => acc + l.total_value, 0));

  return (
    <div>
      <WarehouseSubNav />
      <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <TrendingUp size={24} style={{ color: '#8b5cf6' }} /> Transaction Impact Analysis
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              Financial and inventory valuation impact ledger generated from stock movements
            </p>
          </div>
        </div>

        {/* KPI Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>Inbound Inventory Value</span>
            <span style={{ fontSize: '24px', fontWeight: 800, color: '#10b981' }}>+${totalInboundValue.toLocaleString()}</span>
          </div>

          <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>COGS Impact (Outbound)</span>
            <span style={{ fontSize: '24px', fontWeight: 800, color: '#ef4444' }}>-${totalOutboundValue.toLocaleString()}</span>
          </div>

          <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>Net Inventory Asset Shift</span>
            <span style={{ fontSize: '24px', fontWeight: 800, color: '#8b5cf6' }}>${(totalInboundValue - totalOutboundValue).toLocaleString()}</span>
          </div>
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Type</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Ref No</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Product Name</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Quantity Shift</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Unit Cost</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Total Financial Impact</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Affected GL Account</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {impactLogs.map((log) => {
                  const isInbound = log.type === 'INBOUND';
                  const isOutbound = log.type === 'OUTBOUND';
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                          background: isInbound ? '#dcfce7' : isOutbound ? '#fee2e2' : '#e0f2fe',
                          color: isInbound ? '#15803d' : isOutbound ? '#b91c1c' : '#0369a1'
                        }}>
                          {isInbound && <ArrowDownLeft size={12} style={{ display: 'inline', marginRight: '4px' }} />}
                          {isOutbound && <ArrowUpRight size={12} style={{ display: 'inline', marginRight: '4px' }} />}
                          {log.type}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontWeight: 800, color: '#0ea5e9' }}>
                        {log.reference}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: '#1e293b' }}>
                        {log.product}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: isInbound ? '#10b981' : isOutbound ? '#ef4444' : '#475569' }}>
                        {log.qty}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 600, color: '#64748b' }}>
                        ${log.unit_cost.toFixed(2)}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: log.total_value >= 0 ? '#10b981' : '#ef4444' }}>
                        {log.total_value >= 0 ? `+$${log.total_value.toFixed(2)}` : `-$${Math.abs(log.total_value).toFixed(2)}`}
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                        🏛️ {log.financial_account}
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: '12px', color: '#94a3b8' }}>
                        {log.date}
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

export default TransactionImpact;
