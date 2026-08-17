import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, CheckCircle2, XCircle, Clock, Calendar, Sliders } from 'lucide-react';
import HRSubNav from '../../components/HR/HRSubNav';

const ActivityDefinition = () => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    name: '',
    unit: 'hours',
    start_post: 0,
    end_post: 0,
    min_value: 0.5,
    max_value: 8,
    is_active: true,
  });

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const res = await api.get('/hr/activity-types');
      setActivities(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load activity definitions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, []);

  const handleOpenModal = (act = null) => {
    if (act) {
      setEditingId(act.id);
      setForm({
        name: act.name,
        unit: act.unit || 'hours',
        start_post: act.start_post || 0,
        end_post: act.end_post || 0,
        min_value: act.min_value || 0,
        max_value: act.max_value || 30,
        is_active: act.is_active !== false,
      });
    } else {
      setEditingId(null);
      setForm({
        name: '',
        unit: 'hours',
        start_post: 0,
        end_post: 0,
        min_value: 0.5,
        max_value: 8,
        is_active: true,
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Activity name is required');
    try {
      if (editingId) {
        await api.put(`/hr/activity-types/${editingId}`, form);
        toast.success('Activity definition updated successfully');
      } else {
        await api.post('/hr/activity-types', form);
        toast.success('Activity definition added successfully');
      }
      setShowModal(false);
      fetchActivities();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error saving activity');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this activity?')) return;
    try {
      await api.delete(`/hr/activity-types/${id}`);
      toast.success('Activity deleted successfully');
      fetchActivities();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete activity');
    }
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
              <Sliders size={24} style={{ color: '#4f46e5' }} /> Activity Definitions
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              Define company activity types, permission rules, and valid duration boundaries
            </p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white',
              border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(79,70,229,0.25)'
            }}
          >
            <Plus size={18} /> Add New Activity
          </button>
        </div>

        {/* Main Table */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
          ) : activities.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
              <Sliders size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <p style={{ fontWeight: 700, margin: 0 }}>No activity definitions found</p>
              <p style={{ fontSize: '13px', color: '#cbd5e1' }}>Click "Add New Activity" to create your first company activity definition</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Activity Name</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Unit</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Posting Boundaries (Start / End Post)</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Min — Max Range</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Status</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((act) => (
                  <tr key={act.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 18px', fontWeight: 800, color: '#1e293b' }}>
                      {act.name}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 800,
                        background: act.unit === 'hours' ? '#e0e7ff' : '#fef3c7',
                        color: act.unit === 'hours' ? '#4338ca' : '#b45309'
                      }}>
                        {act.unit === 'hours' ? '⏱️ Hours' : '📅 Days'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: '13px', color: '#475569', fontWeight: 600 }}>
                      From {act.start_post >= 0 ? `+${act.start_post}` : act.start_post} days to {act.end_post >= 0 ? `+${act.end_post}` : act.end_post} days
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: '13px', color: '#475569', fontWeight: 700 }}>
                      {act.min_value} — {act.max_value} {act.unit === 'hours' ? 'Hours' : 'Days'}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                        background: act.is_active ? '#dcfce7' : '#fee2e2',
                        color: act.is_active ? '#15803d' : '#b91c1c'
                      }}>
                        {act.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button onClick={() => handleOpenModal(act)} style={{ padding: '6px', border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white', cursor: 'pointer', color: '#4f46e5' }}>
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(act.id)} style={{ padding: '6px', border: '1px solid #fee2e2', borderRadius: '8px', background: '#fef2f2', cursor: 'pointer', color: '#dc2626' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add / Edit Modal */}
        {showModal && (
          <div style={modalStyle}>
            <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '520px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                  {editingId ? 'Edit Activity Definition' : 'Add New Activity'}
                </h3>
                <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
              </div>

              <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Activity Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Late Permission / Annual Leave"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    style={inputStyle}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Unit</label>
                  <select
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Start Post (Days)</label>
                    <input
                      type="number"
                      value={form.start_post}
                      onChange={(e) => setForm({ ...form, start_post: parseInt(e.target.value) || 0 })}
                      style={inputStyle}
                      placeholder="Negative = days before"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>End Post (Days)</label>
                    <input
                      type="number"
                      value={form.end_post}
                      onChange={(e) => setForm({ ...form, end_post: parseInt(e.target.value) || 0 })}
                      style={inputStyle}
                      placeholder="Positive = days after"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Min Value</label>
                    <input
                      type="number"
                      step="0.1"
                      value={form.min_value}
                      onChange={(e) => setForm({ ...form, min_value: parseFloat(e.target.value) || 0 })}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Max Value</label>
                    <input
                      type="number"
                      step="0.1"
                      value={form.max_value}
                      onChange={(e) => setForm({ ...form, max_value: parseFloat(e.target.value) || 0 })}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="is_active" style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', cursor: 'pointer' }}>Activity is Active</label>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', color: '#475569', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    {editingId ? 'Update' : 'Save'}
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

export default ActivityDefinition;
