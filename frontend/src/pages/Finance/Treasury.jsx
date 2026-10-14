import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { isInvalidDateRange } from '../../utils/dateRange';
import toast from 'react-hot-toast';
import {
  Landmark, Wallet, Plus, X, ChevronRight, RefreshCw,
  ArrowDownLeft, ArrowUpRight, Filter,
  TrendingUp, TrendingDown, DollarSign, Building2,
  CheckCircle
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ─── Account Card ─────────────────────────────────────────────────────────────
const AccountCard = ({ account, selected, onClick }) => {
  const { t, isRTL } = useLanguage();
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
        direction: isRTL ? 'rtl' : 'ltr'
      }}
    >
      {account.is_default && (
        <span style={{
          position: 'absolute',
          top: '10px',
          ...(isRTL ? { left: '10px' } : { right: '10px' }),
          fontSize: '10px', fontWeight: 800, color: 'var(--primary)',
          background: 'rgba(99,102,241,0.1)', padding: '2px 8px', borderRadius: '20px'
        }}>
          {t('finance.treasury.accountCard.default')}
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
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
          {t('finance.treasury.accountCard.currentBalance')}
        </div>
        <div style={{ fontSize: '22px', fontWeight: 900, color: balColor }}>
          <span className="num-en">{fmt(bal)}</span> <span style={{ fontSize: '12px' }}>{t('common.currency', 'EGP')}</span>
        </div>
      </div>

      {/* Month Summary */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1, background: 'rgba(16,185,129,0.07)', borderRadius: '8px', padding: '8px 10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', marginBottom: '2px' }}>
            {t('finance.treasury.accountCard.thisMonthIn')}
          </div>
          <div style={{ fontWeight: 800, fontSize: '13px', color: '#10b981' }}>
            <span className="num-en">{fmt(account.month_incoming)}</span>
          </div>
        </div>
        <div style={{ flex: 1, background: 'rgba(239,68,68,0.07)', borderRadius: '8px', padding: '8px 10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', marginBottom: '2px' }}>
            {t('finance.treasury.accountCard.thisMonthOut')}
          </div>
          <div style={{ fontWeight: 800, fontSize: '13px', color: '#ef4444' }}>
            <span className="num-en">{fmt(account.month_outgoing)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Transaction Row ──────────────────────────────────────────────────────────
const TxnRow = ({ txn }) => {
  const { t, isRTL } = useLanguage();
  const isIn = txn.direction === 'in';
  return (
    <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
      <td style={{ padding: '11px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '13px' }}>
        <span className="num-en">{fmtDate(txn.txn_date)}</span>
      </td>
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
      <td style={{ padding: '11px 14px', fontWeight: 700, fontFamily: 'monospace', fontSize: '12px' }}>
        <span className="num-en">{txn.reference}</span>
      </td>
      <td style={{ padding: '11px 14px', fontSize: '13px', color: 'var(--text-muted)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {txn.description}
      </td>
      <td style={{ padding: '11px 14px', fontSize: '12px', color: 'var(--text-muted)' }}>
        {t(`finance.treasury.methods.${txn.payment_method}`, txn.payment_method)}
      </td>
      <td style={{ padding: '11px 14px', textAlign: isRTL ? 'left' : 'right', fontWeight: 900, fontSize: '14px', color: isIn ? '#10b981' : '#ef4444' }}>
        {isIn ? '+' : '−'}<span className="num-en">{fmt(txn.amount)}</span> {t('common.currency', 'EGP')}
      </td>
    </tr>
  );
};

// ─── Add Account Modal ────────────────────────────────────────────────────────
const AddAccountModal = ({ onClose, onCreated }) => {
  const { t, isRTL } = useLanguage();
  const [form, setForm] = useState({ name: '', type: 'cash', bank_name: '', account_number: '', opening_balance: '', is_default: false });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error(t('finance.treasury.addAccountModal.validationName'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/finance/treasury/accounts', {
        ...form,
        opening_balance: parseFloat(form.opening_balance || 0),
      });
      toast.success(t('finance.treasury.addAccountModal.successCreated', { name: form.name }));
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('finance.treasury.addAccountModal.failedCreated'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '28px', width: 'min(480px,95vw)', boxShadow: '0 25px 60px rgba(0,0,0,0.25)', direction: isRTL ? 'rtl' : 'ltr' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>
            {t('finance.treasury.addAccountModal.title')}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Type */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { v: 'cash', label: t('finance.treasury.addAccountModal.cashbox'), icon: <Wallet size={14}/> },
              { v: 'bank', label: t('finance.treasury.addAccountModal.bankAccount'), icon: <Building2 size={14}/> }
            ].map(tType => (
              <button key={tType.v} type="button" onClick={() => set('type', tType.v)} style={{
                flex: 1, padding: '10px', border: '1.5px solid', borderRadius: '10px', cursor: 'pointer',
                fontWeight: 800, fontSize: '13px',
                borderColor: form.type === tType.v ? 'var(--primary)' : 'var(--glass-border)',
                background: form.type === tType.v ? 'rgba(99,102,241,0.08)' : 'transparent',
                color: form.type === tType.v ? 'var(--primary)' : 'var(--text-muted)',
              }}>
                {tType.label}
              </button>
            ))}
          </div>

          {/* Name */}
          <div>
            <label style={labelStyle}>{t('finance.treasury.addAccountModal.accountName')}</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required
              placeholder={form.type === 'bank' ? t('finance.treasury.addAccountModal.bankNamePlaceholder') : t('finance.treasury.addAccountModal.cashNamePlaceholder')}
              style={inputStyle} />
          </div>

          {/* Bank-specific */}
          {form.type === 'bank' && (
            <>
              <div>
                <label style={labelStyle}>{t('finance.treasury.addAccountModal.bankName')}</label>
                <input value={form.bank_name} onChange={e => set('bank_name', e.target.value)} placeholder={t('finance.treasury.addAccountModal.bankNameInputPlaceholder')} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>{t('finance.treasury.addAccountModal.accountNumber')}</label>
                <input value={form.account_number} onChange={e => set('account_number', e.target.value)} placeholder={t('finance.treasury.addAccountModal.accountNumberPlaceholder')} style={inputStyle} />
              </div>
            </>
          )}

          {/* Opening balance */}
          <div>
            <label style={labelStyle}>{t('finance.treasury.addAccountModal.openingBalance')}</label>
            <input type="number" value={form.opening_balance} onChange={e => set('opening_balance', e.target.value)}
              placeholder={t('finance.treasury.addAccountModal.openingBalancePlaceholder')} min="0" step="0.01" style={inputStyle} />
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {t('finance.treasury.addAccountModal.openingBalanceHelp')}
            </div>
          </div>

          {/* Default */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
            <input type="checkbox" checked={form.is_default} onChange={e => set('is_default', e.target.checked)} />
            {t('finance.treasury.addAccountModal.setDefaultAccount', { type: form.type === 'bank' ? t('finance.treasury.methods.bank_transfer') : t('finance.treasury.methods.cash') })}
          </label>

          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button type="button" onClick={onClose} style={{ ...btnStyle, flex: 1 }}>
              {t('finance.treasury.addAccountModal.cancel')}
            </button>
            <button type="submit" disabled={saving} style={{ ...btnStyle, flex: 2, background: 'var(--primary)', color: 'white', border: 'none', opacity: saving ? 0.7 : 1 }}>
              {saving ? t('finance.treasury.addAccountModal.creating') : t('finance.treasury.addAccountModal.create')}
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
  const { t, isRTL } = useLanguage();
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
      toast.error(t('finance.treasury.messages.loadAccountsError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchTransactions = useCallback(async (accountId) => {
    if (!accountId) return;
    if (isInvalidDateRange(dateFrom, dateTo)) {
      toast.error(t('common.invalidDateRange'), { id: 'invalid-date-range' });
      return;
    }
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
      toast.error(t('finance.treasury.messages.loadTransactionsError'));
    } finally {
      setTxnLoading(false);
    }
  }, [dateFrom, dateTo, t]);

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
      <div>{t('finance.treasury.accountsList.loading')}</div>
    </div>
  );

  return (
    <>
      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} onCreated={fetchAccounts} />}

      {/* KPI Strip */}
      {totals && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: t('finance.treasury.kpi.totalBalance'), value: totals.total_balance, color: '#6366f1', icon: <DollarSign size={16} /> },
            { label: t('finance.treasury.kpi.cashAccounts'), value: totals.total_cash,    color: '#10b981', icon: <Wallet size={16} /> },
            { label: t('finance.treasury.kpi.bankAccounts'), value: totals.total_bank,    color: '#3b82f6', icon: <Building2 size={16} /> },
            { label: t('finance.treasury.kpi.inThisMonth'),  value: totals.month_incoming, color: '#22c55e', icon: <TrendingUp size={16} /> },
            { label: t('finance.treasury.kpi.outThisMonth'), value: totals.month_outgoing, color: '#f97316', icon: <TrendingDown size={16} /> },
          ].map(card => (
            <div key={card.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{card.label}</div>
                <div style={{ fontSize: '17px', fontWeight: 900, color: card.color }}>
                  <span className="num-en">{fmt(card.value)}</span> <span style={{ fontSize: '10px' }}>{t('common.currency', 'EGP')}</span>
                </div>
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
              {t('finance.treasury.accountsList.title', { count: accounts.length })}
            </div>
            {hasFinancialPermission?.('payment.create') && (
              <button onClick={() => setShowAdd(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '8px', background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}>
                <Plus size={13} /> {t('finance.treasury.accountsList.add')}
              </button>
            )}
          </div>

          {accounts.length === 0 ? (
            <div style={{ background: 'var(--bg-card)', border: '1px dashed var(--glass-border)', borderRadius: '14px', padding: '40px', textAlign: 'center' }}>
              <Landmark size={36} style={{ opacity: 0.2, marginBottom: '12px' }} />
              <div style={{ fontWeight: 700, marginBottom: '6px' }}>
                {t('finance.treasury.accountsList.noAccountsTitle')}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                {t('finance.treasury.accountsList.noAccountsSubtitle')}
              </div>
              {hasFinancialPermission?.('payment.create') && (
                <button onClick={() => setShowAdd(true)} style={{ padding: '8px 20px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>
                  {t('finance.treasury.accountsList.addFirstAccount')}
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
                  {t('finance.treasury.transactions.balance')}{' '}
                  <strong style={{ color: selected.current_balance >= 0 ? '#10b981' : '#ef4444' }}>
                    <span className="num-en">{fmt(selected.current_balance)}</span> {t('common.currency', 'EGP')}
                  </strong>
                  {selected.opening_balance > 0 && (
                    <span style={{ marginInlineStart: '6px', color: 'var(--text-muted)' }}>
                      ({t('finance.treasury.transactions.opening')} <span className="num-en">{fmt(selected.opening_balance)}</span>)
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...inputStyle, width: '130px', fontSize: '12px' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>–</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...inputStyle, width: '130px', fontSize: '12px' }} />
                <button onClick={() => fetchTransactions(selected.id)} style={{ ...btnStyle, padding: '7px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Filter size={12} /> {t('finance.treasury.transactions.filter')}
                </button>
              </div>
            </div>

            {/* Transaction Table */}
            {txnLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px', opacity: 0.4 }} />
                <div>{t('finance.treasury.transactions.loading')}</div>
              </div>
            ) : txns.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <CheckCircle size={30} style={{ opacity: 0.2, marginBottom: '10px' }} />
                <div style={{ fontWeight: 700 }}>{t('finance.treasury.transactions.emptyTitle')}</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>{t('finance.treasury.transactions.emptySubtitle')}</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.025)' }}>
                      {[
                        { key: 'date', label: t('finance.treasury.transactions.table.date'), numeric: false },
                        { key: 'type', label: t('finance.treasury.transactions.table.type'), numeric: false },
                        { key: 'reference', label: t('finance.treasury.transactions.table.reference'), numeric: false },
                        { key: 'description', label: t('finance.treasury.transactions.table.description'), numeric: false },
                        { key: 'method', label: t('finance.treasury.transactions.table.method'), numeric: false },
                        { key: 'amount', label: t('finance.treasury.transactions.table.amount'), numeric: true },
                      ].map(h => (
                        <th key={h.key} style={{
                          padding: '10px 14px',
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
                    {txns.map((txn, idx) => <TxnRow key={`${txn.txn_type}-${txn.source_id}-${idx}`} txn={txn} />)}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'rgba(0,0,0,0.02)', borderTop: '2px solid var(--glass-border)' }}>
                      <td colSpan={5} style={{ padding: '12px 14px', fontWeight: 800, fontSize: '13px' }}>
                        {t('finance.treasury.transactions.table.txnCount', { count: txns.length })}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: isRTL ? 'left' : 'right', fontWeight: 900, fontSize: '15px', color: selected.current_balance >= 0 ? '#10b981' : '#ef4444' }}>
                        <span className="num-en">{fmt(selected.current_balance)}</span> {t('common.currency', 'EGP')}
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
            <ChevronRight size={32} style={{ opacity: 0.15, marginBottom: '10px', transform: isRTL ? 'scaleX(-1)' : 'none' }} />
            <div style={{ fontWeight: 700 }}>{t('finance.treasury.accountsList.selectAccountPrompt')}</div>
            <div style={{ fontSize: '13px', marginTop: '4px' }}>{t('finance.treasury.accountsList.selectAccountSubtitle')}</div>
          </div>
        )}
      </div>
    </>
  );
};

export default Treasury;
