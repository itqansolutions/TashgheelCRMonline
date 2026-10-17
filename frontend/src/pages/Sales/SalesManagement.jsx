import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import SalesSubNav from '../../components/Sales/SalesSubNav';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { 
  BarChart3, Users, Handshake, AlertTriangle, Clock, Target, 
  DollarSign, ArrowUpRight, CheckCircle2, ChevronRight, Filter, 
  Building2, Phone, Mail, Calendar, Eye, RefreshCw, UserCheck, AlertCircle
} from 'lucide-react';

const SalesManagement = () => {
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();
  const isRealEstate = user?.template_name === 'real_estate';

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'performance' | 'bottlenecks' | 'distribution'
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [overviewData, setOverviewData] = useState(null);
  const [performanceData, setPerformanceData] = useState([]);
  const [selectedSalesman, setSelectedSalesman] = useState(null);
  const [salesman360, setSalesman360] = useState(null);
  const [loading360, setLoading360] = useState(false);

  // Bulk Assign State
  const [unassignedLeads, setUnassignedLeads] = useState([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [assignTargetUserId, setAssignTargetUserId] = useState('');
  const [assignTeamId, setAssignTeamId] = useState('');
  const [salesTeams, setSalesTeams] = useState([]);
  const [assigning, setAssigning] = useState(false);

  const currency = t('common.currency', isRTL ? 'ج.م' : 'EGP');
  const formatCurrency = (val) => `${(Number(val) || 0).toLocaleString()} ${currency}`;

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [resOverview, resPerf] = await Promise.all([
        api.get(`/sales-management/overview?period=${period}`),
        api.get(`/sales-management/performance?period=${period}`)
      ]);
      setOverviewData(resOverview.data?.data || null);
      setPerformanceData(resPerf.data?.data || []);
    } catch (err) {
      console.error('Failed to load sales management data:', err);
      setLoadError(err.response?.data?.message || err.message || t('salesManagement.alerts.distributeError', 'Failed to load data'));
    } finally {
      setLoading(false);
    }
  }, [period, t]);

  const fetchSalesman360 = async (userId) => {
    try {
      setLoading360(true);
      const res = await api.get(`/sales-management/salesman/${userId}/360?period=${period}`);
      setSalesman360(res.data?.data || null);
    } catch (err) {
      console.error('Failed to load salesman 360:', err);
      toast.error(err.response?.data?.message || 'Failed to load 360 details');
    } finally {
      setLoading360(false);
    }
  };

  const fetchDistributionData = async () => {
    try {
      const [leadsRes, teamsRes] = await Promise.all([
        api.get('/customers?unassigned=true&limit=50').catch(() => ({ data: { data: [] } })),
        api.get('/sales-teams').catch(() => ({ data: { data: [] } }))
      ]);
      setUnassignedLeads(leadsRes.data?.data || leadsRes.data || []);
      setSalesTeams(teamsRes.data?.data || teamsRes.data || []);
    } catch (err) {
      console.warn('Failed to load distribution data:', err);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (activeTab === 'distribution') {
      fetchDistributionData();
    }
  }, [activeTab]);

  const handleSelectSalesman = (rep) => {
    setSelectedSalesman(rep);
    fetchSalesman360(rep.id);
  };

  const handleBulkAssign = async () => {
    if (selectedLeadIds.length === 0) {
      return toast.error(t('salesManagement.alerts.selectLeads', 'Please select at least one lead to distribute'));
    }
    if (!assignTargetUserId && !assignTeamId) {
      return toast.error(t('salesManagement.alerts.selectTarget', 'Please choose a sales representative or a sales team'));
    }

    try {
      setAssigning(true);
      await api.post('/customers/bulk-assign', {
        customer_ids: selectedLeadIds,
        target_user_id: assignTargetUserId ? parseInt(assignTargetUserId, 10) : undefined,
        team_id: assignTeamId ? parseInt(assignTeamId, 10) : undefined,
        distribution_method: 'least_loaded'
      });
      toast.success(t('salesManagement.alerts.distributeSuccess', 'Leads successfully distributed'));
      setSelectedLeadIds([]);
      setAssignTargetUserId('');
      setAssignTeamId('');
      fetchDistributionData();
      fetchOverview();
    } catch (err) {
      toast.error(err.response?.data?.message || t('salesManagement.alerts.distributeError', 'Failed to distribute leads'));
    } finally {
      setAssigning(false);
    }
  };

  const kpis = overviewData?.kpis || {};

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-50/50 pb-12">
      {/* Module Sub-Navigation */}
      <SalesSubNav />

      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <h1 className="text-xl font-black text-slate-800 flex items-center gap-2.5">
              <BarChart3 className="text-indigo-600" size={24} />
              {isRealEstate 
                ? t('salesManagement.titleRealEstate', 'Real Estate Sales Management Cockpit') 
                : t('salesManagement.titleGeneral', 'Sales Management Cockpit')}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {isRealEstate 
                ? t('salesManagement.subtitleRealEstate', 'Monitor real estate agents, unit reservations, signed contracts, and collections')
                : t('salesManagement.subtitleGeneral', 'Monitor sales rep performance, pipeline velocity, target achievement, and bottlenecks')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
              <Calendar size={14} className="text-slate-400" />
              <input 
                type="month" 
                value={period} 
                onChange={e => setPeriod(e.target.value)}
                className="bg-transparent text-slate-700 font-semibold outline-none cursor-pointer"
              />
            </div>
            <button 
              onClick={fetchOverview} 
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Load Error Banner */}
        {loadError && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-rose-700 text-xs font-semibold">
            <div className="flex items-center gap-2">
              <AlertCircle size={18} />
              <span>{loadError}</span>
            </div>
            <button
              onClick={fetchOverview}
              className="px-3 py-1 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1: Active Salesmen / Agents */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>{t('salesManagement.team.rep', 'Representatives')}</span>
              <Users size={16} className="text-indigo-600" />
            </div>
            <div className="text-2xl font-black text-slate-800">
              {performanceData.length}
            </div>
            <p className="text-[11px] text-slate-500">
              {t('salesManagement.kpis.openDealsValue', 'Active Pipeline Value')}: <strong className="text-slate-700">{kpis.open_deals_count || 0} {t('salesManagement.kpis.activeDealsCount', 'deals')}</strong>
            </p>
          </div>

          {/* KPI 2: Target vs Actual */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>{t('salesManagement.kpis.targetProgress', 'Target Achievement')}</span>
              <Target size={16} className="text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-slate-800">
              {kpis.achievement_rate || 0}%
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, kpis.achievement_rate || 0)}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500">
              {t('salesManagement.kpis.achieved', 'Achieved')}: {formatCurrency(kpis.achieved_amount || 0)} / {formatCurrency(kpis.target_amount || 0)}
            </p>
          </div>

          {/* KPI 3: Pipeline Value & Win Rate */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>{t('salesManagement.kpis.openDealsValue', 'Active Pipeline Value')}</span>
              <DollarSign size={16} className="text-blue-600" />
            </div>
            <div className="text-2xl font-black text-slate-800">
              {formatCurrency(kpis.open_deals_value || 0)}
            </div>
            <p className="text-[11px] text-slate-500 flex items-center justify-between">
              <span>{t('salesManagement.kpis.winRate', 'Win Rate')}:</span>
              <strong className="text-emerald-600 font-bold">{kpis.win_rate_pct || 0}%</strong>
            </p>
          </div>

          {/* KPI 4: Overdue & Blocked Deals */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>{t('salesManagement.kpis.overdueSlaAlerts', 'Overdue SLA (>48h)')}</span>
              <AlertTriangle size={16} className="text-rose-600" />
            </div>
            <div className="text-2xl font-black text-rose-600">
              {kpis.overdue_deals_count || 0}
            </div>
            <p className="text-[11px] text-slate-500 flex items-center justify-between">
              <span>{t('salesManagement.kpis.overdueTasks', 'Overdue Follow-ups')}:</span>
              <strong className="text-amber-600 font-bold">{kpis.overdue_tasks_count || 0}</strong>
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'overview' 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t('salesManagement.tabs.overview', 'Overview & Pipeline Velocity')}
          </button>
          <button
            onClick={() => setActiveTab('performance')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'performance' 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t('salesManagement.tabs.performance', 'Sales Team Performance')} ({performanceData.length})
          </button>
          <button
            onClick={() => setActiveTab('bottlenecks')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'bottlenecks' 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t('salesManagement.tabs.bottlenecks', 'Bottlenecks & Lost Analysis')}
          </button>
          <button
            onClick={() => setActiveTab('distribution')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'distribution' 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t('salesManagement.tabs.distribution', 'Bulk Lead Distribution')}
          </button>
        </div>

        {/* TAB 1: OVERVIEW & PIPELINE STAGES */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Handshake size={16} className="text-indigo-600" />
                {t('salesManagement.pipeline.title', 'Pipeline Velocity & Distribution by Stage')}
              </h3>
              <div className="space-y-3">
                {(overviewData?.pipeline_stages || []).map(stage => (
                  <div key={stage.pipeline_stage} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-800">{stage.pipeline_stage}</span>
                      <span className="text-indigo-600">{formatCurrency(stage.total_value)} ({stage.count} {t('salesManagement.pipeline.deals', 'deals')})</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{t('salesManagement.pipeline.avgStageDuration', 'Avg time in stage')}:</span>
                      <strong className="text-slate-700">{stage.avg_days_in_stage || 0} {t('salesManagement.kpis.days', 'days')}</strong>
                    </div>
                  </div>
                ))}
                {(overviewData?.pipeline_stages || []).length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">{t('salesManagement.pipeline.noStages', 'No deals in pipeline yet')}</p>
                )}
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <AlertTriangle size={16} className="text-rose-600" />
                {t('salesManagement.bottlenecksSection.title', 'Loss & Cancellation Reasons Analysis')}
              </h3>
              <div className="space-y-2">
                {(overviewData?.bottlenecks?.lost_reasons || []).map((lr, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                    <span className="text-slate-700 font-semibold">{lr.reason}</span>
                    <div className={isRTL ? 'text-left' : 'text-right'}>
                      <span className="text-rose-600 font-bold">{lr.count} {t('salesManagement.bottlenecksSection.dealsCount', 'deals')}</span>
                      <p className="text-[10px] text-slate-400">{formatCurrency(lr.lost_value)}</p>
                    </div>
                  </div>
                ))}
                {(overviewData?.bottlenecks?.lost_reasons || []).length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">{t('salesManagement.bottlenecksSection.noLostDeals', 'No lost deals recorded')}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TEAM PERFORMANCE COMPARISON MATRIX */}
        {activeTab === 'performance' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className={`w-full text-xs ${isRTL ? 'text-right' : 'text-left'}`}>
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4">{t('salesManagement.team.rep', 'Representative')}</th>
                    <th className="py-3.5 px-3">{t('salesManagement.distributionTab.branch', 'Branch')}</th>
                    <th className="py-3.5 px-3">{t('salesManagement.team.openDeals', 'Open Deals')}</th>
                    <th className="py-3.5 px-3">{t('salesManagement.team.wonDeals', 'Won Deals')}</th>
                    <th className="py-3.5 px-3">{t('salesManagement.team.wonValue', 'Won Value')}</th>
                    <th className="py-3.5 px-3">{t('salesManagement.team.target', 'Target')}</th>
                    <th className="py-3.5 px-3">{t('salesManagement.team.achievement', 'Achievement')}</th>
                    <th className="py-3.5 px-3">{t('salesManagement.team.commissions', 'Commissions')}</th>
                    <th className="py-3.5 px-3">{t('salesManagement.team.overdueTasks', 'Overdue Follow-ups')}</th>
                    <th className="py-3.5 px-4 text-center">{t('salesManagement.team.actions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {performanceData.map(rep => (
                    <tr key={rep.id} className="hover:bg-slate-50 transition cursor-pointer" onClick={() => handleSelectSalesman(rep)}>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{rep.name}</div>
                        <div className="text-[11px] text-slate-400">{rep.email}</div>
                      </td>
                      <td className="py-3.5 px-3 font-semibold text-slate-600">{rep.branch_name || t('salesManagement.allBranches', 'Main Branch')}</td>
                      <td className="py-3.5 px-3 font-bold text-indigo-600">{rep.open_deals}</td>
                      <td className="py-3.5 px-3 font-bold text-emerald-600">{rep.won_deals}</td>
                      <td className="py-3.5 px-3 font-black text-slate-900">{formatCurrency(rep.total_won_value)}</td>
                      <td className="py-3.5 px-3 font-medium text-slate-500">{formatCurrency(rep.target_amount)}</td>
                      <td className="py-3.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          rep.achievement_rate >= 100 ? 'bg-emerald-50 text-emerald-700' :
                          rep.achievement_rate >= 70 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {rep.achievement_rate}%
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-bold text-violet-600">{formatCurrency(rep.commission_amount)}</td>
                      <td className="py-3.5 px-3">
                        {rep.overdue_tasks > 0 ? (
                          <span className="text-rose-600 font-bold flex items-center gap-1">
                            <AlertTriangle size={12} /> {rep.overdue_tasks}
                          </span>
                        ) : (
                          <span className="text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 size={12} /> 0
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleSelectSalesman(rep); }}
                          className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition"
                          title={t('salesManagement.team.view360', '360° View')}
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {performanceData.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        {t('salesManagement.team.noMembers', 'No active sales team members found')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: BOTTLENECK DIAGNOSTICS */}
        {activeTab === 'bottlenecks' && (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-rose-700 flex items-center gap-2">
                <Clock size={16} />
                {t('salesManagement.bottlenecksTab.slaBreaches', 'SLA Inactivity Breaches (>48h without follow-up)')}
              </h3>
              <div className="divide-y divide-slate-100">
                {(overviewData?.bottlenecks?.overdue_sla_deals || []).map(deal => (
                  <div key={deal.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <strong className="text-slate-800 text-sm">{deal.title}</strong>
                      <div className="text-slate-400 text-[11px] mt-0.5">
                        {t('salesManagement.bottlenecksTab.rep', 'Rep')}: {deal.salesman_name || t('salesManagement.distributionTab.unassigned', 'Unassigned')} • {t('salesManagement.bottlenecksTab.stage', 'Stage')}: {deal.pipeline_stage} • {t('salesManagement.bottlenecksTab.value', 'Value')}: {formatCurrency(deal.value)}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-rose-50 text-rose-700 font-bold rounded-lg border border-rose-200">
                      {deal.overdue_hours ? `${deal.overdue_hours} ${t('salesManagement.bottlenecksTab.hoursOverdue', 'hours overdue')}` : t('salesManagement.kpis.requiresImmediateAction', 'Overdue')}
                    </span>
                  </div>
                ))}
                {(overviewData?.bottlenecks?.overdue_sla_deals || []).length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">{t('salesManagement.bottlenecksTab.noOverdueDeals', 'No overdue deals currently! Great work.')}</p>
                )}
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-amber-700 flex items-center gap-2">
                <AlertTriangle size={16} />
                {t('salesManagement.bottlenecksTab.stagnantDeals', 'Stagnant Deals (>14 days without progress)')}
              </h3>
              <div className="divide-y divide-slate-100">
                {(overviewData?.bottlenecks?.stagnant_deals || []).map(deal => (
                  <div key={deal.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <strong className="text-slate-800 text-sm">{deal.title}</strong>
                      <div className="text-slate-400 text-[11px] mt-0.5">
                        {t('salesManagement.bottlenecksTab.rep', 'Rep')}: {deal.salesman_name || t('salesManagement.distributionTab.unassigned', 'Unassigned')} • {t('salesManagement.bottlenecksTab.blocker', 'Blocker')}: {deal.blocker_reason || t('salesManagement.bottlenecksTab.noBlocker', 'Not specified')}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-amber-50 text-amber-700 font-bold rounded-lg border border-amber-200">
                      {Math.round(deal.days_stagnant || 0)} {t('salesManagement.bottlenecksTab.stagnantDays', 'days stagnant')}
                    </span>
                  </div>
                ))}
                {(overviewData?.bottlenecks?.stagnant_deals || []).length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">{t('salesManagement.bottlenecksTab.noStagnantDeals', 'No stagnant deals found in active stages.')}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: BULK LEAD DISTRIBUTION */}
        {activeTab === 'distribution' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <UserCheck size={16} className="text-indigo-600" />
                  {t('salesManagement.distributionTab.title', 'Unassigned Leads Distribution Hub')}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {t('salesManagement.distributionTab.subtitle', 'Distribute incoming leads evenly to sales reps or whole teams using automated load balancing')}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select 
                  value={assignTargetUserId} 
                  onChange={e => { setAssignTargetUserId(e.target.value); setAssignTeamId(''); }}
                  className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 font-semibold"
                >
                  <option value="">-- {t('salesManagement.distributionTab.selectRep', 'Select Representative...')} --</option>
                  {performanceData.map(rep => (
                    <option key={rep.id} value={rep.id}>{rep.name}</option>
                  ))}
                </select>

                <select 
                  value={assignTeamId} 
                  onChange={e => { setAssignTeamId(e.target.value); setAssignTargetUserId(''); }}
                  className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 font-semibold"
                >
                  <option value="">-- {t('salesManagement.distributionTab.selectTeam', 'Select Sales Team...')} --</option>
                  {salesTeams.map(team => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>

                <button
                  onClick={handleBulkAssign}
                  disabled={assigning || selectedLeadIds.length === 0}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  {assigning 
                    ? t('salesManagement.distributionTab.distributing', 'Distributing...') 
                    : `${t('salesManagement.distributionTab.distributeBtn', 'Execute Distribution')} (${selectedLeadIds.length})`}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className={`w-full text-xs ${isRTL ? 'text-right' : 'text-left'}`}>
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 w-10">
                      <input 
                        type="checkbox"
                        checked={unassignedLeads.length > 0 && selectedLeadIds.length === unassignedLeads.length}
                        onChange={e => {
                          if (e.target.checked) setSelectedLeadIds(unassignedLeads.map(l => l.id));
                          else setSelectedLeadIds([]);
                        }}
                      />
                    </th>
                    <th className="py-3 px-4">{t('salesManagement.distributionTab.customerName', 'Customer Name')}</th>
                    <th className="py-3 px-4">{t('salesManagement.distributionTab.phone', 'Phone')}</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4">{t('salesManagement.distributionTab.created', 'Created At')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {unassignedLeads.map(lead => (
                    <tr key={lead.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <input 
                          type="checkbox"
                          checked={selectedLeadIds.includes(lead.id)}
                          onChange={e => {
                            if (e.target.checked) setSelectedLeadIds(prev => [...prev, lead.id]);
                            else setSelectedLeadIds(prev => prev.filter(id => id !== lead.id));
                          }}
                        />
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">{lead.name}</td>
                      <td className="py-3 px-4">{lead.phone || '-'}</td>
                      <td className="py-3 px-4 text-slate-500">{lead.source || 'Direct'}</td>
                      <td className="py-3 px-4 text-slate-400">{new Date(lead.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {unassignedLeads.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        {t('salesManagement.distributionTab.noUnassignedLeads', 'All leads are currently assigned! No unassigned leads waiting.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SALESMAN 360° DRAWER / MODAL */}
        {selectedSalesman && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-end">
            <div className={`bg-white w-full max-w-xl h-full shadow-2xl p-6 overflow-y-auto space-y-6 ${isRTL ? 'text-right' : 'text-left'}`}>
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-black text-slate-800">{selectedSalesman.name}</h3>
                  <p className="text-xs text-slate-400">{selectedSalesman.role} • {selectedSalesman.department_name || 'Sales Department'}</p>
                </div>
                <button 
                  onClick={() => setSelectedSalesman(null)}
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold"
                >
                  {t('salesManagement.drawer360.close', 'Close')}
                </button>
              </div>

              {loading360 ? (
                <div className="py-20 text-center text-slate-400">Loading 360° Profile...</div>
              ) : (
                <div className="space-y-6 text-xs">
                  {/* Contact Info */}
                  <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Phone size={14} className="text-indigo-600" />
                      <span>{selectedSalesman.phone || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Mail size={14} className="text-indigo-600" />
                      <span>{selectedSalesman.email}</span>
                    </div>
                  </div>

                  {/* Assigned Deals */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-800 flex items-center justify-between">
                      <span>{t('salesManagement.drawer360.assignedDeals', 'Assigned Deals')} ({salesman360?.deals?.length || 0})</span>
                    </h4>
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {(salesman360?.deals || []).map(deal => (
                        <div key={deal.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                          <div className="flex items-center justify-between font-bold">
                            <span className="text-slate-800">{deal.title}</span>
                            <span className="text-indigo-600">{formatCurrency(deal.value)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span>{deal.customer_name}</span>
                            <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md font-semibold text-slate-600">
                              {deal.pipeline_stage}
                            </span>
                          </div>
                        </div>
                      ))}
                      {(salesman360?.deals || []).length === 0 && (
                        <p className="text-slate-400 py-4 text-center">{t('salesManagement.drawer360.noDeals', 'No active deals assigned')}</p>
                      )}
                    </div>
                  </div>

                  {/* Pending Tasks */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-800">{t('salesManagement.drawer360.pendingTasks', 'Pending Tasks')} ({salesman360?.tasks?.length || 0})</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {(salesman360?.tasks || []).map(task => (
                        <div key={task.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                          <span className="font-semibold text-slate-700">{task.title}</span>
                          <span className="text-[11px] text-slate-400">{task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}</span>
                        </div>
                      ))}
                      {(salesman360?.tasks || []).length === 0 && (
                        <p className="text-slate-400 py-4 text-center">{t('salesManagement.drawer360.noTasks', 'No pending tasks')}</p>
                      )}
                    </div>
                  </div>

                  {/* Recent Activities */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-800">{t('salesManagement.drawer360.recentActivities', 'Recent Activities')} ({salesman360?.recent_activities?.length || 0})</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {(salesman360?.recent_activities || []).map(act => (
                        <div key={act.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                          <span className="font-semibold text-slate-700">{act.description}</span>
                          <span className="text-[11px] text-slate-400">{new Date(act.created_at).toLocaleDateString()}</span>
                        </div>
                      ))}
                      {(salesman360?.recent_activities || []).length === 0 && (
                        <p className="text-slate-400 py-4 text-center">{t('salesManagement.drawer360.noActivities', 'No recent activity records')}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesManagement;
