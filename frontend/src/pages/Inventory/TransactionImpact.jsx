import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { TrendingUp, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, DollarSign, Package, AlertCircle } from 'lucide-react';
import WarehouseSubNav from '../../components/Warehouse/WarehouseSubNav';
import { useLanguage } from '../../context/LanguageContext';

const TransactionImpact = () => {
  const { t, isRTL } = useLanguage();
  const [impactLogs, setImpactLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch transaction impact logs
    const fetchImpactLogs = async () => {
      setLoading(true);
      try {
        const res = await api.get('/inventory/movements').catch(() => ({ data: { data: [] } }));
        const movements = res.data?.data || [];
        const logs = movements.map((m, i) => {
          const typeLower = (m.type || '').toLowerCase();
          const isInbound = typeLower === 'in' || typeLower === 'inbound';
          const isOutbound = typeLower === 'out' || typeLower === 'outbound';
          const qty = parseFloat(m.quantity || 0);
          const unitCost = parseFloat(m.unit_cost || m.cost || 0);
          const totalVal = qty * unitCost;

          return {
            id: m.id || i + 1,
            rawType: isInbound ? 'inbound' : isOutbound ? 'outbound' : 'transfer',
            reference: m.reference_number || (m.reference_type ? `${m.reference_type.toUpperCase()}-${m.reference_id || m.id}` : `MOV-${m.id}`),
            product: m.product_name || t('inventory.transactionImpact.defaultProduct'),
            qty: isInbound ? `+${qty}` : isOutbound ? `-${qty}` : `${qty}`,
            unit_cost: unitCost,
            total_value: isInbound ? totalVal : -totalVal,
            glKey: isInbound ? 'inventoryAsset' : 'cogs',
            date: m.created_at ? new Date(m.created_at).toLocaleDateString('en-GB') : ''
          };
        });
        setImpactLogs(logs);
      } catch (err) {
        toast.error(t('inventory.transactionImpact.loadError'));
      } finally {
        setLoading(false);
      }
    };
    fetchImpactLogs();
  }, [t]);

  const currencyLabel = t('common.currency', 'EGP');
  const totalInboundValue = impactLogs.filter(l => l.rawType === 'inbound').reduce((acc, l) => acc + l.total_value, 0);
  const totalOutboundValue = Math.abs(impactLogs.filter(l => l.rawType === 'outbound').reduce((acc, l) => acc + l.total_value, 0));

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <WarehouseSubNav />
      <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <TrendingUp size={24} style={{ color: '#8b5cf6' }} /> {t('inventory.transactionImpact.title')}
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              {t('inventory.transactionImpact.subtitle')}
            </p>
          </div>
        </div>

        {/* KPI Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>
              {t('inventory.transactionImpact.kpiInbound')}
            </span>
            <span style={{ fontSize: '24px', fontWeight: 800, color: '#10b981' }}>
              +<span className="num-en">{totalInboundValue.toLocaleString()}</span> {currencyLabel}
            </span>
          </div>

          <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>
              {t('inventory.transactionImpact.kpiOutbound')}
            </span>
            <span style={{ fontSize: '24px', fontWeight: 800, color: '#ef4444' }}>
              -<span className="num-en">{totalOutboundValue.toLocaleString()}</span> {currencyLabel}
            </span>
          </div>

          <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>
              {t('inventory.transactionImpact.kpiNet')}
            </span>
            <span style={{ fontSize: '24px', fontWeight: 800, color: '#8b5cf6' }}>
              <span className="num-en">{(totalInboundValue - totalOutboundValue).toLocaleString()}</span> {currencyLabel}
            </span>
          </div>
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>{t('inventory.transactionImpact.loading')}</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: isRTL ? 'right' : 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.transactionImpact.columns.type')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.transactionImpact.columns.refNo')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.transactionImpact.columns.productName')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.transactionImpact.columns.quantityShift')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.transactionImpact.columns.unitCost')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.transactionImpact.columns.totalFinancialImpact')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.transactionImpact.columns.affectedGLAccount')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.transactionImpact.columns.timestamp')}</th>
                </tr>
              </thead>
              <tbody>
                {impactLogs.map((log) => {
                  const isInbound = log.rawType === 'inbound';
                  const isOutbound = log.rawType === 'outbound';
                  const typeLabel = isInbound
                    ? t('inventory.transactionImpact.types.inbound')
                    : isOutbound
                    ? t('inventory.transactionImpact.types.outbound')
                    : t('inventory.transactionImpact.types.transfer');
                  const glLabel = log.glKey === 'inventoryAsset'
                    ? t('inventory.transactionImpact.glAccounts.inventoryAsset')
                    : t('inventory.transactionImpact.glAccounts.cogs');

                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                          background: isInbound ? '#dcfce7' : isOutbound ? '#fee2e2' : '#e0f2fe',
                          color: isInbound ? '#15803d' : isOutbound ? '#b91c1c' : '#0369a1',
                          display: 'inline-flex', alignItems: 'center', gap: '4px'
                        }}>
                          {isInbound && <ArrowDownLeft size={12} />}
                          {isOutbound && <ArrowUpRight size={12} />}
                          {!isInbound && !isOutbound && <ArrowLeftRight size={12} />}
                          {typeLabel}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontWeight: 800, color: '#0ea5e9' }}>
                        <span className="num-en">{log.reference}</span>
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: '#1e293b' }}>
                        {log.product}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: isInbound ? '#10b981' : isOutbound ? '#ef4444' : '#475569' }}>
                        <span className="num-en">{log.qty}</span>
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 600, color: '#64748b' }}>
                        <span className="num-en">{log.unit_cost.toFixed(2)}</span> {currencyLabel}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: log.total_value >= 0 ? '#10b981' : '#ef4444' }}>
                        <span className="num-en">
                          {log.total_value >= 0 ? `+${log.total_value.toFixed(2)}` : `-${Math.abs(log.total_value).toFixed(2)}`}
                        </span> {currencyLabel}
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                        🏛️ {glLabel}
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: '12px', color: '#94a3b8' }}>
                        <span className="num-en">{log.date}</span>
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
