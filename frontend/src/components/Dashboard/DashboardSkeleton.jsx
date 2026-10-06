import React from 'react';

const DashboardSkeleton = () => {
  return (
    <div className="dashboard-skeleton">
      <div className="skeleton-header">
        <div className="skeleton-box skeleton-title" />
        <div className="skeleton-box skeleton-filter" />
      </div>

      <div className="skeleton-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton-box skeleton-card" />
        ))}
      </div>

      <div className="skeleton-row">
        <div className="skeleton-box skeleton-chart" />
        <div className="skeleton-box skeleton-side" />
      </div>

      <style>{`
        .dashboard-skeleton {
          display: flex;
          flex-direction: column;
          gap: 20px;
          animation: pulse 1.5s infinite ease-in-out;
        }
        .skeleton-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .skeleton-box {
          background: rgba(0, 0, 0, 0.06);
          border-radius: 8px;
        }
        .skeleton-title {
          width: 200px;
          height: 28px;
        }
        .skeleton-filter {
          width: 140px;
          height: 36px;
        }
        .skeleton-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        .skeleton-card {
          height: 110px;
          border-radius: 12px;
        }
        .skeleton-row {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 16px;
        }
        .skeleton-chart {
          height: 320px;
          border-radius: 12px;
        }
        .skeleton-side {
          height: 320px;
          border-radius: 12px;
        }
        @media (max-width: 1024px) {
          .skeleton-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .skeleton-row {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 600px) {
          .skeleton-grid {
            grid-template-columns: 1fr;
          }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};

export default DashboardSkeleton;
