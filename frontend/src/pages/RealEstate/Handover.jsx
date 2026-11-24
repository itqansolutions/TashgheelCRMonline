import React, { useEffect, useRef, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Key } from 'lucide-react';
import api from '../../services/api';
import Modal from '../../components/Common/Modal';
import { useData } from '../../context/DataContext';
import { useLanguage } from '../../context/LanguageContext';
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

const Handover = () => {
  const { deals, fetchDeals } = useData();
  const { t, isRTL } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const dealId = searchParams.get('deal_id');
  const [filter, setFilter] = useState('all');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const listRequest = useRef(0);
  useEffect(() => () => { listRequest.current += 1; }, []);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ deal_id: '', scheduled_date: '', snagging_notes: '' });
  // Rental units need staff-chosen notice timing when handed over.
  const [rental, setRental] = useState(null); // { row, ends_on, lead_days }

  const getStatusLabel = (s) => {
    switch (s) {
      case 'Scheduled': return t('realEstate.handover.statusScheduled');
      case 'Inspection': return t('realEstate.handover.statusInspection');
      case 'Ready for Delivery': return t('realEstate.handover.statusReadyForDelivery');
      case 'Handed Over': return t('realEstate.handover.statusHandedOver');
      case 'Cancelled': return t('realEstate.handover.statusCancelled');
      default: return s;
    }
  };

  const nextMap = {
    Scheduled: [{ status: 'Inspection', label: t('realEstate.handover.btnStartInspection'), color: '#0284c7' }],
    Inspection: [{ status: 'Ready for Delivery', label: t('realEstate.handover.btnReadyForDelivery'), color: '#0d9488' }],
  };

  const load = async () => {
    const request = ++listRequest.current;
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams();
      if (dealId) params.set('deal_id', dealId);
      if (filter !== 'all') params.set('status', filter);
      const res = await api.get(`/re-handovers?${params.toString()}`);
      if (request !== listRequest.current) return;
      setRows(res.data.data || []);
    } catch (err) {
      if (request !== listRequest.current) return;
      setLoadError(true);
      setRows([]);
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  };

  useEffect(() => { load(); }, [dealId, filter]);
  useEffect(() => { if (!deals || deals.length === 0) fetchDeals(); }, []);

  const eligibleDeals = useMemo(() => (deals || []).filter(d => d.unit_id && String(d.pipeline_stage || '').toLowerCase() !== 'lost'), [deals]);

  const submit = async () => {
    if (!form.deal_id) return toast.error(t('realEstate.handover.toastSelectDeal'));
    try {
      const res = await api.post('/re-handovers', {
        deal_id: form.deal_id,
        scheduled_date: form.scheduled_date || new Date().toISOString().split('T')[0],
        snagging_notes: form.snagging_notes
      });
      toast.success(res.data.message || t('realEstate.handover.toastScheduleSuccess'));
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || t('realEstate.handover.toastScheduleError'));
    }
  };

  const transition = async (h, status, extra = {}) => {
    if (status === 'Handed Over' && h.unit_transaction_type === 'rent' && !extra.rental_reminder_lead_days && extra.rental_reminder_lead_days !== 0) {
      setRental({ row: h, ends_on: h.contract_end_date || '', lead_days: '' });
      return;
    }
    if (status === 'Handed Over' && !extra.rental_confirmed && !window.confirm(t('realEstate.handover.confirmComplete'))) return;
    try {
      const { rental_confirmed, ...payload } = extra;
      const res = await api.patch(`/re-handovers/${h.id}/status`, { status, ...payload });
      toast.success(res.data.message || t('realEstate.handover.toastStatusSuccess', { status: getStatusLabel(status) }));
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || t('realEstate.handover.toastStatusError'));
    }
  };

  const columns = [
    { key: 'unit_number', label: t('realEstate.handover.colUnit'), render: (v, r) => <strong>{r.project_name ? `${r.project_name} • ` : ''}<span className="num-en">{v || '—'}</span></strong> },
    { key: 'deal_title', label: t('realEstate.handover.colDeal'), render: (v, r) => v || `#${r.deal_id}` },
    { key: 'customer_name', label: t('realEstate.handover.colCustomer'), render: (v) => v || '—' },
    { key: 'contract_number', label: t('realEstate.handover.colContract'), render: (v) => (v ? <span className="num-en">{v}</span> : '—') },
    { key: 'scheduled_date', label: t('realEstate.handover.colScheduled'), render: fmtDate },
    { 
      key: 'total_paid', 
      label: t('realEstate.handover.colCollectionsInfo'), 
      render: (_, r) => {
        const val = Number(r.contract_value) || 0;
        const paid = Number(r.total_paid) || 0;
        const pct = val > 0 ? Math.round((paid / val) * 100) : 0;
        const overdue = Number(r.overdue_installments_count) || 0;
        return (
          <div style={{ fontSize: '12px' }}>
            <span style={{ fontWeight: 600 }}>{t('realEstate.handover.pctPaid', { pct })}</span>
            {overdue > 0 && <span style={{ marginInlineStart: '6px', color: '#dc2626', fontSize: '11px' }}>{t('realEstate.handover.overdueCount', { count: overdue })}</span>}
          </div>
        );
      }
    },
    { key: 'actual_handover_date', label: t('realEstate.handover.colDelivered'), render: fmtDate },
    { key: 'keys_handed_over', label: t('realEstate.handover.colKeys'), render: (v) => (v ? <Badge color="teal">{t('realEstate.handover.keysIssued')}</Badge> : <Badge>{t('realEstate.handover.keysPending')}</Badge>) },
    { key: 'status', label: t('realEstate.handover.colStatus'), render: (v) => <Badge color={STATUS_COLOR[v]}>{getStatusLabel(v)}</Badge> },
    {
      key: 'actions',
      label: t('realEstate.handover.colActions'),
      align: isRTL ? 'left' : 'right',
      render: (_, r) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: isRTL ? 'flex-start' : 'flex-end', flexWrap: 'wrap' }}>
          {(nextMap[r.status] || []).map(n => (
            <ActionButton key={n.status} color={n.color} onClick={() => transition(r, n.status)}>
              {n.label}
            </ActionButton>
          ))}
          {['Scheduled', 'Inspection', 'Ready for Delivery'].includes(r.status) && (
            <ActionButton color="#059669" onClick={() => transition(r, 'Handed Over')}>
              {t('realEstate.handover.btnComplete')}
            </ActionButton>
          )}
        </div>
      )
    },
  ];

  const count = (s) => rows.filter(r => r.status === s).length;

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <WorkspaceHeader
        icon={<Key size={22} color="#0d9488" />}
        title={t('realEstate.handover.title')}
        subtitle={t('realEstate.handover.subtitle')}
      >
        <button
          type="button"
          onClick={() => { setForm({ deal_id: dealId || '', scheduled_date: '', snagging_notes: '' }); setFormOpen(true); }}
          style={{ background: 'var(--primary)', color: 'white', padding: '10px 18px', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
        >
          {t('realEstate.handover.btnScheduleHandover')}
        </button>
      </WorkspaceHeader>
      <DealFilterBanner dealId={dealId} label={loading || loadError ? undefined : rows[0]?.deal_title} onClear={() => setSearchParams({})} />
      <StatCards items={[
        { label: t('realEstate.handover.statScheduled'), value: count('Scheduled') },
        { label: t('realEstate.handover.statInspection'), value: count('Inspection'), color: '#1d4ed8' },
        { label: t('realEstate.handover.statReadyForDelivery'), value: count('Ready for Delivery'), color: '#b45309' },
        { label: t('realEstate.handover.statHandedOver'), value: count('Handed Over'), color: '#0f766e' },
      ].map(item => ({ ...item, value: loading || loadError ? '...' : item.value }))} />
      <FilterChips value={filter} onChange={setFilter} options={[
        { value: 'all', label: t('realEstate.handover.filterAll') },
        { value: 'Scheduled', label: t('realEstate.handover.filterScheduled') },
        { value: 'Inspection', label: t('realEstate.handover.filterInspection') },
        { value: 'Ready for Delivery', label: t('realEstate.handover.filterReadyForDelivery') },
        { value: 'Handed Over', label: t('realEstate.handover.filterHandedOver') },
      ]} />
      {loadError ? <div role="alert" style={{ padding: 20, color: '#991b1b', border: '1px solid #fecaca', borderRadius: 10 }}>
        <p>{isRTL ? 'تعذر تحميل البيانات. الأرقام غير مؤكدة، ولا يمكن اعتبار القائمة فارغة.' : 'Data could not be loaded. Totals are unconfirmed and the list cannot be treated as empty.'}</p>
        <button type="button" onClick={load} style={{ ...fieldStyle, width: 'auto', cursor: 'pointer' }}>{isRTL ? 'إعادة المحاولة' : 'Retry'}</button>
      </div> : (<SimpleTable
        columns={columns}
        rows={rows}
        loading={loading}
        empty={t('realEstate.handover.empty')}
      />)}

      <Modal variant="form"
        isOpen={!!rental}
        onClose={() => setRental(null)}
        title={t('realEstate.handover.rentalTitle', 'Rental handover: end date and notice')}
        footer={<>
          <button onClick={() => setRental(null)} style={{ background: '#f1f5f9', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>
            {t('realEstate.common.cancel')}
          </button>
          <button
            disabled={!rental || !rental.ends_on || rental.lead_days === '' || Number(rental.lead_days) < 0}
            onClick={async () => {
              const r = rental; setRental(null);
              await transition(r.row, 'Handed Over', { rental_ends_on: r.ends_on, rental_reminder_lead_days: Number(r.lead_days), rental_confirmed: true });
            }}
            style={{ background: 'var(--primary)', color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, opacity: (!rental || !rental.ends_on || rental.lead_days === '') ? 0.5 : 1 }}>
            {t('realEstate.handover.btnComplete')}
          </button>
        </>}
      >
        {rental && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={{ gridColumn: 'span 2', fontSize: '13px', color: '#475569' }}>
              {t('realEstate.handover.rentalHelp', 'An internal alert is sent to the team manager and the unit responsible employee (or the whole team) at 9:00 AM Cairo time, this many days before the rental ends.')}
            </div>
            <div>
              <label style={labelStyle}>{t('realEstate.handover.rentalEndDate', 'Rental end date')}</label>
              <input type="date" style={fieldStyle} value={rental.ends_on} onChange={e => setRental({ ...rental, ends_on: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>{t('realEstate.handover.rentalLeadDays', 'Alert days before end')}</label>
              <input type="number" min="0" max="365" step="1" style={fieldStyle} value={rental.lead_days} onChange={e => setRental({ ...rental, lead_days: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>

      <Modal variant="form"
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={t('realEstate.handover.modalTitle')}
        footer={<>
          <button onClick={() => setFormOpen(false)} style={{ background: '#f1f5f9', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>
            {t('realEstate.common.cancel')}
          </button>
          <button onClick={submit} style={{ background: 'var(--primary)', color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>
            {t('realEstate.handover.btnConfirmSchedule')}
          </button>
        </>}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>{t('realEstate.handover.lblDealUnit')}</label>
            <select style={fieldStyle} value={form.deal_id} onChange={e => setForm({ ...form, deal_id: e.target.value })}>
              <option value="">{t('realEstate.handover.placeholderSelectDeal')}</option>
              {eligibleDeals.map(d => (
                <option key={d.id} value={d.id}>
                  #{d.id} {d.title} ({d.pipeline_stage})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t('realEstate.handover.lblTargetDate')}</label>
            <input type="date" style={fieldStyle} value={form.scheduled_date} onChange={e => setForm({ ...form, scheduled_date: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>{t('realEstate.handover.lblSnaggingNotes')}</label>
            <input type="text" style={fieldStyle} value={form.snagging_notes} onChange={e => setForm({ ...form, snagging_notes: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Handover;
