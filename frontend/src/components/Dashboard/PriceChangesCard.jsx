import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';

const cairoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Same periods as the dashboard filter (week starts Monday), in Cairo days.
export const periodRange = (filter) => {
  const to = cairoToday();
  if (filter === 'TODAY') return { from: to, to };
  if (filter === 'THIS_WEEK') { const dow = (new Date(`${to}T00:00:00Z`).getUTCDay() + 6) % 7; return { from: addDays(to, -dow), to }; }
  return { from: `${to.slice(0, 8)}01`, to };
};
const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const COLORS = { up: '#16a34a', down: '#dc2626', unchanged: '#64748b', unknown: '#64748b' };
const ARROW = { up: '▲', down: '▼', unchanged: '•', unknown: '?' };

const PriceChangesCard = ({ timeFilter }) => {
  const { t } = useLanguage();
  const [state, setState] = useState({ loading: true, error: false, data: [], summary: {} });
  useEffect(() => {
    let live = true;
    const { from, to } = periodRange(timeFilter);
    setState(s => ({ ...s, loading: true, error: false }));
    api.get('/re-units/price-changes', { params: { from, to } })
      .then(r => { if (live) setState({ loading: false, error: false, data: r.data?.data || [], summary: r.data?.summary_by_transaction_type || {} }); })
      .catch(() => { if (live) setState({ loading: false, error: true, data: [], summary: {} }); });
    return () => { live = false; };
  }, [timeFilter]);

  const typeLabel = (k) => k === 'rent' ? t('priceChanges.rent', 'Rent') : k === 'sale' ? t('priceChanges.sale', 'Sale') : k;
  const groups = {};
  state.data.forEach(u => { const k = u.transaction_type || 'sale'; (groups[k] = groups[k] || []).push(u); });

  return (
    <div className="dashboard-card" style={{ marginTop: '16px', padding: '16px' }}>
      <div style={{ fontWeight: 800, marginBottom: '4px' }}>{t('priceChanges.title', 'Unit price changes')}</div>
      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>{t('priceChanges.note', 'For the selected period. Sale and rent are shown separately. History starts from the day this feature was released.')}</div>
      {state.loading ? <div style={{ fontSize: '12px', color: '#94a3b8' }}>…</div>
        : state.error ? <div style={{ fontSize: '12px', color: '#dc2626' }}>{t('priceChanges.error', 'Could not load price changes')}</div>
        : state.data.length === 0 ? <div style={{ fontSize: '12px', color: '#94a3b8' }}>{t('priceChanges.none', 'No price changes in this period')}</div>
        : Object.keys(groups).map(k => (
          <div key={k} style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '4px' }}>
              {typeLabel(k)}
              <span style={{ fontWeight: 600, color: '#64748b', marginInlineStart: '8px' }}>
                {['up', 'down'].map(d => <span key={d} style={{ marginInlineEnd: '8px', color: COLORS[d] }}>{ARROW[d]} <span className="num-en">{(state.summary[k] || {})[d] || 0}</span></span>)}
              </span>
            </div>
            {k === 'rent' && <div style={{ fontSize: '11px', color: '#92400e', background: '#fef3c7', borderRadius: '6px', padding: '4px 8px', marginBottom: '4px' }}>{t('priceChanges.rentBasis', 'Rent prices have no recorded period (monthly or yearly). Each change compares the same unit with itself only. Do not compare rent amounts across units or with sale prices.')}</div>}
            {groups[k].map(u => (
              <div key={u.unit_id} style={{ display: 'flex', gap: '10px', fontSize: '12px', padding: '3px 0', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ color: COLORS[u.direction], fontWeight: 800 }}>{ARROW[u.direction]}</span>
                <span style={{ minWidth: '110px' }}>{u.project_name ? `${u.project_name} · ` : ''}{u.unit_number || u.name}</span>
                <span className="num-en">{u.period_old_price == null ? '—' : fmt(u.period_old_price)} → {u.period_new_price == null ? '—' : fmt(u.period_new_price)}</span>
                {u.net_delta != null && <span className="num-en" style={{ color: COLORS[u.direction], fontWeight: 700 }}>{u.net_delta > 0 ? '+' : ''}{fmt(u.net_delta)}{u.net_percent != null ? ` (${u.net_percent > 0 ? '+' : ''}${u.net_percent.toFixed(1)}%)` : ''}</span>}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
};
export default PriceChangesCard;
