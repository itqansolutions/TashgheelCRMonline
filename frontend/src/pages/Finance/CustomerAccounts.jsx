import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { isInvalidDateRange } from '../../utils/dateRange';
import toast from 'react-hot-toast';
import {
  Users, AlertTriangle, Clock, TrendingUp, Search, ChevronRight,
  X, FileText, ArrowDownLeft, Calendar, Filter, Printer,
  RefreshCw
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_CONFIG = {
  overdue:     { bg: '#fef2f2', color: '#dc2626', dot: '#ef4444' },
  outstanding: { bg: '#fffbeb', color: '#d97706', dot: '#f59e0b' },
  clear:       { bg: '#f0fdf4', color: '#16a34a', dot: '#22c55e' },
};

const Badge = ({ status }) => {
  const { t } = useLanguage();
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.clear;
  const label = t(`finance.customerAccounts.statuses.${status}`, status);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
      background: cfg.bg, color: cfg.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
      {label}
    </span>
  );
};

// ─── Aging Chart ──────────────────────────────────────────────────────────────
const AgingBar = ({ aging }) => {
  const { t } = useLanguage();
  if (!aging) return null;
  const buckets = [
    { label: t('finance.customerAccounts.aging.current'),     value: aging.current,       color: '#22c55e' },
    { label: t('finance.customerAccounts.aging.days_1_30'),   value: aging.days_1_30,     color: '#f59e0b' },
    { label: t('finance.customerAccounts.aging.days_31_60'),  value: aging.days_31_60,    color: '#f97316' },
    { label: t('finance.customerAccounts.aging.days_61_90'),  value: aging.days_61_90,    color: '#ef4444' },
    { label: t('finance.customerAccounts.aging.days_90_plus'), value: aging.days_90_plus, color: '#dc2626' },
  ];
  const total = aging.total || 1;

  return (
    <div style={{ marginTop: '24px' }}>
      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>
        {t('finance.customerAccounts.aging.title')}
      </div>
      {/* Stacked bar */}
      <div style={{ display: 'flex', height: '10px', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px', background: 'var(--glass-border)' }}>
        {buckets.map(b => b.value > 0 && (
          <div key={b.label} style={{ width: `${(b.value / total) * 100}%`, background: b.color }} title={`${b.label}: ${fmt(b.value)} ${t('common.currency', 'EGP')}`} />
        ))}
      </div>
      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {buckets.map(b => (
          <div key={b.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{b.label}</span>
            </div>
            <span style={{ fontWeight: 700, fontSize: '14px', color: b.value > 0 ? b.color : 'var(--text-muted)' }}>
              <span className="num-en">{fmt(b.value)}</span> {t('common.currency', 'EGP')}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--glass-border)', paddingTop: '8px', marginTop: '4px' }}>
          <span style={{ fontWeight: 800, fontSize: '13px' }}>{t('finance.customerAccounts.aging.totalOutstanding')}</span>
          <span style={{ fontWeight: 900, fontSize: '15px', color: '#ef4444' }}>
            <span className="num-en">{fmt(aging.total)}</span> {t('common.currency', 'EGP')}
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── Customer Statement Drawer ─────────────────────────────────────────────────
const StatementDrawer = ({ customerId, onClose }) => {
  const { t, isRTL } = useLanguage();
  const [data, setData]       = useState(null);
  const [aging, setAging]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [view, setView]         = useState('statement'); // 'statement' | 'aging'

  const load = useCallback(async () => {
    if (isInvalidDateRange(dateFrom, dateTo)) {
      toast.error(t('common.invalidDateRange'), { id: 'invalid-date-range' });
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo)   params.append('date_to',   dateTo);

      const [stRes, agRes] = await Promise.all([
        api.get(`/finance/customers/${customerId}/statement?${params}`),
        api.get(`/finance/customers/${customerId}/aging`),
      ]);
      setData(stRes.data);
      setAging(agRes.data.aging);
    } catch (err) {
      toast.error(t('finance.customerAccounts.messages.statementLoadError'));
    } finally {
      setLoading(false);
    }
  }, [customerId, dateFrom, dateTo, t]);

  useEffect(() => { load(); }, [load]);

  const handlePrint = () => window.print();

  const currentDrawerStyle = {
    position: 'fixed',
    top: 0,
    ...(isRTL ? { left: 0 } : { right: 0 }),
    bottom: 0,
    width: 'min(600px, 95vw)',
    background: 'var(--bg-card)',
    ...(isRTL ? { borderRight: '1px solid var(--glass-border)' } : { borderLeft: '1px solid var(--glass-border)' }),
    boxShadow: isRTL ? '20px 0 60px rgba(0,0,0,0.12)' : '-20px 0 60px rgba(0,0,0,0.12)',
    zIndex: 1200,
    overflowY: 'auto',
    padding: '28px 24px',
    display: 'flex',
    flexDirection: 'column',
    direction: isRTL ? 'rtl' : 'ltr',
  };

  if (loading) return (
    <div style={currentDrawerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '12px' }}>
        <RefreshCw size={28} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{t('finance.customerAccounts.drawer.loading')}</span>
      </div>
    </div>
  );

  const { customer, summary, statement } = data || {};

  return (
    <div style={currentDrawerStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
            {t('finance.customerAccounts.drawer.title')}
          </div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>{customer?.name}</h2>
          {customer?.phone && (
            <div className="num-en" dir="ltr" style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', textAlign: isRTL ? 'right' : 'left' }}>
              {customer.phone}
            </div>
          )}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
          <X size={20} />
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
        {[
          { label: t('finance.customerAccounts.drawer.totalInvoiced'), value: summary?.total_invoiced, color: '#6366f1' },
          { label: t('finance.customerAccounts.drawer.totalPaid'),     value: summary?.total_paid,     color: '#10b981' },
          { label: t('finance.customerAccounts.drawer.outstanding'),    value: summary?.outstanding,    color: '#f59e0b' },
          { label: t('finance.customerAccounts.drawer.overdue'),        value: summary?.overdue,        color: '#ef4444' },
        ].map(card => (
          <div key={card.label} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{card.label}</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: card.color }}>
              <span className="num-en">{fmt(card.value)}</span> <span style={{ fontSize: '11px' }}>{t('common.currency', 'EGP')}</span>
            </div>
          </div>
        ))}
      </div>

      {/* View Toggle */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', background: 'rgba(0,0,0,0.03)', padding: '3px', borderRadius: '8px', width: 'fit-content' }}>
        {[
          { id: 'statement', label: t('finance.customerAccounts.drawer.tabs.statement') },
          { id: 'aging',     label: t('finance.customerAccounts.drawer.tabs.aging') },
        ].map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            padding: '6px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px',
            background: view === v.id ? 'white' : 'transparent',
            color: view === v.id ? 'var(--primary)' : 'var(--text-muted)',
            boxShadow: view === v.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
          }}>
            {v.label}
          </button>
        ))}
      </div>

      {view === 'statement' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
              <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={inputStyle} placeholder={t('finance.customerAccounts.drawer.from')} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
              <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={inputStyle} placeholder={t('finance.customerAccounts.drawer.to')} />
            </div>
            <button onClick={load} style={{ ...btnStyle, background: 'rgba(99,102,241,0.1)', color: 'var(--primary)' }}>
              <Filter size={14} /> {t('finance.customerAccounts.drawer.apply')}
            </button>
            <button onClick={handlePrint} style={{ ...btnStyle }}>
              <Printer size={14} /> {t('finance.customerAccounts.drawer.print')}
            </button>
          </div>

          {/* Ledger Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                  {[
                    { key: 'date',      label: t('finance.customerAccounts.drawer.table.date'),      align: isRTL ? 'right' : 'left' },
                    { key: 'type',      label: t('finance.customerAccounts.drawer.table.type'),      align: isRTL ? 'right' : 'left' },
                    { key: 'reference', label: t('finance.customerAccounts.drawer.table.reference'), align: isRTL ? 'right' : 'left' },
                    { key: 'debit',     label: t('finance.customerAccounts.drawer.table.debit'),     align: isRTL ? 'left' : 'right' },
                    { key: 'credit',    label: t('finance.customerAccounts.drawer.table.credit'),    align: isRTL ? 'left' : 'right' },
                    { key: 'balance',   label: t('finance.customerAccounts.drawer.table.balance'),   align: isRTL ? 'left' : 'right' },
                  ].map(h => (
                    <th key={h.key} style={{ padding: '10px 12px', textAlign: h.align, fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--glass-border)', whiteSpace: 'nowrap' }}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(!statement || statement.length === 0) ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      {t('finance.customerAccounts.drawer.table.empty')}
                    </td>
                  </tr>
                ) : statement.map((txn, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      <span className="num-en">{fmtDate(txn.txn_date)}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700,
                        color: txn.txn_type === 'Invoice' ? '#6366f1' : '#10b981' }}>
                        {txn.txn_type === 'Invoice' ? <FileText size={12} /> : <ArrowDownLeft size={12} />}
                        {txn.txn_type === 'Invoice' ? t('finance.customerAccounts.drawer.table.invoice') : t('finance.customerAccounts.drawer.table.receipt')}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, fontFamily: 'monospace' }}>
                      <span className="num-en">{txn.reference}</span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: isRTL ? 'left' : 'right', fontWeight: 700, color: txn.debit > 0 ? '#6366f1' : 'var(--text-muted)' }}>
                      {txn.debit > 0 ? <span className="num-en">{fmt(txn.debit)}</span> : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: isRTL ? 'left' : 'right', fontWeight: 700, color: txn.credit > 0 ? '#10b981' : 'var(--text-muted)' }}>
                      {txn.credit > 0 ? <span className="num-en">{fmt(txn.credit)}</span> : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: isRTL ? 'left' : 'right', fontWeight: 900,
                      color: txn.balance > 0 ? '#ef4444' : txn.balance < 0 ? '#10b981' : 'var(--text-muted)' }}>
                      <span className="num-en">{fmt(Math.abs(txn.balance))}</span> {t('common.currency', 'EGP')}
                      {txn.balance < 0 && <span style={{ fontSize: '10px', marginInlineStart: '4px', color: '#10b981' }}>{t('finance.customerAccounts.drawer.table.creditShort')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {statement && statement.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'rgba(0,0,0,0.02)', borderTop: '2px solid var(--glass-border)' }}>
                    <td colSpan={3} style={{ padding: '12px', fontWeight: 800 }}>{t('finance.customerAccounts.drawer.table.closingBalance')}</td>
                    <td colSpan={3} style={{ padding: '12px', textAlign: isRTL ? 'left' : 'right', fontWeight: 900, fontSize: '16px',
                      color: summary?.outstanding > 0 ? '#ef4444' : '#10b981' }}>
                      <span className="num-en">{fmt(summary?.outstanding)}</span> {t('common.currency', 'EGP')}
                      {summary?.outstanding > 0 ? ` ${t('finance.customerAccounts.drawer.table.due')}` : ` — ${t('finance.customerAccounts.drawer.table.settled')}`}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}

      {view === 'aging' && <AgingBar aging={aging} />}
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const inputStyle = {
  flex: 1, padding: '7px 10px', borderRadius: '7px',
  border: '1px solid var(--glass-border)', background: 'var(--bg-card)',
  color: 'var(--text-main)', fontSize: '13px',
};
const btnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  padding: '7px 12px', borderRadius: '7px',
  border: '1px solid var(--glass-border)',
  background: 'transparent', color: 'var(--text-main)',
  cursor: 'pointer', fontSize: '13px', fontWeight: 700,
};

// ─── Main CustomerAccounts Component ──────────────────────────────────────────
const CustomerAccounts = () => {
  const { t, isRTL } = useLanguage();
  const [customers, setCustomers]           = useState([]);
  const [kpi, setKpi]                       = useState(null);
  const [loading, setLoading]               = useState(true);
  const [search, setSearch]                 = useState('');
  const [statusFilter, setStatusFilter]     = useState('all'); // 'all' | 'overdue' | 'outstanding' | 'clear'
  
  // Read customer_id from URL if navigated from Reports
  const initialCustomerId = new URLSearchParams(window.location.search).get('customer_id') || null;
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomerId);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/finance/customers');
      setCustomers(res.data.data || []);
      setKpi(res.data.kpi || null);
    } catch (err) {
      toast.error(t('finance.customerAccounts.messages.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  // Filtering
  const filtered = customers.filter(c => {
    const matchSearch = !search ||
      c.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.customer_phone?.includes(search) ||
      c.customer_email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.account_status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <>
      {/* Overlay */}
      {selectedCustomerId && (
        <>
          <div
            onClick={() => setSelectedCustomerId(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1199, backdropFilter: 'blur(3px)' }}
          />
          <StatementDrawer
            customerId={selectedCustomerId}
            onClose={() => setSelectedCustomerId(null)}
          />
        </>
      )}

      {/* KPI Row */}
      {kpi && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
          {[
            { label: t('finance.customerAccounts.kpi.totalReceivables'),         value: kpi.totalReceivables,         color: '#6366f1', icon: <TrendingUp size={18} /> },
            { label: t('finance.customerAccounts.kpi.overdue'),                   value: kpi.totalOverdue,             color: '#ef4444', icon: <AlertTriangle size={18} /> },
            { label: t('finance.customerAccounts.kpi.dueThisMonth'),            value: kpi.dueThisMonth,             color: '#f59e0b', icon: <Clock size={18} /> },
            { label: t('finance.customerAccounts.kpi.customersWithOutstanding'), value: kpi.customersWithOutstanding,  color: '#3b82f6', icon: <Users size={18} />, isCount: true },
          ].map(card => (
            <div key={card.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '16px 18px', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{card.label}</div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: card.color }}>
                  {card.isCount ? (
                    <span className="num-en">{card.value}</span>
                  ) : (
                    <>
                      <span className="num-en">{fmt(card.value)}</span> {t('common.currency', 'EGP')}
                    </>
                  )}
                </div>
              </div>
              <div style={{ width: 38, height: 38, borderRadius: '9px', background: `${card.color}18`, color: card.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {card.icon}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1', minWidth: '220px', maxWidth: '340px' }}>
          <Search size={14} style={{ position: 'absolute', ...(isRTL ? { right: '10px' } : { left: '10px' }), top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('finance.customerAccounts.table.searchPlaceholder')}
            style={{
              ...inputStyle,
              width: '100%',
              ...(isRTL ? { paddingRight: '32px', paddingLeft: '10px' } : { paddingLeft: '32px', paddingRight: '10px' })
            }}
          />
        </div>

        {/* Status Filter */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {['all', 'overdue', 'outstanding', 'clear'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '6px 14px', borderRadius: '7px', border: '1px solid',
              cursor: 'pointer', fontSize: '12px', fontWeight: 700,
              borderColor: statusFilter === s ? 'var(--primary)' : 'var(--glass-border)',
              background: statusFilter === s ? 'var(--primary)' : 'transparent',
              color: statusFilter === s ? 'white' : 'var(--text-muted)',
            }}>
              {s === 'all' ? t('finance.customerAccounts.table.filterAll') : t(`finance.customerAccounts.statuses.${s}`, s)}
            </button>
          ))}
        </div>
      </div>

      {/* Customer Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} style={{ marginBottom: '8px', opacity: 0.5, animation: 'spin 1s linear infinite' }} />
          <div>{t('finance.customerAccounts.table.loading')}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          <Users size={40} style={{ opacity: 0.2, marginBottom: '12px' }} />
          <div style={{ fontWeight: 700 }}>{t('finance.customerAccounts.table.empty')}</div>
          <div style={{ fontSize: '13px', marginTop: '4px' }}>{t('finance.customerAccounts.table.emptySubtitle')}</div>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '14px', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.025)' }}>
                {[
                  { key: 'customer',      label: t('finance.customerAccounts.table.customer'),      numeric: false },
                  { key: 'totalInvoiced', label: t('finance.customerAccounts.table.totalInvoiced'), numeric: true },
                  { key: 'totalPaid',     label: t('finance.customerAccounts.table.totalPaid'),     numeric: true },
                  { key: 'outstanding',   label: t('finance.customerAccounts.table.outstanding'),   numeric: true },
                  { key: 'overdue',       label: t('finance.customerAccounts.table.overdue'),       numeric: true },
                  { key: 'lastActivity',  label: t('finance.customerAccounts.table.lastActivity'),  numeric: false },
                  { key: 'status',        label: t('finance.customerAccounts.table.status'),        numeric: false },
                  { key: 'actions',       label: '',                                                numeric: false },
                ].map(h => (
                  <th key={h.key} style={{
                    padding: '12px 16px',
                    textAlign: h.numeric ? (isRTL ? 'left' : 'right') : (isRTL ? 'right' : 'left'),
                    fontWeight: 800,
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--glass-border)',
                    whiteSpace: 'nowrap'
                  }}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, idx) => (
                <tr
                  key={c.customer_id}
                  onClick={() => setSelectedCustomerId(c.customer_id)}
                  style={{
                    borderBottom: '1px solid var(--glass-border)',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.008)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.008)'}
                >
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ fontWeight: 700, marginBottom: '1px' }}>{c.customer_name}</div>
                    {c.customer_phone && (
                      <div className="num-en" dir="ltr" style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: isRTL ? 'right' : 'left' }}>
                        {c.customer_phone}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '13px 16px', textAlign: isRTL ? 'left' : 'right', fontWeight: 700, color: '#6366f1' }}>
                    <span className="num-en">{fmt(c.total_invoiced)}</span>
                  </td>
                  <td style={{ padding: '13px 16px', textAlign: isRTL ? 'left' : 'right', fontWeight: 700, color: '#10b981' }}>
                    <span className="num-en">{fmt(c.total_paid)}</span>
                  </td>
                  <td style={{ padding: '13px 16px', textAlign: isRTL ? 'left' : 'right', fontWeight: 700, color: parseFloat(c.outstanding) > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
                    <span className="num-en">{fmt(c.outstanding)}</span>
                  </td>
                  <td style={{ padding: '13px 16px', textAlign: isRTL ? 'left' : 'right', fontWeight: 700, color: parseFloat(c.overdue) > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                    {parseFloat(c.overdue) > 0 ? <span className="num-en">{fmt(c.overdue)}</span> : '—'}
                  </td>
                  <td style={{ padding: '13px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    <span className="num-en">{fmtDate(c.last_transaction)}</span>
                  </td>
                  <td style={{ padding: '13px 16px' }}><Badge status={c.account_status} /></td>
                  <td style={{ padding: '13px 16px', textAlign: isRTL ? 'left' : 'right' }}>
                    <ChevronRight size={16} style={{ color: 'var(--text-muted)', transform: isRTL ? 'scaleX(-1)' : 'none' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--glass-border)', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
            {t('finance.customerAccounts.table.showingCount', { count: filtered.length, total: customers.length })}
          </div>
        </div>
      )}
    </>
  );
};

export default CustomerAccounts;
