import React, { useRef } from 'react';

// Native date input whose visible text is always dd/mm/yyyy, whatever the browser locale is.
const fmt = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'dd/mm/yyyy';
};

const DateInput = ({ value, style, className, ...rest }) => {
  const ref = useRef(null);
  return (
    <div style={{ position: 'relative', width: (style && style.width) || '100%', flex: style && style.flex }} className={className}>
      <div dir="ltr" style={{ ...style, boxSizing: 'border-box', textAlign: 'start', color: value ? (style && style.color) || 'inherit' : 'var(--text-muted)' }}>{fmt(value)}</div>
      <input
        {...rest}
        ref={ref}
        type="date"
        value={value}
        onClick={(e) => { try { e.currentTarget.showPicker && e.currentTarget.showPicker(); } catch (_) {} if (rest.onClick) rest.onClick(e); }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 0 }}
      />
    </div>
  );
};

export default DateInput;
