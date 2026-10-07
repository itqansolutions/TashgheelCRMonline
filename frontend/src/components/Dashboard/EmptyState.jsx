import React from 'react';
import { AlertCircle } from 'lucide-react';

const EmptyState = ({ message = 'No activity recorded yet for this period.', actionText, onAction, compact = false }) => {
  return (
    <div className={`dashboard-empty-state ${compact ? 'compact-state' : ''}`}>
      <div className="empty-icon-box">
        <AlertCircle size={compact ? 16 : 20} />
      </div>
      <p className="empty-message">{message}</p>
      {actionText && onAction && (
        <button className="empty-action-btn" onClick={onAction}>
          {actionText}
        </button>
      )}

      <style>{`
        .dashboard-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          color: var(--text-muted, #64748b);
          text-align: center;
          gap: 6px;
        }
        .dashboard-empty-state.compact-state {
          padding: 14px 12px;
          flex-direction: row;
          gap: 8px;
        }
        .dashboard-empty-state.compact-state .empty-icon-box {
          margin-bottom: 0;
        }
        .empty-icon-box {
          color: var(--text-muted, #94a3b8);
          margin-bottom: 2px;
        }
        .empty-message {
          font-size: 12.5px;
          font-weight: 500;
          max-width: 320px;
          margin: 0;
        }
        .empty-action-btn {
          margin-top: 4px;
          background: transparent;
          color: var(--primary, #4f46e5);
          font-weight: 600;
          font-size: 12px;
          border: none;
          cursor: pointer;
        }
        .empty-action-btn:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
};

export default EmptyState;
