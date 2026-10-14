import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CreditCard } from 'lucide-react';
import api from '../../services/api';
import Modal from '../../components/Common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  WorkspaceHeader, StatCards, FilterChips, SimpleTable, Badge, ActionButton, DealFilterBanner,
  fmtMoney, fmtDate, fieldStyle, labelStyle
} from '../../components/RealEstate/WorkspaceKit';

/**
 * Real Estate → Installments (standalone workspace)
 * Flow: Deal → Contract → Installment Plan → Installments → Collections.
 *  - Contractual schedule: re_installments (GET /api/re-installments)
 *  - Collected money:      finance_vouchers (POST /:id/pay creates the receipt voucher;
 *                          GET /:id/payments reads the voucher history)
 */
const Installments = () => {
  const { hasFinancialPermission } = useAuth();
  const { t, isRTL } = useLanguage();
  const canCollect = !!hasFinancialPermission?.('payment.create');
  const [searchParams, setSearchParams] = useSearchParams();
  const dealId = searchParams.get('deal_id');
  const [filter, setFilter] = useState('all');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const [planOpen, setPlanOpen] = useState(false);
  const [contracts, setContracts] = useState([]);
  const [plan, setPlan] = useState({ contract_id: '', down_payment: 0, number_of_installments: 4, frequency: 'quarterly', start_date: new Date().toISOString().split('T')[0] });

  const [payFor, setPayFor] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'cash', notes: '' });

  const [historyFor, setHistoryFor] = useState(null);
  const [history, setHistory] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dealId) params.set('deal_id', dealId);
      if (filter === 'overdue') params.set('overdue', 'true');
      else if (filter !== 'all') params.set('status', filter);
      const res = await api.get(`/re-installments?${params.toString()}`);
      setRows(res.data.data || []);
      setSummary(res.data.summary || null);
    } catch (err) {
      toast.error(err.response?.data?.message || t('realEstate.installments.toastLoadError'));
      setRows([]); setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [dealId, filter]);

  const openPlan = async () => {
    try {
      const res = await api.get(`/re-contracts${dealId ? `?deal_id=${dealId}` : ''}`);
      const usable = (res.data.data || []).filter(c => !['Cancelled', 'Completed'].includes(c.status));
      setContracts(usable);
      const first = usable[0];
      setPlan(p => ({ ...p, contract_id: first?.id || '', down_payment: first?.down_payment || 0 }));
      setPlanOpen(true);
    } catch (err) {
      toast.error(err.response?.data?.message || t('realEstate.installments.toastLoadContractsError'));
    }
  };

  const generate = async () => {
    if (!plan.contract_id) return toast.error(t('realEstate.installments.toastSelectContract'));
    try {
      const res = await api.post('/re-installments/generate-schedule', {
        contract_id: plan.contract_id,
        down_payment: Number(plan.down_payment) || 0,
        number_of_installments: parseInt(plan.number_of_installments) || 1,
        frequency: plan.frequency,
        start_date: plan.start_date
      });
      toast.success(res.data.message || t('realEstate.installments.toastPlanSuccess'));
      setPlanOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || t('realEstate.installments.toastPlanError'));
    }
  };

  const openPay = (inst) => {
    setPayFor(inst);
    setPayForm({ amount: Math.max(0, Number(inst.amount) - Number(inst.paid_amount)).toFixed(2), payment_date: new Date().toISOString().split('T')[0], payment_method: 'cash', notes: '' });
  };

  const submitPay = async () => {
    try {
      const res = await api.post(`/re-installments/${payFor.id}/pay`, {
        amount: parseFloat(payForm.amount),
        payment_date: payForm.payment_date,
        payment_method: payForm.payment_method,
        notes: payForm.notes || undefined
      });
      toast.success(res.data.message || t('realEstate.installments.toastPaySuccess'));
      setPayFor(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || t('realEstate.installments.toastPayError'));
    }
  };

  const openHistory = async (inst) => {
    setHistoryFor(inst);
    setHistory([]);
    try {
      const res = await api.get(`/re-installments/${inst.id}/payments`);
      setHistory(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || t('realEstate.installments.toastHistoryError'));
    }
  };

  const statusBadge = (inst) => {
    if (inst.status === 'Paid') return <Badge color="green">{t('realEstate.installments.statusPaid')}</Badge>;
    if (inst.is_overdue) return <Badge color="red">{t('realEstate.installments.statusOverdue')}</Badge>;
    if (inst.status === 'Partially Paid') return <Badge color="amber">{t('realEstate.installments.statusPartiallyPaid')}</Badge>;
    return <Badge color="gray">{inst.status === 'Pending' ? t('realEstate.installments.statusPending') : inst.status}</Badge>;
  };

  const getMethodLabel = (m) => {
    switch (m) {
      case 'cash': return t('realEstate.installments.methodCash');
      case 'bank_transfer': return t('realEstate.installments.methodBankTransfer');
      case 'cheque': return t('realEstate.installments.methodCheque');
      case 'card': return t('realEstate.installments.methodCard');
      default: return m;
    }
  };

  const columns = [
    { key: 'contract_number', label: t('realEstate.installments.colContract'), render: (v) => <strong className="num-en">{v}</strong> },
    { key: 'deal_title', label: t('realEstate.installments.colDeal'), render: (v, r) => v || `#${r.deal_id}` },
    { key: 'customer_name', label: t('realEstate.installments.colCustomer'), render: (v) => v || '—' },
    { key: 'unit_number', label: t('realEstate.installments.colUnit'), render: (v, r) => (v ? `${r.unit_name || ''} ${v}`.trim() : '—') },
    { key: 'installment_number', label: t('realEstate.installments.colNumber'), render: (v) => <span className="num-en">{v}</span> },
    { key: 'installment_type', label: t('realEstate.installments.colType'), render: (v) => <span style={{ textTransform: 'capitalize' }}>{String(v || '').replace('_', ' ')}</span> },
    { key: 'due_date', label: t('realEstate.installments.colDueDate'), render: fmtDate },
    { key: 'amount', label: t('realEstate.installments.colAmount'), render: (v) => fmtMoney(v, t('realEstate.common.currencySuffix')) },
    { key: 'paid_amount', label: t('realEstate.installments.colPaid'), render: (v) => <span style={{ color: '#16a34a' }}>{fmtMoney(v, t('realEstate.common.currencySuffix'))}</span> },
    { key: 'remaining_balance', label: t('realEstate.installments.colRemaining'), render: (v) => fmtMoney(Math.max(0, Number(v)), t('realEstate.common.currencySuffix')) },
    { key: 'status', label: t('realEstate.installments.colStatus'), render: (_, r) => statusBadge(r) },
    {
      key: 'actions',
      label: t('realEstate.installments.colActions'),
      align: isRTL ? 'left' : 'right',
      render: (_, r) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: isRTL ? 'flex-start' : 'flex-end' }}>
          {r.status !== 'Paid' && canCollect && (
            <ActionButton color="#16a34a" onClick={() => openPay(r)}>
              {t('realEstate.installments.btnCollect')}
            </ActionButton>
          )}
          <ActionButton outline color="#334155" onClick={() => openHistory(r)}>
            {t('realEstate.installments.btnHistory')}
          </ActionButton>
        </div>
      )
    },
  ];

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <WorkspaceHeader
        icon={<CreditCard size={22} color="#0284c7" />}
        title={t('realEstate.installments.title')}
        subtitle={t('realEstate.installments.subtitle')}
      >
        <button
          type="button"
          onClick={openPlan}
          style={{ background: 'var(--primary)', color: 'white', padding: '10px 18px', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
        >
          {t('realEstate.installments.btnCreatePlan')}
        </button>
      </WorkspaceHeader>
      <DealFilterBanner dealId={dealId} label={rows[0]?.deal_title} onClear={() => setSearchParams({})} />
      <StatCards items={[
        { label: t('realEstate.installments.statScheduled'), value: fmtMoney(summary?.total_scheduled, t('realEstate.common.currencySuffix')) },
        { label: t('realEstate.installments.statCollected'), value: fmtMoney(summary?.total_paid, t('realEstate.common.currencySuffix')), color: '#15803d' },
        { label: t('realEstate.installments.statOutstanding'), value: fmtMoney(summary?.total_remaining, t('realEstate.common.currencySuffix')), color: '#b45309' },
        { label: t('realEstate.installments.statOverdueCount'), value: summary?.overdue_count || 0, color: '#b91c1c' },
      ]} />
      <FilterChips value={filter} onChange={setFilter} options={[
        { value: 'all', label: t('realEstate.installments.filterAll') },
        { value: 'Pending', label: t('realEstate.installments.filterPending') },
        { value: 'Partially Paid', label: t('realEstate.installments.filterPartiallyPaid') },
        { value: 'overdue', label: t('realEstate.installments.filterOverdue') },
        { value: 'Paid', label: t('realEstate.installments.filterPaid') },
      ]} />
      <SimpleTable
        columns={columns}
        rows={rows}
        loading={loading}
        rowStyle={(r) => (r.is_overdue && r.status !== 'Paid' ? { background: '#fef2f2' } : r.status === 'Paid' ? { background: '#f0fdf4' } : {})}
        empty={t('realEstate.installments.empty')}
      />

      {/* Create / split installment plan */}
      <Modal
        isOpen={planOpen}
        onClose={() => setPlanOpen(false)}
        title={t('realEstate.installments.planModalTitle')}
        footer={<>
          <button onClick={() => setPlanOpen(false)} style={{ background: '#f1f5f9', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>
            {t('realEstate.common.cancel')}
          </button>
          <button onClick={generate} style={{ background: 'var(--primary)', color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>
            {t('realEstate.installments.btnGeneratePlan')}
          </button>
        </>}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>{t('realEstate.installments.lblSelectContract')}</label>
            <select style={fieldStyle} value={plan.contract_id} onChange={e => {
              const c = contracts.find(x => String(x.id) === e.target.value);
              setPlan({ ...plan, contract_id: e.target.value, down_payment: c?.down_payment || 0 });
            }}>
              <option value="">{t('realEstate.installments.placeholderSelectContract')}</option>
              {contracts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.contract_number} — {c.customer_name || c.deal_title} ({Number(c.contract_value || 0).toLocaleString('en-US')} {t('realEstate.common.currency')})
                </option>
              ))}
            </select>
            {contracts.length === 0 && (
              <div style={{ fontSize: '12px', color: '#b45309', marginTop: '6px' }}>
                {t('realEstate.installments.noOpenContracts')}
              </div>
            )}
          </div>
          <div>
            <label style={labelStyle}>{t('realEstate.installments.lblDownPayment')}</label>
            <input type="number" style={fieldStyle} value={plan.down_payment} onChange={e => setPlan({ ...plan, down_payment: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>{t('realEstate.installments.lblInstallmentsCount')}</label>
            <input type="number" min="1" max="120" style={fieldStyle} value={plan.number_of_installments} onChange={e => setPlan({ ...plan, number_of_installments: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>{t('realEstate.installments.lblFrequency')}</label>
            <select style={fieldStyle} value={plan.frequency} onChange={e => setPlan({ ...plan, frequency: e.target.value })}>
              <option value="monthly">{t('realEstate.installments.freqMonthly')}</option>
              <option value="quarterly">{t('realEstate.installments.freqQuarterly')}</option>
              <option value="semi-annual">{t('realEstate.installments.freqSemiAnnual')}</option>
              <option value="annual">{t('realEstate.installments.freqAnnual')}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t('realEstate.installments.lblFirstDueDate')}</label>
            <input type="date" style={fieldStyle} value={plan.start_date} onChange={e => setPlan({ ...plan, start_date: e.target.value })} />
          </div>
        </div>
      </Modal>

      {/* Collect payment → finance voucher */}
      <Modal
        isOpen={!!payFor}
        onClose={() => setPayFor(null)}
        title={payFor ? t('realEstate.installments.collectModalTitle', { contract: payFor.contract_number, number: payFor.installment_number }) : ''}
        footer={<>
          <button onClick={() => setPayFor(null)} style={{ background: '#f1f5f9', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>
            {t('realEstate.common.cancel')}
          </button>
          <button onClick={submitPay} style={{ background: '#16a34a', color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>
            {t('realEstate.installments.btnRecordReceipt')}
          </button>
        </>}
      >
        {payFor && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={labelStyle}>{t('realEstate.installments.lblAmount')}</label>
              <input type="number" style={fieldStyle} value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>{t('realEstate.installments.lblPaymentDate')}</label>
              <input type="date" style={fieldStyle} value={payForm.payment_date} onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>{t('realEstate.installments.lblMethod')}</label>
              <select style={fieldStyle} value={payForm.payment_method} onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })}>
                <option value="cash">{t('realEstate.installments.methodCash')}</option>
                <option value="bank_transfer">{t('realEstate.installments.methodBankTransfer')}</option>
                <option value="cheque">{t('realEstate.installments.methodCheque')}</option>
                <option value="card">{t('realEstate.installments.methodCard')}</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t('realEstate.installments.lblNotes')}</label>
              <input type="text" style={fieldStyle} value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} />
            </div>
            <div style={{ gridColumn: 'span 2', fontSize: '12px', color: '#64748b' }}>
              {t('realEstate.installments.collectNotice', {
                remaining: `${Math.max(0, Number(payFor.amount) - Number(payFor.paid_amount)).toLocaleString('en-US')} ${t('realEstate.common.currency')}`
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* Payment history (finance_vouchers) */}
      <Modal
        isOpen={!!historyFor}
        onClose={() => setHistoryFor(null)}
        title={historyFor ? t('realEstate.installments.historyModalTitle', { contract: historyFor.contract_number, number: historyFor.installment_number }) : ''}
      >
        <SimpleTable
          columns={[
            { key: 'voucher_number', label: t('realEstate.installments.colVoucherNumber'), render: (v) => <span className="num-en">{v}</span> },
            { key: 'voucher_date', label: t('realEstate.installments.colVoucherDate'), render: fmtDate },
            { key: 'amount', label: t('realEstate.installments.colVoucherAmount'), render: (v) => fmtMoney(v, t('realEstate.common.currencySuffix')) },
            { key: 'payment_method', label: t('realEstate.installments.colVoucherMethod'), render: (v) => getMethodLabel(v) },
            { key: 'notes', label: t('realEstate.installments.colVoucherNotes') },
          ]}
          rows={history}
          empty={t('realEstate.installments.noPaymentsRecorded')}
        />
      </Modal>
    </div>
  );
};

export default Installments;
