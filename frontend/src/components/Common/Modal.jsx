import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const Modal = ({ isOpen, onClose, title, children, footer, maxWidth, width, variant = 'dialog', className = '', closeOnEscape = true }) => {
  const { t, isRTL } = useLanguage();

  // Close on ESC key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.keyCode === 27 && closeOnEscape) onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose, closeOnEscape]);

  if (!isOpen) return null;

  return (
    <div className={`modal-overlay ${variant === 'form' ? 'workspace-form-overlay' : ''} ${className}`} dir={isRTL ? 'rtl' : 'ltr'} onClick={onClose}>
      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: 20px;
          animation: fadeIn 0.2s ease-out;
        }
        .modal-content {
          background: white;
          width: 100%;
          max-height: calc(100dvh - 32px);
          display: flex; flex-direction: column;
          max-width: ${maxWidth || width || '500px'};
          border-radius: 12px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
          animation: slideUp 0.3s ease-out;
          overflow: hidden;
        }
        .modal-header {
          flex-shrink: 0; gap: 12px;
          padding: 16px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border);
        }
        .modal-header h3 {
          min-width: 0; overflow-wrap: anywhere;
          font-size: 18px;
          font-weight: 700;
          color: var(--text-main);
        }
        .close-btn {
          background: #f1f5f9;
          color: var(--text-muted);
          padding: 4px;
          border-radius: 6px;
          transition: all 0.2s;
        }
        .close-btn:hover {
          background: var(--bg-main);
          color: var(--danger);
        }
        .modal-body {
          min-height: 0;
          flex: 1 1 auto;
          padding: 20px;
          max-height: 70vh;
          overflow-y: auto;
        }
        .modal-footer {
          flex-shrink: 0; flex-wrap: wrap;
          padding: 16px 20px;
          background-color: #f8fafc;
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }

        .modal-overlay.workspace-form-overlay { padding: 0!important; justify-content: flex-end; align-items: stretch; animation: none; }
        .workspace-form-panel { height: 100dvh; max-height: 100dvh; max-width: min(820px, 100vw); border-radius: 0; animation: none; }
        .workspace-form-panel .modal-header { padding: 22px 24px; }
        .workspace-form-panel .modal-body { max-height: none; padding: 24px; }
        .workspace-form-panel .modal-footer { padding: 18px 24px; }
        @media(max-width:768px) {
          .workspace-form-overlay { padding: 0!important; }
          .workspace-form-panel { width: 100vw; max-height: 100dvh!important; }
          .workspace-form-panel .modal-body { padding: 18px!important; }
          .workspace-form-panel .modal-footer button { flex: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      
      <div className={`modal-content ${variant === 'form' ? 'workspace-form-panel' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button aria-label={t('common.close')} title={t('common.close')} className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        
        <div className="modal-body">
          {children}
        </div>

        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
