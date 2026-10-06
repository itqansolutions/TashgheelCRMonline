import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Building2, DollarSign, Clock, AlertTriangle, Search, Filter,
  ArrowUpRight, ArrowDownLeft, X, Printer, RefreshCw, ChevronRight,
  Calendar, CheckCircle, CreditCard, Wallet, Plus
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

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
  if (!aging) return null;
  const buckets = [
    { key: 'current', label: 'Current', amount: aging.current, color: AGING_COLORS.current },
    { key: 'days_1_30', label: '1–30d', amount: aging.days_1_30, color: AGING_COLORS.days_1_30 },
    { key: 'days_31_60', label: '31–60d', amount: aging.days_31_60, color: AGING_COLORS.days_31_60 },
    { key: 'days_61_90', label: '61–90d', amount: aging.days_61_90, color: AGING_COLORS.days_61_90 },
    { key: 'days_90_plus', label: '90d+', amount: aging.days_90_plus, color: AGING_COLORS.days_90_plus },
  ];
  const total = aging.total || 1;

  return (
    <div style={{ marginTop: '16px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '16px' }}>
      <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
        Payables Aging (From Due Date)
      </div>
      <div style={{ height: '10px', borderRadius: '6px', overflow: 'hidden', display: 'flex', background: 'var(--glass-border)', marginBottom: '12px' }}>
        {buckets.map(b => {
          const pct = (b.amount / total) * 100;
          if (pct <= 0) return null;
          return <div key={b.key} style={{ width: `${pct}%`, background: b.color }} title={`${b.label}: ${fmt(b.amount)} EGP`} />;
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
        {buckets.map(b => (
          <div key={b.key} style={{ textAlign: 'center', background: 'rgba(0,0,0,0.02)', padding: '6px', borderRadius: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: b.color }}>{b.label}</div>
            <div style={{ fontSize: '12px', fontWeight: 800 }}>{fmt(b.amount)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Record Vendor Payment Modal ──────────────────────────────────────────────
const RecordPaymentModal = ({ vendor, onClose, onPaid }) => {
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
      toast.error('Please enter a valid payment amount');
      return;
    }
    setLoading(true);
    try {
      await api.post(`/finance/vendors/${vendor.id || vendor.vendor_id}/payments`, {
        amount: parseFloat(amount),
        payment_method: paymentMethod,
        treasury_account_id: treasuryAccountId ? parseInt(treasuryAccountId) : null,
        notes: notes || `Payment to ${vendor.name || vendor.vendor_name}`
      });
      toast.success('Vendor payment recorded and deducted from Treasury!');
      onPaid();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', width: 'min(440px, 95vw)', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>Pay Vendor: {vendor.name || vendor.vendor_name}</h3>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Deducts directly from selected Treasury Account</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Payment Amount (EGP) *</label>
            <input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Payment Method</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={inputStyle}>
              <option value="cash">Cash / نقدي</option>
              <option value="bank_transfer">Bank Transfer / تحويل بنكي</option>
              <option value="check">Check / شيك</option>
              <option value="card">Card / بطاقة</option>
            </select>
          </div>

          {treasuryAccounts.length > 0 && (
            <div>
              <label style={labelStyle}>Deduct from Treasury Account</label>
              <select value={treasuryAccountId} onChange={e => setTreasuryAccountId(e.target.value)} style={inputStyle}>
                <option value="">Default Account</option>
                {treasuryAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.type === 'bank' ? 'Bank' : 'Cashbox'}) — {fmt(a.current_balance)} EGP</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>Notes / Memo</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Settlement for Raw Materials" style={inputStyle} />
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <button type="button" onClick={onClose} style={{ ...btnStyle, flex: 1 }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ ...btnStyle, flex: 2, background: 'var(--primary)', color: 'white', border: 'none' }}>
              {loading ? 'Processing...' : 'Confirm & Pay'}
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
      toast.error('Failed to load vendor statement');
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    if (vendorId) loadData();
  }, [vendorId, loadData]);

  if (loading) {
    return (
      <div style={drawerStyle}>
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
          <div>Loading vendor statement...</div>
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

      <div style={drawerStyle}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Vendor Financial Account</div>
            <h2 style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: 900 }}>{vendor?.name}</h2>
            {vendor?.phone && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{vendor.phone}</div>}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {hasFinancialPermission?.('payment.create') && (
              <button
                onClick={() => setShowPayModal(true)}
                style={{ ...btnStyle, background: 'var(--primary)', color: 'white', border: 'none', gap: '4px' }}
              >
                <Plus size={14} /> Pay Vendor
              </button>
            )}
            <button onClick={() => window.print()} style={btnStyle} title="Print Statement">
              <Printer size={15} />
            </button>
            <button onClick={onClose} style={{ ...btnStyle, padding: '7px' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 4 Summary Cards */}
        <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', borderBottom: '1px solid var(--glass-border)' }}>
          <div style={{ background: 'rgba(0,0,0,0.02)', padding: '10px', borderRadius: '10px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Purchases</div>
            <div style={{ fontSize: '16px', fontWeight: 900 }}>{fmt(summary?.total_purchases)} EGP</div>
          </div>
          <div style={{ background: 'rgba(16,185,129,0.08)', padding: '10px', borderRadius: '10px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#10b981', textTransform: 'uppercase' }}>Total Paid</div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#10b981' }}>{fmt(summary?.total_paid)} EGP</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.08)', padding: '10px', borderRadius: '10px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase' }}>Outstanding Payable</div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#ef4444' }}>{fmt(summary?.outstanding_balance)} EGP</div>
          </div>
        </div>

        {/* Tabs: Statement vs Aging */}
        <div style={{ padding: '14px 24px 0', display: 'flex', gap: '8px' }}>
          {[
            { id: 'statement', label: 'Chronological Statement' },
            { id: 'aging', label: 'Payables Aging' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              style={{
                padding: '6px 14px', borderRadius: '8px', border: '1px solid', cursor: 'pointer',
                fontWeight: 700, fontSize: '12px',
                borderColor: view === t.id ? 'var(--primary)' : 'var(--glass-border)',
                background: view === t.id ? 'rgba(99,102,241,0.08)' : 'transparent',
                color: view === t.id ? 'var(--primary)' : 'var(--text-muted)'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
          {view === 'statement' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                  {['Date', 'Type', 'Reference', 'Debit (+)', 'Credit (−)', 'Balance'].map((h, i) => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: i >= 3 ? 'right' : 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', borderBottom: '1px solid var(--glass-border)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(transactions || []).map((t, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '12px', background: t.type === 'Purchase' ? 'rgba(99,102,241,0.1)' : 'rgba(16,185,129,0.1)', color: t.type === 'Purchase' ? 'var(--primary)' : '#10b981' }}>
                        {t.type}
                      </span>
                    </td>
                    <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 700 }}>{t.reference}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700 }}>{t.debit > 0 ? fmt(t.debit) : '—'}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{t.credit > 0 ? fmt(t.credit) : '—'}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 900, color: t.running_balance > 0 ? '#ef4444' : '#10b981' }}>
                      {fmt(t.running_balance)} EGP
                    </td>
                  </tr>
                ))}
                {(transactions || []).length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      No financial transactions recorded for this vendor
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
      toast.error('Failed to load vendor accounts');
    } finally {
      setLoading(false);
    }
  }, []);

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
            { label: 'Total Payables (علينا)', value: kpi.totalPayables, color: '#ef4444', icon: <DollarSign size={16} /> },
            { label: 'Overdue Payables', value: kpi.totalOverdue, color: '#dc2626', icon: <AlertTriangle size={16} /> },
            { label: 'Due This Month', value: kpi.dueThisMonth, color: '#f59e0b', icon: <Clock size={16} /> },
            { label: 'Suppliers to Pay', value: kpi.vendorsWithOutstanding, color: '#6366f1', icon: <Building2 size={16} />, isCount: true },
          ].map(c => (
            <div key={c.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '3px' }}>{c.label}</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: c.color }}>
                  {c.isCount ? c.value : `${fmt(c.value)} EGP`}
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
            <span style={{ fontWeight: 800, fontSize: '15px' }}>Vendor Accounts ({filtered.length})</span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search vendor..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ ...inputStyle, paddingLeft: '30px', width: '220px' }}
              />
            </div>
            <button onClick={fetchVendors} style={btnStyle} title="Refresh">
              <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
            <div>Loading vendor payables...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Building2 size={36} style={{ opacity: 0.2, marginBottom: '10px' }} />
            <div style={{ fontWeight: 700 }}>No vendor accounts with purchases found</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>Purchases and invoices will automatically generate vendor accounts here</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                  {['Vendor Name', 'Phone', 'Total Purchases', 'Total Paid', 'Outstanding', 'Overdue', 'Last Action', 'Status'].map((h, i) => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: i >= 2 && i <= 5 ? 'right' : 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', borderBottom: '1px solid var(--glass-border)' }}>
                      {h}
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
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{v.vendor_phone || '—'}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700 }}>{fmt(v.total_purchases)} EGP</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{fmt(v.total_paid)} EGP</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, color: v.outstanding > 0 ? '#ef4444' : '#10b981' }}>
                      {fmt(v.outstanding)} EGP
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: v.overdue > 0 ? '#dc2626' : 'var(--text-muted)' }}>
                      {v.overdue > 0 ? `${fmt(v.overdue)} EGP` : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '12px' }}>{fmtDate(v.last_transaction)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 800,
                        background: v.account_status === 'overdue' ? 'rgba(239,68,68,0.1)' : v.account_status === 'outstanding' ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
                        color: v.account_status === 'overdue' ? '#ef4444' : v.account_status === 'outstanding' ? '#f59e0b' : '#10b981',
                      }}>
                        {v.account_status}
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
const drawerStyle = { position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(680px, 92vw)', background: 'var(--bg-card)', zIndex: 1200, boxShadow: '-10px 0 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' };

export default VendorAccounts;
