import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const cairo = (v) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(v));
// Numbers inside RTL text sit in a bidi-isolated LTR span.
const Num = ({ children }) => <bdi dir="ltr" className="num-en" style={{ unicodeBidi: 'isolate' }}>{children}</bdi>;

// Price warning shown under the value field when the typed price is below the unit price.
export function BelowUnitPriceWarning({ value, unitPrice, disabled }) {
  const { t } = useLanguage();
  const v = Number(value || 0);
  const u = Number(unitPrice);
  if (disabled || !(u > 0) || !(v > 0) || v >= u) return null;
  const [before, after] = t('deals.price.belowWarning', '').split('{unit}');
  return (
    <div role="alert" data-testid="below-unit-warning" style={{ marginTop: 6, fontSize: 12, fontWeight: 700, background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 8, padding: '6px 10px' }}>
      {before}<Num>{fmt(u)}</Num>{after}
    </div>
  );
}

// Pending request banner (with approve/reject for the designated approver) and the deal's price history.
export default function DealPricePanel({ dealId, refreshKey = 0, onDecided }) {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!dealId) return;
    api.get(`/deals/${dealId}/price-history`).then(r => setData(r.data?.data || null)).catch(() => setData(null));
  }, [dealId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const decide = async (kind) => {
    if (!data?.pending || busy) return;
    setBusy(true);
    try {
      await api.post(`/deals/price-approvals/${data.pending.id}/${kind}`, {});
      toast.success(t(kind === 'approve' ? 'deals.price.approved' : 'deals.price.rejected', ''));
      load();
      if (onDecided) onDecided();
    } catch (err) {
      toast.error(err.response?.data?.message || t('deals.price.decideFailed', ''));
      load();
    } finally { setBusy(false); }
  };

  if (!data) return null;
  const p = data.pending;
  const changes = data.changes || [];
  const body = (t('deals.price.pendingBody', '') || '').split(/(\{requested\}|\{unit\}|\{current\})/);
  const currentValue = changes.length ? changes[0].new_value : null;

  return (
    <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="deal-price-panel">
      {p && (
        <div style={{ background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>{t('deals.price.pendingTitle', '')}</div>
          <div>
            {body.map((part, i) => part === '{requested}' ? <Num key={i}>{fmt(p.requested_value)}</Num>
              : part === '{unit}' ? <Num key={i}>{fmt(p.unit_price_at_request)}</Num>
              : part === '{current}' ? <Num key={i}>{fmt(p.deal_value_at_request)}</Num> : <span key={i}>{part}</span>)}
          </div>
          <div style={{ marginTop: 4, opacity: 0.85 }}>
            {t('deals.price.requestedBy', '')}: {p.requested_by_name || '-'} · {t('deals.price.approver', '')}: {p.approver_name || t('deals.price.adminPool', '')}
          </div>
          {data.can_decide && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => decide('approve')}>{t('deals.price.approve', '')}</button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => decide('reject')}>{t('deals.price.reject', '')}</button>
            </div>
          )}
        </div>
      )}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>{t('deals.price.historyTitle', '')}</div>
        {changes.length === 0 && <div style={{ opacity: 0.7 }}>{t('deals.price.noHistory', '')}</div>}
        {changes.map(c => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', borderTop: '1px dashed #e2e8f0' }}>
            <span>
              {t(`deals.price.source_${c.source}`, c.source)}
              {c.old_value !== null && c.old_value !== undefined && <> · {t('deals.price.from', '')} <Num>{fmt(c.old_value)}</Num></>} {t('deals.price.to', '')} <Num>{fmt(c.new_value)}</Num>
            </span>
            <span style={{ opacity: 0.75 }}>{c.changed_by_name || '-'} · <Num>{cairo(c.changed_at)}</Num></span>
          </div>
        ))}
        {(data.approvals || []).filter(a => a.status !== 'pending').length > 0 && (
          <div style={{ marginTop: 8, fontWeight: 800 }}>{t('deals.price.requestsTitle', '')}</div>
        )}
        {(data.approvals || []).filter(a => a.status !== 'pending').map(a => (
          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', borderTop: '1px dashed #e2e8f0' }}>
            <span><Num>{fmt(a.requested_value)}</Num> · {t(`deals.price.status${a.status.charAt(0).toUpperCase()}${a.status.slice(1)}`, a.status)}</span>
            <span style={{ opacity: 0.75 }}>{a.requested_by_name || '-'} · <Num>{cairo(a.requested_at)}</Num></span>
          </div>
        ))}
      </div>
    </div>
  );
}
