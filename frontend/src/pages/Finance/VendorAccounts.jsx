import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Building2, DollarSign, Clock, AlertTriangle, Search,
  X, Printer, RefreshCw,
  Plus
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const AGING_COLORS = {
  current: '#22c55e',
  days_1_30: '#f59e0b',
  days_31_60: '#f97316',
  days_61_90: '#ef4444',
  days_90_plus: '#dc2626',
};

// ─── Payables Aging Bar ───────────────────────────────────────────────────────
const AgingBar = ({ aging }) => {
  const { t } = useLanguage();
  if (!aging) return null;
  const buckets = [
    { key: 'current',      label: t('finance.vendorAccounts.aging.current'),      amount: aging.current,      color: AGING_COLORS.current },
    { key: 'days_1_30',    label: t('finance.vendorAccounts.aging.days_1_30'),    amount: aging.days_1_30,    color: AGING_COLORS.days_1_30 },
    { key: 'days_31_60',   label: t('finance.vendorAccounts.aging.days_31_60'),   amount: aging.days_31_60,   color: AGING_COLORS.days_31_60 },
    { key: 'days_61_90',   label: t('finance.vendorAccounts.aging.days_61_90'),   amount: aging.days_61_90,   color: AGING_COLORS.days_61_90 },
    { key: 'days_90_plus', label: t('finance.vendorAccounts.aging.days_90_plus'), amount: aging.days_90_plus, color: AGING_COLORS.days_90_plus },
  ];
  const total = aging.total || 1;

  return (
    <div style={{ marginTop: '16px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '16px' }}>
      <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
        {t('finance.vendorAccounts.aging.title')}
      </div>
      <div style={{ height: '10px', borderRadius: '6px', overflow: 'hidden', display: 'flex', background: 'var(--glass-border)', marginBottom: '12px' }}>
        {buckets.map(b => {
          const pct = (b.amount / total) * 100;
          if (pct <= 0) return null;
          return <div key={b.key} style={{ width: `${pct}%`, background: b.color }} title={`${b.label}: ${fmt(b.amount)} ${t('common.currency', 'EGP')}`} />;
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
        {buckets.map(b => (
          <div key={b.key} style={{ textAlign: 'center', background: 'rgba(0,0,0,0.02)', padding: '6px', borderRadius: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: b.color }}>{b.label}</div>
            <div style={{ fontSize: '12px', fontWeight: 800 }}>
              <span className="num-en">{fmt(b.amount)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Record Vendor Payment Modal ──────────────────────────────────────────────
const RecordPaymentModal = ({ vendor, onClose, onPaid }) => {
  const { t, isRTL } = useLanguage();
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [treasuryAccountId, setTreasuryAccountId] = useState('');
  const [treasuryAccounts, setTreasuryAccounts] = useState([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/finance/treasury/accounts').then(res => {
      const accs = res.data?.data || [];
      setTreasuryAccounts(accs);
      const def = accs.find(a => a.is_default && a.type === (paymentMethod === 'bank_transfer' ? 'bank' : 'cash'));
      if (def) setTreasuryAccountId(def.id);
    }).catch(() => {});
  }, [paymentMethod]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      toast.error(t('finance.vendorAccounts.recordPaymentModal.validationAmount'));
      return;
    }
    setLoading(true);
    try {
      await api.post(`/finance/vendors/${vendor.id || vendor.vendor_id}/payments`, {
        amount: parseFloat(amount),
        payment_method: paymentMethod,
        treasury_account_id: treasuryAccountId ? parseInt(treasuryAccountId) : null,
        notes: notes || t('finance.vendorAccounts.recordPaymentModal.defaultNotes', { name: vendor.name || vendor.vendor_name })
      });
      toast.success(t('finance.vendorAccounts.recordPaymentModal.success'));
      onPaid();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('finance.vendorAccounts.recordPaymentModal.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', width: 'min(440px, 95vw)', boxShadow: '0 20px 50px rgba(0,0,0,0.25)', direction: isRTL ? 'rtl' : 'ltr' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>
              {t('finance.vendorAccounts.recordPaymentModal.title', { name: vendor.name || vendor.vendor_name })}
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {t('finance.vendorAccounts.recordPaymentModal.subtitle')}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>{t('finance.vendorAccounts.recordPaymentModal.amount')}</label>
            <input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={t('finance.vendorAccounts.recordPaymentModal.amountPlaceholder')}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>{t('finance.vendorAccounts.recordPaymentModal.paymentMethod')}</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={inputStyle}>
              <option value="cash">{t('finance.vendorAccounts.recordPaymentModal.methods.cash')}</option>
              <option value="bank_transfer">{t('finance.vendorAccounts.recordPaymentModal.methods.bank_transfer')}</option>
              <option value="check">{t('finance.vendorAccounts.recordPaymentModal.methods.check')}</option>
              <option value="card">{t('finance.vendorAccounts.recordPaymentModal.methods.card')}</option>
            </select>
          </div>

          {treasuryAccounts.length > 0 && (
            <div>
              <label style={labelStyle}>{t('finance.vendorAccounts.recordPaymentModal.deductTreasury')}</label>
              <select value={treasuryAccountId} onChange={e => setTreasuryAccountId(e.target.value)} style={inputStyle}>
                <option value="">{t('finance.vendorAccounts.recordPaymentModal.defaultAccount')}</option>
                {treasuryAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type === 'bank' ? t('finance.vendorAccounts.recordPaymentModal.bank') : t('finance.vendorAccounts.recordPaymentModal.cashbox')}) — {fmt(a.current_balance)} {t('common.currency', 'EGP')}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>{t('finance.vendorAccounts.recordPaymentModal.notes')}</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={t('finance.vendorAccounts.recordPaymentModal.notesPlaceholder')}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <button type="button" onClick={onClose} style={{ ...btnStyle, flex: 1, justifyContent: 'center' }}>
              {t('finance.vendorAccounts.recordPaymentModal.cancel')}
            </button>
            <button type="submit" disabled={loading} style={{ ...btnStyle, flex: 2, background: 'var(--primary)', color: 'white', border: 'none', justifyContent: 'center' }}>
              {loading ? t('finance.vendorAccounts.recordPaymentModal.processing') : t('finance.vendorAccounts.recordPaymentModal.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Vendor Statement Drawer ──────────────────────────────────────────────────
const VendorStatementDrawer = ({ vendorId, onClose, onPaymentRecorded }) => {
  const { hasFinancialPermission } = useAuth();
  const { t, isRTL } = useLanguage();
  const [statementData, setStatementData] = useState(null);
  const [agingData, setAgingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('statement'); // 'statement' | 'aging'
  const [showPayModal, setShowPayModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [stmtRes, agingRes] = await Promise.all([
        api.get(`/finance/vendors/${vendorId}/statement`),
        api.get(`/finance/vendors/${vendorId}/aging`)
      ]);
      setStatementData(stmtRes.data?.data || null);
      setAgingData(agingRes.data?.aging || null);
    } catch (err) {
      toast.error(t('finance.vendorAccounts.messages.statementLoadError'));
    } finally {
      setLoading(false);
    }
  }, [vendorId, t]);

  useEffect(() => {
    if (vendorId) loadData();
  }, [vendorId, loadData]);

  const currentDrawerStyle = {
    position: 'fixed',
    top: 0,
    ...(isRTL ? { left: 0 } : { right: 0 }),
    bottom: 0,
    width: 'min(680px, 92vw)',
    background: 'var(--bg-card)',
    zIndex: 1200,
    ...(isRTL ? { borderRight: '1px solid var(--glass-border)' } : { borderLeft: '1px solid var(--glass-border)' }),
    boxShadow: isRTL ? '10px 0 40px rgba(0,0,0,0.2)' : '-10px 0 40px rgba(0,0,0,0.2)',
    display: 'flex',
    flexDirection: 'column',
    direction: isRTL ? 'rtl' : 'ltr'
  };

  if (loading) {
    return (
      <div style={currentDrawerStyle}>
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
          <div>{t('finance.vendorAccounts.drawer.loading')}</div>
        </div>
      </div>
    );
  }

  const { vendor, summary, transactions } = statementData || {};

  return (
    <>
      {showPayModal && (
        <RecordPaymentModal
          vendor={vendor}
          onClose={() => setShowPayModal(false)}
          onPaid={() => {
            loadData();
            if (onPaymentRecorded) onPaymentRecorded();
          }}
        />
      )}

      <div style={currentDrawerStyle}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {t('finance.vendorAccounts.drawer.title')}
            </div>
            <h2 style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: 900 }}>{vendor?.name}</h2>
            {vendor?.phone && (
              <div className="num-en" dir="ltr" style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: isRTL ? 'right' : 'left' }}>
                {vendor.phone}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {hasFinancialPermission?.('payment.create') && (
              <button
                onClick={() => setShowPayModal(true)}
                style={{ ...btnStyle, background: 'var(--primary)', color: 'white', border: 'none', gap: '4px' }}
              >
                <Plus size={14} /> {t('finance.vendorAccounts.drawer.payVendor')}
              </button>
            )}
            <button onClick={() => window.print()} style={btnStyle} title={t('finance.vendorAccounts.drawer.printStatement')}>
              <Printer size={15} />
            </button>
            <button onClick={onClose} style={{ ...btnStyle, padding: '7px' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 3 Summary Cards */}
        <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', borderBottom: '1px solid var(--glass-border)' }}>
          <div style={{ background: 'rgba(0,0,0,0.02)', padding: '10px', borderRadius: '10px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {t('finance.vendorAccounts.drawer.totalPurchases')}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 900 }}>
              <span className="num-en">{fmt(summary?.total_purchases)}</span> {t('common.currency', 'EGP')}
            </div>
          </div>
          <div style={{ background: 'rgba(16,185,129,0.08)', padding: '10px', borderRadius: '10px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#10b981', textTransform: 'uppercase' }}>
              {t('finance.vendorAccounts.drawer.totalPaid')}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#10b981' }}>
              <span className="num-en">{fmt(summary?.total_paid)}</span> {t('common.currency', 'EGP')}
            </div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.08)', padding: '10px', borderRadius: '10px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase' }}>
              {t('finance.vendorAccounts.drawer.outstandingPayable')}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#ef4444' }}>
              <span className="num-en">{fmt(summary?.outstanding_balance)}</span> {t('common.currency', 'EGP')}
            </div>
          </div>
        </div>

        {/* Tabs: Statement vs Aging */}
        <div style={{ padding: '14px 24px 0', display: 'flex', gap: '8px' }}>
          {[
            { id: 'statement', label: t('finance.vendorAccounts.drawer.tabs.statement') },
            { id: 'aging',     label: t('finance.vendorAccounts.drawer.tabs.aging') },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              style={{
                padding: '6px 14px', borderRadius: '8px', border: '1px solid', cursor: 'pointer',
                fontWeight: 700, fontSize: '12px',
                borderColor: view === tab.id ? 'var(--primary)' : 'var(--glass-border)',
                background: view === tab.id ? 'rgba(99,102,241,0.08)' : 'transparent',
                color: view === tab.id ? 'var(--primary)' : 'var(--text-muted)'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
          {view === 'statement' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                  {[
                    { key: 'date',      label: t('finance.vendorAccounts.drawer.table.date'),      numeric: false },
                    { key: 'type',      label: t('finance.vendorAccounts.drawer.table.type'),      numeric: false },
                    { key: 'reference', label: t('finance.vendorAccounts.drawer.table.reference'), numeric: false },
                    { key: 'debit',     label: t('finance.vendorAccounts.drawer.table.debit'),     numeric: true },
                    { key: 'credit',    label: t('finance.vendorAccounts.drawer.table.credit'),    numeric: true },
                    { key: 'balance',   label: t('finance.vendorAccounts.drawer.table.balance'),   numeric: true },
                  ].map(h => (
                    <th key={h.key} style={{
                      padding: '8px 10px',
                      textAlign: h.numeric ? (isRTL ? 'left' : 'right') : (isRTL ? 'right' : 'left'),
                      fontWeight: 800,
                      color: 'var(--text-muted)',
                      fontSize: '11px',
                      borderBottom: '1px solid var(--glass-border)'
                    }}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(transactions || []).map((txn, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      <span className="num-en">{fmtDate(txn.date)}</span>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={{
                        fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '12px',
                        background: txn.type === 'Purchase' ? 'rgba(99,102,241,0.1)' : 'rgba(16,185,129,0.1)',
                        color: txn.type === 'Purchase' ? 'var(--primary)' : '#10b981'
                      }}>
                        {txn.type === 'Purchase' ? t('finance.vendorAccounts.drawer.table.purchase') : t('finance.vendorAccounts.drawer.table.payment')}
                      </span>
                    </td>
                    <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 700 }}>
                      <span className="num-en">{txn.reference}</span>
                    </td>
                    <td style={{ padding: '10px', textAlign: isRTL ? 'left' : 'right', fontWeight: 700 }}>
                      {txn.debit > 0 ? <span className="num-en">{fmt(txn.debit)}</span> : '—'}
                    </td>
                    <td style={{ padding: '10px', textAlign: isRTL ? 'left' : 'right', fontWeight: 700, color: '#10b981' }}>
                      {txn.credit > 0 ? <span className="num-en">{fmt(txn.credit)}</span> : '—'}
                    </td>
                    <td style={{ padding: '10px', textAlign: isRTL ? 'left' : 'right', fontWeight: 900, color: txn.running_balance > 0 ? '#ef4444' : '#10b981' }}>
                      <span className="num-en">{fmt(txn.running_balance)}</span> {t('common.currency', 'EGP')}
                    </td>
                  </tr>
                ))}
                {(transactions || []).length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      {t('finance.vendorAccounts.drawer.table.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <AgingBar aging={agingData} />
          )}
        </div>
      </div>
    </>
  );
};

// ─── Main Vendor Accounts Component ───────────────────────────────────────────
const VendorAccounts = () => {
  const { t, isRTL } = useLanguage();
  const [vendors, setVendors] = useState([]);
  const [kpi, setKpi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState(null);

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/finance/vendors');
      setVendors(res.data?.data || []);
      setKpi(res.data?.kpi || null);
    } catch (err) {
      toast.error(t('finance.vendorAccounts.messages.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const filtered = vendors.filter(v =>
    v.vendor_name?.toLowerCase().includes(search.toLowerCase()) ||
    v.vendor_phone?.includes(search)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Drawer */}
      {selectedVendorId && (
        <VendorStatementDrawer
          vendorId={selectedVendorId}
          onClose={() => setSelectedVendorId(null)}
          onPaymentRecorded={fetchVendors}
        />
      )}

      {/* KPI Cards */}
      {kpi && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {[
            { label: t('finance.vendorAccounts.kpi.totalPayables'),   value: kpi.totalPayables,             color: '#ef4444', icon: <DollarSign size={16} /> },
            { label: t('finance.vendorAccounts.kpi.overduePayables'), value: kpi.totalOverdue,              color: '#dc2626', icon: <AlertTriangle size={16} /> },
            { label: t('finance.vendorAccounts.kpi.dueThisMonth'),    value: kpi.dueThisMonth,              color: '#f59e0b', icon: <Clock size={16} /> },
            { label: t('finance.vendorAccounts.kpi.suppliersToPay'),  value: kpi.vendorsWithOutstanding,    color: '#6366f1', icon: <Building2 size={16} />, isCount: true },
          ].map(c => (
            <div key={c.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '3px' }}>{c.label}</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: c.color }}>
                  {c.isCount ? (
                    <span className="num-en">{c.value}</span>
                  ) : (
                    <>
                      <span className="num-en">{fmt(c.value)}</span> {t('common.currency', 'EGP')}
                    </>
                  )}
                </div>
              </div>
              <div style={{ color: c.color, opacity: 0.6 }}>{c.icon}</div>
            </div>
          ))}
        </div>
      )}

      {/* Controls & Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={18} style={{ color: 'var(--primary)' }} />
            <span style={{ fontWeight: 800, fontSize: '15px' }}>
              {t('finance.vendorAccounts.table.title', { count: filtered.length })}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', ...(isRTL ? { right: 10 } : { left: 10 }), top: 10, color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder={t('finance.vendorAccounts.table.searchPlaceholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  ...inputStyle,
                  ...(isRTL ? { paddingRight: '30px', paddingLeft: '10px' } : { paddingLeft: '30px', paddingRight: '10px' }),
                  width: '220px'
                }}
              />
            </div>
            <button onClick={fetchVendors} style={btnStyle} title={t('finance.vendorAccounts.table.refresh')}>
              <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
            <div>{t('finance.vendorAccounts.table.loading')}</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Building2 size={36} style={{ opacity: 0.2, marginBottom: '10px' }} />
            <div style={{ fontWeight: 700 }}>{t('finance.vendorAccounts.table.empty')}</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>{t('finance.vendorAccounts.table.emptySubtitle')}</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                  {[
                    { key: 'vendorName',      label: t('finance.vendorAccounts.table.vendorName'),      numeric: false },
                    { key: 'phone',           label: t('finance.vendorAccounts.table.phone'),           numeric: false },
                    { key: 'totalPurchases',  label: t('finance.vendorAccounts.table.totalPurchases'),  numeric: true },
                    { key: 'totalPaid',       label: t('finance.vendorAccounts.table.totalPaid'),       numeric: true },
                    { key: 'outstanding',     label: t('finance.vendorAccounts.table.outstanding'),     numeric: true },
                    { key: 'overdue',         label: t('finance.vendorAccounts.table.overdue'),         numeric: true },
                    { key: 'lastAction',      label: t('finance.vendorAccounts.table.lastAction'),      numeric: false },
                    { key: 'status',          label: t('finance.vendorAccounts.table.status'),          numeric: false },
                  ].map(h => (
                    <th key={h.key} style={{
                      padding: '12px 14px',
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
                {filtered.map(v => (
                  <tr
                    key={v.vendor_id}
                    onClick={() => setSelectedVendorId(v.vendor_id)}
                    style={{ borderBottom: '1px solid var(--glass-border)', cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 14px', fontWeight: 800 }}>{v.vendor_name}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>
                      {v.vendor_phone ? (
                        <span className="num-en" dir="ltr">{v.vendor_phone}</span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: isRTL ? 'left' : 'right', fontWeight: 700 }}>
                      <span className="num-en">{fmt(v.total_purchases)}</span> {t('common.currency', 'EGP')}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: isRTL ? 'left' : 'right', fontWeight: 700, color: '#10b981' }}>
                      <span className="num-en">{fmt(v.total_paid)}</span> {t('common.currency', 'EGP')}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: isRTL ? 'left' : 'right', fontWeight: 900, color: v.outstanding > 0 ? '#ef4444' : '#10b981' }}>
                      <span className="num-en">{fmt(v.outstanding)}</span> {t('common.currency', 'EGP')}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: isRTL ? 'left' : 'right', fontWeight: 800, color: v.overdue > 0 ? '#dc2626' : 'var(--text-muted)' }}>
                      {v.overdue > 0 ? (
                        <>
                          <span className="num-en">{fmt(v.overdue)}</span> {t('common.currency', 'EGP')}
                        </>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      <span className="num-en">{fmtDate(v.last_transaction)}</span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 800,
                        background: v.account_status === 'overdue' ? 'rgba(239,68,68,0.1)' : v.account_status === 'outstanding' ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
                        color: v.account_status === 'overdue' ? '#ef4444' : v.account_status === 'outstanding' ? '#f59e0b' : '#10b981',
                      }}>
                        {t(`finance.vendorAccounts.statuses.${v.account_status}`, v.account_status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

// ─── Inline Styles ────────────────────────────────────────────────────────────
const labelStyle = { display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' };
const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '13px', boxSizing: 'border-box' };
const btnStyle = { padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 700, fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' };

export default VendorAccounts;
