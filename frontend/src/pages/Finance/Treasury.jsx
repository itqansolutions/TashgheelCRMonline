import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Landmark, Wallet, Plus, X, ChevronRight, RefreshCw,
  ArrowDownLeft, ArrowUpRight, Calendar, Filter,
  TrendingUp, TrendingDown, DollarSign, Building2,
  Edit2, CheckCircle, AlertCircle
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const METHOD_LABELS = {
  cash: 'Cash', bank_transfer: 'Bank Transfer',
  card: 'Card', check: 'Check',
};

// ─── Account Card ─────────────────────────────────────────────────────────────
const AccountCard = ({ account, selected, onClick }) => {
  const isBank = account.type === 'bank';
  const bal = account.current_balance;
  const balColor = bal >= 0 ? '#10b981' : '#ef4444';

  return (
    <div
      onClick={onClick}
      style={{
        background: selected ? 'rgba(99,102,241,0.06)' : 'var(--bg-card)',
        border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--glass-border)'}`,
        borderRadius: '14px', padding: '20px', cursor: 'pointer',
        transition: 'all 0.15s', boxShadow: selected ? '0 0 0 3px rgba(99,102,241,0.12)' : 'var(--shadow-sm)',
        position: 'relative',
      }}
    >
      {account.is_default && (
        <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '10px', fontWeight: 800, color: 'var(--primary)', background: 'rgba(99,102,241,0.1)', padding: '2px 8px', borderRadius: '20px' }}>
          Default
        </span>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <div style={{ width: 38, height: 38, borderRadius: '10px', background: isBank ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isBank ? <Building2 size={18} style={{ color: '#3b82f6' }} /> : <Wallet size={18} style={{ color: '#10b981' }} />}
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: '14px' }}>{account.name}</div>
          {account.bank_name && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{account.bank_name}</div>}
        </div>
      </div>

      {/* Balance */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Current Balance</div>
        <div style={{ fontSize: '22px', fontWeight: 900, color: balColor }}>{fmt(bal)} <span style={{ fontSize: '12px' }}>EGP</span></div>
      </div>

      {/* Month Summary */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1, background: 'rgba(16,185,129,0.07)', borderRadius: '8px', padding: '8px 10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', marginBottom: '2px' }}>↑ This Month</div>
          <div style={{ fontWeight: 800, fontSize: '13px', color: '#10b981' }}>{fmt(account.month_incoming)}</div>
        </div>
        <div style={{ flex: 1, background: 'rgba(239,68,68,0.07)', borderRadius: '8px', padding: '8px 10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', marginBottom: '2px' }}>↓ This Month</div>
          <div style={{ fontWeight: 800, fontSize: '13px', color: '#ef4444' }}>{fmt(account.month_outgoing)}</div>
        </div>
      </div>
    </div>
  );
};

