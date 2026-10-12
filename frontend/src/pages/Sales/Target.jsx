import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import {
  Target as TargetIcon, Plus, Edit2, Trash2, TrendingUp, Award, DollarSign,
  Calendar, CheckCircle2, User, X, Eye, Building2, Home, FileText, Clock, Layers, AlertTriangle
} from 'lucide-react';

const PERIOD_OPTIONS = [
  { value: 'All Periods', label: 'All Target Periods (الكل)' },
  { value: '2026-10', label: '2026-10 (October 2026)' },
  { value: '2026-11', label: '2026-11 (November 2026)' },
  { value: '2026-12', label: '2026-12 (December 2026)' },
  { value: '2026-Q1', label: '2026-Q1 (Jan - Mar)' },
  { value: '2026-Q2', label: '2026-Q2 (Apr - Jun)' },
  { value: '2026-Q3', label: '2026-Q3 (Jul - Sep)' },
  { value: '2026-Q4', label: '2026-Q4 (Oct - Dec)' },
  { value: '2026', label: 'Full Year 2026 (سنوي)' },
];

const Target = () => {
  const { user } = useAuth();
  const isRealEstate = user?.template_name === 'real_estate';

  const [targets, setTargets] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('2026-Q3');
  const [showModal, setShowModal] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  // Performance Detail Drawer State
  const [showPerformanceModal, setShowPerformanceModal] = useState(false);
  const [performanceData, setPerformanceData] = useState(null);
  const [loadingPerformance, setLoadingPerformance] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState('contracts');

  const [form, setForm] = useState({
    user_id: '',
    period: '2026-Q3',
    target_amount: '',
    target_units: 5,
    commission_rate: 3.5,
    notes: ''
  });

  const fetchTargets = async () => {
    setLoading(true);
    try {
      const baseUrl = isRealEstate ? '/re-targets' : '/sales/targets';
      const url = selectedPeriod === 'All Periods'
        ? baseUrl
        : `${baseUrl}?period=${encodeURIComponent(selectedPeriod)}`;

      const res = await api.get(url).catch(() => ({ data: { data: [] } }));
      setTargets(res.data?.data || []);
    } catch (err) {
      toast.error('Failed to load targets');
    } finally {
      setLoading(false);
    }
  };

  const fetchSalesmen = async () => {
    try {
      const url = isRealEstate ? '/re-targets/salesmen' : '/sales/salesmen';
      const res = await api.get(url).catch(() => ({ data: { data: [] } }));
      let list = res.data?.data || [];
      if (list.length === 0) {
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
  }, [selectedPeriod, isRealEstate]);

  const handleOpenModal = (target = null) => {
    if (target) {
      setEditingTarget(target);
      setForm({
        user_id: String(target.user_id),
        period: target.period || '2026-Q3',
        target_amount: target.target_amount || '',
        target_units: target.target_units || 0,
        commission_rate: target.commission_rate || 3.5,
        notes: target.notes || ''
      });
    } else {
      setEditingTarget(null);
      setForm({
        user_id: salesmen.length > 0 ? String(salesmen[0].id) : '',
        period: selectedPeriod !== 'All Periods' ? selectedPeriod : '2026-Q3',
        target_amount: '',
        target_units: isRealEstate ? 5 : 0,
        commission_rate: 3.5,
        notes: ''
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.user_id) return toast.error('Please select a sales representative');
    if (!form.target_amount || parseFloat(form.target_amount) <= 0) {
      return toast.error('Please enter a valid target quota amount');
    }

    setSaving(true);
    try {
      const baseUrl = isRealEstate ? '/re-targets' : '/sales/targets';
      if (editingTarget) {
        await api.put(`${baseUrl}/${editingTarget.id}`, form);
        toast.success('Target updated successfully');
      } else {
        await api.post(baseUrl, form);
        toast.success('Target assigned successfully');
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
    if (!window.confirm('Are you sure you want to delete this target?')) return;
    try {
      const baseUrl = isRealEstate ? '/re-targets' : '/sales/targets';
      await api.delete(`${baseUrl}/${id}`);
      toast.success('Target deleted');
      fetchTargets();
    } catch (err) {
      toast.error('Failed to delete target');
    }
  };

  // Open "View Performance" Detail Drawer
  const handleViewPerformance = async (salesmanId, period) => {
    setLoadingPerformance(true);
    setShowPerformanceModal(true);
    setPerformanceData(null);
    setActiveDetailTab('contracts');

    try {
      if (isRealEstate) {
        const res = await api.get(`/re-targets/performance/${salesmanId}?period=${encodeURIComponent(period)}`);
        setPerformanceData(res.data?.data || null);
      } else {
        // General Business
        const res = await api.get(`/sales/targets?user_id=${salesmanId}&period=${encodeURIComponent(period)}`);
        setPerformanceData({ general: res.data?.data?.[0] || null });
      }
    } catch (err) {
      toast.error('Failed to load performance details');
    } finally {
      setLoadingPerformance(false);
    }
  };

  // Aggregates for Team Banner
  const totalTargetSum = targets.reduce((acc, t) => acc + (parseFloat(t.target_amount) || 0), 0);
  const totalAchievedValueSum = targets.reduce((acc, t) => {
    const val = isRealEstate ? (parseFloat(t.achieved_contracts_value) || 0) : (parseFloat(t.achieved_amount) || 0);
    return acc + val;
  }, 0);
  const totalTargetUnits = targets.reduce((acc, t) => acc + (parseInt(t.target_units, 10) || 0), 0);
  const totalAchievedUnits = targets.reduce((acc, t) => acc + (parseInt(t.achieved_units_count, 10) || 0), 0);
  const totalCashCollected = targets.reduce((acc, t) => acc + (parseFloat(t.achieved_collected_amount) || 0), 0);

  const overallValuePct = totalTargetSum > 0 ? Math.round((totalAchievedValueSum / totalTargetSum) * 100) : 0;
  const overallUnitsPct = totalTargetUnits > 0 ? Math.round((totalAchievedUnits / totalTargetUnits) * 100) : 0;

  const modalStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)',
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
    <div style={{ padding: '24px', maxWidth: '1350px', margin: '0 auto', fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <TargetIcon size={26} style={{ color: isRealEstate ? '#0284c7' : '#10b981' }} />
            {isRealEstate ? 'Real Estate Targets & Performance (التارجت العقاري)' : 'Sales Targets & Goals (أهداف المبيعات التجارية)'}
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
            {isRealEstate
              ? 'متابعة كوتة العقود المبرمة، عدد الوحدات المباعة، والمقدمات والأقساط المحصلة للمندوبين'
              : 'Track sales volume quotas, cash collection progress, and performance bonuses'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            style={{
              padding: '9px 16px', borderRadius: '10px',
              border: `1.5px solid ${isRealEstate ? '#0284c7' : '#10b981'}`,
              fontWeight: 700, outline: 'none',
              background: isRealEstate ? '#f0f9ff' : '#ecfdf5',
              color: isRealEstate ? '#0369a1' : '#047857',
              fontSize: '13px'
            }}
          >
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>

          <button
            onClick={() => handleOpenModal()}
            style={{
              padding: '10px 18px',
              background: isRealEstate
                ? 'linear-gradient(135deg, #0284c7, #0369a1)'
                : 'linear-gradient(135deg, #10b981, #059669)',
              color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px',
              boxShadow: '0 4px 12px rgba(2,132,199,0.25)'
            }}
          >
            <Plus size={16} /> {isRealEstate ? 'Set Real Estate Target' : 'Set Sales Target'}
          </button>
        </div>
      </div>

      {/* Team Overall Performance Banner */}
      <div style={{
        background: isRealEstate
          ? 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 100%)'
          : 'linear-gradient(135deg, #064e3b 0%, #047857 100%)',
        color: 'white', padding: '24px', borderRadius: '20px', marginBottom: '24px',
        boxShadow: '0 10px 25px rgba(2,132,199,0.18)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#7dd3fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Overall Team Performance ({selectedPeriod})
            </span>
            <h2 style={{ margin: '4px 0 0 0', fontSize: '28px', fontWeight: 800 }}>
              {totalAchievedValueSum.toLocaleString()} EGP
              <span style={{ fontSize: '16px', fontWeight: 500, color: '#bae6fd' }}> / {totalTargetSum.toLocaleString()} EGP Target</span>
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', padding: '10px 18px', borderRadius: '14px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.2)' }}>
              <span style={{ fontSize: '11px', color: '#bae6fd', display: 'block', fontWeight: 700 }}>Value Progress</span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: '#ffffff' }}>{overallValuePct}%</span>
            </div>

            {isRealEstate && (
              <>
                <div style={{ background: 'rgba(255,255,255,0.15)', padding: '10px 18px', borderRadius: '14px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <span style={{ fontSize: '11px', color: '#bae6fd', display: 'block', fontWeight: 700 }}>Units Sold</span>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#ffffff' }}>{totalAchievedUnits} / {totalTargetUnits} ({overallUnitsPct}%)</span>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.15)', padding: '10px 18px', borderRadius: '14px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <span style={{ fontSize: '11px', color: '#38bdf8', display: 'block', fontWeight: 700 }}>Cash Collected</span>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#38bdf8' }}>{totalCashCollected.toLocaleString()} EGP</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Value Progress Bar */}
        <div style={{ height: '10px', background: 'rgba(255,255,255,0.2)', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(overallValuePct, 100)}%`, background: isRealEstate ? '#38bdf8' : '#34d399', transition: 'width 0.6s ease' }} />
        </div>
      </div>

      {/* Salesmen Target Cards */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', background: 'white', borderRadius: '16px' }}>Loading targets...</div>
      ) : targets.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '60px', textAlign: 'center' }}>
          <TargetIcon size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>No Targets Set for this Period</h3>
          <p style={{ margin: '0 0 20px 0', color: '#64748b', fontSize: '14px' }}>
            {isRealEstate
              ? 'حدد أهداف القيمة البيعية وعدد الوحدات لمندوبي المبيعات العقارية.'
              : 'Assign quotas to your commercial sales representatives.'}
          </p>
          <button
            onClick={() => handleOpenModal()}
            style={{ padding: '10px 20px', background: isRealEstate ? '#0284c7' : '#10b981', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={16} /> Set First Target
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
          {targets.map((t) => {
            const targetAmount = parseFloat(t.target_amount) || 1;
            const achievedVal = isRealEstate ? (parseFloat(t.achieved_contracts_value) || 0) : (parseFloat(t.achieved_amount) || 0);
            const valPct = isRealEstate ? (t.contracts_achievement_pct || 0) : Math.round((achievedVal / targetAmount) * 100);
            const isTargetMet = valPct >= 100;

            const targetUnits = parseInt(t.target_units, 10) || 0;
            const achievedUnits = parseInt(t.achieved_units_count, 10) || 0;
            const unitsPct = t.units_achievement_pct || (targetUnits > 0 ? Math.round((achievedUnits / targetUnits) * 100) : 0);

            return (
              <div key={t.id} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
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
                        {isTargetMet ? 'Goal Achieved! 🎉' : `${valPct}%`}
                      </span>

                      <button onClick={() => handleOpenModal(t)} title="Edit Target" style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: '#475569' }}>
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(t.id)} title="Delete Target" style={{ background: '#fee2e2', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: '#ef4444' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* 3D Real Estate Metrics Breakdown */}
                  {isRealEstate ? (
                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', marginBottom: '14px', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>1. Contracted Value:</span>
                        <span style={{ fontWeight: 800, color: '#1e293b' }}>
                          {achievedVal.toLocaleString()} / {targetAmount.toLocaleString()} EGP ({valPct}%)
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>2. Units Sold Count:</span>
                        <span style={{ fontWeight: 800, color: '#0284c7' }}>
                          {achievedUnits} / {targetUnits} Units ({unitsPct}%)
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>3. Cash Collected (مقدمات وأقساط):</span>
                        <span style={{ fontWeight: 800, color: '#10b981' }}>
                          {(parseFloat(t.achieved_collected_amount) || 0).toLocaleString()} EGP
                        </span>
                      </div>

                      {t.cancellations_count > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ef4444' }}>
                          <span style={{ fontWeight: 600 }}>إلغاءات في الفترة:</span>
                          <span style={{ fontWeight: 800 }}>{t.cancellations_count} عقود</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* General Business Metrics */
                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', marginBottom: '14px', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>Assigned Quota:</span>
                        <span style={{ fontWeight: 800, color: '#1e293b' }}>{targetAmount.toLocaleString()} EGP</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>Cash Collected:</span>
                        <span style={{ fontWeight: 800, color: '#10b981' }}>{achievedVal.toLocaleString()} EGP</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>Commission Rate:</span>
                        <span style={{ fontWeight: 800, color: '#8b5cf6' }}>{t.commission_rate || 0}%</span>
                      </div>
                    </div>
                  )}

                  {/* Dual Progress Bars for Real Estate */}
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
                      <span>Contract Value Quota</span>
                      <span>{valPct}%</span>
                    </div>
                    <div style={{ height: '7px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
                      <div style={{ height: '100%', width: `${Math.min(valPct, 100)}%`, background: valPct >= 80 ? '#10b981' : valPct >= 50 ? '#f59e0b' : '#ef4444' }} />
                    </div>

                    {isRealEstate && targetUnits > 0 && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
                          <span>Units Count Quota</span>
                          <span>{unitsPct}%</span>
                        </div>
                        <div style={{ height: '7px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(unitsPct, 100)}%`, background: '#0284c7' }} />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* View Performance Button */}
                <button
                  onClick={() => handleViewPerformance(t.user_id, t.period)}
                  style={{
                    width: '100%', padding: '10px',
                    background: isRealEstate ? '#f0f9ff' : '#f0fdf4',
                    color: isRealEstate ? '#0369a1' : '#15803d',
                    border: `1.5px solid ${isRealEstate ? '#bae6fd' : '#bbf7d0'}`,
                    borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                  }}
                >
                  <Eye size={15} /> عرض الأداء التفصيلي (View Performance)
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Performance Drill-down Drawer / Modal */}
      {showPerformanceModal && (
        <div style={modalStyle}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '850px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '18px 24px', background: isRealEstate ? 'linear-gradient(135deg, #0284c7, #0369a1)' : 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
              <div>
                <h3 style={{ margin: 0, fontWeight: 800, fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Award size={18} /> كشف أداء المندوب التفصيلي (Salesman Performance Details)
                </h3>
                <span style={{ fontSize: '12px', color: '#bae6fd', fontWeight: 600 }}>
                  {performanceData?.salesman?.name} — فترة {performanceData?.period || selectedPeriod}
                </span>
              </div>
              <button onClick={() => setShowPerformanceModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {loadingPerformance ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading detailed performance records...</div>
              ) : isRealEstate && performanceData ? (
                <div>
                  {/* Prior Period Cancellations Alert if any */}
                  {performanceData.summary?.prior_cancellations_deduction_value > 0 && (
                    <div style={{
                      padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca',
                      borderRadius: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px',
                      color: '#991b1b', fontSize: '13px'
                    }}>
                      <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                      <div>
                        <strong>تنبيه مالي:</strong> تم خصم تسويات إلغاء عقود سابقة بقيمة{' '}
                        <strong>{(performanceData.summary.prior_cancellations_deduction_value || 0).toLocaleString()} EGP</strong>{' '}
                        من إجمالي عقود الفترة الحالية ({performanceData.summary.cancellations_count || 0} عقود ملغاة).
                      </div>
                    </div>
                  )}

                  {/* Summary Metric Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>صافي قيمة العقود</span>
                      <h4 style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: 800, color: (performanceData.summary?.total_contract_value || 0) < 0 ? '#ef4444' : '#1e293b' }}>
                        {(performanceData.summary?.total_contract_value || 0).toLocaleString()} EGP
                      </h4>
                      <span style={{ fontSize: '11px', color: (performanceData.summary?.total_contract_value || 0) < 0 ? '#ef4444' : '#0284c7', fontWeight: 600 }}>
                        {(performanceData.summary?.total_contract_value || 0) < 0
                          ? `عجز في صافي العقود (${performanceData.summary?.contracts_achievement_pct || 0}%)`
                          : `${performanceData.summary?.contracts_achievement_pct || 0}% من التارجت`}
                      </span>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>إجمالي التحصيل النقدي الفعلي</span>
                      <h4 style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: 800, color: '#10b981' }}>
                        {(performanceData.summary?.total_collected_amount || 0).toLocaleString()} EGP
                      </h4>
                      <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 600 }}>
                        مقدمات: {(performanceData.summary?.total_down_payment || 0).toLocaleString()} | أقساط: {(performanceData.summary?.total_installments_collected || 0).toLocaleString()}
                      </span>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>عدد الوحدات المتعاقد عليها</span>
                      <h4 style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: 800, color: '#0284c7' }}>
                        {performanceData.summary?.units_contracted_count || 0} وحدات
                      </h4>
                      <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 600 }}>
                        {performanceData.summary?.units_achievement_pct || 0}% من التارجت
                      </span>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>حجوزات قائمة نشطة</span>
                      <h4 style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: 800, color: '#f59e0b' }}>
                        {performanceData.summary?.active_reservations_count || 0} وحدات
                      </h4>
                      <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600 }}>في انتظار التعاقد</span>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div style={{ display: 'flex', gap: '8px', borderBottom: '1.5px solid #e2e8f0', marginBottom: '16px', overflowX: 'auto' }}>
                    <button
                      onClick={() => setActiveDetailTab('contracts')}
                      style={{
                        padding: '10px 16px', background: 'none', border: 'none',
                        borderBottom: activeDetailTab === 'contracts' ? '2.5px solid #0284c7' : 'none',
                        color: activeDetailTab === 'contracts' ? '#0284c7' : '#64748b',
                        fontWeight: 800, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap'
                      }}
                    >
                      <FileText size={15} /> العقود المبرمة ({performanceData.contracts?.length || 0})
                    </button>
                    <button
                      onClick={() => setActiveDetailTab('collections')}
                      style={{
                        padding: '10px 16px', background: 'none', border: 'none',
                        borderBottom: activeDetailTab === 'collections' ? '2.5px solid #10b981' : 'none',
                        color: activeDetailTab === 'collections' ? '#10b981' : '#64748b',
                        fontWeight: 800, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap'
                      }}
                    >
                      <DollarSign size={15} /> التحصيلات الفعلية ({performanceData.collections?.length || 0})
                    </button>
                    <button
                      onClick={() => setActiveDetailTab('reservations')}
                      style={{
                        padding: '10px 16px', background: 'none', border: 'none',
                        borderBottom: activeDetailTab === 'reservations' ? '2.5px solid #f59e0b' : 'none',
                        color: activeDetailTab === 'reservations' ? '#f59e0b' : '#64748b',
                        fontWeight: 800, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap'
                      }}
                    >
                      <Clock size={15} /> الحجوزات القائمة ({performanceData.reservations?.length || 0})
                    </button>
                    {performanceData.cancellations?.length > 0 && (
                      <button
                        onClick={() => setActiveDetailTab('cancellations')}
                        style={{
                          padding: '10px 16px', background: 'none', border: 'none',
                          borderBottom: activeDetailTab === 'cancellations' ? '2.5px solid #ef4444' : 'none',
                          color: activeDetailTab === 'cancellations' ? '#ef4444' : '#64748b',
                          fontWeight: 800, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap'
                        }}
                      >
                        <AlertTriangle size={15} /> تسويات الإلغاء ({performanceData.cancellations?.length || 0})
                      </button>
                    )}
                  </div>

                  {/* Contracts Table */}
                  {activeDetailTab === 'contracts' && (
                    <div>
                      {performanceData.contracts?.length === 0 ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>لا توجد عقود مبرمة في هذه الفترة</div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', textAlign: 'right' }}>
                                <th style={{ padding: '10px' }}>رقم العقد</th>
                                <th style={{ padding: '10px' }}>المشروع والوحدة</th>
                                <th style={{ padding: '10px' }}>العميل</th>
                                <th style={{ padding: '10px' }}>قيمة العقد</th>
                                <th style={{ padding: '10px' }}>المقدم</th>
                                <th style={{ padding: '10px' }}>تاريخ العقد</th>
                                <th style={{ padding: '10px' }}>الحالة</th>
                              </tr>
                            </thead>
                            <tbody>
                              {performanceData.contracts.map((c) => (
                                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '10px', fontWeight: 700 }}>{c.contract_number}</td>
                                  <td style={{ padding: '10px' }}>{c.project_name || '—'} (وحدة {c.unit_number || '—'})</td>
                                  <td style={{ padding: '10px' }}>{c.customer_name || '—'}</td>
                                  <td style={{ padding: '10px', fontWeight: 800, color: '#1e293b' }}>{parseFloat(c.contract_value).toLocaleString()} EGP</td>
                                  <td style={{ padding: '10px', fontWeight: 700, color: '#10b981' }}>{parseFloat(c.down_payment || 0).toLocaleString()} EGP</td>
                                  <td style={{ padding: '10px', color: '#64748b' }}>{c.contract_date ? new Date(c.contract_date).toLocaleDateString() : '—'}</td>
                                  <td style={{ padding: '10px' }}>
                                    <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: '#dcfce7', color: '#15803d' }}>
                                      {c.contract_status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Collections Table (التحصيلات الفعلية) */}
                  {activeDetailTab === 'collections' && (
                    <div>
                      {performanceData.collections?.length === 0 ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>لا توجد تحصيلات فعلية مسجلة في هذه الفترة</div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', textAlign: 'right' }}>
                                <th style={{ padding: '10px' }}>تاريخ السداد</th>
                                <th style={{ padding: '10px' }}>رقم السند / المرجع</th>
                                <th style={{ padding: '10px' }}>النوع</th>
                                <th style={{ padding: '10px' }}>العميل</th>
                                <th style={{ padding: '10px' }}>المشروع والوحدة</th>
                                <th style={{ padding: '10px' }}>المبلغ المحصل</th>
                                <th style={{ padding: '10px' }}>طريقة الدفع</th>
                                <th style={{ padding: '10px' }}>الحالة</th>
                              </tr>
                            </thead>
                            <tbody>
                              {performanceData.collections.map((col) => (
                                <tr key={col.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '10px', color: '#64748b' }}>
                                    {col.payment_date ? new Date(col.payment_date).toLocaleDateString() : '—'}
                                  </td>
                                  <td style={{ padding: '10px', fontWeight: 700 }}>{col.reference_number || '—'}</td>
                                  <td style={{ padding: '10px' }}>
                                    <span style={{
                                      padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                                      background: col.collection_type === 'down_payment' || col.collection_type === 'direct_receipt' ? '#e0f2fe' : '#f0fdf4',
                                      color: col.collection_type === 'down_payment' || col.collection_type === 'direct_receipt' ? '#0369a1' : '#15803d'
                                    }}>
                                      {col.collection_type_label}
                                    </span>
                                  </td>
                                  <td style={{ padding: '10px' }}>{col.customer_name || '—'}</td>
                                  <td style={{ padding: '10px' }}>{col.project_name} (وحدة {col.unit_number})</td>
                                  <td style={{ padding: '10px', fontWeight: 800, color: '#10b981' }}>
                                    {parseFloat(col.amount).toLocaleString()} EGP
                                  </td>
                                  <td style={{ padding: '10px' }}>
                                    <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>
                                      {col.payment_method}
                                    </span>
                                  </td>
                                  <td style={{ padding: '10px' }}>
                                    <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: '#dcfce7', color: '#15803d' }}>
                                      {col.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reservations Table */}
                  {activeDetailTab === 'reservations' && (
                    <div>
                      {performanceData.reservations?.length === 0 ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>لا توجد حجوزات نشطة حالياً لهذا المندوب</div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', textAlign: 'right' }}>
                                <th style={{ padding: '10px' }}>رقم الوحدة</th>
                                <th style={{ padding: '10px' }}>المشروع</th>
                                <th style={{ padding: '10px' }}>النوع</th>
                                <th style={{ padding: '10px' }}>السعر المتوقع</th>
                                <th style={{ padding: '10px' }}>انتهاء الحجز</th>
                              </tr>
                            </thead>
                            <tbody>
                              {performanceData.reservations.map((r) => (
                                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '10px', fontWeight: 700 }}>{r.unit_number}</td>
                                  <td style={{ padding: '10px' }}>{r.project_name || '—'}</td>
                                  <td style={{ padding: '10px' }}>{r.type || '—'}</td>
                                  <td style={{ padding: '10px', fontWeight: 800 }}>{parseFloat(r.price || 0).toLocaleString()} EGP</td>
                                  <td style={{ padding: '10px', color: '#f59e0b' }}>{r.reservation_expires_at ? new Date(r.reservation_expires_at).toLocaleDateString() : 'نشط'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cancellations & Settlements Table */}
                  {activeDetailTab === 'cancellations' && (
                    <div>
                      {performanceData.cancellations?.length === 0 ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>لا توجد إلغاءات أو تسويات في هذه الفترة</div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', textAlign: 'right' }}>
                                <th style={{ padding: '10px' }}>تاريخ الإلغاء</th>
                                <th style={{ padding: '10px' }}>رقم العقد</th>
                                <th style={{ padding: '10px' }}>نوع التسوية</th>
                                <th style={{ padding: '10px' }}>العميل</th>
                                <th style={{ padding: '10px' }}>قيمة العقد</th>
                                <th style={{ padding: '10px' }}>المبلغ المسدد</th>
                                <th style={{ padding: '10px' }}>الخصم / المسترد</th>
                                <th style={{ padding: '10px' }}>سبب الإلغاء</th>
                              </tr>
                            </thead>
                            <tbody>
                              {performanceData.cancellations.map((canc) => (
                                <tr key={canc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '10px', color: '#64748b' }}>
                                    {canc.cancelled_at ? new Date(canc.cancelled_at).toLocaleDateString() : '—'}
                                  </td>
                                  <td style={{ padding: '10px', fontWeight: 700 }}>{canc.contract_number}</td>
                                  <td style={{ padding: '10px' }}>
                                    <span style={{
                                      padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                                      background: canc.is_prior_period ? '#fee2e2' : '#fef3c7',
                                      color: canc.is_prior_period ? '#b91c1c' : '#b45309'
                                    }}>
                                      {canc.settlement_type_label}
                                    </span>
                                  </td>
                                  <td style={{ padding: '10px' }}>{canc.customer_name || '—'}</td>
                                  <td style={{ padding: '10px', fontWeight: 800, color: '#ef4444' }}>
                                    -{canc.contract_value.toLocaleString()} EGP
                                  </td>
                                  <td style={{ padding: '10px' }}>{canc.total_paid_amount.toLocaleString()} EGP</td>
                                  <td style={{ padding: '10px', color: '#64748b' }}>
                                    خصم: {canc.deduction_amount} | مسترد: {canc.refundable_amount}
                                  </td>
                                  <td style={{ padding: '10px', color: '#475569' }}>{canc.cancellation_reason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* General Business Performance Fallback */
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <CheckCircle2 size={36} style={{ color: '#10b981', marginBottom: '8px' }} />
                  <h4>إنجاز المبيعات التجارية</h4>
                  <p style={{ color: '#64748b', fontSize: '13px' }}>
                    تم التحقق من تحصيلات الفواتير المسندة للمندوب خلال الفترة المحددة بنجاح.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Set / Edit Target Modal */}
      {showModal && (
        <div style={modalStyle}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '520px', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '18px 24px', background: isRealEstate ? 'linear-gradient(135deg, #0284c7, #0369a1)' : 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
              <h3 style={{ margin: 0, fontWeight: 800, fontSize: '16px' }}>
                {editingTarget
                  ? (isRealEstate ? 'تعديل التارجت العقاري' : 'Edit Sales Target')
                  : (isRealEstate ? 'تحديد تارجت عقاري جديد' : 'Set New Sales Target')}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>مسؤول المبيعات (Sales Representative) *</label>
                <select
                  value={form.user_id}
                  onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                  style={inputStyle}
                  required
                >
                  <option value="">اختر مندوب المبيعات...</option>
                  {salesmen.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>فترة التارجت (Target Period) *</label>
                  <select
                    value={form.period}
                    onChange={(e) => setForm({ ...form, period: e.target.value })}
                    style={inputStyle}
                    required
                  >
                    {PERIOD_OPTIONS.filter(p => p.value !== 'All Periods').map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>
                    {isRealEstate ? 'تارجت قيمة العقود (EGP) *' : 'Target Quota ($ / EGP) *'}
                  </label>
                  <input
                    type="number"
                    value={form.target_amount}
                    onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
                    placeholder="e.g. 10000000"
                    style={inputStyle}
                    required
                  />
                </div>
              </div>

              {isRealEstate && (
                <div>
                  <label style={labelStyle}>تارجت عدد الوحدات المستهدف (Target Units Count) *</label>
                  <input
                    type="number"
                    value={form.target_units}
                    onChange={(e) => setForm({ ...form, target_units: e.target.value })}
                    placeholder="e.g. 5"
                    style={inputStyle}
                    required
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>نسبة العمولة الافتراضية (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.commission_rate}
                    onChange={(e) => setForm({ ...form, commission_rate: e.target.value })}
                    placeholder="e.g. 2.5"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>ملاحظات وشروط الحافز (Notes)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="أي شروط إضافية خاصة بالتارجت..."
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
                  style={{
                    padding: '10px 22px',
                    background: isRealEstate
                      ? 'linear-gradient(135deg, #0284c7, #0369a1)'
                      : 'linear-gradient(135deg, #10b981, #059669)',
                    color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800,
                    cursor: saving ? 'not-allowed' : 'pointer'
                  }}
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
