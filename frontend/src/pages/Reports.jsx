import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { 
  BarChart, LineChart, PieChart, 
  TrendingUp, Calendar, Filter, 
  ArrowUpRight, ArrowDownRight, Package 
} from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, 
  BarElement, PointElement, LineElement, 
  Title, Tooltip, Legend, ArcElement, Filler 
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, 
  PointElement, LineElement, Title, 
  Tooltip, Legend, ArcElement, Filler
);

const Reports = () => {
  const [revenueData, setRevenueData] = useState([]);
  const [expenseData, setExpenseData] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    try {
      const [trendRes, productsRes] = await Promise.all([
        api.get('/reports/financial-trends'),
        api.get('/reports/top-products')
      ]);
      setRevenueData(trendRes.data?.data?.revenue || []);
      setExpenseData(trendRes.data?.data?.expenses || []);
      setTopProducts(productsRes.data?.data || []);
    } catch (err) {
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const financialChartData = {
    labels: (revenueData || []).map(r => r.month),
    datasets: [
      {
        label: 'Revenue',
        data: (revenueData || []).map(r => r.revenue),
        borderColor: '#1e40af',
        backgroundColor: 'rgba(30, 64, 175, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Expenses',
        data: (expenseData || []).map(e => e.expenses),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: true,
        tension: 0.4,
      }
    ]
  };

  const productChartData = {
    labels: (topProducts || []).map(p => p.name),
    datasets: [
      {
        label: 'Units Sold',
        data: (topProducts || []).map(p => parseInt(p.total_sold)),
        backgroundColor: '#3b82f6',
        borderRadius: 6
      }
    ]
  };

  if (loading) return <div className="loading" style={{ textAlign: 'center', margin: '100px' }}>Analyzing your data...</div>;

  return (
    <div className="reports-page">
      <style>{`
        .reports-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; }
        .chart-card { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
        .chart-card h3 { font-size: 16px; font-weight: 700; margin-bottom: 24px; display: flex; align-items: center; gap: 8px; }
        .chart-container { height: 350px; }
        .stats-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 24px; }
        .summary-mini-card { background: white; padding: 16px; border-radius: 12px; border: 1px solid var(--border); }
        .summary-mini-card h4 { font-size: 13px; color: var(--text-muted); font-weight: 500; }
        .summary-mini-card p { font-size: 18px; font-weight: 800; margin-top: 4px; }
      `}</style>

      <div className="page-header" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '800' }}>Business Intelligence</h2>
        <p style={{ color: 'var(--text-muted)' }}>Financial trends and product performance breakdown.</p>
      </div>

      <div className="stats-summary">
        <div className="summary-mini-card">
          <h4>Avg. Monthly Revenue</h4>
          <p>{revenueData.length > 0 ? (revenueData.reduce((acc, curr) => acc + parseFloat(curr.revenue), 0) / revenueData.length).toFixed(2) : 0} EGP</p>
        </div>
        <div className="summary-mini-card">
            <h4>Total Products Sold</h4>
            <p>{topProducts.reduce((acc, curr) => acc + parseInt(curr.total_sold), 0)} Units</p>
        </div>
        <div className="summary-mini-card">
            <h4>Total Revenue Analyzed</h4>
            <p>{revenueData.reduce((acc, curr) => acc + parseFloat(curr.revenue), 0).toLocaleString()} EGP</p>
        </div>
      </div>

      <div className="reports-grid">
        <div className="chart-card">
          <h3><TrendingUp size={18} color="var(--primary)" /> Financial Performance (Revenue vs. Expenses)</h3>
          <div className="chart-container">
            <Line 
              data={financialChartData} 
              options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }}
            />
          </div>
        </div>

        <div className="chart-card">
          <h3><Package size={18} color="#3b82f6" /> Top Selling Products</h3>
          <div className="chart-container" style={{ height: '350px' }}>
            <Bar 
              data={productChartData} 
              options={{ 
                indexAxis: 'y', 
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
