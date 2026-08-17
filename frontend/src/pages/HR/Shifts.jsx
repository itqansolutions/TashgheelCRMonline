import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Clock, Plus, Edit2, Trash2, Users, Calendar, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import HRSubNav from '../../components/HR/HRSubNav';

const DAYS_MAP = [
  { id: 0, name: 'Sunday' },
  { id: 1, name: 'Monday' },
  { id: 2, name: 'Tuesday' },
  { id: 3, name: 'Wednesday' },
  { id: 4, name: 'Thursday' },
  { id: 5, name: 'Friday' },
  { id: 6, name: 'Saturday' },
];

const Shifts = () => {
  const [activeTab, setActiveTab] = useState('shifts'); // 'shifts' | 'assignments'
  const [shifts, setShifts] = useState([]);
  const [userSummary, setUserSummary] = useState([]);
  const [loading, setLoading] = useState(true);

  // Shift Modal
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState(null);
  const [shiftForm, setShiftForm] = useState({
    name: '',
    start_time: '08:00',
    end_time: '17:00',
    grace_minutes: 15,
    off_days: [5, 6], // Fri, Sat
    deduction_rules: [
      { from_min: 1, to_min: 15, deduct_days: 0 },
      { from_min: 16, to_min: 30, deduct_days: 0.25 },
      { from_min: 31, to_min: 60, deduct_days: 0.5 },
      { from_min: 61, to_min: 9999, deduct_days: 1.0 },
    ],
    is_active: true,
  });

  // Assign Modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({
    user_id: '',
    shift_id: '',
    effective_from: new Date().toISOString().split('T')[0],
  });

  const fetchShifts = async () => {
    setLoading(true);
    try {
      const res = await api.get('/hr/shifts');
      setShifts(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load shifts');
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const res = await api.get('/hr/shifts/user-summary');
      setUserSummary(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load employee shift assignments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'shifts') fetchShifts();
    else fetchAssignments();
  }, [activeTab]);

  // Handle Shift Modal Open
  const handleOpenShiftModal = (shift = null) => {
    if (shift) {
      setEditingShiftId(shift.id);
      setShiftForm({
        name: shift.name,
        start_time: shift.start_time || '08:00',
        end_time: shift.end_time || '17:00',
        grace_minutes: shift.grace_minutes || 15,
        off_days: shift.off_days || [5, 6],
        deduction_rules: shift.deduction_rules || [],
        is_active: shift.is_active !== false,
      });
    } else {
      setEditingShiftId(null);
      setShiftForm({
        name: '',
        start_time: '08:00',
        end_time: '17:00',
        grace_minutes: 15,
        off_days: [5, 6],
        deduction_rules: [
          { from_min: 1, to_min: 15, deduct_days: 0 },
          { from_min: 16, to_min: 30, deduct_days: 0.25 },
          { from_min: 31, to_min: 60, deduct_days: 0.5 },
          { from_min: 61, to_min: 9999, deduct_days: 1.0 },
        ],
        is_active: true,
      });
    }
    setShowShiftModal(true);
  };

  // Save Shift
  const handleSaveShift = async (e) => {
    e.preventDefault();
    if (!shiftForm.name.trim()) return toast.error('Shift name is required');
    try {
      if (editingShiftId) {
        await api.put(`/hr/shifts/${editingShiftId}`, shiftForm);
        toast.success('Shift updated successfully');
      } else {
        await api.post('/hr/shifts', shiftForm);
        toast.success('Shift created successfully');
      }
      setShowShiftModal(false);
      fetchShifts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save shift');
    }
  };

  // Delete Shift
  const handleDeleteShift = async (id) => {
    if (!window.confirm('Are you sure you want to delete this shift?')) return;
    try {
      await api.delete(`/hr/shifts/${id}`);
      toast.success('Shift deleted successfully');
      fetchShifts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete shift');
    }
  };

  // Assign Shift
  const handleOpenAssignModal = (user = null) => {
    setAssignForm({
      user_id: user?.user_id || '',
      shift_id: user?.shift_id || (shifts[0]?.id || ''),
      effective_from: new Date().toISOString().split('T')[0],
    });
    setShowAssignModal(true);
  };

  const handleSaveAssign = async (e) => {
    e.preventDefault();
    if (!assignForm.user_id || !assignForm.shift_id) return toast.error('Employee and shift are required');
    try {
      await api.post('/hr/shifts/assign', assignForm);
      toast.success('Shift assigned to employee successfully');
      setShowAssignModal(false);
      fetchAssignments();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign shift');
    }
  };

  // Deduction Rule Handlers
  const handleAddRule = () => {
    setShiftForm({
      ...shiftForm,
      deduction_rules: [...shiftForm.deduction_rules, { from_min: 0, to_min: 0, deduct_days: 0 }]
    });
  };

  const handleUpdateRule = (index, field, value) => {
    const updated = [...shiftForm.deduction_rules];
    updated[index][field] = parseFloat(value) || 0;
    setShiftForm({ ...shiftForm, deduction_rules: updated });
  };

  const handleRemoveRule = (index) => {
    const updated = shiftForm.deduction_rules.filter((_, i) => i !== index);
    setShiftForm({ ...shiftForm, deduction_rules: updated });
  };

  const handleToggleOffDay = (dayId) => {
    let current = [...shiftForm.off_days];
    if (current.includes(dayId)) {
      current = current.filter(d => d !== dayId);
    } else {
      current.push(dayId);
    }
    setShiftForm({ ...shiftForm, off_days: current });
  };

  const modalStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '16px'
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px',
    fontSize: '14px', fontWeight: 600, outline: 'none', background: '#f8fafc', boxSizing: 'border-box'
  };

  return (
    <div>
      <HRSubNav />
      <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Clock size={24} style={{ color: '#06b6d4' }} /> Shifts & Deduction Rules Engine
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              Configure work hours, attendance shifts, off days, and cumulative late penalty rules
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => handleOpenShiftModal()}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
                background: 'linear-gradient(135deg, #06b6d4, #0891b2)', color: 'white',
                border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(6,182,212,0.25)'
              }}
            >
              <Plus size={18} /> Create New Shift
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '12px', borderBottom: '2px solid #e2e8f0', marginBottom: '24px' }}>
          <button
            onClick={() => setActiveTab('shifts')}
            style={{
              padding: '10px 20px', background: 'transparent', border: 'none',
              borderBottom: activeTab === 'shifts' ? '3px solid #06b6d4' : '3px solid transparent',
              color: activeTab === 'shifts' ? '#06b6d4' : '#64748b', fontWeight: 800, cursor: 'pointer', fontSize: '14px',
              marginBottom: '-2px', display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            <Clock size={16} /> Configured Shifts ({shifts.length})
          </button>
          <button
            onClick={() => setActiveTab('assignments')}
            style={{
              padding: '10px 20px', background: 'transparent', border: 'none',
              borderBottom: activeTab === 'assignments' ? '3px solid #06b6d4' : '3px solid transparent',
              color: activeTab === 'assignments' ? '#06b6d4' : '#64748b', fontWeight: 800, cursor: 'pointer', fontSize: '14px',
              marginBottom: '-2px', display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            <Users size={16} /> Employee Shift Assignments
          </button>
        </div>

        {/* Content Tab 1: Shifts List */}
        {activeTab === 'shifts' && (
          <div>
            {loading ? (
              <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
            ) : shifts.length === 0 ? (
              <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                <Clock size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <p style={{ fontWeight: 700, margin: 0 }}>No shifts defined yet</p>
                <p style={{ fontSize: '13px', color: '#cbd5e1' }}>Create morning or evening shifts to manage employee attendance</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
                {shifts.map((s) => (
                  <div key={s.id} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{s.name}</h3>
                          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                            👥 {s.employee_count || 0} employees assigned
                          </span>
                        </div>
                        <span style={{
                          padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                          background: s.is_active ? '#dcfce7' : '#fee2e2', color: s.is_active ? '#15803d' : '#b91c1c'
                        }}>
                          {s.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '10px', marginBottom: '14px', border: '1px solid #f1f5f9' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, display: 'block' }}>Shift Schedule</span>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{s.start_time} — {s.end_time}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, display: 'block' }}>Grace Period</span>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: '#06b6d4' }}>{s.grace_minutes} Mins</span>
                        </div>
                      </div>

                      <div style={{ marginBottom: '14px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Weekly Off Days:</span>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {DAYS_MAP.map(d => {
                            const isOff = (s.off_days || []).includes(d.id);
                            return (
                              <span key={d.id} style={{
                                padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                                background: isOff ? '#fee2e2' : '#f1f5f9',
                                color: isOff ? '#dc2626' : '#94a3b8'
                              }}>
                                {d.name} {isOff && '❌'}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {/* Deduction Rules Preview */}
                      <div>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Cumulative Penalty Rules:</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {(s.deduction_rules || []).map((r, i) => (
                            <div key={i} style={{ fontSize: '12px', background: '#fffbeb', color: '#b45309', padding: '4px 10px', borderRadius: '6px', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                              <span>Late {r.from_min} to {r.to_min} Mins</span>
                              <span>Deduct: {r.deduct_days} Day(s)</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                      <button onClick={() => handleOpenShiftModal(s)} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', color: '#4f46e5', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Edit2 size={14} /> Edit Shift
                      </button>
                      <button onClick={() => handleDeleteShift(s.id)} style={{ padding: '8px 12px', background: '#fef2f2', border: 'none', borderRadius: '8px', color: '#dc2626', fontWeight: 800, cursor: 'pointer' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content Tab 2: Employee Shift Assignments */}
        {activeTab === 'assignments' && (
          <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
            {loading ? (
              <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
            ) : userSummary.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>No employees found</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Employee</th>
                    <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Badge Number</th>
                    <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Assigned Shift</th>
                    <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Effective From</th>
                    <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {userSummary.map((u) => (
                    <tr key={u.user_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: '#1e293b' }}>
                        {u.employee_name}
                      </td>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontWeight: 700, color: '#64748b' }}>
                        {u.badge_number || 'Unassigned'}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        {u.shift_name ? (
                          <span style={{ padding: '4px 12px', background: '#e0f2fe', color: '#0369a1', borderRadius: '20px', fontWeight: 800, fontSize: '12px' }}>
                            ⏰ {u.shift_name} ({u.start_time} - {u.end_time})
                          </span>
                        ) : (
                          <span style={{ padding: '4px 12px', background: '#fee2e2', color: '#b91c1c', borderRadius: '20px', fontWeight: 700, fontSize: '12px' }}>
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: '13px', color: '#64748b' }}>
                        {u.effective_from ? new Date(u.effective_from).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleOpenAssignModal(u)}
                          style={{ padding: '6px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: 800, color: '#0f172a', cursor: 'pointer' }}
                        >
                          Change Shift
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Shift Create/Edit Modal */}
        {showShiftModal && (
          <div style={modalStyle}>
            <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                  {editingShiftId ? 'Edit Shift Config' : 'Create New Shift'}
                </h3>
                <button onClick={() => setShowShiftModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
              </div>

              <form onSubmit={handleSaveShift} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Shift Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Morning Shift / HQ Operations"
                    value={shiftForm.name}
                    onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                    style={inputStyle}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Start Time</label>
                    <input
                      type="time"
                      value={shiftForm.start_time}
                      onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })}
                      style={inputStyle}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>End Time</label>
                    <input
                      type="time"
                      value={shiftForm.end_time}
                      onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })}
                      style={inputStyle}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Grace (Mins)</label>
                    <input
                      type="number"
                      value={shiftForm.grace_minutes}
                      onChange={(e) => setShiftForm({ ...shiftForm, grace_minutes: parseInt(e.target.value) || 0 })}
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Off Days Checkboxes */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Weekly Off Days</label>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {DAYS_MAP.map((d) => {
                      const checked = shiftForm.off_days.includes(d.id);
                      return (
                        <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: checked ? '#fee2e2' : '#f8fafc', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: checked ? '#dc2626' : '#475569' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleOffDay(d.id)}
                          />
                          {d.name}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Dynamic Deduction Rules */}
                <div style={{ background: '#fafafa', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>Cumulative Late Penalty Rules</label>
                    <button
                      type="button"
                      onClick={handleAddRule}
                      style={{ padding: '4px 10px', background: '#06b6d4', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                    >
                      + Add Rule
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {shiftForm.deduction_rules.map((rule, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="number"
                          placeholder="From Min"
                          value={rule.from_min}
                          onChange={(e) => handleUpdateRule(idx, 'from_min', e.target.value)}
                          style={inputStyle}
                        />
                        <input
                          type="number"
                          placeholder="To Min"
                          value={rule.to_min}
                          onChange={(e) => handleUpdateRule(idx, 'to_min', e.target.value)}
                          style={inputStyle}
                        />
                        <input
                          type="number"
                          step="0.25"
                          placeholder="Deduct Days"
                          value={rule.deduct_days}
                          onChange={(e) => handleUpdateRule(idx, 'deduct_days', e.target.value)}
                          style={inputStyle}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveRule(idx)}
                          style={{ padding: '8px', background: '#fef2f2', border: 'none', color: '#dc2626', borderRadius: '8px', cursor: 'pointer' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setShowShiftModal(false)}
                    style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', color: '#475569', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #06b6d4, #0891b2)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    {editingShiftId ? 'Update Shift' : 'Save Shift'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Assign User Shift Modal */}
        {showAssignModal && (
          <div style={modalStyle}>
            <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '450px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                  Assign Shift to Employee
                </h3>
                <button onClick={() => setShowAssignModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
              </div>

              <form onSubmit={handleSaveAssign} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Employee</label>
                  <select
                    value={assignForm.user_id}
                    onChange={(e) => setAssignForm({ ...assignForm, user_id: e.target.value })}
                    style={inputStyle}
                    required
                  >
                    <option value="">Select Employee...</option>
                    {userSummary.map(u => (
                      <option key={u.user_id} value={u.user_id}>{u.employee_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Target Shift</label>
                  <select
                    value={assignForm.shift_id}
                    onChange={(e) => setAssignForm({ ...assignForm, shift_id: e.target.value })}
                    style={inputStyle}
                    required
                  >
                    <option value="">Select Shift...</option>
                    {shifts.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.start_time} - {s.end_time})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Effective Date</label>
                  <input
                    type="date"
                    value={assignForm.effective_from}
                    onChange={(e) => setAssignForm({ ...assignForm, effective_from: e.target.value })}
                    style={inputStyle}
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setShowAssignModal(false)}
                    style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', color: '#475569', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #06b6d4, #0891b2)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    Save Assignment
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Shifts;
