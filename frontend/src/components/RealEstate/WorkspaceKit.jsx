import React from 'react';
import { X } from 'lucide-react';

/**
 * Lightweight shared building blocks for the standalone Real Estate workspaces
 * (Reservations, Contracts, Installments, Commissions, Handover).
 * Presentation only – all data access and authorization stays in the backend.
 */

export const fmtMoney = (v) => `${Number(v || 0).toLocaleString()} EGP`;
export const fmtDate = (v) => (v ? String(v).split('T')[0] : '—');

export const WorkspaceHeader = ({ icon, title, subtitle, children }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
        {icon} {title}
      </h2>
      {subtitle && <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>{subtitle}</p>}
    </div>
    {children && <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>}
  </div>
);

export const StatCards = ({ items }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: '12px', marginBottom: '16px' }}>
    {items.map((s) => (
      <div key={s.label} style={{ background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: '12px', padding: '14px 16px' }}>
        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{s.label}</div>
        <div style={{ fontSize: '20px', fontWeight: 800, color: s.color || '#0f172a', marginTop: '4px' }}>{s.value}</div>
      </div>
    ))}
  </div>
);

export const FilterChips = ({ options, value, onChange }) => (
  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
    {options.map((o) => {
      const active = value === o.value;
      return (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          style={{ padding: '6px 12px', borderRadius: '999px', border: active ? '1px solid var(--primary)' : '1px solid #e2e8f0', background: active ? 'var(--primary)' : 'white', color: active ? 'white' : '#475569', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);

export const DealFilterBanner = ({ dealId, label, onClear }) =>
  dealId ? (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: '10px', padding: '8px 12px', marginBottom: '12px', fontSize: '12px', fontWeight: 700 }}>
      <span>Showing records for Deal #{dealId}{label ? ` — ${label}` : ''}</span>
      <button type="button" onClick={onClear} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', color: '#1e40af', cursor: 'pointer', fontWeight: 700 }}>
        <X size={14} /> Clear
      </button>
    </div>
  ) : null;

const BADGE_COLORS = {
  green: ['#dcfce7', '#15803d'],
  blue: ['#dbeafe', '#1d4ed8'],
  amber: ['#fef3c7', '#b45309'],
  red: ['#fee2e2', '#b91c1c'],
  gray: ['#f1f5f9', '#475569'],
  teal: ['#ccfbf1', '#0f766e'],
};

export const Badge = ({ color = 'gray', children }) => {
  const [bg, fg] = BADGE_COLORS[color] || BADGE_COLORS.gray;
  return (
    <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, background: bg, color: fg, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
};

export const ActionButton = ({ color = '#2563eb', outline = false, children, ...rest }) => (
  <button
    type="button"
    {...rest}
    style={{
      padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: rest.disabled ? 'not-allowed' : 'pointer',
      background: outline ? 'white' : color, color: outline ? color : 'white', border: `1px solid ${color}`, opacity: rest.disabled ? 0.5 : 1,
      whiteSpace: 'nowrap', ...(rest.style || {})
    }}
  >
    {children}
  </button>
);

export const SimpleTable = ({ columns, rows, loading, empty = 'No records found.', rowStyle }) => (
  <div style={{ background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: '12px', overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
      <thead>
        <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'left' }}>
          {columns.map((c) => (
            <th key={c.key} style={{ padding: '10px 12px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', textAlign: c.align || 'left' }}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr><td colSpan={columns.length} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Loading…</td></tr>
        ) : rows.length === 0 ? (
          <tr><td colSpan={columns.length} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>{empty}</td></tr>
        ) : (
          rows.map((r, idx) => (
            <tr key={r.id ?? idx} style={{ borderBottom: '1px solid #f1f5f9', ...(rowStyle ? rowStyle(r) : {}) }}>
              {columns.map((c) => (
                <td key={c.key} style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: c.align || 'left' }}>
                  {c.render ? c.render(r[c.key], r) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

export const fieldStyle = { width: '100%', padding: '9px 10px', border: '1px solid var(--border, #e2e8f0)', borderRadius: '8px', fontSize: '13px', background: 'var(--bg-main, #fff)' };
export const labelStyle = { display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 600, color: '#334155' };
