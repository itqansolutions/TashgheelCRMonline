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
      
      <div className="section-header">
        <h2 style={{ fontSize: '22px', fontWeight: '700' }}>Dashboard Overview</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Welcome back! Here's what's happening today.</p>
      </div>

      <div className="kpi-grid">
        <KPICard 
          title="Total Revenue" 
          value={`${stats?.finance?.total_income || 0} EGP`}
          icon={<ShoppingBag size={20} />}
          color="blue"
          trend="up"
          trendValue="12%"
        />
        <KPICard 
          title="Expenses" 
          value={`${stats?.finance?.total_expenses || 0} EGP`}
          icon={<CreditCard size={20} />}
          color="yellow"
          trend="down"
          trendValue="3%"
        />
        <KPICard 
          title="Net Profit" 
          value={`${stats?.finance?.net_profit || 0} EGP`}
          icon={<Wallet size={20} />}
          color="green"
          trend="up"
          trendValue="8%"
        />
        <KPICard 
          title="Customers" 
          value={stats?.customers_count || 0}
          icon={<Users size={20} />}
          color="purple"
          trend="up"
          trendValue="5%"
        />
        <KPICard 
          title="Pending Tasks" 
          value={stats?.pending_tasks || 0}
          icon={<CheckSquare size={20} />}
          color="red"
          trend="down"
          trendValue="10%"
        />
      </div>

      <div className="charts-row">
        <div className="chart-card">
          <h3>Revenue vs Expenses Trend</h3>
          <div className="chart-container">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>
        <div className="chart-card">
          <h3>Pipeline Distribution</h3>
          <div className="chart-container">
            <Doughnut 
              data={{
                labels: stats?.deals_pipeline?.map(d => d.pipeline_stage) || ['Discovery', 'Won', 'Lost'],
                datasets: [{
                  data: stats?.deals_pipeline?.map(d => parseInt(d.count)) || [5, 12, 3],
                  backgroundColor: ['#2563eb', '#16a34a', '#dc2626', '#f59e0b'],
                  borderWidth: 0
                }]
              }}
              options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
