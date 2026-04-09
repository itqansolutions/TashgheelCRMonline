import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, Users, 
  ShoppingBag, CheckSquare, Handshake, 
  CreditCard, Wallet, ArrowUpRight, ArrowDownRight 
} from 'lucide-react';
import api from '../services/api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

// Register ChartJS modules
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const KPICard = ({ title, value, icon, color, trend, trendValue }) => (
  <div className="kpi-card">
    <div className="kpi-header">
      <div className={`kpi-icon icon-${color}`}>{icon}</div>
      <div className={`kpi-trend ${trend === 'up' ? 'trend-up' : 'trend-down'}`}>
        <div className="trend-badge">
          {trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {trendValue}
        </div>
      </div>
    </div>
    <div className="kpi-body">
      <p className="kpi-title">{title}</p>
      <h3 className="kpi-value">{value}</h3>
    </div>
  </div>
);

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [expenseData, setExpenseData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [statsRes, trendRes] = await Promise.all([
          api.get('/dashboard/stats'),
          api.get('/reports/financial-trends')
        ]);
        setStats(statsRes.data.data);
        setRevenueData(trendRes.data.data.revenue);
        setExpenseData(trendRes.data.data.expenses);
      } catch (err) {
        console.error('Failed to fetch dashboard data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, []);

  const chartData = {
    labels: revenueData.map(r => r.month),
    datasets: [
      {
        label: 'Revenue',
        data: revenueData.map(r => parseFloat(r.revenue)),
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
      {
        label: 'Expenses',
        data: expenseData.map(e => parseFloat(e.expenses)),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      y: { grid: { borderDash: [5, 5] }, beginAtZero: true },
      x: { grid: { display: false } },
    },
  };

  if (loading) return <div className="loading">Loading dashboard...</div>;

  return (
    <div className="dashboard">
      <style>{`
        .dashboard {
          display: flex;
          flex-direction: column;
          gap: 24px;
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
        .kpi-card:hover {
          transform: translateY(-5px);
          box-shadow: var(--shadow-xl);
          border-color: var(--primary);
        }
        .kpi-icon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: 0 8px 16px rgba(0,0,0,0.1);
        }
        .icon-blue { background: linear-gradient(135deg, #4f46e5, #6366f1); }
        .icon-green { background: linear-gradient(135deg, #10b981, #34d399); }
        .icon-yellow { background: linear-gradient(135deg, #f59e0b, #fbbf24); }
        .icon-red { background: linear-gradient(135deg, #ef4444, #f87171); }
        .icon-purple { background: linear-gradient(135deg, #8b5cf6, #a78bfa); }

        .trend-badge {
          display: flex;
          align-items: center;
          padding: 4px 8px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          gap: 4px;
          background: rgba(0, 0, 0, 0.05);
        }
        .trend-up .trend-badge { color: #059669; background: rgba(16, 185, 129, 0.1); }
        .trend-down .trend-badge { color: #dc2626; background: rgba(239, 68, 68, 0.1); }

        .kpi-body {
          display: flex;
          flex-direction: column;
        }
        .kpi-title {
          font-size: 14px;
          color: var(--text-muted);
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .kpi-value {
          font-size: 24px;
          font-weight: 800;
          color: var(--text-main);
          margin-top: 4px;
          letter-spacing: -0.02em;
        }

        .charts-row {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 20px;
        }
        .chart-card {
          background: var(--bg-card);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          padding: 32px;
          border-radius: var(--radius);
          border: 1px solid var(--glass-border);
          box-shadow: var(--shadow-lg);
          min-height: 420px;
        }
        .chart-card h3 {
          font-size: 18px;
          font-weight: 800;
          margin-bottom: 24px;
          letter-spacing: -0.01em;
          color: var(--primary);
        }
        .chart-container {
          height: 300px;
        }

        @media (max-width: 1024px) {
          .charts-row {
            grid-template-columns: 1fr;
          }
        }
        .loading {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 400px;
          color: var(--primary);
          font-weight: 600;
        }
      `}</style>
      
      <div className="section-header" style={{ marginBottom: '8px' }}>
        <h2 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.02em' }}>Analytics Dashboard</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>Strategic insights and real-time performance metrics.</p>
      </div>

      <div className="kpi-grid">
        <KPICard 
          title="Total Revenue" 
          value={`${stats?.finance?.total_income?.toLocaleString() || 0} EGP`}
          icon={<ShoppingBag size={20} />}
          color="blue"
          trend="up"
          trendValue="12.5%"
        />
        <KPICard 
          title="Pipeline Value" 
          value={`${stats?.pipeline_value?.toLocaleString() || 0} EGP`}
          icon={<TrendingUp size={20} />}
          color="purple"
          trend="up"
          trendValue="Live"
        />
        <KPICard 
          title="Win Rate" 
          value={`${stats?.win_rate || 0}%`}
          icon={<Handshake size={20} />}
          color="green"
          trend={stats?.win_rate > 50 ? 'up' : 'down'}
          trendValue="Benchmark"
        />
        <KPICard 
          title="Customers" 
          value={stats?.customers_count || 0}
          icon={<Users size={20} />}
          color="purple"
          trend="up"
          trendValue="+5"
        />
        <KPICard 
          title="Profit Margin" 
          value={`${stats?.finance?.total_income > 0 ? ((stats.finance.net_profit / stats.finance.total_income) * 100).toFixed(1) : 0}%`}
          icon={<Wallet size={20} />}
          color="green"
          trend="up"
          trendValue="Healthy"
        />
      </div>

      <div className="charts-row">
        <div className="chart-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h3 style={{ margin: 0 }}>Financial Trajectory</h3>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Last 6 Months</div>
          </div>
          <div className="chart-container">
            {revenueData.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                    No financial data available for this period.
                </div>
            ) : (
                <Line data={chartData} options={chartOptions} />
            )}
          </div>
        </div>
        <div className="chart-card">
          <h3>Deal Pipeline</h3>
          <div className="chart-container">
            {stats?.deals_pipeline?.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                    No active deals to analyze.
                </div>
            ) : (
                <Doughnut 
                  data={{
                    labels: stats?.deals_pipeline?.map(d => d.pipeline_stage) || [],
                    datasets: [{
                      data: stats?.deals_pipeline?.map(d => parseInt(d.count)) || [],
                      backgroundColor: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
                      borderWidth: 0,
                      hoverOffset: 15
                    }]
                  }}
                  options={{ 
                    maintainAspectRatio: false, 
                    plugins: { 
                        legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } } 
                    },
                    cutout: '70%'
                  }} 
                />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
