import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { BarChart3, FileSpreadsheet, PieChart, Scale, ArrowUpRight, ArrowDownRight, CheckCircle2 } from 'lucide-react';

const FinancialReports = () => {
  const [activeTab, setActiveTab] = useState('tb');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    fetchReport(activeTab);
    return () => { requestId.current += 1; };
  }, [activeTab]);

  const fetchReport = async (tab) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setLoadError('');
    setReportData(null);
    try {
      let endpoint = '/erp/reports/trial-balance';
      if (tab === 'bs') endpoint = '/erp/reports/balance-sheet';
      if (tab === 'pl') endpoint = '/erp/reports/income-statement';
      if (tab === 'ar') endpoint = '/erp/reports/ar-aging';

      const res = await api.get(endpoint);
      if (currentRequest === requestId.current) setReportData(res.data.data);
    } catch (err) {
      if (currentRequest === requestId.current) setLoadError(err.response?.data?.code === 'ERP_ACCOUNTING_DISABLED'
        ? 'ERP Accounting is not enabled. This report is unavailable.'
        : 'Could not load report data. No report totals have been confirmed.');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  };

  return (
    <div className="erp-financial-reports-page" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BarChart3 size={28} /> ERP Double-Entry Financial Reports
          </h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
            Real-time financial statements directly aggregated from posted double-entry journal entry lines
          </p>
        </div>
      </div>

      <div className="erp-report-tabs" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        {[
          { id: 'tb', label: 'Trial Balance', icon: <Scale size={16} /> },
          { id: 'bs', label: 'Balance Sheet', icon: <FileSpreadsheet size={16} /> },
          { id: 'pl', label: 'Income Statement (P&L)', icon: <PieChart size={16} /> },
          { id: 'ar', label: 'AR Aging Report', icon: <BarChart3 size={16} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px',
              borderRadius: '8px', border: '1px solid #e2e8f0',
              backgroundColor: activeTab === tab.id ? '#4f46e5' : 'white',
              color: activeTab === tab.id ? 'white' : '#475569', fontWeight: '600', cursor: 'pointer'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>Generating Financial Report...</div>
      ) : !reportData ? (
        <div role="alert" style={{ textAlign: 'center', padding: '40px' }}>
          <p>{loadError || 'Report data is unavailable.'}</p>
          <button type="button" style={{ marginInlineStart: '12px', marginTop: '8px', padding: '8px 16px', border: '1px solid #c7d2fe', borderRadius: '8px', background: '#eef2ff', color: '#4338ca', cursor: 'pointer' }} onClick={() => fetchReport(activeTab)}>Retry</button>
        </div>
      ) : (
        <div className="erp-report-content" style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
          {activeTab === 'tb' && (
            <div>
              <div className="erp-trial-summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '12px 16px', backgroundColor: reportData.is_balanced ? '#f0fdf4' : '#fef2f2', borderRadius: '8px', border: `1px solid ${reportData.is_balanced ? '#bbf7d0' : '#fecaca'}` }}>
                <span style={{ fontWeight: '700', color: reportData.is_balanced ? '#166534' : '#991b1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={18} /> {reportData.is_balanced ? 'Trial Balance is BALANCED' : 'Trial Balance is IMBALANCED'}
                </span>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>
                  Total DR: {reportData.grand_total_debit?.toLocaleString()} EGP | Total CR: {reportData.grand_total_credit?.toLocaleString()} EGP
                </span>
              </div>
              <div className="responsive-table-region" role="region" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '10px' }}>Code</th>
                    <th style={{ padding: '10px' }}>Account Name</th>
                    <th style={{ padding: '10px' }}>Type</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Total Debit (DR)</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Total Credit (CR)</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Net Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {(reportData.rows || []).map(r => (
                    <tr key={r.account_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: '700' }}>{r.account_code}</td>
                      <td style={{ padding: '10px' }}>{r.account_name}</td>
                      <td style={{ padding: '10px', color: '#64748b' }}>{r.account_type.toUpperCase()}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: '600', color: '#10b981' }}>{Number(r.total_debit).toLocaleString()}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: '600', color: '#ef4444' }}>{Number(r.total_credit).toLocaleString()}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: '700' }}>{Number(r.net_balance).toLocaleString()} EGP</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}

          {activeTab === 'bs' && (
            <div>
              <div className="erp-report-summary" style={{ marginBottom: '20px', display: 'flex', gap: '20px' }}>
                <div style={{ flex: 1, backgroundColor: '#f0fdf4', padding: '16px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                  <span style={{ fontSize: '12px', color: '#166534', fontWeight: '700' }}>TOTAL ASSETS</span>
                  <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#15803d', marginTop: '4px' }}>{(reportData?.assets?.total ?? 0).toLocaleString()} EGP</h2>
                </div>
                <div style={{ flex: 1, backgroundColor: '#fef2f2', padding: '16px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                  <span style={{ fontSize: '12px', color: '#991b1b', fontWeight: '700' }}>TOTAL LIABILITIES & EQUITY</span>
                  <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#b91c1c', marginTop: '4px' }}>{(reportData?.total_liabilities_and_equity ?? 0).toLocaleString()} EGP</h2>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pl' && (
            <div>
              <div className="erp-report-summary" style={{ marginBottom: '20px', display: 'flex', gap: '20px' }}>
                <div style={{ flex: 1, backgroundColor: '#f0fdf4', padding: '16px', borderRadius: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#166534', fontWeight: '700' }}>TOTAL REVENUE</span>
                  <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#15803d', marginTop: '4px' }}>{(reportData?.revenue?.total ?? 0).toLocaleString()} EGP</h2>
                </div>
                <div style={{ flex: 1, backgroundColor: '#fff7ed', padding: '16px', borderRadius: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#9a3412', fontWeight: '700' }}>TOTAL EXPENSES</span>
                  <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#c2410c', marginTop: '4px' }}>{(reportData?.expenses?.total ?? 0).toLocaleString()} EGP</h2>
                </div>
                <div style={{ flex: 1, backgroundColor: '#e0e7ff', padding: '16px', borderRadius: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#3730a3', fontWeight: '700' }}>NET PROFIT / LOSS</span>
                  <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#4338ca', marginTop: '4px' }}>{(reportData?.net_profit ?? 0).toLocaleString()} EGP</h2>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ar' && (
            <div>
              <div className="erp-aging-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
                {Object.entries(reportData.brackets || {}).map(([key, val]) => (
                  <div key={key} style={{ backgroundColor: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700' }}>{key.replace('_', ' ').toUpperCase()}</span>
                    <h3 style={{ fontSize: '18px', fontWeight: '800', marginTop: '4px', color: '#1e293b' }}>{Number(val).toLocaleString()} EGP</h3>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FinancialReports;
