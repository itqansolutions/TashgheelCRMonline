import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, Calendar,
  Filter, Printer, RefreshCw, ChevronRight, FileText, ArrowDownLeft,
  ArrowUpRight, AlertTriangle, Users, Wallet, Building2, CheckCircle2,
  Clock, ShieldAlert, PieChart, Layers
} from 'lucide-react';

// ─── Formatting Helpers ───────────────────────────────────────────────────────
const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const METHOD_LABELS = {
  cash: 'Cash / نقدي',
  bank_transfer: 'Bank Transfer / تحويل بنكي',
  card: 'Card / بطاقة',
  check: 'Check / شيك',
};

const AGING_COLORS = {
  current: '#22c55e',
  days_1_30: '#f59e0b',
  days_31_60: '#f97316',
  days_61_90: '#ef4444',
  days_90_plus: '#dc2626',
};

// ─── Main Reports Component ───────────────────────────────────────────────────
const Reports = ({ onSelectCustomer }) => {
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
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      if (branchId && branchId !== 'all') params.append('branch_id', branchId);

      const res = await api.get(`/finance/reports?${params.toString()}`);
      setData(res.data);
    } catch (err) {
      toast.error('Failed to load financial intelligence data');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, branchId]);

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
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>Financial Intelligence</h2>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
            Real-time executive metrics derived directly from transactions
          </p>
        </div>

        {/* Filters Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          {/* Preset Buttons */}
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.03)', padding: '3px', borderRadius: '9px' }}>
            {[
              { id: 'today', label: 'Today' },
              { id: 'this_month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'this_year', label: 'This Year' },
              { id: 'all', label: 'All Time' },
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
              <option value="all">All Branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}

          <button onClick={fetchReports} style={btnIconStyle} title="Refresh Data">
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>

          <button onClick={handlePrint} style={{ ...btnIconStyle, gap: '6px' }} title="Print / Export">
            <Printer size={14} /> Print
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
          { id: 'overview', label: 'Executive Overview', icon: <Layers size={15} /> },
          { id: 'sales', label: '1. Sales & Invoices', icon: <FileText size={15} /> },
          { id: 'collections', label: '2. Collections', icon: <TrendingUp size={15} /> },
          { id: 'expenses', label: '3. Expenses', icon: <TrendingDown size={15} /> },
          { id: 'aging', label: '4. Receivables & Aging', icon: <Clock size={15} /> },
          { id: 'cashflow', label: '5. Cash Flow', icon: <DollarSign size={15} /> },
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
          <div style={{ fontWeight: 700 }}>Calculating Financial Intelligence...</div>
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
                  { label: 'Total Sales (Invoiced)', value: overview?.total_invoiced, color: '#6366f1', icon: <FileText size={18} />, sub: `${overview?.invoices_count || 0} Invoices Issued` },
                  { label: 'Total Collections', value: overview?.total_collected, color: '#10b981', icon: <ArrowDownLeft size={18} />, sub: `${overview?.collections_count || 0} Payments Received` },
                  { label: 'Receivables (لينا عند العملاء)', value: overview?.total_receivables, color: '#f59e0b', icon: <Users size={18} />, sub: `Overdue: ${fmt(overview?.total_overdue_receivables)} EGP` },
                  { label: 'Payables (علينا للموردين)', value: overview?.total_payables, color: '#ef4444', icon: <Building2 size={18} />, sub: `Overdue: ${fmt(overview?.total_overdue_payables)} EGP` },
                  {
                    label: 'Net Position (لينا − علينا)',
                    value: overview?.net_position,
                    color: (overview?.net_position || 0) >= 0 ? '#10b981' : '#dc2626',
                    icon: <CheckCircle2 size={18} />,
                    sub: (overview?.net_position || 0) >= 0 ? 'Positive Equity (+Receivables)' : 'Negative Position (−Payables)'
                  },
                  {
                    label: 'Net Cash Flow (معانا سيولة)',
                    value: overview?.net_cashflow,
                    color: (overview?.net_cashflow || 0) >= 0 ? '#10b981' : '#dc2626',
                    icon: <DollarSign size={18} />,
                    sub: `In: ${fmt(overview?.total_collected)} | Out: ${fmt(overview?.total_outflow)}`
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
                      {fmt(card.value)} <span style={{ fontSize: '12px' }}>EGP</span>
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
                    <div style={{ fontWeight: 800, fontSize: '14px' }}>Cash In vs Cash Out</div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>Liquidity Velocity</span>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                      <span style={{ color: '#10b981' }}>Collections (In): {fmt(overview?.total_collected)} EGP</span>
                      <span style={{ color: '#ef4444' }}>Outflow (Out): {fmt(overview?.total_outflow)} EGP</span>
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
                      <span>Customer Collections</span>
                      <span>Expenses: {fmt(overview?.total_expenses)} + Vendors: {fmt(overview?.total_vendor_payments)}</span>
                    </div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.02)', padding: '12px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700 }}>Net Cash Position:</span>
                    <span style={{ fontSize: '15px', fontWeight: 900, color: (overview?.net_cashflow || 0) >= 0 ? '#10b981' : '#dc2626' }}>
                      {(overview?.net_cashflow || 0) >= 0 ? '+' : ''}{fmt(overview?.net_cashflow)} EGP
                    </span>
                  </div>
                </div>

                {/* 2. Receivables Aging Distribution */}
                <div style={cardBoxStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div style={{ fontWeight: 800, fontSize: '14px' }}>Receivables Aging Summary</div>
                    <button
                      onClick={() => setActiveReportTab('aging')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 800, color: 'var(--primary)' }}
                    >
                      View Details →
                    </button>
                  </div>

                  {/* Stacked bar */}
                  <div style={{ height: '10px', borderRadius: '6px', overflow: 'hidden', display: 'flex', background: 'var(--glass-border)', marginBottom: '14px' }}>
                    {Object.entries(receivables_aging?.buckets || {}).filter(([k]) => k !== 'total').map(([bucket, amount]) => {
                      const pct = receivables_aging?.buckets?.total > 0 ? (amount / receivables_aging.buckets.total) * 100 : 0;
                      if (pct <= 0) return null;
                      return (
                        <div key={bucket} style={{ width: `${pct}%`, background: AGING_COLORS[bucket] }} title={`${bucket}: ${fmt(amount)} EGP`} />
                      );
                    })}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '11px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: AGING_COLORS.current }} />
                      <span style={{ color: 'var(--text-muted)' }}>Current:</span>
                      <strong>{fmt(receivables_aging?.buckets?.current)}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: AGING_COLORS.days_1_30 }} />
                      <span style={{ color: 'var(--text-muted)' }}>1–30d:</span>
                      <strong>{fmt(receivables_aging?.buckets?.days_1_30)}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: AGING_COLORS.days_31_60 }} />
                      <span style={{ color: 'var(--text-muted)' }}>31–60d:</span>
                      <strong>{fmt(receivables_aging?.buckets?.days_31_60)}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: AGING_COLORS.days_90_plus }} />
                      <span style={{ color: 'var(--text-muted)' }}>90d+:</span>
                      <strong style={{ color: '#dc2626' }}>{fmt(receivables_aging?.buckets?.days_90_plus)}</strong>
                    </div>
                  </div>
                </div>

                {/* 3. Top Debtors Quick List */}
                <div style={cardBoxStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontWeight: 800, fontSize: '14px' }}>Top Outstanding Accounts</div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{receivables_aging?.total_debtors_count || 0} Clients</span>
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
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{debtor.invoice_count} unpaid invoices</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, fontSize: '13px', color: '#ef4444' }}>{fmt(debtor.total_outstanding)} EGP</div>
                          {debtor.overdue_amount > 0 && (
                            <div style={{ fontSize: '10px', color: '#dc2626' }}>Overdue: {fmt(debtor.overdue_amount)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                    {(receivables_aging?.top_debtors || []).length === 0 && (
                      <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px' }}>
                        All receivables settled! Zero outstanding.
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
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800 }}>Invoice Status & Performance Breakdown</h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '24px' }}>
                  {(sales?.by_status || []).map(st => (
                    <div key={st.status} style={{ border: '1px solid var(--glass-border)', padding: '14px', borderRadius: '10px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{st.status}</div>
                      <div style={{ fontSize: '20px', fontWeight: 900, margin: '4px 0' }}>{fmt(st.total_amount)} <span style={{ fontSize: '11px' }}>EGP</span></div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{st.count} Invoices</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '10px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--primary)' }}>Overall Collection Rate</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Paid amount vs total billed for this period</div>
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--primary)' }}>
                    {overview?.total_invoiced > 0
                      ? Math.round((overview.total_collected / overview.total_invoiced) * 100)
                      : 0}%
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
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800 }}>Collections by Payment Method</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(collections?.by_method || []).map(m => {
                      const pct = collections.total_collected > 0 ? (m.total_amount / collections.total_collected) * 100 : 0;
                      return (
                        <div key={m.method}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>
                            <span>{METHOD_LABELS[m.method] || m.method}</span>
                            <span>{fmt(m.total_amount)} EGP ({Math.round(pct)}%)</span>
                          </div>
                          <div style={{ height: '8px', borderRadius: '4px', background: 'var(--glass-border)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: '#10b981', width: `${pct}%` }} />
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{m.count} transactions</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Collections Trend */}
                <div style={cardBoxStyle}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800 }}>Monthly Collections Trend</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(collections?.trend || []).map(tr => (
                      <div key={tr.period} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px' }}>{tr.period}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tr.count} receipts</span>
                        <strong style={{ color: '#10b981', fontSize: '14px' }}>{fmt(tr.total_amount)} EGP</strong>
                      </div>
                    ))}
                    {(collections?.trend || []).length === 0 && (
                      <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No collections in selected period</div>
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
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800 }}>Expenses by Category</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(expenses?.by_category || []).map(cat => {
                      const pct = expenses.total_expenses > 0 ? (cat.total_amount / expenses.total_expenses) * 100 : 0;
                      return (
                        <div key={cat.category}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>
                            <span>{cat.category}</span>
                            <span style={{ color: '#ef4444' }}>{fmt(cat.total_amount)} EGP ({Math.round(pct)}%)</span>
                          </div>
                          <div style={{ height: '8px', borderRadius: '4px', background: 'var(--glass-border)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: '#ef4444', width: `${pct}%` }} />
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{cat.count} expenses</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Expenses Trend */}
                <div style={cardBoxStyle}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800 }}>Monthly Outflow Trend</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(expenses?.trend || []).map(tr => (
                      <div key={tr.period} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px' }}>{tr.period}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tr.count} entries</span>
                        <strong style={{ color: '#ef4444', fontSize: '14px' }}>{fmt(tr.total_amount)} EGP</strong>
                      </div>
                    ))}
                    {(expenses?.trend || []).length === 0 && (
                      <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No expenses recorded in selected period</div>
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
                  { label: 'Current (Not Due)', value: receivables_aging?.buckets?.current, color: AGING_COLORS.current },
                  { label: '1–30 Days Overdue', value: receivables_aging?.buckets?.days_1_30, color: AGING_COLORS.days_1_30 },
                  { label: '31–60 Days Overdue', value: receivables_aging?.buckets?.days_31_60, color: AGING_COLORS.days_31_60 },
                  { label: '61–90 Days Overdue', value: receivables_aging?.buckets?.days_61_90, color: AGING_COLORS.days_61_90 },
                  { label: '90+ Days Critical', value: receivables_aging?.buckets?.days_90_plus, color: AGING_COLORS.days_90_plus },
                ].map(b => (
                  <div key={b.label} style={{ background: 'var(--bg-card)', border: `1.5px solid ${b.color}40`, borderRadius: '12px', padding: '14px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px' }}>{b.label}</div>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: b.color }}>{fmt(b.value)} <span style={{ fontSize: '10px' }}>EGP</span></div>
                  </div>
                ))}
              </div>

              {/* Debtors List with Direct Statement Drilldown */}
              <div style={cardBoxStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Clients with Outstanding Receivables</h3>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>Click any client row to open their full statement</p>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 800 }}>Total: {fmt(receivables_aging?.buckets?.total)} EGP</span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                        {['Customer Name', 'Phone', 'Unpaid Invoices', 'Total Outstanding', 'Overdue Amount', 'Action'].map((h, i) => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: i >= 3 ? 'right' : 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', borderBottom: '1px solid var(--glass-border)' }}>
                            {h}
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
                          <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{debtor.customer_phone || '—'}</td>
                          <td style={{ padding: '12px 14px' }}>{debtor.invoice_count}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#f59e0b' }}>{fmt(debtor.total_outstanding)} EGP</td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, color: debtor.overdue_amount > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                            {debtor.overdue_amount > 0 ? `${fmt(debtor.overdue_amount)} EGP` : '—'}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              Statement <ChevronRight size={13} />
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
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#10b981', textTransform: 'uppercase' }}>Total Inflow (Collections)</div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>+{fmt(cashflow?.inflow)} EGP</div>
                </div>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '18px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase' }}>Total Outflow (Expenses)</div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#ef4444', marginTop: '4px' }}>−{fmt(cashflow?.outflow)} EGP</div>
                </div>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '18px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net Cash Position</div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: (cashflow?.net || 0) >= 0 ? '#10b981' : '#dc2626', marginTop: '4px' }}>
                    {(cashflow?.net || 0) >= 0 ? '+' : ''}{fmt(cashflow?.net)} EGP
                  </div>
                </div>
              </div>

              {/* By Treasury Account */}
              <div style={cardBoxStyle}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800 }}>Cash Flow by Treasury Account (Cashboxes & Banks)</h3>
                
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                        {['Account Name', 'Type', 'Inflow (+)', 'Outflow (−)', 'Net Change'].map((h, i) => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: i >= 2 ? 'right' : 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', borderBottom: '1px solid var(--glass-border)' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(cashflow?.by_treasury_account || []).map(acc => (
                        <tr key={acc.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                          <td style={{ padding: '12px 14px', fontWeight: 700 }}>
                            {acc.name}
                            {acc.bank_name && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>({acc.bank_name})</span>}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '12px', background: acc.type === 'bank' ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)', color: acc.type === 'bank' ? '#3b82f6' : '#10b981' }}>
                              {acc.type === 'bank' ? 'Bank' : 'Cashbox'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#10b981' }}>+{fmt(acc.inflow)} EGP</td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>−{fmt(acc.outflow)} EGP</td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, color: acc.net >= 0 ? '#10b981' : '#dc2626' }}>
                            {acc.net >= 0 ? '+' : ''}{fmt(acc.net)} EGP
                          </td>
                        </tr>
                      ))}
                      {(cashflow?.by_treasury_account || []).length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                            No movements across treasury accounts during this period
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
