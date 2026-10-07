import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CreditCard } from 'lucide-react';
import api from '../../services/api';
import Modal from '../../components/Common/Modal';
import { useAuth } from '../../context/AuthContext';
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
      toast.error(err.response?.data?.message || 'Failed to load installments');
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
      toast.error(err.response?.data?.message || 'Failed to load contracts');
    }
  };

  const generate = async () => {
    if (!plan.contract_id) return toast.error('Select a contract');
    try {
      const res = await api.post('/re-installments/generate-schedule', {
        contract_id: plan.contract_id,
        down_payment: Number(plan.down_payment) || 0,
        number_of_installments: parseInt(plan.number_of_installments) || 1,
        frequency: plan.frequency,
        start_date: plan.start_date
      });
      toast.success(res.data.message || 'Installment plan generated');
      setPlanOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate plan');
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
      toast.success(res.data.message || 'Payment recorded');
      setPayFor(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payment failed');
    }
  };

  const openHistory = async (inst) => {
    setHistoryFor(inst);
    setHistory([]);
    try {
      const res = await api.get(`/re-installments/${inst.id}/payments`);
      setHistory(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load payment history');
    }
  };

  const statusBadge = (inst) => {
    if (inst.status === 'Paid') return <Badge color="green">Paid</Badge>;
    if (inst.is_overdue) return <Badge color="red">Overdue</Badge>;
    if (inst.status === 'Partially Paid') return <Badge color="amber">Partially Paid</Badge>;
    return <Badge color="gray">{inst.status}</Badge>;
  };

  const columns = [
    { key: 'contract_number', label: 'Contract', render: (v) => <strong>{v}</strong> },
    { key: 'deal_title', label: 'Deal', render: (v, r) => v || `#${r.deal_id}` },
    { key: 'customer_name', label: 'Customer', render: (v) => v || '—' },
    { key: 'unit_number', label: 'Unit', render: (v, r) => (v ? `${r.unit_name || ''} ${v}`.trim() : '—') },
    { key: 'installment_number', label: '#' },
    { key: 'installment_type', label: 'Type', render: (v) => <span style={{ textTransform: 'capitalize' }}>{String(v || '').replace('_', ' ')}</span> },
    { key: 'due_date', label: 'Due Date', render: fmtDate },
    { key: 'amount', label: 'Amount', render: fmtMoney },
    { key: 'paid_amount', label: 'Paid', render: (v) => <span style={{ color: '#16a34a' }}>{fmtMoney(v)}</span> },
    { key: 'remaining_balance', label: 'Remaining', render: (v) => fmtMoney(Math.max(0, Number(v))) },
    { key: 'status', label: 'Status', render: (_, r) => statusBadge(r) },
    {
      key: 'actions', label: 'Actions', align: 'right', render: (_, r) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          {r.status !== 'Paid' && canCollect && <ActionButton color="#16a34a" onClick={() => openPay(r)}>Collect</ActionButton>}
          <ActionButton outline color="#334155" onClick={() => openHistory(r)}>History</ActionButton>
        </div>
      )
    },
  ];

  return (
    <div>
      <WorkspaceHeader icon={<CreditCard size={22} color="#0284c7" />} title="Installments" subtitle="Contractual payment schedules and collections (receipts post to Finance vouchers).">
        <button type="button" onClick={openPlan} style={{ background: 'var(--primary)', color: 'white', padding: '10px 18px', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          + Create Installment Plan
        </button>
      </WorkspaceHeader>
      <DealFilterBanner dealId={dealId} label={rows[0]?.deal_title} onClear={() => setSearchParams({})} />
      <StatCards items={[
        { label: 'Scheduled', value: fmtMoney(summary?.total_scheduled) },
        { label: 'Collected', value: fmtMoney(summary?.total_paid), color: '#15803d' },
        { label: 'Outstanding', value: fmtMoney(summary?.total_remaining), color: '#b45309' },
        { label: 'Overdue Installments', value: summary?.overdue_count || 0, color: '#b91c1c' },
      ]} />
      <FilterChips value={filter} onChange={setFilter} options={[
        { value: 'all', label: 'All' },
        { value: 'Pending', label: 'Pending' },
        { value: 'Partially Paid', label: 'Partially Paid' },
        { value: 'overdue', label: 'Overdue' },
        { value: 'Paid', label: 'Paid' },
      ]} />
      <SimpleTable columns={columns} rows={rows} loading={loading}
        rowStyle={(r) => (r.is_overdue && r.status !== 'Paid' ? { background: '#fef2f2' } : r.status === 'Paid' ? { background: '#f0fdf4' } : {})}
        empty="No installments. Create an installment plan from a contract." />

      {/* Create / split installment plan */}
      <Modal isOpen={planOpen} onClose={() => setPlanOpen(false)} title="Create Installment Plan"
        footer={<>
          <button onClick={() => setPlanOpen(false)} style={{ background: '#f1f5f9', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>Cancel</button>
          <button onClick={generate} style={{ background: 'var(--primary)', color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>Generate Plan</button>
        </>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Contract</label>
            <select style={fieldStyle} value={plan.contract_id} onChange={e => {
              const c = contracts.find(x => String(x.id) === e.target.value);
              setPlan({ ...plan, contract_id: e.target.value, down_payment: c?.down_payment || 0 });
            }}>
              <option value="">-- Select contract --</option>
              {contracts.map(c => <option key={c.id} value={c.id}>{c.contract_number} — {c.customer_name || c.deal_title} ({fmtMoney(c.contract_value)})</option>)}
            </select>
            {contracts.length === 0 && <div style={{ fontSize: '12px', color: '#b45309', marginTop: '6px' }}>No open contracts. Create a contract from the Deal first.</div>}
          </div>
          <div><label style={labelStyle}>Down Payment (EGP)</label><input type="number" style={fieldStyle} value={plan.down_payment} onChange={e => setPlan({ ...plan, down_payment: e.target.value })} /></div>
          <div><label style={labelStyle}>Number of Installments</label><input type="number" min="1" max="120" style={fieldStyle} value={plan.number_of_installments} onChange={e => setPlan({ ...plan, number_of_installments: e.target.value })} /></div>
          <div><label style={labelStyle}>Frequency</label>
            <select style={fieldStyle} value={plan.frequency} onChange={e => setPlan({ ...plan, frequency: e.target.value })}>
              <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option>
              <option value="semi-annual">Semi-Annual</option><option value="annual">Annual</option>
            </select>
          </div>
          <div><label style={labelStyle}>First Due Date</label><input type="date" style={fieldStyle} value={plan.start_date} onChange={e => setPlan({ ...plan, start_date: e.target.value })} /></div>
        </div>
      </Modal>

      {/* Collect payment → finance voucher */}
      <Modal isOpen={!!payFor} onClose={() => setPayFor(null)} title={payFor ? `Collect — ${payFor.contract_number} #${payFor.installment_number}` : ''}
        footer={<>
          <button onClick={() => setPayFor(null)} style={{ background: '#f1f5f9', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>Cancel</button>
          <button onClick={submitPay} style={{ background: '#16a34a', color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>Record Receipt</button>
        </>}>
        {payFor && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div><label style={labelStyle}>Amount (EGP)</label><input type="number" style={fieldStyle} value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} /></div>
            <div><label style={labelStyle}>Payment Date</label><input type="date" style={fieldStyle} value={payForm.payment_date} onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })} /></div>
            <div><label style={labelStyle}>Method</label>
              <select style={fieldStyle} value={payForm.payment_method} onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })}>
                <option value="cash">Cash</option><option value="bank_transfer">Bank Transfer</option><option value="cheque">Cheque</option><option value="card">Card</option>
              </select>
            </div>
            <div><label style={labelStyle}>Notes</label><input type="text" style={fieldStyle} value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} /></div>
            <div style={{ gridColumn: 'span 2', fontSize: '12px', color: '#64748b' }}>Remaining on this installment: {fmtMoney(Math.max(0, Number(payFor.amount) - Number(payFor.paid_amount)))}. A receipt voucher will be created in Finance.</div>
          </div>
        )}
      </Modal>

      {/* Payment history (finance_vouchers) */}
      <Modal isOpen={!!historyFor} onClose={() => setHistoryFor(null)} title={historyFor ? `Payment History — ${historyFor.contract_number} #${historyFor.installment_number}` : ''}>
        <SimpleTable
          columns={[
            { key: 'voucher_number', label: 'Voucher #' },
            { key: 'voucher_date', label: 'Date', render: fmtDate },
            { key: 'amount', label: 'Amount', render: fmtMoney },
            { key: 'payment_method', label: 'Method' },
            { key: 'notes', label: 'Notes' },
          ]}
          rows={history}
          empty="No payments recorded."
        />
      </Modal>
    </div>
  );
};

export default Installments;
