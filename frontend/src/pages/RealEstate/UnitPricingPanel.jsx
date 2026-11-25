import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { cairoTime } from '../../utils/cairoTime.mjs';
import { useLanguage } from '../../context/LanguageContext';

/** Unit price edit, marketing (active/inactive) switch, and price/marketing history timeline. */
const box = { background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '16px' };
const inp = { padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontFamily: 'inherit' };
const btn = (bg) => ({ background: bg, color: 'white', padding: '8px 14px', borderRadius: '8px', fontWeight: 700, fontSize: '12px', border: 0, cursor: 'pointer' });
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

const UnitPricingPanel = ({ unit, onChanged }) => {
  const { t } = useLanguage();
  const [events, setEvents] = useState([]);
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('sold_elsewhere');
  const [note, setNote] = useState('');
  const [deact, setDeact] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = unit.marketing_active !== false;

  const load = useCallback(async () => {
    try { const r = await api.get(`/re-units/${unit.id}/events`); setEvents(r.data?.data || []); } catch (e) { setEvents([]); }
  }, [unit.id]);
  useEffect(() => { setPrice(''); setDeact(false); load(); }, [unit.id, load]);

  const send = async (body, ok) => {
    setBusy(true);
    try {
      const r = await api.put(`/re-units/${unit.id}`, body);
      toast.success(ok);
      onChanged && onChanged(r.data?.data);
      setPrice(''); setDeact(false); setNote('');
      load();
    } catch (e) { toast.error(e.response?.data?.message || t('common.errorOccurred', 'Error')); }
    finally { setBusy(false); }
  };

  const describe = (ev) => {
    const p = ev.previous_data || {}, n = ev.new_data || {};
    if (ev.event_type === 'price_changed') return `${t('unitPricing.price', 'Price')}: ${t('unitPricing.from', 'from')} \u2066${fmt(p.price)}\u2069 ${t('unitPricing.to', 'to')} \u2066${fmt(n.price)}\u2069`;
    if (ev.event_type === 'marketing_deactivated') return `${t('unitPricing.deactivated', 'Deactivated')} (${n.reason === 'sold_elsewhere' ? t('unitPricing.soldElsewhere', 'Sold elsewhere') : t('unitPricing.other', 'Other')}${n.note ? `: ${n.note}` : ''})`;
    if (ev.event_type === 'marketing_activated') return t('unitPricing.activated', 'Re-activated');
    return ev.event_type;
  };

  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
        <div style={{ fontWeight: 800, fontSize: '13px' }}>{t('unitPricing.title', 'Price and availability for marketing')}</div>
        <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 900, background: active ? '#dcfce7' : '#fee2e2', color: active ? '#166534' : '#991b1b' }}>
          {active ? t('unitPricing.active', 'Active') : t('unitPricing.inactive', 'Inactive (not for sale here)')}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
        <input aria-label="new price" type="number" min="0" step="0.01" style={{ ...inp, width: '170px' }} placeholder={`${t('unitPricing.newPrice', 'New price')} (${fmt(unit.price)})`} value={price} onChange={e => setPrice(e.target.value)} />
        <button disabled={busy || price === '' || Number(price) < 0 || Number(price) === Number(unit.price)} style={{ ...btn('var(--primary, #2563eb)'), opacity: (busy || price === '' || Number(price) === Number(unit.price)) ? 0.5 : 1 }}
          onClick={() => send({ price: Number(price) }, t('unitPricing.priceSaved', 'Price updated'))}>{t('unitPricing.savePrice', 'Update price')}</button>
        {active
          ? <button disabled={busy} style={btn('#dc2626')} onClick={() => setDeact(v => !v)}>{t('unitPricing.deactivate', 'Mark inactive')}</button>
          : <button disabled={busy} style={btn('#059669')} onClick={() => send({ marketing_active: true }, t('unitPricing.activated', 'Re-activated'))}>{t('unitPricing.activate', 'Re-activate')}</button>}
      </div>
      {deact && active && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
          <select style={inp} value={reason} onChange={e => setReason(e.target.value)}>
            <option value="sold_elsewhere">{t('unitPricing.soldElsewhere', 'Sold elsewhere')}</option>
            <option value="other">{t('unitPricing.other', 'Other')}</option>
          </select>
          <input style={{ ...inp, flex: 1, minWidth: '160px' }} placeholder={t('unitPricing.note', 'Note (required for Other)')} value={note} onChange={e => setNote(e.target.value)} maxLength={500} />
          <button disabled={busy || (reason === 'other' && !note.trim())} style={{ ...btn('#dc2626'), opacity: (reason === 'other' && !note.trim()) ? 0.5 : 1 }}
            onClick={() => send({ marketing_active: false, marketing_inactive_reason: reason, marketing_inactive_note: note.trim() || undefined }, t('unitPricing.deactivated', 'Deactivated'))}>{t('unitPricing.confirm', 'Confirm')}</button>
        </div>
      )}
      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px' }}>{t('unitPricing.historyNote', 'History starts from the day this feature was released.')}</div>
      {events.length === 0
        ? <div style={{ fontSize: '12px', color: '#94a3b8' }}>{t('unitPricing.noHistory', 'No changes recorded yet')}</div>
        : <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '4px' }}>
            {events.slice(0, 20).map(ev => (
              <li key={ev.id} style={{ fontSize: '12px', display: 'flex', gap: '10px' }}>
                <span className="num-en" style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{cairoTime(ev.created_at)}</span>
                <span dir="auto" style={{ unicodeBidi: 'plaintext' }}>{describe(ev)}</span>
              </li>
            ))}
          </ul>}
    </div>
  );
};
export default UnitPricingPanel;
