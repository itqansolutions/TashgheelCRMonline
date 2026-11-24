import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { CalendarClock } from 'lucide-react';
import api from '../../services/api';
import Modal from '../../components/Common/Modal';
import { useLanguage } from '../../context/LanguageContext';
import { WorkspaceHeader, SimpleTable, Badge, ActionButton, fmtDate, fieldStyle, labelStyle } from '../../components/RealEstate/WorkspaceKit';

/** Rentals: current occupancies, internal end-of-lease alert timing, vacancy confirmation. */
const STATE_COLOR = { occupied: 'blue', vacancy_confirmed: 'teal', cancelled: 'gray' };

const Rentals = () => {
  const { t, isRTL } = useLanguage();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get('/re-rentals'); setRows(r.data?.data || []); }
    catch (e) { toast.error(e.response?.data?.message || t('rentals.loadFailed', 'Failed to load rentals')); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, ok) => {
    try { await fn(); toast.success(ok); load(); }
    catch (e) { toast.error(e.response?.data?.message || t('rentals.actionFailed', 'Action failed')); }
  };
  const stateLabel = (s) => ({
    occupied: t('rentals.stateOccupied', 'Occupied'),
    vacancy_confirmed: t('rentals.stateVacant', 'Vacancy confirmed'),
    cancelled: t('rentals.stateCancelled', 'Cancelled')
  }[s] || s);

  const columns = [
    { key: 'unit_number', label: t('rentals.colUnit', 'Unit'), render: (v, r) => <span>{r.project_name ? `${r.project_name} · ` : ''}{v || r.unit_name}</span> },
    { key: 'deal_title', label: t('rentals.colDeal', 'Deal'), render: (v, r) => <span>{v}{r.team_name ? ` · ${r.team_name}` : ''}</span> },
    { key: 'ends_on', label: t('rentals.colEnds', 'Rental ends'), render: fmtDate },
    { key: 'reminder_lead_days', label: t('rentals.colLead', 'Alert days before'), render: (v) => <span className="num-en">{v}</span> },
    { key: 'alert_due_at', label: t('rentals.colAlert', 'Alert at (Cairo 9:00)'), render: (v) => <span className="num-en">{v ? String(v).replace('T', ' ').slice(0, 16) : '—'}</span> },
    { key: 'alerts_delivered', label: t('rentals.colSent', 'Alerts sent'), render: (v) => <span className="num-en">{v}</span> },
    { key: 'state', label: t('rentals.colState', 'Status'), render: (v) => <Badge color={STATE_COLOR[v]}>{stateLabel(v)}</Badge> },
    {
      key: 'actions', label: '', align: isRTL ? 'left' : 'right',
      render: (_, r) => r.state !== 'occupied' ? null : (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <ActionButton outline onClick={() => setEdit({ id: r.id, ends_on: r.ends_on, reminder_lead_days: String(r.reminder_lead_days) })}>{t('rentals.edit', 'Edit dates')}</ActionButton>
          <ActionButton color="#059669" onClick={() => window.confirm(t('rentals.confirmVacancyQ', 'Confirm the unit is vacant? This does not change the unit status.')) && act(() => api.post(`/re-rentals/${r.id}/confirm-vacancy`), t('rentals.vacancyOk', 'Vacancy confirmed'))}>{t('rentals.confirmVacancy', 'Confirm vacancy')}</ActionButton>
          <ActionButton color="#dc2626" outline onClick={() => window.confirm(t('rentals.cancelQ', 'Cancel this rental alert?')) && act(() => api.post(`/re-rentals/${r.id}/cancel`), t('rentals.cancelled', 'Cancelled'))}>{t('rentals.cancel', 'Cancel')}</ActionButton>
        </div>
      )
    }
  ];

  return (
    <div>
      <WorkspaceHeader icon={<CalendarClock size={26} />} title={t('rentals.title', 'Rentals')} subtitle={t('rentals.subtitle', 'Internal alerts before a rental ends')} />
      <SimpleTable columns={columns} rows={rows} loading={loading} empty={t('rentals.empty', 'No rentals yet')} />
      <Modal variant="form" isOpen={!!edit} onClose={() => setEdit(null)} title={t('rentals.edit', 'Edit dates')}
        footer={<>
          <button onClick={() => setEdit(null)} style={{ background: '#f1f5f9', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>{t('realEstate.common.cancel')}</button>
          <button onClick={() => { const e = edit; setEdit(null); act(() => api.patch(`/re-rentals/${e.id}`, { ends_on: e.ends_on, reminder_lead_days: Number(e.reminder_lead_days) }), t('rentals.saved', 'Saved')); }}
            style={{ background: 'var(--primary)', color: 'white', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>{t('rentals.save', 'Save')}</button>
        </>}>
        {edit && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div><label style={labelStyle}>{t('rentals.colEnds', 'Rental ends')}</label>
              <input type="date" style={fieldStyle} value={edit.ends_on} onChange={e => setEdit({ ...edit, ends_on: e.target.value })} /></div>
            <div><label style={labelStyle}>{t('rentals.colLead', 'Alert days before')}</label>
              <input type="number" min="0" max="365" style={fieldStyle} value={edit.reminder_lead_days} onChange={e => setEdit({ ...edit, reminder_lead_days: e.target.value })} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
};
export default Rentals;
