import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import toast from 'react-hot-toast';
import {
  UserCircle, CheckSquare, Handshake, Users, Building2,
  ChevronLeft, ChevronRight, Activity, Clock, Wallet,
  FileText, CheckCircle, Shield, Calendar, DollarSign
} from 'lucide-react';
import DataTable from '../components/Common/DataTable';

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US') : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-US') : '—';

// ─── Leave Request Form ───────────────────────────────────────────────────────
const LeaveRequestForm = ({ onSuccess }) => {
  const [form, setForm] = useState({ type: 'annual', start_date: '', end_date: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.start_date || !form.end_date) return toast.error('Please select leave dates');
    setSaving(true);
    try {
      await api.post('/hr/leaves', form);
      toast.success('Request submitted successfully');
      setForm({ type: 'annual', start_date: '', end_date: '', notes: '' });
      onSuccess?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit request');
    } finally { setSaving(false); }
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0',
    borderRadius: '10px', fontSize: '14px', fontWeight: 600, outline: 'none',
    boxSizing: 'border-box', background: '#fafafa',
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '500px' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>Submit New Request</h3>
      <div>
        <label style={{ display: 'block', fontWeight: 700, fontSize: '12px', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Request Type</label>
        <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inputStyle}>
          <option value="annual">Annual Leave</option>
          <option value="sick">Sick Leave</option>
          <option value="emergency">Emergency Leave</option>
          <option value="unpaid">Unpaid Leave</option>
          <option value="delay">Late Permission (Delay)</option>
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 700, fontSize: '12px', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>From Date</label>
          <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={inputStyle} required />
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 700, fontSize: '12px', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>To Date</label>
          <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={inputStyle} required />
        </div>
      </div>
      <div>
        <label style={{ display: 'block', fontWeight: 700, fontSize: '12px', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Notes (Optional)</label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Reason for request..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
      </div>
      <button type="submit" disabled={saving} style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, alignSelf: 'flex-start' }}>
        {saving ? 'Submitting...' : 'Submit Request'}
      </button>
    </form>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const MyProfile = () => {
  const { user } = useAuth();
  const { taskStatuses } = useData();
  const isRealEstate = user?.template_name === 'real_estate';
  const isManager = user?.role === 'admin' || user?.role === 'manager';

  const [activeTab, setActiveTab] = useState('tasks');
  const [data, setData] = useState({ tasks: [], deals: [], customers: [], units: [], activity: [], leaves: [], payrolls: [], pendingLeaves: [] });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
  const [loading, setLoading] = useState(true);

  // ── Tab definitions ──
  const TABS = [
    { id: 'tasks', label: 'Tasks', icon: <CheckSquare size={15} /> },
    { id: 'deals', label: 'Deals', icon: <Handshake size={15} /> },
    { id: 'customers', label: 'Customers', icon: <Users size={15} /> },
    ...(isRealEstate ? [{ id: 'units', label: 'My Units', icon: <Building2 size={15} /> }] : []),
    { id: 'activity', label: 'Activity', icon: <Clock size={15} />, desc: 'Attendance & Logs' },
    { id: 'balance', label: 'Activity Balance', icon: <Wallet size={15} />, desc: 'Leave Balances' },
    { id: 'requests', label: 'Requests', icon: <FileText size={15} />, desc: 'My Requests' },
    ...(isManager ? [{ id: 'approvals', label: 'Requests Approve', icon: <CheckCircle size={15} />, desc: 'Pending Approvals' }] : []),
    { id: 'payroll', label: 'Payroll Slips', icon: <DollarSign size={15} />, desc: 'Salary Slips' },
  ];

  useEffect(() => {
    fetchTabData();
  }, [activeTab, pagination.page]);

  const fetchTabData = async () => {
    setLoading(true);
    try {
      let endpointMap = {
        tasks: '/profile/tasks',
        deals: '/profile/deals',
        customers: '/profile/customers',
        units: '/profile/units',
      };

      if (endpointMap[activeTab]) {
        const res = await api.get(`${endpointMap[activeTab]}?page=${pagination.page}&limit=${pagination.limit}`);
        setData(prev => ({ ...prev, [activeTab]: res.data.data || [] }));
        setPagination(prev => ({ ...prev, total: res.data?.meta?.total ?? (res.data?.data?.length || 0), page: res.data?.meta?.page ?? 1 }));
      } else if (activeTab === 'activity') {
        const res = await api.get('/hr/attendance/my');
        setData(prev => ({ ...prev, activity: res.data.data || [] }));
        setPagination(prev => ({ ...prev, total: 0 }));
      } else if (activeTab === 'balance') {
        const res = await api.get('/hr/leaves/my');
        setData(prev => ({ ...prev, leaves: res.data.data || [] }));
        setPagination(prev => ({ ...prev, total: 0 }));
      } else if (activeTab === 'requests') {
        const res = await api.get('/hr/leaves/my');
        setData(prev => ({ ...prev, leaves: res.data.data || [] }));
        setPagination(prev => ({ ...prev, total: 0 }));
      } else if (activeTab === 'approvals') {
        const res = await api.get('/hr/leaves');
        setData(prev => ({ ...prev, pendingLeaves: res.data.data || [] }));
        setPagination(prev => ({ ...prev, total: 0 }));
      } else if (activeTab === 'payroll') {
        const res = await api.get('/hr/payroll');
        setData(prev => ({ ...prev, payrolls: res.data.data || [] }));
        setPagination(prev => ({ ...prev, total: 0 }));
      }
    } catch (err) {
      // Silently fail for HR tabs that may not be enabled
      console.warn(`Tab ${activeTab} data load failed:`, err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveApproval = async (id, status) => {
    try {
      await api.put(`/hr/leaves/${id}/status`, { status });
      toast.success(status === 'approved' ? 'Request approved' : 'Request rejected');
      fetchTabData();
    } catch { toast.error('Operation failed'); }
  };

  const statusColor = { approved: '#10b981', pending: '#f59e0b', rejected: '#ef4444' };
  const statusLabel = { approved: 'Approved', pending: 'Pending Review', rejected: 'Rejected' };

  // ── Tab Content ──
  const renderContent = () => {
    if (loading) {
      return (
        <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ marginTop: '16px', fontWeight: 600 }}>Loading...</p>
        </div>
      );
    }

    if (activeTab === 'tasks') {
      const cols = [
        { key: 'title', label: 'Task', render: v => <span style={{ fontWeight: 700, color: '#1e293b' }}>{v}</span> },
        { key: 'priority', label: 'Priority', render: v => <span style={{ textTransform: 'capitalize', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, background: v === 'high' ? '#fef2f2' : v === 'medium' ? '#fffbeb' : '#f0fdf4', color: v === 'high' ? '#dc2626' : v === 'medium' ? '#d97706' : '#16a34a' }}>{v}</span> },
        { key: 'status_id', label: 'Status', render: v => { const s = taskStatuses.find(x => x.id === v) || { name: 'Todo', color: '#64748b' }; return <span style={{ background: s.color, color: 'white', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 800 }}>{s.name}</span>; } },
        { key: 'due_date', label: 'Due', render: v => fmtDate(v) },
      ];
      return <DataTable columns={cols} data={data.tasks} />;
    }

    if (activeTab === 'deals') {
      const cols = [
        { key: 'title', label: 'Deal', render: v => <span style={{ fontWeight: 700, color: '#1e293b' }}>{v}</span> },
        { key: 'value', label: 'Value', render: v => <span style={{ fontWeight: 700, color: '#4f46e5' }}>{fmt(v)} EGP</span> },
        { key: 'pipeline_stage', label: 'Stage', render: v => <span style={{ textTransform: 'capitalize', fontWeight: 600, color: '#475569' }}>{v}</span> },
        { key: 'expected_close_date', label: 'Close Date', render: v => fmtDate(v) },
      ];
      return <DataTable columns={cols} data={data.deals} />;
    }

    if (activeTab === 'customers') {
      const cols = [
        { key: 'name', label: 'Name', render: v => <span style={{ fontWeight: 700, color: '#1e293b' }}>{v}</span> },
        { key: 'phone', label: 'Phone' },
        { key: 'source_name', label: 'Source' },
        { key: 'created_at', label: 'Added', render: v => fmtDate(v) },
      ];
      return <DataTable columns={cols} data={data.customers} />;
    }

    if (activeTab === 'units') {
      const cols = [
        { key: 'unit_number', label: 'Unit No.', render: v => <span style={{ fontWeight: 700 }}>{v}</span> },
        { key: 'project_name', label: 'Project' },
        { key: 'price', label: 'Price', render: v => <span style={{ fontWeight: 700, color: '#4f46e5' }}>{Number(v).toLocaleString()} EGP</span> },
        { key: 'status', label: 'Status', render: v => <span style={{ background: v === 'Available' ? '#dcfce7' : '#f1f5f9', color: v === 'Available' ? '#16a34a' : '#475569', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>{v}</span> },
      ];
      return <DataTable columns={cols} data={data.units} />;
    }

    if (activeTab === 'activity') {
      return (
        <div style={{ padding: '20px' }}>
          {data.activity.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              <Clock size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <p style={{ fontWeight: 700 }}>No attendance records</p>
              <p style={{ fontSize: '13px', color: '#cbd5e1' }}>Your check-in and check-out logs will appear here once connected to attendance devices</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  {['Date', 'Check In', 'Check Out', 'Duration'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.activity.map((a, i) => {
                  const duration = a.check_out && a.check_in
                    ? Math.round((new Date(a.check_out) - new Date(a.check_in)) / 60000) + ' min'
                    : '—';
                  return (
                    <tr key={a.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1e293b' }}>{fmtDate(a.check_in)}</td>
                      <td style={{ padding: '12px 16px', color: '#10b981', fontWeight: 700 }}>{a.check_in ? new Date(a.check_in).toLocaleTimeString('en-US') : '—'}</td>
                      <td style={{ padding: '12px 16px', color: '#ef4444', fontWeight: 700 }}>{a.check_out ? new Date(a.check_out).toLocaleTimeString('en-US') : '⏳ Ongoing'}</td>
                      <td style={{ padding: '12px 16px', color: '#64748b' }}>{duration}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      );
    }

    if (activeTab === 'balance') {
      const leaveTypes = ['annual', 'sick', 'emergency', 'unpaid', 'delay'];
      const counts = {};
      leaveTypes.forEach(t => {
        counts[t] = data.leaves.filter(l => l.type === t && l.status === 'approved').length;
      });
      const typeLabel = { annual: 'Annual', sick: 'Sick', emergency: 'Emergency', unpaid: 'Unpaid', delay: 'Delay' };
      const typeColor = { annual: '#4f46e5', sick: '#ef4444', emergency: '#f59e0b', unpaid: '#64748b', delay: '#06b6d4' };
      return (
        <div style={{ padding: '24px' }}>
          <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>Approved Leave Balances Summary</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
            {leaveTypes.map(t => (
              <div key={t} style={{ background: 'white', border: `2px solid ${typeColor[t]}30`, borderRadius: '14px', padding: '20px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: '36px', fontWeight: 900, color: typeColor[t], lineHeight: 1 }}>{counts[t]}</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginTop: '6px', textTransform: 'uppercase' }}>{typeLabel[t]} Leave</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '24px', background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
              ⚠️ Displayed balances reflect actual approved days. To calculate remaining annual quotas, link your company leave policy.
            </p>
          </div>
        </div>
      );
    }

    if (activeTab === 'requests') {
      return (
        <div>
          <LeaveRequestForm onSuccess={fetchTabData} />
          {data.leaves.length > 0 && (
            <div style={{ padding: '0 24px 24px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', marginBottom: '12px' }}>My Previous Requests</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.leaves.map(l => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div>
                      <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '14px' }}>{l.type === 'annual' ? 'Annual Leave' : l.type === 'sick' ? 'Sick Leave' : l.type}</span>
                      <span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '12px' }}>{fmtDate(l.start_date)} — {fmtDate(l.end_date)}</span>
                    </div>
                    <span style={{ background: `${statusColor[l.status]}18`, color: statusColor[l.status], padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 800 }}>
                      {statusLabel[l.status]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (activeTab === 'approvals') {
      const pending = data.pendingLeaves.filter(l => l.status === 'pending');
      return (
        <div style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
            Pending Requests ({pending.length})
          </h3>
          {pending.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              <CheckCircle size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <p style={{ fontWeight: 700 }}>No pending requests</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pending.map(l => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '14px', marginBottom: '4px' }}>{l.user_name || 'Employee'}</div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>
                      {l.type} · {fmtDate(l.start_date)} — {fmtDate(l.end_date)}
                    </div>
                    {l.notes && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{l.notes}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleLeaveApproval(l.id, 'approved')} style={{ padding: '8px 16px', background: '#dcfce7', color: '#16a34a', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', fontSize: '13px' }}>✅ Approve</button>
                    <button onClick={() => handleLeaveApproval(l.id, 'rejected')} style={{ padding: '8px 16px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', fontSize: '13px' }}>❌ Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* All requests history */}
          <h4 style={{ margin: '24px 0 12px', fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>All Requests History</h4>
          {data.pendingLeaves.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '13px' }}>No requests</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  {['Employee', 'Type', 'From', 'To', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.pendingLeaves.map((l, i) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafbfc' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#1e293b' }}>{l.user_name || '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#64748b' }}>{l.type}</td>
                    <td style={{ padding: '10px 14px', color: '#64748b' }}>{fmtDate(l.start_date)}</td>
                    <td style={{ padding: '10px 14px', color: '#64748b' }}>{fmtDate(l.end_date)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: `${statusColor[l.status]}18`, color: statusColor[l.status], padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800 }}>
                        {statusLabel[l.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      );
    }

    if (activeTab === 'payroll') {
      return (
        <div style={{ padding: '20px' }}>
          {data.payrolls.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              <DollarSign size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <p style={{ fontWeight: 700 }}>No payroll data found</p>
              <p style={{ fontSize: '13px', color: '#cbd5e1' }}>Your salary details will appear here once published by management</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {data.payrolls.filter(p => isManager || p.user_id === user?.id).map(p => (
                <div key={p.id} style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                        Salary for {new Date(p.period_start || p.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </h4>
                      {isManager && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>Employee: {p.user_name || '—'}</p>}
                    </div>
                    <span style={{
                      background: p.status === 'finalized' ? '#dcfce7' : '#fffbeb',
                      color: p.status === 'finalized' ? '#16a34a' : '#d97706',
                      padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 800
                    }}>
                      {p.status === 'finalized' ? '✅ Finalized' : '⏳ Draft'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
                    {[
                      { label: 'Basic Salary', value: fmt(p.basic_salary), color: '#4f46e5' },
                      { label: 'Allowances', value: fmt(p.allowances), color: '#10b981' },
                      { label: 'Deductions', value: fmt(p.deductions), color: '#ef4444' },
                      { label: 'Net Salary', value: fmt(p.net_salary), color: '#1e293b' },
                    ].map(s => (
                      <div key={s.label} style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>{s.label}</div>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: s.color }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= Math.ceil(pagination.total / pagination.limit)) {
      setPagination(prev => ({ ...prev, page: newPage }));
    }
  };

  const showPagination = ['tasks', 'deals', 'customers', 'units'].includes(activeTab);

  return (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', marginBottom: '32px' }}>
        <div style={{ width: '80px', height: '80px', borderRadius: '20px', background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 10px 25px rgba(99,102,241,0.3)', flexShrink: 0 }}>
          <UserCircle size={40} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#1e293b', margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>
            {user?.name || 'Employee Profile'}
          </h1>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {user?.role === 'manager' ? '⭐ Team Manager' : user?.role === 'admin' ? '🛡️ Admin' : '👤 Employee'}
            </span>
            <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600 }}>{user?.email}</span>
            {user?.job_title_name && (
              <span style={{ background: '#ede9fe', color: '#7c3aed', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>
                {user.job_title_name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '2px solid #e2e8f0', marginBottom: '24px', overflowX: 'auto', paddingBottom: '0' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setPagination(p => ({ ...p, page: 1 })); }}
            style={{
              padding: '10px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #6366f1' : '2px solid transparent',
              color: activeTab === tab.id ? '#6366f1' : '#64748b',
              fontWeight: 800,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginBottom: '-2px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.04)' }}>
        {/* Content header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fbfcfd' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {TABS.find(t => t.id === activeTab)?.icon}
            {TABS.find(t => t.id === activeTab)?.label}
            {TABS.find(t => t.id === activeTab)?.desc && (
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>— {TABS.find(t => t.id === activeTab)?.desc}</span>
            )}
          </h3>
          {showPagination && (
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '4px 12px', borderRadius: '20px' }}>
              {pagination.total} records
            </span>
          )}
        </div>

        {renderContent()}

        {/* Pagination */}
        {showPagination && !loading && pagination.total > pagination.limit && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fbfcfd' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
              Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page === 1}
                style={{ padding: '6px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: pagination.page === 1 ? 'not-allowed' : 'pointer', opacity: pagination.page === 1 ? 0.5 : 1, display: 'flex', alignItems: 'center' }}>
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => handlePageChange(pagination.page + 1)} disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
                style={{ padding: '6px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: pagination.page >= Math.ceil(pagination.total / pagination.limit) ? 'not-allowed' : 'pointer', opacity: pagination.page >= Math.ceil(pagination.total / pagination.limit) ? 0.5 : 1, display: 'flex', alignItems: 'center' }}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyProfile;
