import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { isInvalidDateRange } from '../../utils/dateRange';
import toast from 'react-hot-toast';
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign,
  Printer, RefreshCw, ChevronRight, FileText, ArrowDownLeft,
  Users, Building2, CheckCircle2,
  Clock, Layers
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

// ─── Formatting Helpers ───────────────────────────────────────────────────────
const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const AGING_COLORS = {
  current: '#22c55e',
  days_1_30: '#f59e0b',
  days_31_60: '#f97316',
  days_61_90: '#ef4444',
  days_90_plus: '#dc2626',
};

// ─── Main Reports Component ───────────────────────────────────────────────────
const Reports = ({ onSelectCustomer }) => {
  const { t, isRTL } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeReportTab, setActiveReportTab] = useState('overview'); // overview, sales, collections, expenses, aging, cashflow

  // Filters
  const [datePreset, setDatePreset] = useState('this_month'); // today, this_month, last_month, this_quarter, this_year, all, custom
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState([]);

  // Calculate preset dates
  const applyPreset = (preset) => {
    setDatePreset(preset);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    if (preset === 'today') {
      const todayStr = now.toISOString().split('T')[0];
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (preset === 'this_month') {
      const firstDay = new Date(y, m, 1).toISOString().split('T')[0];
      const lastDay = new Date(y, m + 1, 0).toISOString().split('T')[0];
      setDateFrom(firstDay);
      setDateTo(lastDay);
    } else if (preset === 'last_month') {
      const firstDay = new Date(y, m - 1, 1).toISOString().split('T')[0];
      const lastDay = new Date(y, m, 0).toISOString().split('T')[0];
      setDateFrom(firstDay);
      setDateTo(lastDay);
    } else if (preset === 'this_quarter') {
      const qStartMonth = Math.floor(m / 3) * 3;
      const firstDay = new Date(y, qStartMonth, 1).toISOString().split('T')[0];
      const lastDay = new Date(y, qStartMonth + 3, 0).toISOString().split('T')[0];
      setDateFrom(firstDay);
      setDateTo(lastDay);
    } else if (preset === 'this_year') {
      setDateFrom(`${y}-01-01`);
      setDateTo(`${y}-12-31`);
    } else if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
    }
  };

  // Initial preset
  useEffect(() => {
    applyPreset('this_month');
    // Fetch branches for filter
    api.get('/branches').then(res => {
      setBranches(res.data?.data || res.data || []);
    }).catch(() => {});
  }, []);

  const fetchReports = useCallback(async () => {
    if (isInvalidDateRange(dateFrom, dateTo)) {
      toast.error(t('common.invalidDateRange'), { id: 'invalid-date-range' });
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      if (branchId && branchId !== 'all') params.append('branch_id', branchId);

      const res = await api.get(`/finance/reports?${params.toString()}`);
      setData(res.data);
    } catch (err) {
      toast.error(t('finance.reports.messages.loadError'));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, branchId, t]);

  useEffect(() => {
    if (datePreset !== 'custom' || (dateFrom && dateTo)) {
      fetchReports();
    }
  }, [fetchReports, datePreset]);

  const handlePrint = () => {
    window.print();
  };

  const { overview, sales, collections, expenses, receivables_aging, cashflow } = data || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ─── Unified Global Header & Filters Bar ────────────────────────────── */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--glass-border)',
        borderRadius: '16px',
        padding: '18px 24px',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <BarChart3 size={20} style={{ color: 'var(--primary)' }} />
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>
              {t('finance.reports.header.title')}
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
            {t('finance.reports.header.subtitle')}
          </p>
        </div>

        {/* Filters Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          {/* Preset Buttons */}
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.03)', padding: '3px', borderRadius: '9px' }}>
            {[
              { id: 'today',      label: t('finance.reports.presets.today') },
              { id: 'this_month', label: t('finance.reports.presets.this_month') },
              { id: 'last_month', label: t('finance.reports.presets.last_month') },
              { id: 'this_year',  label: t('finance.reports.presets.this_year') },
              { id: 'all',        label: t('finance.reports.presets.all') },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '7px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: datePreset === p.id ? 'var(--primary)' : 'transparent',
                  color: datePreset === p.id ? 'white' : 'var(--text-muted)',
                  transition: 'all 0.15s'
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDatePreset('custom'); setDateFrom(e.target.value); }}
              style={inputStyle}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDatePreset('custom'); setDateTo(e.target.value); }}
              style={inputStyle}
            />
          </div>

          {/* Branch Filter if multi-branch exists */}
          {branches.length > 0 && (
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              style={inputStyle}
            >
              <option value="all">{t('finance.reports.header.allBranches')}</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}

          <button onClick={fetchReports} style={btnIconStyle} title={t('finance.reports.header.refresh')}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>

          <button onClick={handlePrint} style={{ ...btnIconStyle, gap: '6px' }} title={t('finance.reports.header.print')}>
            <Printer size={14} /> {t('finance.reports.header.print')}
          </button>
        </div>
      </div>

      {/* ─── 5 Reports Navigation Strip ─────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        paddingBottom: '4px'
      }}>
        {[
          { id: 'overview',    label: t('finance.reports.tabs.overview'),    icon: <Layers size={15} /> },
          { id: 'sales',       label: t('finance.reports.tabs.sales'),       icon: <FileText size={15} /> },
          { id: 'collections', label: t('finance.reports.tabs.collections'), icon: <TrendingUp size={15} /> },
          { id: 'expenses',    label: t('finance.reports.tabs.expenses'),    icon: <TrendingDown size={15} /> },
          { id: 'aging',       label: t('finance.reports.tabs.aging'),       icon: <Clock size={15} /> },
          { id: 'cashflow',    label: t('finance.reports.tabs.cashflow'),    icon: <DollarSign size={15} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveReportTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '10px',
              border: '1.5px solid',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '13px',
              whiteSpace: 'nowrap',
              borderColor: activeReportTab === tab.id ? 'var(--primary)' : 'var(--glass-border)',
              background: activeReportTab === tab.id ? 'var(--primary)' : 'var(--bg-card)',
              color: activeReportTab === tab.id ? 'white' : 'var(--text-muted)',
              boxShadow: activeReportTab === tab.id ? '0 4px 12px rgba(99,102,241,0.2)' : 'none',
              transition: 'all 0.15s'
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
          <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px', opacity: 0.4 }} />
          <div style={{ fontWeight: 700 }}>{t('finance.reports.loading')}</div>
        </div>
      ) : !data ? null : (
        <>
          {/* ═══════════════════════════════════════════════════════════════════
              REPORT 0: EXECUTIVE OVERVIEW (30-SECOND DASHBOARD)
             ═══════════════════════════════════════════════════════════════════ */}
          {activeReportTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* 6 Strategic Executive KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
                {[
                  {
                    label: t('finance.reports.overview.kpi.totalSales'),
                    value: overview?.total_invoiced,
                    color: '#6366f1',
                    icon: <FileText size={18} />,
                    sub: t('finance.reports.overview.kpi.invoicesIssued', { count: overview?.invoices_count || 0 })
                  },
                  {
                    label: t('finance.reports.overview.kpi.totalCollections'),
                    value: overview?.total_collected,
                    color: '#10b981',
                    icon: <ArrowDownLeft size={18} />,
                    sub: t('finance.reports.overview.kpi.paymentsReceived', { count: overview?.collections_count || 0 })
                  },
                  {
                    label: t('finance.reports.overview.kpi.receivables'),
                    value: overview?.total_receivables,
                    color: '#f59e0b',
                    icon: <Users size={18} />,
                    sub: t('finance.reports.overview.kpi.overdueSub', { amount: fmt(overview?.total_overdue_receivables) })
                  },
                  {
                    label: t('finance.reports.overview.kpi.payables'),
                    value: overview?.total_payables,
                    color: '#ef4444',
                    icon: <Building2 size={18} />,
                    sub: t('finance.reports.overview.kpi.overdueSub', { amount: fmt(overview?.total_overdue_payables) })
                  },
                  {
                    label: t('finance.reports.overview.kpi.netPosition'),
                    value: overview?.net_position,
                    color: (overview?.net_position || 0) >= 0 ? '#10b981' : '#dc2626',
                    icon: <CheckCircle2 size={18} />,
                    sub: (overview?.net_position || 0) >= 0
                      ? t('finance.reports.overview.kpi.positiveEquity')
                      : t('finance.reports.overview.kpi.negativePosition')
                  },
                  {
                    label: t('finance.reports.overview.kpi.netCashFlow'),
                    value: overview?.net_cashflow,
                    color: (overview?.net_cashflow || 0) >= 0 ? '#10b981' : '#dc2626',
                    icon: <DollarSign size={18} />,
                    sub: t('finance.reports.overview.kpi.cashflowSub', { in: fmt(overview?.total_collected), out: fmt(overview?.total_outflow) })
                  },
                ].map(card => (
                  <div key={card.label} style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '14px',
                    padding: '18px 20px',
                    boxShadow: 'var(--shadow-sm)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {card.label}
                      </span>
                      <div style={{ width: 34, height: 34, borderRadius: '8px', background: `${card.color}15`, color: card.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {card.icon}
                      </div>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: card.color, marginBottom: '4px' }}>
                      <span className="num-en">{fmt(card.value)}</span> <span style={{ fontSize: '12px' }}>{t('common.currency', 'EGP')}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {card.sub}
                    </div>
                  </div>
                ))}
              </div>

              {/* Visual Breakdown Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                
                {/* 1. Cash In vs Cash Out Progress */}
                <div style={cardBoxStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ fontWeight: 800, fontSize: '14px' }}>{t('finance.reports.overview.cards.cashInOut')}</div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>{t('finance.reports.overview.cards.liquidityVelocity')}</span>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                      <span style={{ color: '#10b981' }}>
                        {t('finance.reports.overview.cards.collectionsIn', { amount: fmt(overview?.total_collected) })}
                      </span>
                      <span style={{ color: '#ef4444' }}>
                        {t('finance.reports.overview.cards.outflowOut', { amount: fmt(overview?.total_outflow) })}
                      </span>
                    </div>
                    <div style={{ height: '12px', borderRadius: '6px', background: 'rgba(239,68,68,0.2)', display: 'flex', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          background: '#10b981',
                          width: `${Math.min(100, Math.max(0, (overview?.total_collected / ((overview?.total_collected || 1) + (overview?.total_outflow || 0))) * 100))}%`
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      <span>{t('finance.reports.overview.cards.customerCollections')}</span>
                      <span>{t('finance.reports.overview.cards.expensesAndVendors', { expenses: fmt(overview?.total_expenses), vendors: fmt(overview?.total_vendor_payments) })}</span>
                    </div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.02)', padding: '12px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700 }}>{t('finance.reports.overview.cards.netCashPosition')}</span>
                    <span style={{ fontSize: '15px', fontWeight: 900, color: (overview?.net_cashflow || 0) >= 0 ? '#10b981' : '#dc2626' }}>
                      {(overview?.net_cashflow || 0) >= 0 ? '+' : ''}<span className="num-en">{fmt(overview?.net_cashflow)}</span> {t('common.currency', 'EGP')}
                    </span>
                  </div>
                </div>

                {/* 2. Receivables Aging Distribution */}
                <div style={cardBoxStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div style={{ fontWeight: 800, fontSize: '14px' }}>{t('finance.reports.overview.cards.agingSummary')}</div>
                    <button
                      onClick={() => setActiveReportTab('aging')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 800, color: 'var(--primary)' }}
                    >
                      {t('finance.reports.overview.cards.viewDetails')}
                    </button>
                  </div>

                  {/* Stacked bar */}
                  <div style={{ height: '10px', borderRadius: '6px', overflow: 'hidden', display: 'flex', background: 'var(--glass-border)', marginBottom: '14px' }}>
                    {Object.entries(receivables_aging?.buckets || {}).filter(([k]) => k !== 'total').map(([bucket, amount]) => {
                      const pct = receivables_aging?.buckets?.total > 0 ? (amount / receivables_aging.buckets.total) * 100 : 0;
                      if (pct <= 0) return null;
                      return (
                        <div key={bucket} style={{ width: `${pct}%`, background: AGING_COLORS[bucket] }} title={`${t(`finance.reports.agingReport.${bucket}`, bucket)}: ${fmt(amount)} ${t('common.currency', 'EGP')}`} />
                      );
                    })}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '11px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: AGING_COLORS.current }} />
                      <span style={{ color: 'var(--text-muted)' }}>{t('finance.reports.overview.cards.current')}</span>
                      <strong><span className="num-en">{fmt(receivables_aging?.buckets?.current)}</span></strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: AGING_COLORS.days_1_30 }} />
                      <span style={{ color: 'var(--text-muted)' }}>{t('finance.reports.overview.cards.days_1_30')}</span>
                      <strong><span className="num-en">{fmt(receivables_aging?.buckets?.days_1_30)}</span></strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: AGING_COLORS.days_31_60 }} />
                      <span style={{ color: 'var(--text-muted)' }}>{t('finance.reports.overview.cards.days_31_60')}</span>
                      <strong><span className="num-en">{fmt(receivables_aging?.buckets?.days_31_60)}</span></strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: AGING_COLORS.days_90_plus }} />
                      <span style={{ color: 'var(--text-muted)' }}>{t('finance.reports.overview.cards.days_90_plus')}</span>
                      <strong style={{ color: '#dc2626' }}><span className="num-en">{fmt(receivables_aging?.buckets?.days_90_plus)}</span></strong>
                    </div>
                  </div>
                </div>

                {/* 3. Top Debtors Quick List */}
                <div style={cardBoxStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontWeight: 800, fontSize: '14px' }}>{t('finance.reports.overview.cards.topDebtors')}</div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {t('finance.reports.overview.cards.clientsCount', { count: receivables_aging?.total_debtors_count || 0 })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(receivables_aging?.top_debtors || []).slice(0, 4).map(debtor => (
                      <div
                        key={debtor.customer_id}
                        onClick={() => onSelectCustomer ? onSelectCustomer(debtor.customer_id) : setActiveReportTab('aging')}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 8px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          background: 'rgba(0,0,0,0.015)'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '12px' }}>{debtor.customer_name}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {t('finance.reports.overview.cards.unpaidInvoices', { count: debtor.invoice_count })}
                          </div>
                        </div>
                        <div style={{ textAlign: isRTL ? 'left' : 'right' }}>
                          <div style={{ fontWeight: 800, fontSize: '13px', color: '#ef4444' }}>
                            <span className="num-en">{fmt(debtor.total_outstanding)}</span> {t('common.currency', 'EGP')}
                          </div>
                          {debtor.overdue_amount > 0 && (
                            <div style={{ fontSize: '10px', color: '#dc2626' }}>
                              {t('finance.reports.overview.cards.overdueDebtor', { amount: fmt(debtor.overdue_amount) })}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {(receivables_aging?.top_debtors || []).length === 0 && (
                      <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px' }}>
                        {t('finance.reports.overview.cards.zeroOutstanding')}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              REPORT 1: SALES & INVOICES
             ═══════════════════════════════════════════════════════════════════ */}
          {activeReportTab === 'sales' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={cardBoxStyle}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800 }}>
                  {t('finance.reports.salesReport.title')}
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '24px' }}>
                  {(sales?.by_status || []).map(st => (
                    <div key={st.status} style={{ border: '1px solid var(--glass-border)', padding: '14px', borderRadius: '10px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        {t(`finance.invoices.statuses.${(st.status || '').toLowerCase()}`, st.status)}
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 900, margin: '4px 0' }}>
                        <span className="num-en">{fmt(st.total_amount)}</span> <span style={{ fontSize: '11px' }}>{t('common.currency', 'EGP')}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {t('finance.reports.salesReport.invoicesCount', { count: st.count })}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '10px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--primary)' }}>
                      {t('finance.reports.salesReport.overallRate')}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {t('finance.reports.salesReport.overallRateSub')}
                    </div>
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--primary)' }}>
                    <span className="num-en">
                      {overview?.total_invoiced > 0
                        ? Math.round((overview.total_collected / overview.total_invoiced) * 100)
                        : 0}
                    </span>%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              REPORT 2: COLLECTIONS
             ═══════════════════════════════════════════════════════════════════ */}
          {activeReportTab === 'collections' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                
                {/* By Payment Method */}
                <div style={cardBoxStyle}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800 }}>
                    {t('finance.reports.collectionsReport.byMethod')}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(collections?.by_method || []).map(m => {
                      const pct = collections.total_collected > 0 ? (m.total_amount / collections.total_collected) * 100 : 0;
                      return (
                        <div key={m.method}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>
                            <span>{t(`finance.treasury.methods.${m.method}`, m.method)}</span>
                            <span>
                              <span className="num-en">{fmt(m.total_amount)}</span> {t('common.currency', 'EGP')} (<span className="num-en">{Math.round(pct)}</span>%)
                            </span>
                          </div>
                          <div style={{ height: '8px', borderRadius: '4px', background: 'var(--glass-border)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: '#10b981', width: `${pct}%` }} />
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {t('finance.reports.collectionsReport.transactionsCount', { count: m.count })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Collections Trend */}
                <div style={cardBoxStyle}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800 }}>
                    {t('finance.reports.collectionsReport.trendTitle')}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(collections?.trend || []).map(tr => (
                      <div key={tr.period} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px' }}><span className="num-en">{tr.period}</span></span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {t('finance.reports.collectionsReport.receiptsCount', { count: tr.count })}
                        </span>
                        <strong style={{ color: '#10b981', fontSize: '14px' }}>
                          <span className="num-en">{fmt(tr.total_amount)}</span> {t('common.currency', 'EGP')}
                        </strong>
                      </div>
                    ))}
                    {(collections?.trend || []).length === 0 && (
                      <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                        {t('finance.reports.collectionsReport.empty')}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              REPORT 3: EXPENSES
             ═══════════════════════════════════════════════════════════════════ */}
          {activeReportTab === 'expenses' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                
                {/* By Category */}
                <div style={cardBoxStyle}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800 }}>
                    {t('finance.reports.expensesReport.byCategory')}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(expenses?.by_category || []).map(cat => {
                      const pct = expenses.total_expenses > 0 ? (cat.total_amount / expenses.total_expenses) * 100 : 0;
                      return (
                        <div key={cat.category}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>
                            <span>{cat.category}</span>
                            <span style={{ color: '#ef4444' }}>
                              <span className="num-en">{fmt(cat.total_amount)}</span> {t('common.currency', 'EGP')} (<span className="num-en">{Math.round(pct)}</span>%)
                            </span>
                          </div>
                          <div style={{ height: '8px', borderRadius: '4px', background: 'var(--glass-border)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: '#ef4444', width: `${pct}%` }} />
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {t('finance.reports.expensesReport.expensesCount', { count: cat.count })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Expenses Trend */}
                <div style={cardBoxStyle}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800 }}>
                    {t('finance.reports.expensesReport.trendTitle')}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(expenses?.trend || []).map(tr => (
                      <div key={tr.period} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px' }}><span className="num-en">{tr.period}</span></span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {t('finance.reports.expensesReport.entriesCount', { count: tr.count })}
                        </span>
                        <strong style={{ color: '#ef4444', fontSize: '14px' }}>
                          <span className="num-en">{fmt(tr.total_amount)}</span> {t('common.currency', 'EGP')}
                        </strong>
                      </div>
                    ))}
                    {(expenses?.trend || []).length === 0 && (
                      <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                        {t('finance.reports.expensesReport.empty')}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              REPORT 4: RECEIVABLES & AGING
             ═══════════════════════════════════════════════════════════════════ */}
          {activeReportTab === 'aging' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Aging 5 Buckets Strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                {[
                  { label: t('finance.reports.agingReport.currentNotDue'), value: receivables_aging?.buckets?.current, color: AGING_COLORS.current },
                  { label: t('finance.reports.agingReport.days_1_30'),     value: receivables_aging?.buckets?.days_1_30, color: AGING_COLORS.days_1_30 },
                  { label: t('finance.reports.agingReport.days_31_60'),    value: receivables_aging?.buckets?.days_31_60, color: AGING_COLORS.days_31_60 },
                  { label: t('finance.reports.agingReport.days_61_90'),    value: receivables_aging?.buckets?.days_61_90, color: AGING_COLORS.days_61_90 },
                  { label: t('finance.reports.agingReport.days_90_plus'),  value: receivables_aging?.buckets?.days_90_plus, color: AGING_COLORS.days_90_plus },
                ].map(b => (
                  <div key={b.label} style={{ background: 'var(--bg-card)', border: `1.5px solid ${b.color}40`, borderRadius: '12px', padding: '14px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px' }}>{b.label}</div>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: b.color }}>
                      <span className="num-en">{fmt(b.value)}</span> <span style={{ fontSize: '10px' }}>{t('common.currency', 'EGP')}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Debtors List with Direct Statement Drilldown */}
              <div style={cardBoxStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                      {t('finance.reports.agingReport.tableTitle')}
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {t('finance.reports.agingReport.tableSubtitle')}
                    </p>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 800 }}>
                    {t('finance.reports.agingReport.total', { amount: fmt(receivables_aging?.buckets?.total) })}
                  </span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                        {[
                          { key: 'customerName',     label: t('finance.reports.agingReport.table.customerName'),     numeric: false },
                          { key: 'phone',            label: t('finance.reports.agingReport.table.phone'),            numeric: false },
                          { key: 'unpaidInvoices',   label: t('finance.reports.agingReport.table.unpaidInvoices'),   numeric: false },
                          { key: 'totalOutstanding', label: t('finance.reports.agingReport.table.totalOutstanding'), numeric: true },
                          { key: 'overdueAmount',    label: t('finance.reports.agingReport.table.overdueAmount'),    numeric: true },
                          { key: 'action',           label: t('finance.reports.agingReport.table.action'),           numeric: true },
                        ].map(h => (
                          <th key={h.key} style={{
                            padding: '10px 14px',
                            textAlign: h.numeric ? (isRTL ? 'left' : 'right') : (isRTL ? 'right' : 'left'),
                            fontWeight: 800,
                            color: 'var(--text-muted)',
                            fontSize: '11px',
                            textTransform: 'uppercase',
                            borderBottom: '1px solid var(--glass-border)'
                          }}>
                            {h.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(receivables_aging?.top_debtors || []).map(debtor => (
                        <tr
                          key={debtor.customer_id}
                          onClick={() => onSelectCustomer && onSelectCustomer(debtor.customer_id)}
                          style={{ borderBottom: '1px solid var(--glass-border)', cursor: 'pointer', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.04)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '12px 14px', fontWeight: 700 }}>{debtor.customer_name}</td>
                          <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>
                            {debtor.customer_phone ? <span className="num-en" dir="ltr">{debtor.customer_phone}</span> : '—'}
                          </td>
                          <td style={{ padding: '12px 14px' }}><span className="num-en">{debtor.invoice_count}</span></td>
                          <td style={{ padding: '12px 14px', textAlign: isRTL ? 'left' : 'right', fontWeight: 800, color: '#f59e0b' }}>
                            <span className="num-en">{fmt(debtor.total_outstanding)}</span> {t('common.currency', 'EGP')}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: isRTL ? 'left' : 'right', fontWeight: 900, color: debtor.overdue_amount > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                            {debtor.overdue_amount > 0 ? (
                              <>
                                <span className="num-en">{fmt(debtor.overdue_amount)}</span> {t('common.currency', 'EGP')}
                              </>
                            ) : '—'}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: isRTL ? 'left' : 'right' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              {t('finance.reports.agingReport.table.statement')}{' '}
                              <ChevronRight size={13} style={{ transform: isRTL ? 'scaleX(-1)' : 'none' }} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              REPORT 5: CASH FLOW
             ═══════════════════════════════════════════════════════════════════ */}
          {activeReportTab === 'cashflow' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Cashflow Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '18px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#10b981', textTransform: 'uppercase' }}>
                    {t('finance.reports.cashflowReport.inflow')}
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>
                    +<span className="num-en">{fmt(cashflow?.inflow)}</span> {t('common.currency', 'EGP')}
                  </div>
                </div>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '18px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase' }}>
                    {t('finance.reports.cashflowReport.outflow')}
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#ef4444', marginTop: '4px' }}>
                    −<span className="num-en">{fmt(cashflow?.outflow)}</span> {t('common.currency', 'EGP')}
                  </div>
                </div>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '18px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {t('finance.reports.cashflowReport.netPosition')}
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: (cashflow?.net || 0) >= 0 ? '#10b981' : '#dc2626', marginTop: '4px' }}>
                    {(cashflow?.net || 0) >= 0 ? '+' : ''}<span className="num-en">{fmt(cashflow?.net)}</span> {t('common.currency', 'EGP')}
                  </div>
                </div>
              </div>

              {/* By Treasury Account */}
              <div style={cardBoxStyle}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800 }}>
                  {t('finance.reports.cashflowReport.treasuryBreakdown')}
                </h3>
                
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                        {[
                          { key: 'accountName', label: t('finance.reports.cashflowReport.table.accountName'), numeric: false },
                          { key: 'type',        label: t('finance.reports.cashflowReport.table.type'),        numeric: false },
                          { key: 'inflow',      label: t('finance.reports.cashflowReport.table.inflow'),      numeric: true },
                          { key: 'outflow',     label: t('finance.reports.cashflowReport.table.outflow'),     numeric: true },
                          { key: 'netChange',   label: t('finance.reports.cashflowReport.table.netChange'),   numeric: true },
                        ].map(h => (
                          <th key={h.key} style={{
                            padding: '10px 14px',
                            textAlign: h.numeric ? (isRTL ? 'left' : 'right') : (isRTL ? 'right' : 'left'),
                            fontWeight: 800,
                            color: 'var(--text-muted)',
                            fontSize: '11px',
                            textTransform: 'uppercase',
                            borderBottom: '1px solid var(--glass-border)'
                          }}>
                            {h.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(cashflow?.by_treasury_account || []).map(acc => (
                        <tr key={acc.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                          <td style={{ padding: '12px 14px', fontWeight: 700 }}>
                            {acc.name}
                            {acc.bank_name && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginInlineStart: '6px' }}>({acc.bank_name})</span>}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '12px', background: acc.type === 'bank' ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)', color: acc.type === 'bank' ? '#3b82f6' : '#10b981' }}>
                              {acc.type === 'bank' ? t('finance.reports.cashflowReport.table.bank') : t('finance.reports.cashflowReport.table.cashbox')}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: isRTL ? 'left' : 'right', fontWeight: 800, color: '#10b981' }}>
                            +<span className="num-en">{fmt(acc.inflow)}</span> {t('common.currency', 'EGP')}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: isRTL ? 'left' : 'right', fontWeight: 800, color: '#ef4444' }}>
                            −<span className="num-en">{fmt(acc.outflow)}</span> {t('common.currency', 'EGP')}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: isRTL ? 'left' : 'right', fontWeight: 900, color: acc.net >= 0 ? '#10b981' : '#dc2626' }}>
                            {(acc.net >= 0 ? '+' : '')}<span className="num-en">{fmt(acc.net)}</span> {t('common.currency', 'EGP')}
                          </td>
                        </tr>
                      ))}
                      {(cashflow?.by_treasury_account || []).length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                            {t('finance.reports.cashflowReport.table.empty')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </>
      )}

    </div>
  );
};

// ─── Inline Styles ────────────────────────────────────────────────────────────
const cardBoxStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--glass-border)',
  borderRadius: '14px',
  padding: '20px 24px',
  boxShadow: 'var(--shadow-sm)'
};

const inputStyle = {
  padding: '6px 10px',
  borderRadius: '8px',
  border: '1px solid var(--glass-border)',
  background: 'var(--bg-card)',
  color: 'var(--text-main)',
  fontSize: '12px',
  fontWeight: 600
};

const btnIconStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '7px 12px',
  borderRadius: '8px',
  border: '1px solid var(--glass-border)',
  background: 'transparent',
  color: 'var(--text-main)',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 700
};

export default Reports;
