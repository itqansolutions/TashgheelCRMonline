import React from 'react';
import { AlertCircle } from 'lucide-react';

const EmptyState = ({ message = 'No activity recorded yet for this period.', actionText, onAction }) => {
  return (
    <div className="dashboard-empty-state">
      <div className="empty-icon-box">
        <AlertCircle size={20} />
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
          padding: 32px 16px;
          color: var(--text-muted, #64748b);
          text-align: center;
          gap: 8px;
        }
        .empty-icon-box {
          color: var(--text-muted, #94a3b8);
          margin-bottom: 4px;
        }
        .empty-message {
          font-size: 13px;
          font-weight: 500;
          max-width: 300px;
        }
        .empty-action-btn {
          margin-top: 6px;
          background: transparent;
          color: var(--primary, #4f46e5);
          font-weight: 600;
          font-size: 12.5px;
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
