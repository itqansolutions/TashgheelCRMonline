import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Lock, Calendar, DollarSign, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

const PeriodClosing = () => {
  const [fixedAssets, setFixedAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    fetchFixedAssets();
    return () => { requestId.current += 1; };
  }, []);

  const fetchFixedAssets = async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.get('/erp/closing/assets');
      if (currentRequest === requestId.current) setFixedAssets(res.data.data || []);
    } catch (err) {
      if (currentRequest !== requestId.current) return;
      setFixedAssets([]);
      setLoadError(err.response?.data?.code === 'ERP_ACCOUNTING_DISABLED'
        ? 'ERP Accounting is not enabled. Fixed asset data is unavailable.'
        : 'Could not load fixed assets. This does not mean there are no assets.');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  };

  const handleRunDepreciation = async (assetId) => {
    try {
      await api.post('/erp/closing/assets/depreciate', { asset_id: assetId });
      toast.success('Monthly depreciation journal posted!');
      fetchFixedAssets();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to post depreciation');
    }
  };

  return (
    <div className="erp-closing-page" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Lock size={28} /> Period Closing & Fixed Assets Engine
          </h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
            Month-End Trial Balance Lock, Year-End Retained Earnings Closing & Fixed Assets Depreciation
          </p>
        </div>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '12px', color: '#1e293b' }}>Fixed Assets Directory & Depreciation Engine</h3>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>Loading Fixed Assets...</div>
        ) : loadError ? (
          <div role="alert" style={{ padding: '24px', color: '#991b1b' }}>
            <p>{loadError}</p>
            <button type="button" style={{ marginInlineStart: '12px', marginTop: '8px', padding: '8px 16px', border: '1px solid #c7d2fe', borderRadius: '8px', background: '#eef2ff', color: '#4338ca', cursor: 'pointer' }} onClick={fetchFixedAssets}>Retry</button>
          </div>
        ) : fixedAssets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No Fixed Assets Registered</div>
        ) : (
          <div className="responsive-table-region" role="region" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '10px' }}>Asset Code</th>
                <th style={{ padding: '10px' }}>Asset Name</th>
                <th style={{ padding: '10px' }}>Acquisition Cost</th>
                <th style={{ padding: '10px' }}>Accumulated Depr</th>
                <th style={{ padding: '10px' }}>Net Book Value (NBV)</th>
                <th style={{ padding: '10px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {fixedAssets.map(fa => (
                <tr key={fa.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: '700', color: '#4f46e5' }}>{fa.asset_code}</td>
                  <td style={{ padding: '10px', fontWeight: '600' }}>{fa.name}</td>
                  <td style={{ padding: '10px' }}>{Number(fa.acquisition_cost).toLocaleString()} EGP</td>
                  <td style={{ padding: '10px', color: '#ef4444' }}>{Number(fa.accumulated_depreciation || 0).toLocaleString()} EGP</td>
                  <td style={{ padding: '10px', fontWeight: '700', color: '#10b981' }}>{Number(fa.net_book_value ?? fa.acquisition_cost).toLocaleString()} EGP</td>
                  <td style={{ padding: '10px' }}>
                    <button
                      onClick={() => handleRunDepreciation(fa.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px',
                        backgroundColor: '#4f46e5', color: 'white', border: 'none',
                        borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer'
                      }}
                    >
                      <RefreshCw size={12} /> Post Monthly Depr
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
};

export default PeriodClosing;
