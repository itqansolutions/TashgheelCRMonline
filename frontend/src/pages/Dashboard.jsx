import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, Users, 
  ShoppingBag, CheckSquare, Handshake, 
  Wallet, ArrowUpRight, ArrowDownRight, Globe, MapPin
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { AlertTriangle, TrendingUp as SuccessIcon, XCircle } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const KPICard = ({ title, value, icon, color, trend, trendValue, subtitle }) => (
  <div className="kpi-card">
    <div className="kpi-header">
      <div className={`kpi-icon icon-${color}`}>{icon}</div>
      {trend && (
        <div className={`kpi-trend ${trend === 'up' ? 'trend-up' : 'trend-down'}`}>
          <div className="trend-badge">
            {trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {trendValue}
          </div>
        </div>
      )}
    </div>
    <div className="kpi-body">
      <p className="kpi-title">{title}</p>
      <h3 className="kpi-value">{value}</h3>
      {subtitle && <p className="kpi-subtitle">{subtitle}</p>}
    </div>
  </div>
);

const Dashboard = () => {
  const { user } = useAuth();
  const { currentBranch } = useBranch();
  
  const [stats, setStats] = useState(null);
  const [comparisonData, setComparisonData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // BI Engine: View Mode Toggle (ALL vs SINGLE)
  const [viewMode, setViewMode] = useState(user?.role === 'admin' ? 'ALL' : 'SINGLE');
  const [timeFilter, setTimeFilter] = useState('YTD');

  const fetchDashboardData = async (mode, time) => {
    setLoading(true);
    try {
      const endpoint = `/dashboard/branch-summary?viewMode=${mode}&timeFilter=${time}`;
      const res = await api.get(endpoint);
      setStats(res.data.data);

      if (mode === 'ALL') {
        const compRes = await api.get(`/dashboard/branch-comparison?timeFilter=${time}`);
        setComparisonData(compRes.data.data);
      } else {
        setComparisonData([]);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard intelligence', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(viewMode, timeFilter);
  }, [viewMode, currentBranch, timeFilter]);

  const handleModeToggle = (mode) => {
    setViewMode(mode);
  };

  return (
    <div className="dashboard">
      <style>{`
        .dashboard {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .bi-header {
           display: flex;
           justify-content: space-between;
           align-items: flex-end;
           margin-bottom: 8px;
        }
        .view-mode-toggle {
           display: flex;
           background: rgba(255,255,255,0.05);
           border: 1px solid rgba(255,255,255,0.1);
           border-radius: 12px;
           padding: 4px;
        }
        .mode-btn {
           padding: 8px 16px;
           border-radius: 8px;
           border: none;
           background: transparent;
           color: rgba(255,255,255,0.6);
           font-weight: 600;
           font-size: 13px;
           cursor: pointer;
           display: flex;
           align-items: center;
           gap: 6px;
           transition: all 0.2s;
        }
        .mode-btn.active {
           background: var(--primary);
           color: white;
           box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
          gap: 20px;
        }
        .kpi-card {
          background: var(--bg-card);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          padding: 24px;
          border-radius: var(--radius);
          border: 1px solid var(--glass-border);
          box-shadow: var(--shadow-md);
          display: flex;
          flex-direction: column;
          gap: 16px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .kpi-card:hover { transform: translateY(-5px); box-shadow: var(--shadow-xl); border-color: var(--primary); }
        .kpi-icon { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 8px 16px rgba(0,0,0,0.1); }
        .icon-blue { background: linear-gradient(135deg, #4f46e5, #6366f1); }
        .icon-green { background: linear-gradient(135deg, #10b981, #34d399); }
        .icon-yellow { background: linear-gradient(135deg, #f59e0b, #fbbf24); }
        .icon-red { background: linear-gradient(135deg, #ef4444, #f87171); }
        .icon-purple { background: linear-gradient(135deg, #8b5cf6, #a78bfa); }
        .trend-badge { display: flex; align-items: center; padding: 4px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; gap: 4px; background: rgba(0, 0, 0, 0.05); }
        .trend-up .trend-badge { color: #059669; background: rgba(16, 185, 129, 0.1); }
        .trend-down .trend-badge { color: #dc2626; background: rgba(239, 68, 68, 0.1); }
        .kpi-title { font-size: 14px; color: var(--text-muted); font-weight: 600; letter-spacing: 0.02em; }
        .kpi-value { font-size: 24px; font-weight: 800; color: var(--text-main); margin-top: 4px; letter-spacing: -0.02em; }
        .kpi-subtitle { font-size: 11px; color: var(--text-muted); margin-top: 6px; font-weight: 500; }
        .loading { display: flex; justify-content: center; align-items: center; height: 400px; color: var(--primary); font-weight: 600; }
        .charts-row { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-top: 24px;}
        .chart-card { background: var(--bg-card); padding: 32px; border-radius: var(--radius); border: 1px solid var(--glass-border); min-height: 200px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-weight: 600;}
        
        .insight-box { display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px; border-radius: 8px; margin-bottom: 12px; font-weight: 600; font-size: 13px; animation: fadeIn 0.5s ease-out; }
        .insight-success { background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); color: #10b981; }
        .insight-warning { background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2); color: #f59e0b; }
        .insight-critical { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; }
      `}</style>
      
      <div className="bi-header">
        <div className="section-header">
          <h2 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.02em' }}>Intelligence Engine</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>Strategic insights for {viewMode === 'ALL' ? 'Organization-wide Performance' : `${currentBranch?.name || 'Current Branch'} Performance`}.</p>
        </div>

        {/* Global Filters */}
        <div style={{ display: 'flex', gap: '12px' }}>
            <select 
              value={timeFilter} 
              onChange={e => setTimeFilter(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', outline: 'none' }}
            >
                <option value="THIS_MONTH" style={{ color: 'black' }}>This Month</option>
                <option value="LAST_MONTH" style={{ color: 'black' }}>Last Month</option>
                <option value="YTD" style={{ color: 'black' }}>Year to Date</option>
            </select>

            {/* View Mode Toggle (Admins Only) */}
            {user?.role === 'admin' && (
                <div className="view-mode-toggle">
                    <button className={`mode-btn ${viewMode === 'ALL' ? 'active' : ''}`} onClick={() => handleModeToggle('ALL')}>
                        <Globe size={14} /> All Branches
                    </button>
                    <button className={`mode-btn ${viewMode === 'SINGLE' ? 'active' : ''}`} onClick={() => handleModeToggle('SINGLE')}>
                        <MapPin size={14} /> Current Branch
                    </button>
                </div>
            )}
        </div>
      </div>

      {loading ? (
        <div className="loading">Generating Analytics...</div>
      ) : (
        <>
            {/* INSIGHT ENGINE MODULE */}
            {stats?.insights?.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    {stats.insights.map((insight, idx) => (
                        <div key={idx} className={`insight-box insight-${insight.type}`}>
                            {insight.type === 'success' && <SuccessIcon size={18} />}
                            {insight.type === 'warning' && <AlertTriangle size={18} />}
                            {insight.type === 'critical' && <XCircle size={18} />}
                            <span>{insight.message}</span>
                        </div>
                    ))}
                </div>
            )}

            <div className="kpi-grid">
                <KPICard 
                title="Total Revenue" 
                value={`${stats?.revenue?.toLocaleString() ?? 0} EGP`}
                icon={<ShoppingBag size={20} />}
                color="blue"
                trend="up"
                trendValue="YTD"
                />
                <KPICard 
                title="Total Expenses" 
                value={`${stats?.expenses?.toLocaleString() ?? 0} EGP`}
                icon={<TrendingDown size={20} />}
                color="red"
                trend="down"
                trendValue="YTD"
                />
                <KPICard 
                title="Net Profit" 
                value={`${stats?.profit?.toLocaleString() ?? 0} EGP`}
                icon={<Wallet size={20} />}
                color={(stats?.profit ?? 0) >= 0 ? "green" : "red"}
                trend={(stats?.profit ?? 0) >= 0 ? "up" : "down"}
                trendValue="YTD"
                subtitle={`Margin: ${stats?.profitMargin ?? 0}%`}
                />
                <KPICard 
                title="Deals Win Rate" 
                value={`${stats?.winRate ?? 0}%`}
                icon={<Handshake size={20} />}
                color={(stats?.winRate ?? 0) > 40 ? 'purple' : 'red'}
                trend={(stats?.winRate ?? 0) > 40 ? 'up' : 'down'}
                trendValue="Avg"
                subtitle={`${stats?.wonDeals ?? 0} Won / ${stats?.totalDeals ?? 0} Total`}
                />
                <KPICard 
                title="Task Completion" 
                value={`${stats?.taskCompletion ?? 0}%`}
                icon={<CheckSquare size={20} />}
                color="yellow"
                trend="up"
                trendValue="YTD"
                subtitle={`${stats?.completedTasks ?? 0} Done`}
                />
            </div>

            {/* Intelligence Comparison Module (Phase 2) */}
            {viewMode === 'ALL' && (
              <div className="charts-row" style={{ marginTop: '24px' }}>
                  <div className="chart-card" style={{ display: 'block', padding: '24px' }}>
                      <h3 style={{ margin: '0 0 24px 0', color: 'var(--text-main)' }}>Cross-Branch Financial Setup</h3>
                      {comparisonData?.length > 0 ? (
                        <div style={{ height: '300px' }}>
                            <Bar 
                                data={{
                                labels: comparisonData.map(d => d.branch_name),
                                datasets: [
                                    {
                                    label: 'Revenue',
                                    data: comparisonData.map(d => d.revenue),
                                    backgroundColor: 'rgba(79, 70, 229, 0.8)',
                                    borderRadius: 4
                                    },
                                    {
                                    label: 'Expenses',
                                    data: comparisonData.map(d => d.expenses),
                                    backgroundColor: 'rgba(245, 158, 11, 0.8)',
                                    borderRadius: 4
                                    }
                                ]
                                }}
                                options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { position: 'bottom' } },
                                scales: { y: { beginAtZero: true, grid: { borderDash: [5, 5] } }, x: { grid: { display: false } } }
                                }}
                            />
                        </div>
                      ) : (
                        <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                           No comparison data available. Add more branches to view insights.
                        </div>
                      )}
                  </div>
                  
                  <div className="chart-card leaderboard-card" style={{ display: 'block', padding: '24px', overflowY: 'auto' }}>
                      <style>{`
                          .leaderboard-card h3 { margin: 0 0 16px 0; color: var(--text-main); }
                          .lb-item { display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(255,255,255,0.02); border-radius: 8px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.05); transition: background 0.2s; }
                          .lb-item:hover { background: rgba(255,255,255,0.05); }
                          .lb-rank { width: 24px; height: 24px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; }
                          .lb-rank.gold { background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #78350f; }
                          .lb-rank.silver { background: linear-gradient(135deg, #e5e7eb, #9ca3af); color: #1f2937; }
                          .lb-rank.bronze { background: linear-gradient(135deg, #fcd34d, #d97706); color: #451a03; }
                          .lb-details { flex: 1; margin-left: 12px; }
                          .lb-name { font-size: 13px; font-weight: 700; color: var(--text-main); }
                          .lb-score-meta { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
                          .lb-score { font-size: 16px; font-weight: 800; color: var(--primary); }
                      `}</style>
                      <h3>Smart Leaderboard</h3>
                      {comparisonData?.length > 0 ? comparisonData.map((branch, idx) => (
                          <div className="lb-item" key={branch.branch_id}>
                              <div className={`lb-rank ${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : ''}`}>
                                  {idx + 1}
                              </div>
                              <div className="lb-details">
                                  <div className="lb-name">{branch.branch_name}</div>
                                  <div className="lb-score-meta">Win Rate: {branch.winRate}% | Task: {branch.taskCompletion}%</div>
                              </div>
                              <div className="lb-score">{branch.score}</div>
                          </div>
                      )) : (
                        <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', marginTop: '40px' }}>
                            Register business activity to start ranking branches.
                        </div>
                      )}
                  </div>
              </div>
            )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
