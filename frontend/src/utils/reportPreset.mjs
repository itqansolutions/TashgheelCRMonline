export function localDateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function reportPreset(preset, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();
  if (preset === 'today') return [localDateInput(now), localDateInput(now)];
  if (preset === 'this_month') return [localDateInput(new Date(y, m, 1)), localDateInput(new Date(y, m + 1, 0))];
  if (preset === 'last_month') return [localDateInput(new Date(y, m - 1, 1)), localDateInput(new Date(y, m, 0))];
  if (preset === 'this_quarter') { const q = Math.floor(m / 3) * 3; return [localDateInput(new Date(y, q, 1)), localDateInput(new Date(y, q + 3, 0))]; }
  if (preset === 'this_year') return [`${y}-01-01`, `${y}-12-31`];
  if (preset === 'all') return ['', ''];
  return null;
}
