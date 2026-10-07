import React, { useEffect, useMemo, useState } from 'react';
import { Wallet, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

/**
 * My Profile → Activity Balance
 * Read-only personal view of balances assigned by HR.
 * Data: GET /api/hr/activity-balances/my — identity comes from the auth token
 * on the server; no user id is sent from the client. No create/edit/delete.
 * HR management of balances lives separately at HR → Activity Balance.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

const MyActivityBalance = () => {
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (month) params.set('month', month);
        if (year) params.set('year', year);
        const res = await api.get(`/hr/activity-balances/my?${params.toString()}`);
        setRows(res.data?.data || []);
      } catch (err) {
        toast.error('Failed to load your activity balances.');
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [month, year]);

  const totals = useMemo(() => rows.reduce((t, r) => ({
    allocated: t.allocated + Number(r.allocated || 0),
    used: t.used + Number(r.used || 0),
    remaining: t.remaining + Number(r.remaining || 0),
  }), { allocated: 0, used: 0, remaining: 0 }), [rows]);

  const sel = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', background: 'white' };

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '26px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Wallet size={26} color="#10b981" /> My Activity Balance
          </h2>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Lock size={13} /> Balances assigned to you by HR (view only)
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select value={month} onChange={e => setMonth(parseInt(e.target.value) || '')} style={sel}>
            <option value="">All months</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(parseInt(e.target.value) || '')} style={sel}>
            <option value="">All years</option>
            {[currentYear + 1, currentYear, currentYear - 1, currentYear - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
        {[
          { label: 'Allocated', value: totals.allocated, color: '#0f172a' },
          { label: 'Used', value: totals.used, color: '#b45309' },
          { label: 'Remaining', value: totals.remaining, color: totals.remaining < 0 ? '#b91c1c' : '#15803d' },
        ].map(s => (
          <div key={s.label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>{s.label}</div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: s.color, marginTop: '4px' }}>{fmt(s.value)}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left', color: '#475569' }}>
              {['Activity', 'Period', 'Allocated', 'Used', 'Remaining', 'Notes'].map(h => (
                <th key={h} style={{ padding: '12px 16px', fontWeight: 800, fontSize: '12px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: '28px', textAlign: 'center', color: '#64748b' }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '28px', textAlign: 'center', color: '#94a3b8' }}>No balances assigned for this period.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px 16px', fontWeight: 700 }}>{r.activity_name} <span style={{ color: '#94a3b8', fontWeight: 500 }}>({r.unit})</span></td>
                <td style={{ padding: '12px 16px' }}>{MONTHS[(r.period_month || 1) - 1]} {r.period_year}</td>
                <td style={{ padding: '12px 16px' }}>{fmt(r.allocated)}</td>
                <td style={{ padding: '12px 16px', color: '#b45309' }}>{fmt(r.used)}</td>
                <td style={{ padding: '12px 16px', fontWeight: 800, color: Number(r.remaining) < 0 ? '#b91c1c' : '#15803d' }}>{fmt(r.remaining)}</td>
                <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{r.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MyActivityBalance;