// ─── Transaction Row ──────────────────────────────────────────────────────────
const TxnRow = ({ txn }) => {
  const isIn = txn.direction === 'in';
  return (
    <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
      <td style={{ padding: '11px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '13px' }}>{fmtDate(txn.txn_date)}</td>
      <td style={{ padding: '11px 14px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700, fontSize: '12px',
          color: isIn ? '#10b981' : '#ef4444',
          background: isIn ? 'rgba(16,185,129,0.09)' : 'rgba(239,68,68,0.09)',
          padding: '3px 10px', borderRadius: '20px'
        }}>
          {isIn ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}
          {txn.txn_type}
        </span>
      </td>
      <td style={{ padding: '11px 14px', fontWeight: 700, fontFamily: 'monospace', fontSize: '12px' }}>{txn.reference}</td>
      <td style={{ padding: '11px 14px', fontSize: '13px', color: 'var(--text-muted)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txn.description}</td>
      <td style={{ padding: '11px 14px', fontSize: '12px', color: 'var(--text-muted)' }}>{METHOD_LABELS[txn.payment_method] || txn.payment_method}</td>
      <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 900, fontSize: '14px', color: isIn ? '#10b981' : '#ef4444' }}>
        {isIn ? '+' : '−'}{fmt(txn.amount)} EGP
      </td>
    </tr>
  );
};

// ─── Add Account Modal ────────────────────────────────────────────────────────
const AddAccountModal = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({ name: '', type: 'cash', bank_name: '', account_number: '', opening_balance: '', is_default: false });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Account name is required'); return; }
    setSaving(true);
    try {
      await api.post('/finance/treasury/accounts', {
        ...form,
        opening_balance: parseFloat(form.opening_balance || 0),
      });
      toast.success(`${form.name} created`);
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create account');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '28px', width: 'min(480px,95vw)', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>Add Treasury Account</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Type */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {[{ v: 'cash', label: '💵 Cashbox', icon: <Wallet size={14}/> }, { v: 'bank', label: '🏦 Bank Account', icon: <Building2 size={14}/> }].map(t => (
              <button key={t.v} type="button" onClick={() => set('type', t.v)} style={{
                flex: 1, padding: '10px', border: '1.5px solid', borderRadius: '10px', cursor: 'pointer',
                fontWeight: 800, fontSize: '13px',
                borderColor: form.type === t.v ? 'var(--primary)' : 'var(--glass-border)',
                background: form.type === t.v ? 'rgba(99,102,241,0.08)' : 'transparent',
                color: form.type === t.v ? 'var(--primary)' : 'var(--text-muted)',
              }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Name */}
          <div>
            <label style={labelStyle}>Account Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required
              placeholder={form.type === 'bank' ? 'e.g. CIB Main Account' : 'e.g. Main Cashbox'}
              style={inputStyle} />
          </div>

          {/* Bank-specific */}
          {form.type === 'bank' && (
            <>
              <div>
                <label style={labelStyle}>Bank Name</label>
                <input value={form.bank_name} onChange={e => set('bank_name', e.target.value)} placeholder="e.g. CIB, QNB, HSBC" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Account Number</label>
                <input value={form.account_number} onChange={e => set('account_number', e.target.value)} placeholder="Optional" style={inputStyle} />
              </div>
            </>
          )}

          {/* Opening balance */}
          <div>
            <label style={labelStyle}>Opening Balance (EGP)</label>
            <input type="number" value={form.opening_balance} onChange={e => set('opening_balance', e.target.value)}
              placeholder="Balance before CRM tracking started" min="0" step="0.01" style={inputStyle} />
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              This is a one-time value representing the balance before CRM tracking began.
            </div>
          </div>

          {/* Default */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
            <input type="checkbox" checked={form.is_default} onChange={e => set('is_default', e.target.checked)} />
            Set as default {form.type} account
          </label>

          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button type="button" onClick={onClose} style={{ ...btnStyle, flex: 1 }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...btnStyle, flex: 2, background: 'var(--primary)', color: 'white', border: 'none', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Creating…' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' };
const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '13px', boxSizing: 'border-box' };
const btnStyle = { padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 700, fontSize: '13px' };

// ─── Main Treasury Component ──────────────────────────────────────────────────
const Treasury = () => {
  const { hasFinancialPermission } = useAuth();
  const [accounts, setAccounts]     = useState([]);
  const [totals, setTotals]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null); // selected account object
  const [txns, setTxns]             = useState([]);
  const [txnLoading, setTxnLoading] = useState(false);
  const [showAdd, setShowAdd]       = useState(false);
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/finance/treasury/accounts');
      setAccounts(res.data.data || []);
      setTotals(res.data.totals || null);
    } catch (err) {
      toast.error('Failed to load treasury accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTransactions = useCallback(async (accountId) => {
    if (!accountId) return;
    setTxnLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo)   params.append('date_to', dateTo);
      const res = await api.get(`/finance/treasury/accounts/${accountId}/transactions?${params}`);
      setTxns(res.data.transactions || []);
      // Update current balance in selected account from response
      if (res.data.account) {
        setSelected(prev => prev ? { ...prev, current_balance: res.data.account.current_balance } : prev);
      }
    } catch (err) {
      toast.error('Failed to load transactions');
    } finally {
      setTxnLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);
  useEffect(() => { if (selected) fetchTransactions(selected.id); }, [selected?.id, fetchTransactions]);

  const handleSelectAccount = (acc) => {
    setSelected(acc);
    setDateFrom('');
    setDateTo('');
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
      <RefreshCw size={28} style={{ marginBottom: '10px', opacity: 0.4, animation: 'spin 1s linear infinite' }} />
      <div>Loading treasury…</div>
    </div>
  );

  return (
    <>
      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} onCreated={fetchAccounts} />}

      {/* KPI Strip */}
      {totals && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: 'Total Balance', value: totals.total_balance, color: '#6366f1', icon: <DollarSign size={16} /> },
            { label: 'Cash Accounts', value: totals.total_cash,    color: '#10b981', icon: <Wallet size={16} /> },
            { label: 'Bank Accounts', value: totals.total_bank,    color: '#3b82f6', icon: <Building2 size={16} /> },
            { label: 'In This Month', value: totals.month_incoming, color: '#22c55e', icon: <TrendingUp size={16} /> },
            { label: 'Out This Month', value: totals.month_outgoing, color: '#f97316', icon: <TrendingDown size={16} /> },
          ].map(card => (
            <div key={card.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{card.label}</div>
                <div style={{ fontSize: '17px', fontWeight: 900, color: card.color }}>{fmt(card.value)} <span style={{ fontSize: '10px' }}>EGP</span></div>
              </div>
              <div style={{ color: card.color, opacity: 0.6 }}>{card.icon}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: accounts.length === 0 ? '1fr' : 'minmax(260px, 320px) 1fr', gap: '20px', alignItems: 'start' }}>

        {/* Left: Account Cards */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Accounts ({accounts.length})
            </div>
            {hasFinancialPermission?.('payment.create') && (
              <button onClick={() => setShowAdd(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '8px', background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}>
                <Plus size={13} /> Add
              </button>
            )}
          </div>

          {accounts.length === 0 ? (
            <div style={{ background: 'var(--bg-card)', border: '1px dashed var(--glass-border)', borderRadius: '14px', padding: '40px', textAlign: 'center' }}>
              <Landmark size={36} style={{ opacity: 0.2, marginBottom: '12px' }} />
              <div style={{ fontWeight: 700, marginBottom: '6px' }}>No Treasury Accounts Yet</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Add a Cashbox or Bank Account to start tracking cash flows
              </div>
              {hasFinancialPermission?.('payment.create') && (
                <button onClick={() => setShowAdd(true)} style={{ padding: '8px 20px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>
                  + Add First Account
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {accounts.map(acc => (
                <AccountCard
                  key={acc.id}
                  account={acc}
                  selected={selected?.id === acc.id}
                  onClick={() => handleSelectAccount(acc)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: Transactions Panel */}
        {selected && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '14px', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            {/* Panel Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: '15px' }}>{selected.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Balance: <strong style={{ color: selected.current_balance >= 0 ? '#10b981' : '#ef4444' }}>{fmt(selected.current_balance)} EGP</strong>
                  {selected.opening_balance > 0 && <span style={{ marginLeft: '6px', color: 'var(--text-muted)' }}>(Opening: {fmt(selected.opening_balance)})</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...inputStyle, width: '130px', fontSize: '12px' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>–</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...inputStyle, width: '130px', fontSize: '12px' }} />
                <button onClick={() => fetchTransactions(selected.id)} style={{ ...btnStyle, padding: '7px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Filter size={12} /> Filter
                </button>
              </div>
            </div>

            {/* Transaction Table */}
            {txnLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px', opacity: 0.4 }} />
                <div>Loading transactions…</div>
              </div>
            ) : txns.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <CheckCircle size={30} style={{ opacity: 0.2, marginBottom: '10px' }} />
                <div style={{ fontWeight: 700 }}>No transactions yet</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>Payments and expenses linked to this account will appear here</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.025)' }}>
                      {['Date', 'Type', 'Reference', 'Description', 'Method', 'Amount'].map((h, i) => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: i === 5 ? 'right' : 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--glass-border)', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map((txn, idx) => <TxnRow key={`${txn.txn_type}-${txn.source_id}-${idx}`} txn={txn} />)}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'rgba(0,0,0,0.02)', borderTop: '2px solid var(--glass-border)' }}>
                      <td colSpan={5} style={{ padding: '12px 14px', fontWeight: 800, fontSize: '13px' }}>
                        {txns.length} transaction(s)
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, fontSize: '15px', color: selected.current_balance >= 0 ? '#10b981' : '#ef4444' }}>
                        {fmt(selected.current_balance)} EGP
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Placeholder when no account selected */}
        {!selected && accounts.length > 0 && (
          <div style={{ background: 'var(--bg-card)', border: '1px dashed var(--glass-border)', borderRadius: '14px', padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <ChevronRight size={32} style={{ opacity: 0.15, marginBottom: '10px' }} />
            <div style={{ fontWeight: 700 }}>Select an account</div>
            <div style={{ fontSize: '13px', marginTop: '4px' }}>Click an account card to view its transactions</div>
          </div>
        )}
      </div>
    </>
  );
};

export default Treasury;
