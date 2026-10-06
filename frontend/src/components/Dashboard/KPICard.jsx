import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

const KPICard = ({
  title,
  value,
  icon,
  trend,
  trendValue,
  subtitle,
  onClick,
  badge,
  color = 'primary'
}) => {
  const isClickable = Boolean(onClick);

  return (
    <div
      className={`dashboard-kpi-card ${isClickable ? 'cursor-pointer hover-card' : ''}`}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <div className="kpi-top">
        <div className={`kpi-icon-wrapper kpi-color-${color}`}>
          {icon}
        </div>
        <div className="kpi-top-meta">
          {badge && <span className="kpi-badge">{badge}</span>}
          {trend && (
            <span className={`kpi-trend ${trend === 'up' ? 'trend-up' : 'trend-down'}`}>
              {trend === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {trendValue}
            </span>
          )}
        </div>
      </div>

      <div className="kpi-details">
        <span className="kpi-label">{title}</span>
        <div className="kpi-val-container">
          <span className="kpi-number">{value}</span>
        </div>
        {subtitle && <span className="kpi-subtext">{subtitle}</span>}
      </div>

      <style>{`
        .dashboard-kpi-card {
          background: var(--bg-card, #ffffff);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: var(--radius, 12px);
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: all 0.2s ease-in-out;
          box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
        }
        .dashboard-kpi-card.hover-card:hover {
          transform: translateY(-2px);
          border-color: var(--primary, #4f46e5);
          box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
        }
        .kpi-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .kpi-icon-wrapper {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .kpi-color-primary { background: rgba(79, 70, 229, 0.1); color: #4f46e5; }
        .kpi-color-success { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .kpi-color-warning { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        .kpi-color-danger { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .kpi-color-info { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
        .kpi-color-purple { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }

        .kpi-top-meta {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .kpi-badge {
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 6px;
          background: rgba(0, 0, 0, 0.04);
          color: var(--text-muted, #64748b);
        }
        .kpi-trend {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 6px;
        }
        .trend-up {
          background: rgba(16, 185, 129, 0.12);
          color: #059669;
        }
        .trend-down {
          background: rgba(239, 68, 68, 0.12);
          color: #dc2626;
        }
        .kpi-details {
          display: flex;
          flex-direction: column;
        }
        .kpi-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-muted, #64748b);
          margin-bottom: 4px;
        }
        .kpi-number {
          font-size: 22px;
          font-weight: 800;
          color: var(--text-main, #0f172a);
          letter-spacing: -0.02em;
        }
        .kpi-subtext {
          font-size: 11.5px;
          color: var(--text-muted, #64748b);
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
};

export default KPICard;
