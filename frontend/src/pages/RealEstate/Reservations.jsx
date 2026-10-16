import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2 } from 'lucide-react';
import api from '../../services/api';
import { useData } from '../../context/DataContext';
import { useLanguage } from '../../context/LanguageContext';
import { WorkspaceHeader, StatCards, FilterChips, SimpleTable, Badge, ActionButton, fmtMoney } from '../../components/RealEstate/WorkspaceKit';

/**
 * Real Estate → Reservations (standalone workspace)
 * A reservation is a unit held for an open deal (re_units.status = 'Reserved').
 * Source: GET /api/deals (tenant + row scoped server-side). Extension reuses
 * POST /api/deals/:id/extend-reservation (existing reservation engine).
 */
const OPEN_STAGE_EXCLUDE = ['won', 'lost', 'closed'];

const Reservations = () => {
  const navigate = useNavigate();
  const { t, isRTL } = useLanguage();
  const { deals, fetchDeals, loading } = useData();
  const [filter, setFilter] = useState('all');

  useEffect(() => { fetchDeals(); }, []);

  const timeLeft = (iso) => {
    if (!iso) return { text: t('realEstate.reservations.noExpiry'), ms: Infinity };
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return { text: t('realEstate.reservations.expired'), ms };
    const h = Math.floor(ms / 3600000);
    if (h >= 48) {
      const days = Math.floor(h / 24);
      const hours = h % 24;
      return {
        text: (
          <span>
            <span className="num-en">{days}</span> {t('realEstate.contracts.durationMonths', { count: '' }).trim() || 'd'} <span className="num-en">{hours}</span>h
          </span>
        ),
        ms
      };
    }
    const mins = Math.floor((ms % 3600000) / 60000);
    return {
      text: (
        <span>
          <span className="num-en">{h}</span>h <span className="num-en">{mins}</span>m
        </span>
      ),
      ms
    };
  };

  const reservations = useMemo(() => {
    const candidateDeals = (deals || []).filter(d =>
      d.unit_id &&
      String(d.unit_status || '').toLowerCase() === 'reserved' &&
      !OPEN_STAGE_EXCLUDE.includes(String(d.pipeline_stage || '').toLowerCase())
    );
    const byUnit = new Map();
    for (const d of candidateDeals) {
      const uid = String(d.unit_id);
      if (!byUnit.has(uid)) byUnit.set(uid, []);
      byUnit.get(uid).push(d);
    }
    const result = [];
    for (const unitDeals of byUnit.values()) {
      const explicitHolders = unitDeals.filter(d => {
        const cf = (d.custom_fields && typeof d.custom_fields === 'object') ? d.custom_fields : {};
        const stg = String(d.pipeline_stage || '').trim().toLowerCase();
        return cf.is_unit_reservation === true || cf.is_unit_reservation === 'true' || ['reserved', 'reservation', 'حجز'].includes(stg);
      });
      if (explicitHolders.length > 0) {
        result.push(...explicitHolders);
      } else {
        result.push(...unitDeals);
      }
    }
    return result;
  }, [deals]);

  const rows = useMemo(() => reservations.filter(d => {
    const tVal = timeLeft(d.unit_reservation_expires_at);
    if (filter === 'expiring') return tVal.ms > 0 && tVal.ms <= 24 * 3600000;
    if (filter === 'expired') return tVal.ms <= 0;
    return true;
  }), [reservations, filter]);

  const expiringCount = reservations.filter(d => { const tVal = timeLeft(d.unit_reservation_expires_at); return tVal.ms > 0 && tVal.ms <= 24 * 3600000; }).length;
  const expiredCount = reservations.filter(d => timeLeft(d.unit_reservation_expires_at).ms <= 0).length;

  const extend = async (dealId, hours) => {
    try {
      const res = await api.post(`/deals/${dealId}/extend-reservation`, { extension_hours: hours });
      toast.success(res.data.message || t('realEstate.reservations.toastExtendSuccess', { hours }));
      fetchDeals(false);
    } catch (err) {
      toast.error(err.response?.data?.message || t('realEstate.reservations.toastExtendError'));
    }
  };

  const columns = [
    {
      key: 'unit',
      label: t('realEstate.reservations.colUnit'),
      render: (_, d) => (
        <strong>
          {d.unit_project || t('realEstate.common.unitFallback')} • <span className="num-en">{d.unit_number || d.unit_id}</span>
        </strong>
      )
    },
    { key: 'title', label: t('realEstate.reservations.colDeal') },
    { key: 'client_name', label: t('realEstate.reservations.colCustomer'), render: (v) => v || '—' },
    { key: 'assigned_to_name', label: t('realEstate.reservations.colOwner'), render: (v) => v || '—' },
    { key: 'value', label: t('realEstate.reservations.colValue'), render: (v) => fmtMoney(v, t('realEstate.common.currencySuffix')) },
    { key: 'pipeline_stage', label: t('realEstate.reservations.colStage'), render: (v) => <Badge color="blue">{v}</Badge> },
    {
      key: 'unit_reservation_expires_at',
      label: t('realEstate.reservations.colExpires'),
      render: (v) => (v ? <span className="num-en">{new Date(v).toLocaleString('en-US')}</span> : '—')
    },
    {
      key: 'left',
      label: t('realEstate.reservations.colTimeLeft'),
      render: (_, d) => {
        const tVal = timeLeft(d.unit_reservation_expires_at);
        return <Badge color={tVal.ms <= 0 ? 'red' : tVal.ms <= 24 * 3600000 ? 'amber' : 'green'}>{tVal.text}</Badge>;
      }
    },
    {
      key: 'unit_reservation_extension_count',
      label: t('realEstate.reservations.colExtensions'),
      render: (v) => <span className="num-en">{Number(v || 0)}</span>
    },
    {
      key: 'actions',
      label: t('realEstate.reservations.colActions'),
      align: isRTL ? 'left' : 'right',
      render: (_, d) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: isRTL ? 'flex-start' : 'flex-end' }}>
          <ActionButton color="#16a34a" onClick={() => extend(d.id, 24)}>
            <span className="num-en">+24</span>h
          </ActionButton>
          <ActionButton color="#0d9488" onClick={() => extend(d.id, 48)}>
            <span className="num-en">+48</span>h
          </ActionButton>
          <ActionButton outline color="#2563eb" onClick={() => navigate('/deals')}>
            {t('realEstate.reservations.btnDeal')}
          </ActionButton>
        </div>
      )
    },
  ];

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <WorkspaceHeader
        icon={<CheckCircle2 size={22} color="#16a34a" />}
        title={t('realEstate.reservations.title')}
        subtitle={t('realEstate.reservations.subtitle')}
      />
      <StatCards items={[
        { label: t('realEstate.reservations.activeReservations'), value: reservations.length },
        { label: t('realEstate.reservations.expiringWithin24h'), value: expiringCount, color: '#b45309' },
        { label: t('realEstate.reservations.expiredAwaitingRelease'), value: expiredCount, color: '#b91c1c' },
      ]} />
      <FilterChips value={filter} onChange={setFilter} options={[
        { value: 'all', label: t('realEstate.reservations.filterAll') },
        { value: 'expiring', label: t('realEstate.reservations.filterExpiring') },
        { value: 'expired', label: t('realEstate.reservations.filterExpired') },
      ]} />
      <SimpleTable
        columns={columns}
        rows={rows}
        loading={loading}
        empty={t('realEstate.reservations.empty')}
      />
    </div>
  );
};

export default Reservations;
