import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileText } from 'lucide-react';
import api from '../../services/api';
import Modal from '../../components/Common/Modal';
import {
  WorkspaceHeader, StatCards, FilterChips, SimpleTable, Badge, ActionButton, DealFilterBanner,
  fmtMoney, fmtDate, fieldStyle, labelStyle
} from '../../components/RealEstate/WorkspaceKit';

/**
 * Real Estate → Contracts (standalone workspace)
 * Contracts originate from a Deal (created from the Deal's Related Records panel)
 * and keep the link to it. Lifecycle: Draft → Generated → Signed → Active → Completed / Cancelled.
 * Term: start date + duration (months) → end date; expiry reminders are sent by the backend scanner.
 */
const NEXT_STEP = {
  Draft: { status: 'Generated', label: 'Generate', color: '#2563eb' },
  Generated: { status: 'Signed', label: 'Mark Signed', color: '#d97706' },
  Signed: { status: 'Active', label: 'Activate', color: '#16a34a' },
  Active: { status: 'Completed', label: 'Complete', color: '#059669' },
};
const STATUS_COLOR = { Draft: 'gray', Generated: 'blue', Signed: 'amber', Active: 'green', Completed: 'teal', Cancelled: 'red' };

const expiryBadge = (c) => {
  switch (c.expiry_state) {
    case 'expired': return <Badge color="red">Expired {Math.abs(c.days_remaining)}d ago</Badge>;
    case 'expiring_soon': return <Badge color="amber">{c.days_remaining}d left</Badge>;
    case 'active': return <Badge color="green">{c.days_remaining}d left</Badge>;
    case 'closed': return <Badge color="gray">—</Badge>;
    default: return <span style={{ color: '#94a3b8', fontSize: '12px' }}>No term</span>;
  }
};

