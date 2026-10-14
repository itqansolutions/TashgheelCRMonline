import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useLanguage } from '../context/LanguageContext';
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
  const { t, isRTL } = useLanguage();
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
      toast.error(t('reportsHub.toastLoadError'));
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
        label: t('reportsHub.chartRevenue'),
        data: (revenueData || []).map(r => r.revenue),
        borderColor: '#1e40af',
        backgroundColor: 'rgba(30, 64, 175, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: t('reportsHub.chartExpenses'),
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
        label: t('reportsHub.chartUnitsSold'),
        data: (topProducts || []).map(p => parseInt(p.total_sold)),
        backgroundColor: '#3b82f6',
        borderRadius: 6
      }
    ]
  };

  if (loading) return <div className="loading" style={{ textAlign: 'center', margin: '100px' }}>{t('reportsHub.loadingAnalysis')}</div>;

  const avgRev = revenueData.length > 0 ? (revenueData.reduce((acc, curr) => acc + parseFloat(curr.revenue), 0) / revenueData.length).toFixed(2) : 0;
  const totalSold = topProducts.reduce((acc, curr) => acc + parseInt(curr.total_sold), 0);
  const totalRev = revenueData.reduce((acc, curr) => acc + parseFloat(curr.revenue), 0).toLocaleString();

  return (
    <div className="reports-page" dir={isRTL ? 'rtl' : 'ltr'}>
      <style>{`
        .reports-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; }
        .chart-card { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
        .chart-card h3 { font-size: 16px; font-weight: 700; margin-bottom: 24px; display: flex; align-items: center; gap: 8px; }
        .chart-container { height: 350px; }
        .stats-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 24px; }
        .summary-mini-card { background: white; padding: 16px; border-radius: 12px; border: 1px solid var(--border); }
        .summary-mini-card h4 { font-size: 13px; color: var(--text-muted); font-weight: 500; }
        .summary-mini-card p { font-size: 18px; font-weight: 800; margin-top: 4px; }
        @media (max-width: 900px) {
          .reports-grid { grid-template-columns: 1fr; }
          .stats-summary { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="page-header" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '800' }}>{t('reportsHub.title')}</h2>
        <p style={{ color: 'var(--text-muted)' }}>{t('reportsHub.subtitle')}</p>
      </div>

      <div className="stats-summary">
        <div className="summary-mini-card">
          <h4>{t('reportsHub.avgMonthlyRevenue')}</h4>
          <p><span className="num-en">{avgRev}</span> {t('common.currency', 'EGP')}</p>
        </div>
        <div className="summary-mini-card">
          <h4>{t('reportsHub.totalProductsSold')}</h4>
          <p><span className="num-en">{t('reportsHub.unitsCount', { count: totalSold })}</span></p>
        </div>
        <div className="summary-mini-card">
          <h4>{t('reportsHub.totalRevenueAnalyzed')}</h4>
          <p><span className="num-en">{totalRev}</span> {t('common.currency', 'EGP')}</p>
        </div>
      </div>

      <div className="reports-grid">
        <div className="chart-card">
          <h3><TrendingUp size={18} color="var(--primary)" /> {t('reportsHub.chartFinancial')}</h3>
          <div className="chart-container">
            <Line 
              data={financialChartData} 
              options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }}
            />
          </div>
        </div>

        <div className="chart-card">
          <h3><Package size={18} color="#3b82f6" /> {t('reportsHub.chartTopSelling')}</h3>
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
