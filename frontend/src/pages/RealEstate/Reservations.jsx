import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2 } from 'lucide-react';
import api from '../../services/api';
import { useData } from '../../context/DataContext';
import { WorkspaceHeader, StatCards, FilterChips, SimpleTable, Badge, ActionButton } from '../../components/RealEstate/WorkspaceKit';

/**
 * Real Estate → Reservations (standalone workspace)
 * A reservation is a unit held for an open deal (re_units.status = 'Reserved').
 * Source: GET /api/deals (tenant + row scoped server-side). Extension reuses
 * POST /api/deals/:id/extend-reservation (existing reservation engine).
 */
const OPEN_STAGE_EXCLUDE = ['won', 'lost', 'closed'];

const timeLeft = (iso) => {
  if (!iso) return { text: 'No expiry', ms: Infinity };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { text: 'Expired', ms };
  const h = Math.floor(ms / 3600000);
  if (h >= 48) return { text: `${Math.floor(h / 24)}d ${h % 24}h`, ms };
  return { text: `${h}h ${Math.floor((ms % 3600000) / 60000)}m`, ms };
};

const Reservations = () => {
  const navigate = useNavigate();
  const { deals, fetchDeals, loading } = useData();
  const [filter, setFilter] = useState('all');

  useEffect(() => { fetchDeals(); }, []);

  const reservations = useMemo(() => (deals || []).filter(d =>
    d.unit_id &&
    String(d.unit_status || '').toLowerCase() === 'reserved' &&
    !OPEN_STAGE_EXCLUDE.includes(String(d.pipeline_stage || '').toLowerCase())
  ), [deals]);

  const rows = useMemo(() => reservations.filter(d => {
    const t = timeLeft(d.unit_reservation_expires_at);
    if (filter === 'expiring') return t.ms > 0 && t.ms <= 24 * 3600000;
    if (filter === 'expired') return t.ms <= 0;
    return true;
  }), [reservations, filter]);

  const expiringCount = reservations.filter(d => { const t = timeLeft(d.unit_reservation_expires_at); return t.ms > 0 && t.ms <= 24 * 3600000; }).length;
  const expiredCount = reservations.filter(d => timeLeft(d.unit_reservation_expires_at).ms <= 0).length;

  const extend = async (dealId, hours) => {
    try {
      const res = await api.post(`/deals/${dealId}/extend-reservation`, { extension_hours: hours });
      toast.success(res.data.message || `Reservation extended by ${hours}h`);
      fetchDeals(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to extend reservation');
    }
  };

  const columns = [
    { key: 'unit', label: 'Unit', render: (_, d) => <strong>{d.unit_project || 'Unit'} • {d.unit_number || d.unit_id}</strong> },
    { key: 'title', label: 'Deal' },
    { key: 'client_name', label: 'Customer', render: (v) => v || '—' },
    { key: 'assigned_to_name', label: 'Owner', render: (v) => v || '—' },
    { key: 'value', label: 'Value', render: (v) => `${Number(v || 0).toLocaleString()} EGP` },
    { key: 'pipeline_stage', label: 'Stage', render: (v) => <Badge color="blue">{v}</Badge> },
    { key: 'unit_reservation_expires_at', label: 'Expires', render: (v) => (v ? new Date(v).toLocaleString() : '—') },
    {
      key: 'left', label: 'Time Left', render: (_, d) => {
        const t = timeLeft(d.unit_reservation_expires_at);
        return <Badge color={t.ms <= 0 ? 'red' : t.ms <= 24 * 3600000 ? 'amber' : 'green'}>{t.text}</Badge>;
      }
    },
    { key: 'unit_reservation_extension_count', label: 'Extensions', render: (v) => Number(v || 0) },
    {
      key: 'actions', label: 'Actions', align: 'right', render: (_, d) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <ActionButton color="#16a34a" onClick={() => extend(d.id, 24)}>+24h</ActionButton>
          <ActionButton color="#0d9488" onClick={() => extend(d.id, 48)}>+48h</ActionButton>
          <ActionButton outline color="#2563eb" onClick={() => navigate('/deals')}>Deal</ActionButton>
        </div>
      )
    },
  ];

  return (
    <div>
      <WorkspaceHeader icon={<CheckCircle2 size={22} color="#16a34a" />} title="Reservations" subtitle="Units currently held for open deals, with expiry and extension tracking." />
      <StatCards items={[
        { label: 'Active Reservations', value: reservations.length },
        { label: 'Expiring within 24h', value: expiringCount, color: '#b45309' },
        { label: 'Expired (awaiting release)', value: expiredCount, color: '#b91c1c' },
      ]} />
      <FilterChips value={filter} onChange={setFilter} options={[
        { value: 'all', label: 'All' },
        { value: 'expiring', label: 'Expiring soon' },
        { value: 'expired', label: 'Expired' },
      ]} />
      <SimpleTable columns={columns} rows={rows} loading={loading} empty="No active reservations." />
    </div>
  );
};

export default Reservations;