const Contracts = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const dealId = searchParams.get('deal_id');
  const [filter, setFilter] = useState('all');
  const [contracts, setContracts] = useState([]);
  const [allContracts, setAllContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dealId) params.set('deal_id', dealId);
      const res = await api.get(`/re-contracts?${params.toString()}`);
      const data = res.data.data || [];
      setAllContracts(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load contracts');
      setAllContracts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [dealId]);

  useEffect(() => {
    setContracts(allContracts.filter(c => {
      if (filter === 'all') return true;
      if (filter === 'expiring_soon' || filter === 'expired') return c.expiry_state === filter;
      return c.status === filter;
    }));
  }, [allContracts, filter]);

  const transition = async (c, status) => {
    if (status === 'Cancelled' && !window.confirm(`Cancel contract ${c.contract_number}?`)) return;
    try {
      const res = await api.patch(`/re-contracts/${c.id}/status`, { status });
      toast.success(res.data.message || `Contract → ${status}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Status update failed');
    }
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({
      contract_date: fmtDate(c.contract_date) === '—' ? '' : fmtDate(c.contract_date),
      start_date: c.start_date ? fmtDate(c.start_date) : '',
      duration_months: c.duration_months ?? '',
      end_date: c.end_date ? fmtDate(c.end_date) : '',
      contract_value: c.contract_value,
      down_payment: c.down_payment,
      notes: c.notes || ''
    });
  };

  const saveEdit = async () => {
    const payload = {
      contract_date: form.contract_date || undefined,
      start_date: form.start_date || null,
      notes: form.notes,
    };
    // duration drives end date when provided; otherwise send explicit end date
    if (form.duration_months !== '' && form.duration_months !== null) payload.duration_months = form.duration_months;
    else payload.end_date = form.end_date || null;
    if (!['Signed', 'Active'].includes(editing.status)) {
      payload.contract_value = form.contract_value;
      payload.down_payment = form.down_payment;
    }
    try {
      await api.put(`/re-contracts/${editing.id}`, payload);
      toast.success('Contract updated');
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    }
  };

  const count = (fn) => allContracts.filter(fn).length;
  const commercialFrozen = editing && ['Signed', 'Active'].includes(editing.status);

  const columns = [
    { key: 'contract_number', label: 'Contract #', render: (v) => <strong>{v}</strong> },
    { key: 'customer_name', label: 'Customer', render: (v) => v || '—' },
    { key: 'deal_title', label: 'Deal', render: (v, c) => <span title={`Deal #${c.deal_id}`}>{v || `#${c.deal_id}`}</span> },
    { key: 'unit', label: 'Unit', render: (_, c) => (c.unit_number ? `${c.project_name || ''} • ${c.unit_number}` : '—') },
    { key: 'contract_date', label: 'Contract Date', render: fmtDate },
    { key: 'start_date', label: 'Start', render: fmtDate },
    { key: 'end_date', label: 'End', render: fmtDate },
    { key: 'duration_months', label: 'Duration', render: (v) => (v ? `${v} mo` : '—') },
    { key: 'contract_value', label: 'Value', render: fmtMoney },
    { key: 'expiry', label: 'Expiry', render: (_, c) => expiryBadge(c) },
    { key: 'status', label: 'Status', render: (v) => <Badge color={STATUS_COLOR[v]}>{v}</Badge> },
    {
      key: 'actions', label: 'Actions', align: 'right', render: (_, c) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          {NEXT_STEP[c.status] && <ActionButton color={NEXT_STEP[c.status].color} onClick={() => transition(c, NEXT_STEP[c.status].status)}>{NEXT_STEP[c.status].label}</ActionButton>}
          {!['Completed', 'Cancelled'].includes(c.status) && <ActionButton outline color="#334155" onClick={() => openEdit(c)}>Edit</ActionButton>}
          <ActionButton outline color="#2563eb" onClick={() => navigate(`/installments?deal_id=${c.deal_id}`)}>Installments</ActionButton>
          {!['Completed', 'Cancelled'].includes(c.status) && <ActionButton outline color="#b91c1c" onClick={() => transition(c, 'Cancelled')}>Cancel</ActionButton>}
        </div>
      )
    },
  ];

  return (
    <div>
      <WorkspaceHeader icon={<FileText size={22} color="#2563eb" />} title="Contracts" subtitle="Sales contracts originated from deals — lifecycle, term and expiry tracking." />
      <DealFilterBanner dealId={dealId} label={allContracts[0]?.deal_title} onClear={() => setSearchParams({})} />
      <StatCards items={[
        { label: 'Total Contracts', value: allContracts.length },
        { label: 'Active', value: count(c => c.status === 'Active'), color: '#15803d' },
        { label: 'Expiring Soon (30d)', value: count(c => c.expiry_state === 'expiring_soon'), color: '#b45309' },
        { label: 'Expired', value: count(c => c.expiry_state === 'expired'), color: '#b91c1c' },
      ]} />
      <FilterChips value={filter} onChange={setFilter} options={[
        { value: 'all', label: 'All' },
        { value: 'Draft', label: 'Draft' },
        { value: 'Signed', label: 'Signed' },
        { value: 'Active', label: 'Active' },
        { value: 'expiring_soon', label: 'Expiring soon' },
        { value: 'expired', label: 'Expired' },
        { value: 'Completed', label: 'Completed' },
        { value: 'Cancelled', label: 'Cancelled' },
      ]} />
      <SimpleTable columns={columns} rows={contracts} loading={loading} empty="No contracts. Contracts are created from a Deal (Deals → open deal → Create Sales Contract)." />

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.contract_number}` : ''}
        footer={<>
          <button className="btn-cancel" onClick={() => setEditing(null)} style={{ background: '#f1f5f9', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>Cancel</button>
          <button className="btn-save" onClick={saveEdit} style={{ background: 'var(--primary)', color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>Save</button>
        </>}
      >
        {editing && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div><label style={labelStyle}>Contract Date</label><input type="date" style={fieldStyle} value={form.contract_date} onChange={e => setForm({ ...form, contract_date: e.target.value })} /></div>
            <div><label style={labelStyle}>Start Date</label><input type="date" style={fieldStyle} value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><label style={labelStyle}>Duration (months)</label><input type="number" min="0" style={fieldStyle} value={form.duration_months} onChange={e => setForm({ ...form, duration_months: e.target.value })} placeholder="e.g. 12" /></div>
            <div><label style={labelStyle}>End Date {form.duration_months !== '' && <span style={{ color: '#94a3b8' }}>(from duration)</span>}</label><input type="date" style={fieldStyle} value={form.end_date} disabled={form.duration_months !== ''} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
            <div><label style={labelStyle}>Contract Value (EGP)</label><input type="number" style={fieldStyle} value={form.contract_value} disabled={commercialFrozen} onChange={e => setForm({ ...form, contract_value: e.target.value })} /></div>
            <div><label style={labelStyle}>Down Payment (EGP)</label><input type="number" style={fieldStyle} value={form.down_payment} disabled={commercialFrozen} onChange={e => setForm({ ...form, down_payment: e.target.value })} /></div>
            <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Notes</label><textarea rows="2" style={fieldStyle} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            {commercialFrozen && <div style={{ gridColumn: 'span 2', fontSize: '12px', color: '#92400e' }}>Value and down payment are frozen once a contract is {editing.status}.</div>}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Contracts;
