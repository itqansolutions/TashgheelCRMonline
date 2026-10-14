import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Award } from 'lucide-react';
import api from '../../services/api';
import Modal from '../../components/Common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  WorkspaceHeader, StatCards, FilterChips, SimpleTable, Badge, ActionButton, DealFilterBanner,
  fmtMoney, fieldStyle, labelStyle
} from '../../components/RealEstate/WorkspaceKit';

/**
 * Sales → Commissions (standalone workspace)
 * Reuses the existing Real Estate commission engine (/api/re-commissions):
 * calculation, approval and payout rules are unchanged. Visibility is
 * row-scoped by the backend (deal scope OR current user is the beneficiary).
 */
const STATUS_COLOR = { Pending: 'amber', Approved: 'blue', Earned: 'blue', 'Partially Paid': 'amber', Paid: 'green', Clawback: 'red', Cancelled: 'gray' };
const emptyForm = { deal_id: '', beneficiary_type: 'internal_agent', beneficiary_name: '', commission_type: 'percentage', rate: 2.5, calculated_amount: 0, trigger_event: 'contract_signing', notes: '' };

const Commissions = () => {
  const { user, hasFinancialPermission } = useAuth();
  const { t, isRTL } = useLanguage();
  const canPay = !!hasFinancialPermission?.('payment.create');
  const { deals, fetchDeals } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const dealId = searchParams.get('deal_id');
  const [filter, setFilter] = useState('all');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const getStatusLabel = (s) => {
    switch (s) {
      case 'Pending': return t('realEstate.commissions.statusPending');
      case 'Approved': return t('realEstate.commissions.statusApproved');
      case 'Earned': return t('realEstate.commissions.statusEarned');
      case 'Partially Paid': return t('realEstate.commissions.statusPartiallyPaid');
      case 'Paid': return t('realEstate.commissions.statusPaid');
      case 'Clawback': return t('realEstate.commissions.statusClawback');
      case 'Cancelled': return t('realEstate.commissions.statusCancelled');
      default: return s;
    }
  };

  const getBeneficiaryTypeLabel = (bt) => {
    switch (bt) {
      case 'internal_agent': return t('realEstate.commissions.typeInternalAgent');
      case 'broker': return t('realEstate.commissions.typeBroker');
      case 'agency': return t('realEstate.commissions.typeAgency');
      default: return String(bt || '').replace('_', ' ');
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dealId) params.set('deal_id', dealId);
      if (filter !== 'all') params.set('status', filter);
      const res = await api.get(`/re-commissions?${params.toString()}`);
      setRows(res.data.data || []);
      setSummary(res.data.summary || null);
    } catch (err) {
      toast.error(err.response?.data?.message || t('realEstate.commissions.toastLoadError'));
      setRows([]); setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [dealId, filter]);
  useEffect(() => { if (!deals || deals.length === 0) fetchDeals(); }, []);

  const eligibleDeals = useMemo(() => (deals || []).filter(d => Number(d.value) > 0 && String(d.pipeline_stage || '').toLowerCase() !== 'lost'), [deals]);

  const openForm = () => {
    setForm({ ...emptyForm, deal_id: dealId || '' });
    setFormOpen(true);
  };

  const submit = async () => {
    const deal = eligibleDeals.find(d => String(d.id) === String(form.deal_id));
    if (!deal) return toast.error(t('realEstate.commissions.toastSelectDeal'));
    try {
      let contractId = null;
      try {
        const c = await api.get(`/re-contracts?deal_id=${deal.id}`);
        contractId = c.data.data?.[0]?.id || null;
      } catch (e) { /* no contract yet */ }
      const res = await api.post('/re-commissions', {
        deal_id: deal.id,
        contract_id: contractId,
        beneficiary_type: form.beneficiary_type,
        beneficiary_name: form.beneficiary_name || user?.name || 'Agent',
        commission_type: form.commission_type,
        rate: Number(form.rate) || 0,
        base_amount: Number(deal.value) || 0,
        calculated_amount: form.commission_type === 'fixed' ? Number(form.calculated_amount) : undefined,
        trigger_event: form.trigger_event,
        notes: form.notes
      });
      toast.success(res.data.message || t('realEstate.commissions.toastCreateSuccess'));
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || t('realEstate.commissions.toastCreateError'));
    }
  };

  const approve = async (c) => {
    try {
      const res = await api.patch(`/re-commissions/${c.id}/status`, { status: 'Approved' });
      toast.success(res.data.message || t('realEstate.commissions.toastApproveSuccess'));
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || t('realEstate.commissions.toastApproveError'));
    }
  };

  const pay = async (c, unpaid) => {
    const amt = window.prompt(t('realEstate.commissions.promptPayoutAmount'), unpaid);
    if (!amt) return;
    try {
      const res = await api.post(`/re-commissions/${c.id}/pay`, { amount: parseFloat(amt), payment_date: new Date().toISOString().split('T')[0] });
      toast.success(res.data.message || t('realEstate.commissions.toastPaySuccess'));
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || t('realEstate.commissions.toastPayError'));
    }
  };

  const columns = [
    { key: 'beneficiary_name', label: t('realEstate.commissions.colBeneficiary'), render: (v) => <strong>{v}</strong> },
    { key: 'beneficiary_type', label: t('realEstate.commissions.colType'), render: (v) => <span>{getBeneficiaryTypeLabel(v)}</span> },
    { key: 'deal_title', label: t('realEstate.commissions.colDeal'), render: (v, r) => v || `#${r.deal_id}` },
    { key: 'contract_number', label: t('realEstate.commissions.colContract'), render: (v) => (v ? <span className="num-en">{v}</span> : '—') },
    {
      key: 'rate',
      label: t('realEstate.commissions.colRateCalc'),
      render: (v, r) => (r.commission_type === 'percentage' ? <span><span className="num-en">{v}</span>%</span> : t('realEstate.commissions.fixed'))
    },
    { key: 'calculated_amount', label: t('realEstate.commissions.colTotalDue'), render: (v) => fmtMoney(v, t('realEstate.common.currencySuffix')) },
    { key: 'paid_amount', label: t('realEstate.commissions.colPaid'), render: (v) => <span style={{ color: '#16a34a' }}>{fmtMoney(v, t('realEstate.common.currencySuffix'))}</span> },
    { key: 'status', label: t('realEstate.commissions.colStatus'), render: (v) => <Badge color={STATUS_COLOR[v]}>{getStatusLabel(v)}</Badge> },
    {
      key: 'actions',
      label: t('realEstate.commissions.colActions'),
      align: isRTL ? 'left' : 'right',
      render: (_, r) => {
        const unpaid = Math.max(0, Number(r.calculated_amount) - Number(r.paid_amount));
        return (
          <div style={{ display: 'flex', gap: '6px', justifyContent: isRTL ? 'flex-start' : 'flex-end' }}>
            {r.status === 'Pending' && (
              <ActionButton onClick={() => approve(r)}>
                {t('realEstate.commissions.btnApprove')}
              </ActionButton>
            )}
            {['Approved', 'Earned', 'Partially Paid'].includes(r.status) && unpaid > 0 && canPay && (
              <ActionButton color="#16a34a" onClick={() => pay(r, unpaid)}>
                {t('realEstate.commissions.btnPay')}
              </ActionButton>
            )}
          </div>
        );
      }
    },
  ];

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <WorkspaceHeader
        icon={<Award size={22} color="#ea580c" />}
        title={t('realEstate.commissions.title')}
        subtitle={t('realEstate.commissions.subtitle')}
      >
        <button
          type="button"
          onClick={openForm}
          style={{ background: 'var(--primary)', color: 'white', padding: '10px 18px', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
        >
          {t('realEstate.commissions.btnAddCommission')}
        </button>
      </WorkspaceHeader>
      <DealFilterBanner dealId={dealId} label={rows[0]?.deal_title} onClear={() => setSearchParams({})} />
      <StatCards items={[
        { label: t('realEstate.commissions.statTotal'), value: fmtMoney(summary?.total_commissions, t('realEstate.common.currencySuffix')) },
        { label: t('realEstate.commissions.statPaid'), value: fmtMoney(summary?.total_paid, t('realEstate.common.currencySuffix')), color: '#15803d' },
        { label: t('realEstate.commissions.statPendingPayout'), value: fmtMoney(summary?.total_pending, t('realEstate.common.currencySuffix')), color: '#b45309' },
        { label: t('realEstate.commissions.statRecords'), value: summary?.count || 0 },
      ]} />
      <FilterChips value={filter} onChange={setFilter} options={[
        { value: 'all', label: t('realEstate.commissions.filterAll') },
        { value: 'Pending', label: t('realEstate.commissions.filterPending') },
        { value: 'Approved', label: t('realEstate.commissions.filterApproved') },
        { value: 'Partially Paid', label: t('realEstate.commissions.filterPartiallyPaid') },
        { value: 'Paid', label: t('realEstate.commissions.filterPaid') },
        { value: 'Cancelled', label: t('realEstate.commissions.filterCancelled') },
      ]} />
      <SimpleTable
        columns={columns}
        rows={rows}
        loading={loading}
        empty={t('realEstate.commissions.empty')}
      />

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={t('realEstate.commissions.modalTitle')}
        footer={<>
          <button onClick={() => setFormOpen(false)} style={{ background: '#f1f5f9', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>
            {t('realEstate.common.cancel')}
          </button>
          <button onClick={submit} style={{ background: 'var(--primary)', color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>
            {t('realEstate.commissions.btnSaveCommission')}
          </button>
        </>}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>{t('realEstate.commissions.lblDeal')}</label>
            <select style={fieldStyle} value={form.deal_id} onChange={e => setForm({ ...form, deal_id: e.target.value })}>
              <option value="">{t('realEstate.commissions.placeholderSelectDeal')}</option>
              {eligibleDeals.map(d => (
                <option key={d.id} value={d.id}>
                  #{d.id} {d.title} — {Number(d.value || 0).toLocaleString('en-US')} {t('realEstate.common.currency')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t('realEstate.commissions.lblBeneficiaryType')}</label>
            <select style={fieldStyle} value={form.beneficiary_type} onChange={e => setForm({ ...form, beneficiary_type: e.target.value })}>
              <option value="internal_agent">{t('realEstate.commissions.typeInternalAgent')}</option>
              <option value="broker">{t('realEstate.commissions.typeBroker')}</option>
              <option value="agency">{t('realEstate.commissions.typeAgency')}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t('realEstate.commissions.lblBeneficiaryName')}</label>
            <input type="text" style={fieldStyle} value={form.beneficiary_name} onChange={e => setForm({ ...form, beneficiary_name: e.target.value })} placeholder={t('realEstate.commissions.placeholderBeneficiaryName')} />
          </div>
          <div>
            <label style={labelStyle}>{t('realEstate.commissions.lblCalculation')}</label>
            <select style={fieldStyle} value={form.commission_type} onChange={e => setForm({ ...form, commission_type: e.target.value })}>
              <option value="percentage">{t('realEstate.commissions.calcPercentage')}</option>
              <option value="fixed">{t('realEstate.commissions.calcFixed')}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{form.commission_type === 'percentage' ? t('realEstate.commissions.lblRate') : t('realEstate.commissions.lblAmount')}</label>
            <input
              type="number"
              step="0.01"
              style={fieldStyle}
              value={form.commission_type === 'percentage' ? form.rate : form.calculated_amount}
              onChange={e => setForm(form.commission_type === 'percentage' ? { ...form, rate: e.target.value } : { ...form, calculated_amount: e.target.value })}
            />
          </div>
          <div>
            <label style={labelStyle}>{t('realEstate.commissions.lblTriggerEvent')}</label>
            <select style={fieldStyle} value={form.trigger_event} onChange={e => setForm({ ...form, trigger_event: e.target.value })}>
              <option value="contract_signing">{t('realEstate.commissions.triggerContractSigning')}</option>
              <option value="down_payment">{t('realEstate.commissions.triggerDownPayment')}</option>
              <option value="installment_collection">{t('realEstate.commissions.triggerInstallmentCollection')}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t('realEstate.commissions.lblNotes')}</label>
            <input type="text" style={fieldStyle} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Commissions;
