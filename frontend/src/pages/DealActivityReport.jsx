import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useLanguage } from '../context/LanguageContext';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
const ACTIONS = ['called', 'whatsapp', 'meeting', 'email_sent', 'visited', 'follow_up', 'note', 'task'];

/** Per-salesperson manual deal activity counts (calls, WhatsApp, ...) for a Cairo-day range. */
const DealActivityReport = () => {
  const { t, isRTL } = useLanguage();
  const [from, setFrom] = useState(() => `${today().slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [state, setState] = useState({ loading: true, error: '', rows: [] });
  const label = (a) => ({
    called: t('dealActivity.called', 'Calls'), whatsapp: t('dealActivity.whatsapp', 'WhatsApp'), meeting: t('dealActivity.meeting', 'Meetings'),
    email_sent: t('dealActivity.email', 'Emails'), visited: t('dealActivity.visited', 'Visits'), follow_up: t('dealActivity.followUp', 'Follow-ups'),
    note: t('dealActivity.note', 'Notes'), task: t('dealActivity.task', 'Tasks')
  }[a] || a);

  useEffect(() => {
    let live = true;
    if (!from || !to || from > to) { setState({ loading: false, error: t('dealActivity.badRange', 'Choose a valid date range'), rows: [] }); return undefined; }
    setState(s => ({ ...s, loading: true, error: '' }));
    api.get('/activities/reports/deal-activity', { params: { from, to } })
      .then(r => { if (live) setState({ loading: false, error: '', rows: r.data?.data || [] }); })
      .catch(e => { if (live) setState({ loading: false, error: e.response?.data?.message || t('dealActivity.error', 'Could not load the report'), rows: [] }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const cell = { padding: '10px 12px', textAlign: 'center', fontSize: '13px' };
  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '4px' }}>{t('dealActivity.title', 'Salesperson activity on deals')}</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '13px' }}>{t('dealActivity.subtitle', 'Counts of activities logged manually by each salesperson (calls, WhatsApp, and more). Automatic system entries are not counted.')}</p>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '12px', fontWeight: 700 }}>{t('dealActivity.from', 'From')} <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ marginInlineStart: '6px' }} /></label>
        <label style={{ fontSize: '12px', fontWeight: 700 }}>{t('dealActivity.to', 'To')} <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ marginInlineStart: '6px' }} /></label>
      </div>
      {state.error && <div style={{ color: '#dc2626', marginBottom: '12px' }}>{state.error}</div>}
      <div style={{ background: 'white', border: '1px solid var(--border, #e2e8f0)', borderRadius: '12px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#f8fafc' }}>
            <th style={{ ...cell, textAlign: isRTL ? 'right' : 'left' }}>{t('dealActivity.salesperson', 'Salesperson')}</th>
            {ACTIONS.map(a => <th key={a} style={cell}>{label(a)}</th>)}
            <th style={cell}>{t('dealActivity.total', 'Total')}</th>
          </tr></thead>
          <tbody>
            {state.loading ? <tr><td style={cell} colSpan={ACTIONS.length + 2}>…</td></tr>
              : state.rows.length === 0 ? <tr><td style={{ ...cell, color: '#94a3b8' }} colSpan={ACTIONS.length + 2}>{t('dealActivity.empty', 'No logged activity in this period')}</td></tr>
              : state.rows.map(r => (
                <tr key={r.user_id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ ...cell, textAlign: isRTL ? 'right' : 'left', fontWeight: 700 }}>{r.user_name}</td>
                  {ACTIONS.map(a => <td key={a} style={cell}><span className="num-en">{r.by_action[a] || 0}</span></td>)}
                  <td style={{ ...cell, fontWeight: 800 }}><span className="num-en">{r.total}</span></td>
                </tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
export default DealActivityReport;
