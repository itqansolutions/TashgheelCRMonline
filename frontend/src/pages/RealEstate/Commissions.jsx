import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Award } from 'lucide-react';
import api from '../../services/api';
import Modal from '../../components/Common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
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
      toast.error(err.response?.data?.message || 'Failed to load commissions');
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
    if (!deal) return toast.error('Select a deal');
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
      toast.success(res.data.message || 'Commission created');
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create commission');
    }
  };

  const approve = async (c) => {
    try {
      const res = await api.patch(`/re-commissions/${c.id}/status`, { status: 'Approved' });
      toast.success(res.data.message || 'Commission approved');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve');
    }
  };

  const pay = async (c, unpaid) => {
    const amt = window.prompt('Commission payout amount (EGP):', unpaid);
    if (!amt) return;
    try {
      const res = await api.post(`/re-commissions/${c.id}/pay`, { amount: parseFloat(amt), payment_date: new Date().toISOString().split('T')[0] });
      toast.success(res.data.message || 'Commission paid');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payout failed');
    }
  };

  const columns = [
    { key: 'beneficiary_name', label: 'Beneficiary', render: (v) => <strong>{v}</strong> },
    { key: 'beneficiary_type', label: 'Type', render: (v) => <span style={{ textTransform: 'capitalize' }}>{String(v || '').replace('_', ' ')}</span> },
    { key: 'deal_title', label: 'Deal', render: (v, r) => v || `#${r.deal_id}` },
    { key: 'contract_number', label: 'Contract', render: (v) => v || '—' },
    { key: 'rate', label: 'Rate / Calc', render: (v, r) => (r.commission_type === 'percentage' ? `${v}%` : 'Fixed') },
    { key: 'calculated_amount', label: 'Total Due', render: fmtMoney },
    { key: 'paid_amount', label: 'Paid', render: (v) => <span style={{ color: '#16a34a' }}>{fmtMoney(v)}</span> },
    { key: 'status', label: 'Status', render: (v) => <Badge color={STATUS_COLOR[v]}>{v}</Badge> },
    {
      key: 'actions', label: 'Actions', align: 'right', render: (_, r) => {
        const unpaid = Math.max(0, Number(r.calculated_amount) - Number(r.paid_amount));
        return (
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            {r.status === 'Pending' && <ActionButton onClick={() => approve(r)}>Approve</ActionButton>}
            {['Approved', 'Earned', 'Partially Paid'].includes(r.status) && unpaid > 0 && canPay && <ActionButton color="#16a34a" onClick={() => pay(r, unpaid)}>Pay</ActionButton>}
          </div>
        );
      }
    },
  ];

  return (
    <div>
      <WorkspaceHeader icon={<Award size={22} color="#ea580c" />} title="Commissions" subtitle="Agent and broker commissions earned on deals and contracts.">
        <button type="button" onClick={openForm} style={{ background: 'var(--primary)', color: 'white', padding: '10px 18px', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          + Add Commission
        </button>
      </WorkspaceHeader>
      <DealFilterBanner dealId={dealId} label={rows[0]?.deal_title} onClear={() => setSearchParams({})} />
      <StatCards items={[
        { label: 'Total Commissions', value: fmtMoney(summary?.total_commissions) },
        { label: 'Paid', value: fmtMoney(summary?.total_paid), color: '#15803d' },
        { label: 'Pending Payout', value: fmtMoney(summary?.total_pending), color: '#b45309' },
        { label: 'Records', value: summary?.count || 0 },
      ]} />
      <FilterChips value={filter} onChange={setFilter} options={[
        { value: 'all', label: 'All' }, { value: 'Pending', label: 'Pending' }, { value: 'Approved', label: 'Approved' },
        { value: 'Partially Paid', label: 'Partially Paid' }, { value: 'Paid', label: 'Paid' }, { value: 'Cancelled', label: 'Cancelled' },
      ]} />
      <SimpleTable columns={columns} rows={rows} loading={loading} empty="No commissions recorded." />

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title="Add Commission"
        footer={<>
          <button onClick={() => setFormOpen(false)} style={{ background: '#f1f5f9', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>Cancel</button>
          <button onClick={submit} style={{ background: 'var(--primary)', color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>Save Commission</button>
        </>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Deal</label>
            <select style={fieldStyle} value={form.deal_id} onChange={e => setForm({ ...form, deal_id: e.target.value })}>
              <option value="">-- Select deal --</option>
              {eligibleDeals.map(d => <option key={d.id} value={d.id}>#{d.id} {d.title} — {fmtMoney(d.value)}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Beneficiary Type</label>
            <select style={fieldStyle} value={form.beneficiary_type} onChange={e => setForm({ ...form, beneficiary_type: e.target.value })}>
              <option value="internal_agent">Internal Agent</option><option value="broker">External Broker</option><option value="agency">Agency / Partner</option>
            </select>
          </div>
          <div><label style={labelStyle}>Beneficiary Name</label><input type="text" style={fieldStyle} value={form.beneficiary_name} onChange={e => setForm({ ...form, beneficiary_name: e.target.value })} placeholder="Agent / Broker name" /></div>
          <div><label style={labelStyle}>Calculation</label>
            <select style={fieldStyle} value={form.commission_type} onChange={e => setForm({ ...form, commission_type: e.target.value })}>
              <option value="percentage">Percentage (%)</option><option value="fixed">Fixed Amount (EGP)</option>
            </select>
          </div>
          <div><label style={labelStyle}>{form.commission_type === 'percentage' ? 'Rate (%)' : 'Amount (EGP)'}</label>
            <input type="number" step="0.01" style={fieldStyle}
              value={form.commission_type === 'percentage' ? form.rate : form.calculated_amount}
              onChange={e => setForm(form.commission_type === 'percentage' ? { ...form, rate: e.target.value } : { ...form, calculated_amount: e.target.value })} />
          </div>
          <div><label style={labelStyle}>Trigger Event</label>
            <select style={fieldStyle} value={form.trigger_event} onChange={e => setForm({ ...form, trigger_event: e.target.value })}>
              <option value="contract_signing">Contract Signing</option><option value="down_payment">Down Payment</option><option value="installment_collection">Installment Collection</option>
            </select>
          </div>
          <div><label style={labelStyle}>Notes</label><input type="text" style={fieldStyle} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
      </Modal>
    </div>
  );
};

export default Commissions;
