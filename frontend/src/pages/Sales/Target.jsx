import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Target as TargetIcon, Plus, Edit2, Trash2, TrendingUp, Award, DollarSign, Calendar, CheckCircle2, User, X } from 'lucide-react';

const Target = () => {
  const [targets, setTargets] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('All Periods');
  const [showModal, setShowModal] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    user_id: '',
    period: 'Q3 2026',
    target_amount: '',
    commission_rate: 3.5,
    bonus_threshold: '',
    notes: ''
  });

  const fetchTargets = async () => {
    setLoading(true);
    try {
      const url = selectedPeriod === 'All Periods' ? '/sales/targets' : `/sales/targets?period=${encodeURIComponent(selectedPeriod)}`;
      const res = await api.get(url).catch(() => ({ data: { data: [] } }));
      setTargets(res.data?.data || []);
    } catch (err) {
      toast.error('Failed to load sales targets');
    } finally {
      setLoading(false);
    }
  };

  const fetchSalesmen = async () => {
    try {
      const res = await api.get('/sales/salesmen').catch(() => ({ data: { data: [] } }));
      let list = res.data?.data || [];
      if (list.length === 0) {
        // Fallback to /users
        const uRes = await api.get('/users').catch(() => ({ data: { data: [] } }));
        list = uRes.data?.data || [];
      }
      setSalesmen(list);
    } catch (err) {
      console.error('Failed to fetch sales team', err);
    }
  };

  useEffect(() => {
    fetchTargets();
    fetchSalesmen();
  }, [selectedPeriod]);

  const handleOpenModal = (target = null) => {
    if (target) {
      setEditingTarget(target);
      setForm({
        user_id: String(target.user_id),
        period: target.period || 'Q3 2026',
        target_amount: target.target_amount || '',
        commission_rate: target.commission_rate || 3.5,
        bonus_threshold: target.bonus_threshold || '',
        notes: target.notes || ''
      });
    } else {
      setEditingTarget(null);
      setForm({
        user_id: salesmen.length > 0 ? String(salesmen[0].id) : '',
        period: selectedPeriod !== 'All Periods' ? selectedPeriod : 'Q3 2026',
        target_amount: '',
        commission_rate: 3.5,
        bonus_threshold: '',
        notes: ''
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.user_id) return toast.error('Please select a sales representative');
    if (!form.target_amount || parseFloat(form.target_amount) <= 0) return toast.error('Please enter a valid target amount');

    setSaving(true);
    try {
      if (editingTarget) {
        await api.put(`/sales/targets/${editingTarget.id}`, form);
        toast.success('Sales target updated successfully');
      } else {
        await api.post('/sales/targets', form);
        toast.success('Sales target assigned successfully');
      }
      setShowModal(false);
      fetchTargets();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save target');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this sales target?')) return;
    try {
      await api.delete(`/sales/targets/${id}`);
      toast.success('Target deleted');
      fetchTargets();
    } catch (err) {
      toast.error('Failed to delete target');
    }
  };

  const totalTargetSum = targets.reduce((acc, t) => acc + (parseFloat(t.target_amount) || 0), 0);
  const totalAchievedSum = targets.reduce((acc, t) => acc + (parseFloat(t.achieved_amount) || 0), 0);
  const overallPercentage = totalTargetSum > 0 ? Math.round((totalAchievedSum / totalTargetSum) * 100) : 0;

  const modalStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '16px'
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px',
    fontSize: '14px', fontWeight: 600, outline: 'none', background: '#f8fafc', boxSizing: 'border-box'
  };

  const labelStyle = {
    display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px'
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <TargetIcon size={24} style={{ color: '#10b981' }} /> Sales Targets & Goals
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
            Track sales volume quotas, target achievement progress, and incentive bonuses
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            style={{ padding: '9px 16px', borderRadius: '10px', border: '1.5px solid #10b981', fontWeight: 700, outline: 'none', background: '#ecfdf5', color: '#047857', fontSize: '13px' }}
          >
            <option value="All Periods">All Target Periods</option>
            <option value="Q1 2026">Q1 2026 (Jan - Mar)</option>
            <option value="Q2 2026">Q2 2026 (Apr - Jun)</option>
            <option value="Q3 2026">Q3 2026 (Jul - Sep)</option>
            <option value="Q4 2026">Q4 2026 (Oct - Dec)</option>
            <option value="FY 2026">Full Year 2026</option>
          </select>

          <button
            onClick={() => handleOpenModal()}
            style={{
              padding: '10px 18px', background: 'linear-gradient(135deg, #10b981, #059669)',
              color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px',
              boxShadow: '0 4px 12px rgba(16,185,129,0.25)'
            }}
          >
            <Plus size={16} /> Set Sales Target
          </button>
        </div>
      </div>

      {/* Total Target Progress Widget */}
      <div style={{ background: 'linear-gradient(135deg, #064e3b 0%, #047857 100%)', color: 'white', padding: '24px', borderRadius: '20px', marginBottom: '24px', boxShadow: '0 10px 25px rgba(4,120,87,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Overall Team Target Performance ({selectedPeriod})</span>
            <h2 style={{ margin: '4px 0 0 0', fontSize: '28px', fontWeight: 800 }}>${totalAchievedSum.toLocaleString()} <span style={{ fontSize: '16px', fontWeight: 500, color: '#a7f3d0' }}>/ ${totalTargetSum.toLocaleString()}</span></h2>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', padding: '12px 20px', borderRadius: '14px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.2)' }}>
            <span style={{ fontSize: '11px', color: '#a7f3d0', display: 'block', fontWeight: 700 }}>Achievement</span>
            <span style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff' }}>{overallPercentage}%</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ height: '10px', background: 'rgba(255,255,255,0.2)', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(overallPercentage, 100)}%`, background: '#34d399', transition: 'width 0.6s ease' }} />
        </div>
      </div>

      {/* Salesmen Individual Quota Cards */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', background: 'white', borderRadius: '16px' }}>Loading sales targets...</div>
      ) : targets.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '60px', textAlign: 'center' }}>
          <TargetIcon size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>No Sales Targets Set</h3>
          <p style={{ margin: '0 0 20px 0', color: '#64748b', fontSize: '14px' }}>Assign quarterly or annual sales targets to your sales representatives to monitor performance.</p>
          <button
            onClick={() => handleOpenModal()}
            style={{ padding: '10px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={16} /> Set First Target
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {targets.map((t) => {
            const targetAmount = parseFloat(t.target_amount) || 1;
            const achievedAmount = parseFloat(t.achieved_amount) || 0;
            const pct = Math.round((achievedAmount / targetAmount) * 100);
            const isTargetMet = pct >= 100;
            return (
              <div key={t.id} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1e293b' }}>{t.salesman_name || 'Representative'}</h3>
                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Period: {t.period}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                        background: isTargetMet ? '#dcfce7' : '#e0f2fe',
                        color: isTargetMet ? '#15803d' : '#0369a1'
                      }}>
                        {isTargetMet ? 'Goal Achieved! 🎉' : `${pct}% Completed`}
                      </span>
                      <button onClick={() => handleOpenModal(t)} title="Edit Target" style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: '#475569' }}>
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(t.id)} title="Delete Target" style={{ background: '#fee2e2', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: '#ef4444' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', marginBottom: '14px', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>Assigned Quota:</span>
                      <span style={{ fontWeight: 800, color: '#1e293b' }}>${targetAmount.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>Closed Revenue:</span>
                      <span style={{ fontWeight: 800, color: '#10b981' }}>${achievedAmount.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>Commission Rate:</span>
                      <span style={{ fontWeight: 800, color: '#8b5cf6' }}>{t.commission_rate || 0}% ({t.commission_earned ? `$${t.commission_earned.toLocaleString()}` : '$0'})</span>
                    </div>
                    {t.bonus_threshold > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>Bonus Threshold:</span>
                        <span style={{ fontWeight: 800, color: '#f59e0b' }}>${parseFloat(t.bonus_threshold).toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  {/* Individual Bar */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
                      <span>Quota Progress</span>
                      <span>{pct}%</span>
                    </div>
                    <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444' }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Set / Edit Target Modal */}
      {showModal && (
        <div style={modalStyle}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '520px', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
              <h3 style={{ margin: 0, fontWeight: 800, fontSize: '16px' }}>
                {editingTarget ? 'Edit Sales Target' : 'Set New Sales Target'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Sales Representative *</label>
                <select
                  value={form.user_id}
                  onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                  style={inputStyle}
                  required
                >
                  <option value="">Select sales representative...</option>
                  {salesmen.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>Target Period *</label>
                  <select
                    value={form.period}
                    onChange={(e) => setForm({ ...form, period: e.target.value })}
                    style={inputStyle}
                    required
                  >
                    <option value="Q1 2026">Q1 2026 (Jan - Mar)</option>
                    <option value="Q2 2026">Q2 2026 (Apr - Jun)</option>
                    <option value="Q3 2026">Q3 2026 (Jul - Sep)</option>
                    <option value="Q4 2026">Q4 2026 (Oct - Dec)</option>
                    <option value="FY 2026">Full Year 2026</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Target Quota ($ / EGP) *</label>
                  <input
                    type="number"
                    value={form.target_amount}
                    onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
                    placeholder="e.g. 150000"
                    style={inputStyle}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>Commission Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.commission_rate}
                    onChange={(e) => setForm({ ...form, commission_rate: e.target.value })}
                    placeholder="e.g. 3.5"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Bonus Threshold ($ / EGP)</label>
                  <input
                    type="number"
                    value={form.bonus_threshold}
                    onChange={(e) => setForm({ ...form, bonus_threshold: e.target.value })}
                    placeholder="e.g. 180000"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Notes & Performance Incentive Terms</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Optional bonus scheme notes or incentives..."
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', color: '#475569', fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}
                >
                  {saving ? 'Saving...' : editingTarget ? 'Update Target' : 'Assign Target'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Target;
