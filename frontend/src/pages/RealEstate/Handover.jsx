import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Key } from 'lucide-react';
import api from '../../services/api';
import Modal from '../../components/Common/Modal';
import { useData } from '../../context/DataContext';
import {
  WorkspaceHeader, StatCards, FilterChips, SimpleTable, Badge, ActionButton, DealFilterBanner,
  fmtDate, fieldStyle, labelStyle
} from '../../components/RealEstate/WorkspaceKit';

/**
 * Sales → Handover (standalone workspace)
 * Reuses the existing handover milestone lifecycle (/api/re-handovers):
 * Scheduled → Inspection → Ready for Delivery → Handed Over.
 */
const STATUS_COLOR = { Scheduled: 'gray', Inspection: 'blue', 'Ready for Delivery': 'amber', 'Handed Over': 'teal', Cancelled: 'red' };
const NEXT = {
  Scheduled: [{ status: 'Inspection', label: 'Start Inspection', color: '#0284c7' }],
  Inspection: [{ status: 'Ready for Delivery', label: 'Ready for Delivery', color: '#0d9488' }],
};

const Handover = () => {
  const { deals, fetchDeals } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const dealId = searchParams.get('deal_id');
  const [filter, setFilter] = useState('all');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ deal_id: '', scheduled_date: '', snagging_notes: '' });

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dealId) params.set('deal_id', dealId);
      if (filter !== 'all') params.set('status', filter);
      const res = await api.get(`/re-handovers?${params.toString()}`);
      setRows(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load handovers');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [dealId, filter]);
  useEffect(() => { if (!deals || deals.length === 0) fetchDeals(); }, []);

  // Handover applies to unit deals that reached the final stage (or are contracted)
  const eligibleDeals = useMemo(() => (deals || []).filter(d => d.unit_id && String(d.pipeline_stage || '').toLowerCase() !== 'lost'), [deals]);

  const submit = async () => {
    if (!form.deal_id) return toast.error('Select a deal');
    try {
      const res = await api.post('/re-handovers', {
        deal_id: form.deal_id,
        scheduled_date: form.scheduled_date || new Date().toISOString().split('T')[0],
        snagging_notes: form.snagging_notes
      });
      toast.success(res.data.message || 'Handover scheduled');
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to schedule handover');
    }
  };

  const transition = async (h, status) => {
    if (status === 'Handed Over' && !window.confirm('Complete handover and release keys?')) return;
    try {
      const res = await api.patch(`/re-handovers/${h.id}/status`, { status });
      toast.success(res.data.message || `Handover → ${status}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Status update failed');
    }
  };

  const columns = [
    { key: 'unit_number', label: 'Unit', render: (v, r) => <strong>{r.project_name ? `${r.project_name} • ` : ''}{v || '—'}</strong> },
    { key: 'deal_title', label: 'Deal', render: (v, r) => v || `#${r.deal_id}` },
    { key: 'customer_name', label: 'Customer', render: (v) => v || '—' },
    { key: 'contract_number', label: 'Contract', render: (v) => v || '—' },
    { key: 'scheduled_date', label: 'Scheduled', render: fmtDate },
    { 
      key: 'total_paid', 
      label: 'Collections (Info)', 
      render: (_, r) => {
        const val = Number(r.contract_value) || 0;
        const paid = Number(r.total_paid) || 0;
        const pct = val > 0 ? Math.round((paid / val) * 100) : 0;
        const overdue = Number(r.overdue_installments_count) || 0;
        return (
          <div style={{ fontSize: '12px' }}>
            <span style={{ fontWeight: 600 }}>{pct}% Paid</span>
            {overdue > 0 && <span style={{ marginLeft: '6px', color: '#dc2626', fontSize: '11px' }}>({overdue} Overdue)</span>}
          </div>
        );
      }
    },
    { key: 'actual_handover_date', label: 'Delivered', render: fmtDate },
    { key: 'keys_handed_over', label: 'Keys', render: (v) => (v ? <Badge color="teal">Issued</Badge> : <Badge>Pending</Badge>) },
    { key: 'status', label: 'Status', render: (v) => <Badge color={STATUS_COLOR[v]}>{v}</Badge> },
    {
      key: 'actions', label: 'Actions', align: 'right', render: (_, r) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          {(NEXT[r.status] || []).map(n => <ActionButton key={n.status} color={n.color} onClick={() => transition(r, n.status)}>{n.label}</ActionButton>)}
          {['Scheduled', 'Inspection', 'Ready for Delivery'].includes(r.status) && <ActionButton color="#059669" onClick={() => transition(r, 'Handed Over')}>Complete</ActionButton>}
        </div>
      )
    },
  ];

  const count = (s) => rows.filter(r => r.status === s).length;

  return (
    <div>
      <WorkspaceHeader icon={<Key size={22} color="#0d9488" />} title="Handover" subtitle="Unit delivery milestones, inspections and key release.">
        <button type="button" onClick={() => { setForm({ deal_id: dealId || '', scheduled_date: '', snagging_notes: '' }); setFormOpen(true); }} style={{ background: 'var(--primary)', color: 'white', padding: '10px 18px', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          + Schedule Handover
        </button>
      </WorkspaceHeader>
      <DealFilterBanner dealId={dealId} label={rows[0]?.deal_title} onClear={() => setSearchParams({})} />
      <StatCards items={[
        { label: 'Scheduled', value: count('Scheduled') },
        { label: 'Inspection', value: count('Inspection'), color: '#1d4ed8' },
        { label: 'Ready for Delivery', value: count('Ready for Delivery'), color: '#b45309' },
        { label: 'Handed Over', value: count('Handed Over'), color: '#0f766e' },
      ]} />
      <FilterChips value={filter} onChange={setFilter} options={[
        { value: 'all', label: 'All' }, { value: 'Scheduled', label: 'Scheduled' }, { value: 'Inspection', label: 'Inspection' },
        { value: 'Ready for Delivery', label: 'Ready for Delivery' }, { value: 'Handed Over', label: 'Handed Over' },
      ]} />
      <SimpleTable columns={columns} rows={rows} loading={loading} empty="No handovers scheduled." />

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title="Schedule Handover"
        footer={<>
          <button onClick={() => setFormOpen(false)} style={{ background: '#f1f5f9', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>Cancel</button>
          <button onClick={submit} style={{ background: 'var(--primary)', color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>Confirm Schedule</button>
        </>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Deal (unit)</label>
            <select style={fieldStyle} value={form.deal_id} onChange={e => setForm({ ...form, deal_id: e.target.value })}>
              <option value="">-- Select deal --</option>
              {eligibleDeals.map(d => <option key={d.id} value={d.id}>#{d.id} {d.title} ({d.pipeline_stage})</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Target Delivery Date</label><input type="date" style={fieldStyle} value={form.scheduled_date} onChange={e => setForm({ ...form, scheduled_date: e.target.value })} /></div>
          <div><label style={labelStyle}>Inspection / Snagging Notes</label><input type="text" style={fieldStyle} value={form.snagging_notes} onChange={e => setForm({ ...form, snagging_notes: e.target.value })} /></div>
        </div>
      </Modal>
    </div>
  );
};

export default Handover;
