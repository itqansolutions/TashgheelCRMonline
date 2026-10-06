import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useModule } from '../hooks/useModule';
import DashboardSkeleton from '../components/Dashboard/DashboardSkeleton';
import GeneralDashboard from './GeneralDashboard';
import RealEstateDashboard from './RealEstateDashboard';
import { AlertCircle } from 'lucide-react';

const Dashboard = () => {
  const { user } = useAuth();
  const { modules: planModules } = useModule();
  
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeFilter, setTimeFilter] = useState('THIS_MONTH');

  const isRealEstate = (user?.template_name || summaryData?.template) === 'real_estate';

  const fetchDashboardData = async (time) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/dashboard/summary?timeFilter=${time}`);
      setSummaryData(res.data);
    } catch (err) {
      console.error('[Dashboard Error]:', err);
      setError(err?.response?.data?.message || 'Failed to load business metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(timeFilter);
  }, [timeFilter]);

  if (loading) {
    return (
      <div className="dashboard-container">
        <DashboardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-error-banner">
          <AlertCircle size={20} />
          <div>
            <h4>Dashboard Unavailable</h4>
            <p>{error}</p>
          </div>
          <button onClick={() => fetchDashboardData(timeFilter)} className="retry-btn">
            Retry
          </button>
        </div>
        <style>{`
          .dashboard-container {
            padding: 4px;
          }
          .dashboard-error-banner {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 16px 20px;
            background: rgba(239, 68, 68, 0.08);
            border: 1px solid rgba(239, 68, 68, 0.2);
            border-radius: var(--radius, 12px);
            color: #dc2626;
          }
          .dashboard-error-banner h4 {
            margin: 0;
            font-size: 14px;
            font-weight: 700;
          }
          .dashboard-error-banner p {
            margin: 2px 0 0 0;
            font-size: 12.5px;
            color: var(--text-muted, #64748b);
          }
          .retry-btn {
            margin-left: auto;
            background: #dc2626;
            color: white;
            border: none;
            border-radius: 6px;
            padding: 6px 14px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {isRealEstate ? (
        <RealEstateDashboard 
          data={summaryData?.data}
          timeFilter={timeFilter}
          setTimeFilter={setTimeFilter}
          modules={summaryData?.modules || planModules}
        />
      ) : (
        <GeneralDashboard 
          data={summaryData?.data}
          timeFilter={timeFilter}
          setTimeFilter={setTimeFilter}
          modules={summaryData?.modules || planModules}
        />
      )}

      <style>{`
        .dashboard-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
