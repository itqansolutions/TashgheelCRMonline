import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import SalesSubNav from '../../components/Sales/SalesSubNav';
import {
  Target as TargetIcon, Plus, Edit2, Trash2, TrendingUp, Award, DollarSign,
  Calendar, CheckCircle2, User, X, Eye, Building2, Home, FileText, Clock, Layers, AlertTriangle
} from 'lucide-react';

const PERIOD_VALUES = [
  'All Periods',
  '2026-10', '2026-11', '2026-12',
  '2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4',
  '2026'
];

const Target = () => {
  const { user } = useAuth();
  const { t, isRTL, language } = useLanguage();
  const isRealEstate = user?.template_name === 'real_estate';
  const currency = t('common.currency') || 'ج.م';

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

  const getPeriodLabel = (val) => {
    switch (val) {
      case 'All Periods': return t('sales.targets.allPeriods');
      case '2026-10': return isRTL ? '2026-10 (أكتوبر 2026)' : '2026-10 (October 2026)';
      case '2026-11': return isRTL ? '2026-11 (نوفمبر 2026)' : '2026-11 (November 2026)';
      case '2026-12': return isRTL ? '2026-12 (ديسمبر 2026)' : '2026-12 (December 2026)';
      case '2026-Q1': return isRTL ? '2026-Q1 (الربع الأول)' : '2026-Q1 (Jan - Mar)';
      case '2026-Q2': return isRTL ? '2026-Q2 (الربع الثاني)' : '2026-Q2 (Apr - Jun)';
      case '2026-Q3': return isRTL ? '2026-Q3 (الربع الثالث)' : '2026-Q3 (Jul - Sep)';
      case '2026-Q4': return isRTL ? '2026-Q4 (الربع الرابع)' : '2026-Q4 (Oct - Dec)';
      case '2026': return isRTL ? 'Full Year 2026 (سنوي)' : 'Full Year 2026 (Annual)';
      default: return val;
    }
  };

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
      toast.error(t('sales.targets.toasts.loadError'));
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
    if (!form.user_id) return toast.error(t('sales.targets.toasts.selectRepError'));
    if (!form.target_amount || parseFloat(form.target_amount) <= 0) {
      return toast.error(t('sales.targets.toasts.validAmountError'));
    }

    setSaving(true);
    try {
      const baseUrl = isRealEstate ? '/re-targets' : '/sales/targets';
      if (editingTarget) {
        await api.put(`${baseUrl}/${editingTarget.id}`, form);
        toast.success(t('sales.targets.toasts.updateSuccess'));
      } else {
        await api.post(baseUrl, form);
        toast.success(t('sales.targets.toasts.createSuccess'));
      }
      setShowModal(false);
      fetchTargets();
    } catch (err) {
      toast.error(err.response?.data?.message || t('sales.targets.toasts.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('sales.targets.toasts.confirmDelete'))) return;
    try {
      const baseUrl = isRealEstate ? '/re-targets' : '/sales/targets';
      await api.delete(`${baseUrl}/${id}`);
      toast.success(t('sales.targets.toasts.deleteSuccess'));
      fetchTargets();
    } catch (err) {
      toast.error(t('sales.targets.toasts.deleteError'));
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
      toast.error(t('sales.targets.toasts.perfLoadError'));
    } finally {
      setLoadingPerformance(false);
    }
  };

  // Aggregates for Team Banner
  const totalTargetSum = targets.reduce((acc, trg) => acc + (parseFloat(trg.target_amount) || 0), 0);
  const totalAchievedValueSum = targets.reduce((acc, trg) => {
    const val = isRealEstate ? (parseFloat(trg.achieved_contracts_value) || 0) : (parseFloat(trg.achieved_amount) || 0);
    return acc + val;
  }, 0);
  const totalTargetUnits = targets.reduce((acc, trg) => acc + (parseInt(trg.target_units, 10) || 0), 0);
  const totalAchievedUnits = targets.reduce((acc, trg) => acc + (parseInt(trg.achieved_units_count, 10) || 0), 0);
  const totalCashCollected = targets.reduce((acc, trg) => acc + (parseFloat(trg.achieved_collected_amount) || 0), 0);

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
    <div dir={isRTL ? 'rtl' : 'ltr'} style={{ padding: '24px', maxWidth: '1350px', margin: '0 auto', fontFamily: 'inherit' }}>
      {/* Sales Navigation */}
      <SalesSubNav />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <TargetIcon size={26} style={{ color: isRealEstate ? '#0284c7' : '#10b981' }} />
            {isRealEstate ? t('sales.targets.titleRealEstate') : t('sales.targets.titleCommercial')}
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
            {isRealEstate
              ? t('sales.targets.subtitleRealEstate')
              : t('sales.targets.subtitleCommercial')}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
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
            {PERIOD_VALUES.map((val) => (
              <option key={val} value={val}>{getPeriodLabel(val)}</option>
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
            <Plus size={16} /> {isRealEstate ? t('sales.targets.setTargetRealEstate') : t('sales.targets.setTargetCommercial')}
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
              {t('sales.targets.teamBannerTitle', { period: selectedPeriod })}
            </span>
            <h2 style={{ margin: '4px 0 0 0', fontSize: '28px', fontWeight: 800 }}>
              <span className="num-en">{totalAchievedValueSum.toLocaleString()}</span> {currency}
              <span style={{ fontSize: '16px', fontWeight: 500, color: '#bae6fd' }}>
                {' '}/ <span className="num-en">{totalTargetSum.toLocaleString()}</span> {currency} {t('sales.targets.targetSuffix')}
              </span>
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', padding: '10px 18px', borderRadius: '14px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.2)' }}>
              <span style={{ fontSize: '11px', color: '#bae6fd', display: 'block', fontWeight: 700 }}>
                {t('sales.targets.valueProgress')}
              </span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: '#ffffff' }} className="num-en">
                {overallValuePct}%
              </span>
            </div>

            {isRealEstate && (
              <>
                <div style={{ background: 'rgba(255,255,255,0.15)', padding: '10px 18px', borderRadius: '14px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <span style={{ fontSize: '11px', color: '#bae6fd', display: 'block', fontWeight: 700 }}>
                    {t('sales.targets.unitsSold')}
                  </span>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#ffffff' }} className="num-en">
                    {totalAchievedUnits} / {totalTargetUnits} ({overallUnitsPct}%)
                  </span>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.15)', padding: '10px 18px', borderRadius: '14px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <span style={{ fontSize: '11px', color: '#38bdf8', display: 'block', fontWeight: 700 }}>
                    {t('sales.targets.cashCollected')}
                  </span>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#38bdf8' }}>
                    <span className="num-en">{totalCashCollected.toLocaleString()}</span> {currency}
                  </span>
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
        <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', background: 'white', borderRadius: '16px' }}>
          {t('sales.targets.loading')}
        </div>
      ) : targets.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '60px', textAlign: 'center' }}>
          <TargetIcon size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>
            {t('sales.targets.noTargetsTitle')}
          </h3>
          <p style={{ margin: '0 0 20px 0', color: '#64748b', fontSize: '14px' }}>
            {isRealEstate
              ? t('sales.targets.noTargetsDescRealEstate')
              : t('sales.targets.noTargetsDesc')}
          </p>
          <button
            onClick={() => handleOpenModal()}
            style={{ padding: '10px 20px', background: isRealEstate ? '#0284c7' : '#10b981', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={16} /> {isRealEstate ? t('sales.targets.setTargetRealEstate') : t('sales.targets.setTargetCommercial')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
          {targets.map((trg) => {
            const targetAmount = parseFloat(trg.target_amount) || 1;
            const achievedVal = isRealEstate ? (parseFloat(trg.achieved_contracts_value) || 0) : (parseFloat(trg.achieved_amount) || 0);
            const valPct = isRealEstate ? (trg.contracts_achievement_pct || 0) : Math.round((achievedVal / targetAmount) * 100);
            const isTargetMet = valPct >= 100;

            const targetUnits = parseInt(trg.target_units, 10) || 0;
            const achievedUnits = parseInt(trg.achieved_units_count, 10) || 0;
            const unitsPct = trg.units_achievement_pct || (targetUnits > 0 ? Math.round((achievedUnits / targetUnits) * 100) : 0);

            return (
              <div key={trg.id} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1e293b' }}>
                        {trg.salesman_name || t('sales.targets.salesRep')}
                      </h3>
                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                        {t('sales.targets.targetPeriod')}: <span className="num-en">{trg.period}</span>
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                        background: isTargetMet ? '#dcfce7' : '#e0f2fe',
                        color: isTargetMet ? '#15803d' : '#0369a1'
                      }}>
                        {isTargetMet ? t('sales.targets.goalAchieved') : <span className="num-en">{valPct}%</span>}
                      </span>

                      <button onClick={() => handleOpenModal(trg)} title={t('common.edit') || 'Edit'} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: '#475569' }}>
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(trg.id)} title={t('common.delete') || 'Delete'} style={{ background: '#fee2e2', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: '#ef4444' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* 3D Real Estate Metrics Breakdown */}
                  {isRealEstate ? (
                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', marginBottom: '14px', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>{t('sales.targets.contractedValueQuota')}</span>
                        <span style={{ fontWeight: 800, color: '#1e293b' }}>
                          <span className="num-en">{achievedVal.toLocaleString()}</span> / <span className="num-en">{targetAmount.toLocaleString()}</span> {currency} (<span className="num-en">{valPct}%</span>)
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>{t('sales.targets.unitsSoldCount')}</span>
                        <span style={{ fontWeight: 800, color: '#0284c7' }}>
                          <span className="num-en">{achievedUnits}</span> / <span className="num-en">{targetUnits}</span> {t('sales.targets.unitsSuffix')} (<span className="num-en">{unitsPct}%</span>)
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>{t('sales.targets.cashCollectedBreakdown')}</span>
                        <span style={{ fontWeight: 800, color: '#10b981' }}>
                          <span className="num-en">{(parseFloat(trg.achieved_collected_amount) || 0).toLocaleString()}</span> {currency}
                        </span>
                      </div>

                      {trg.cancellations_count > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ef4444' }}>
                          <span style={{ fontWeight: 600 }}>{t('sales.targets.cancellationsInPeriod')}</span>
                          <span style={{ fontWeight: 800 }}>
                            <span className="num-en">{trg.cancellations_count}</span> {t('sales.targets.contractsSuffix')}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* General Business Metrics */
                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', marginBottom: '14px', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>{t('sales.targets.assignedQuota')}</span>
                        <span style={{ fontWeight: 800, color: '#1e293b' }}>
                          <span className="num-en">{targetAmount.toLocaleString()}</span> {currency}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>{t('sales.targets.cashCollected')}</span>
                        <span style={{ fontWeight: 800, color: '#10b981' }}>
                          <span className="num-en">{achievedVal.toLocaleString()}</span> {currency}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>{t('sales.targets.commissionRateLabel')}</span>
                        <span style={{ fontWeight: 800, color: '#8b5cf6' }}>
                          <span className="num-en">{trg.commission_rate || 0}%</span>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Dual Progress Bars for Real Estate */}
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
                      <span>{t('sales.targets.contractValueQuota')}</span>
                      <span className="num-en">{valPct}%</span>
                    </div>
                    <div style={{ height: '7px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
                      <div style={{ height: '100%', width: `${Math.min(valPct, 100)}%`, background: valPct >= 80 ? '#10b981' : valPct >= 50 ? '#f59e0b' : '#ef4444' }} />
                    </div>

                    {isRealEstate && targetUnits > 0 && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
                          <span>{t('sales.targets.unitsCountQuota')}</span>
                          <span className="num-en">{unitsPct}%</span>
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
                  onClick={() => handleViewPerformance(trg.user_id, trg.period)}
                  style={{
                    width: '100%', padding: '10px',
                    background: isRealEstate ? '#f0f9ff' : '#f0fdf4',
                    color: isRealEstate ? '#0369a1' : '#15803d',
                    border: `1.5px solid ${isRealEstate ? '#bae6fd' : '#bbf7d0'}`,
                    borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                  }}
                >
                  <Eye size={15} /> {t('sales.targets.viewPerformance')}
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
                  <Award size={18} /> {t('sales.targets.drawerTitle')}
                </h3>
                <span style={{ fontSize: '12px', color: '#bae6fd', fontWeight: 600 }}>
                  {t('sales.targets.drawerSubtitle', { name: performanceData?.salesman?.name, period: performanceData?.period || selectedPeriod })}
                </span>
              </div>
              <button onClick={() => setShowPerformanceModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {loadingPerformance ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  {t('sales.targets.loadingPerformance')}
                </div>
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
                        {t('sales.targets.cancellationAlert', {
                          amount: (performanceData.summary.prior_cancellations_deduction_value || 0).toLocaleString(),
                          currency,
                          count: performanceData.summary.cancellations_count || 0
                        })}
                      </div>
                    </div>
                  )}

                  {/* Summary Metric Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                        {t('sales.targets.netContractValue')}
                      </span>
                      <h4 style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: 800, color: (performanceData.summary?.total_contract_value || 0) < 0 ? '#ef4444' : '#1e293b' }}>
                        <span className="num-en">{(performanceData.summary?.total_contract_value || 0).toLocaleString()}</span> {currency}
                      </h4>
                      <span style={{ fontSize: '11px', color: (performanceData.summary?.total_contract_value || 0) < 0 ? '#ef4444' : '#0284c7', fontWeight: 600 }}>
                        {(performanceData.summary?.total_contract_value || 0) < 0
                          ? t('sales.targets.contractsDeficit', { pct: performanceData.summary?.contracts_achievement_pct || 0 })
                          : `${performanceData.summary?.contracts_achievement_pct || 0}% ${t('sales.targets.ofTarget')}`}
                      </span>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                        {t('sales.targets.actualCashCollected')}
                      </span>
                      <h4 style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: 800, color: '#10b981' }}>
                        <span className="num-en">{(performanceData.summary?.total_collected_amount || 0).toLocaleString()}</span> {currency}
                      </h4>
                      <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 600 }}>
                        {t('sales.targets.downPaymentInstallments', {
                          downPayment: (performanceData.summary?.total_down_payment || 0).toLocaleString() + ' ' + currency,
                          installments: (performanceData.summary?.total_installments_collected || 0).toLocaleString() + ' ' + currency
                        })}
                      </span>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                        {t('sales.targets.unitsContractedCount')}
                      </span>
                      <h4 style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: 800, color: '#0284c7' }}>
                        <span className="num-en">{performanceData.summary?.units_contracted_count || 0}</span> {t('sales.targets.unitsSuffix')}
                      </h4>
                      <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 600 }}>
                        <span className="num-en">{performanceData.summary?.units_achievement_pct || 0}%</span> {t('sales.targets.ofTarget')}
                      </span>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                        {t('sales.targets.activeReservationsCount')}
                      </span>
                      <h4 style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: 800, color: '#f59e0b' }}>
                        <span className="num-en">{performanceData.summary?.active_reservations_count || 0}</span> {t('sales.targets.unitsSuffix')}
                      </h4>
                      <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600 }}>
                        {t('sales.targets.awaitingContract')}
                      </span>
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
                      <FileText size={15} /> {t('sales.targets.tabs.contracts', { count: performanceData.contracts?.length || 0 })}
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
                      <DollarSign size={15} /> {t('sales.targets.tabs.collections', { count: performanceData.collections?.length || 0 })}
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
                      <Clock size={15} /> {t('sales.targets.tabs.reservations', { count: performanceData.reservations?.length || 0 })}
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
                        <AlertTriangle size={15} /> {t('sales.targets.tabs.cancellations', { count: performanceData.cancellations?.length || 0 })}
                      </button>
                    )}
                  </div>

                  {/* Contracts Table */}
                  {activeDetailTab === 'contracts' && (
                    <div>
                      {performanceData.contracts?.length === 0 ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                          {t('sales.salesmen.noContracts')}
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', textAlign: isRTL ? 'right' : 'left' }}>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.contractNo')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.projectAndUnit')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.customer')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.contractValue')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.downPayment')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.contractDate')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.status')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {performanceData.contracts.map((c) => (
                                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '10px', fontWeight: 700 }} className="num-en">{c.contract_number}</td>
                                  <td style={{ padding: '10px' }}>{c.project_name || '—'} ({t('sales.targets.columns.unitNo')} {c.unit_number || '—'})</td>
                                  <td style={{ padding: '10px' }}>{c.customer_name || '—'}</td>
                                  <td style={{ padding: '10px', fontWeight: 800, color: '#1e293b' }}>
                                    <span className="num-en">{parseFloat(c.contract_value).toLocaleString()}</span> {currency}
                                  </td>
                                  <td style={{ padding: '10px', fontWeight: 700, color: '#10b981' }}>
                                    <span className="num-en">{parseFloat(c.down_payment || 0).toLocaleString()}</span> {currency}
                                  </td>
                                  <td style={{ padding: '10px', color: '#64748b' }} className="num-en">
                                    {c.contract_date ? new Date(c.contract_date).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US') : '—'}
                                  </td>
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

                  {/* Collections Table */}
                  {activeDetailTab === 'collections' && (
                    <div>
                      {performanceData.collections?.length === 0 ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                          {t('sales.salesmen.noCollections')}
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', textAlign: isRTL ? 'right' : 'left' }}>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.paymentDate')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.refNo')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.type')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.customer')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.projectAndUnit')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.collectedAmount')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.paymentMethod')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.status')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {performanceData.collections.map((col) => (
                                <tr key={col.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '10px', color: '#64748b' }} className="num-en">
                                    {col.payment_date ? new Date(col.payment_date).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US') : '—'}
                                  </td>
                                  <td style={{ padding: '10px', fontWeight: 700 }} className="num-en">{col.reference_number || '—'}</td>
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
                                  <td style={{ padding: '10px' }}>{col.project_name} ({t('sales.targets.columns.unitNo')} {col.unit_number})</td>
                                  <td style={{ padding: '10px', fontWeight: 800, color: '#10b981' }}>
                                    <span className="num-en">{parseFloat(col.amount).toLocaleString()}</span> {currency}
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
                        <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                          {t('sales.salesmen.noReservations')}
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', textAlign: isRTL ? 'right' : 'left' }}>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.unitNo')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.project')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.type')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.expectedPrice')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.reservationExpiry')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {performanceData.reservations.map((r) => (
                                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '10px', fontWeight: 700 }} className="num-en">{r.unit_number}</td>
                                  <td style={{ padding: '10px' }}>{r.project_name || '—'}</td>
                                  <td style={{ padding: '10px' }}>{r.type || '—'}</td>
                                  <td style={{ padding: '10px', fontWeight: 800 }}>
                                    <span className="num-en">{parseFloat(r.price || 0).toLocaleString()}</span> {currency}
                                  </td>
                                  <td style={{ padding: '10px', color: '#f59e0b' }} className="num-en">
                                    {r.reservation_expires_at ? new Date(r.reservation_expires_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US') : t('sales.salesmen.active')}
                                  </td>
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
                        <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                          {t('sales.salesmen.noCancellations')}
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', textAlign: isRTL ? 'right' : 'left' }}>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.cancellationDate')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.contractNo')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.settlementType')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.customer')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.contractValue')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.paidAmount')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.deductionRefund')}</th>
                                <th style={{ padding: '10px' }}>{t('sales.targets.columns.cancellationReason')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {performanceData.cancellations.map((canc) => (
                                <tr key={canc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '10px', color: '#64748b' }} className="num-en">
                                    {canc.cancelled_at ? new Date(canc.cancelled_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US') : '—'}
                                  </td>
                                  <td style={{ padding: '10px', fontWeight: 700 }} className="num-en">{canc.contract_number}</td>
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
                                    -<span className="num-en">{canc.contract_value?.toLocaleString()}</span> {currency}
                                  </td>
                                  <td style={{ padding: '10px' }}>
                                    <span className="num-en">{canc.total_paid_amount?.toLocaleString()}</span> {currency}
                                  </td>
                                  <td style={{ padding: '10px', color: '#64748b' }}>
                                    <span className="num-en">{canc.deduction_amount}</span> | <span className="num-en">{canc.refundable_amount}</span>
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
                  <h4>{t('sales.targets.commercialPerformanceTitle')}</h4>
                  <p style={{ color: '#64748b', fontSize: '13px' }}>
                    {t('sales.targets.commercialPerformanceDesc')}
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
                  ? t('sales.targets.editTarget')
                  : (isRealEstate ? t('sales.targets.setTargetRealEstate') : t('sales.targets.newTarget'))}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>{t('sales.targets.salesRep')}</label>
                <select
                  value={form.user_id}
                  onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                  style={inputStyle}
                  required
                >
                  <option value="">{t('sales.targets.selectSalesRep')}</option>
                  {salesmen.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>{t('sales.targets.targetPeriod')}</label>
                  <select
                    value={form.period}
                    onChange={(e) => setForm({ ...form, period: e.target.value })}
                    style={inputStyle}
                    required
                  >
                    {PERIOD_VALUES.filter(p => p !== 'All Periods').map((val) => (
                      <option key={val} value={val}>{getPeriodLabel(val)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>
                    {t('sales.targets.targetAmount', { currency })}
                  </label>
                  <input
                    type="number"
                    value={form.target_amount}
                    onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
                    placeholder={t('sales.targets.targetAmountPlaceholder')}
                    style={inputStyle}
                    required
                  />
                </div>
              </div>

              {isRealEstate && (
                <div>
                  <label style={labelStyle}>{t('sales.targets.targetUnitsCount')}</label>
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
                  <label style={labelStyle}>{t('sales.targets.defaultCommissionRate')}</label>
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
                <label style={labelStyle}>{t('sales.targets.notes')}</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder={t('sales.targets.notesPlaceholder')}
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
                  {t('sales.targets.cancel')}
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
                  {saving ? t('sales.targets.saving') : editingTarget ? t('sales.targets.update') : t('sales.targets.save')}
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
