export function currentQuarter(date = new Date()) {
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}
export function targetPeriods(records = [], selected = '', formPeriod = '', date = new Date()) {
  const year = date.getFullYear();
  const values = new Set([selected, formPeriod, ...records.map(record => record.period)].filter(value => value && value !== 'All Periods'));
  for (let y = year - 1; y <= year + 1; y++) {
    values.add(String(y));
    for (let month = 1; month <= 12; month++) values.add(`${y}-${String(month).padStart(2, '0')}`);
    for (let quarter = 1; quarter <= 4; quarter++) values.add(`${y}-Q${quarter}`);
  }
  return ['All Periods', ...[...values].sort().reverse()];
}
