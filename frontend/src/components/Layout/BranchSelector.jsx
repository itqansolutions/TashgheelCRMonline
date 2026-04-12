import React from 'react';
import { useBranch } from '../../context/BranchContext';
import { MapPin, ChevronDown, Check, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

const BranchSelector = () => {
  const { currentBranch, branches, selectBranch } = useBranch();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!branches || branches.length === 0) return null;

  return (
    <div className="branch-selector-wrapper">
      <style>{`
        .branch-selector-wrapper { position: relative; }
        .branch-trigger {
          display: flex; align-items: center; gap: 8px; padding: 6px 14px;
          background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px; cursor: pointer; color: white; transition: 0.2s;
        }
        .branch-trigger:hover { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.2); }
        .branch-dropdown {
          position: absolute; top: calc(100% + 8px); right: 0; min-width: 220px;
          background: #1e1b4b; border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);
          padding: 8px; z-index: 1000; animation: slideDown 0.2s ease-out;
        }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .branch-option {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 12px; border-radius: 8px; cursor: pointer; transition: 0.2s;
          color: rgba(255, 255, 255, 0.7); font-size: 13px; font-weight: 600;
        }
        .branch-option:hover { background: rgba(255, 255, 255, 0.05); color: white; }
        .branch-option.active { background: rgba(99, 102, 241, 0.1); color: #818cf8; }
        .branch-name { display: flex; align-items: center; gap: 8px; }
      `}</style>

      <button className="branch-trigger" onClick={() => setIsOpen(!isOpen)}>
        <MapPin size={14} className="text-secondary" />
        <span style={{ fontSize: '13px', fontWeight: '700' }}>{currentBranch?.name || 'Select Branch'}</span>
        <ChevronDown size={14} style={{ opacity: 0.5 }} />
      </button>

      {isOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setIsOpen(false)} />
          <div className="branch-dropdown">
            <div style={{ padding: '4px 12px 8px', fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Switch Workspace
            </div>
            {branches.map((branch) => (
              <div 
                key={branch.id} 
                className={`branch-option ${currentBranch?.id === branch.id ? 'active' : ''}`}
                onClick={() => {
                  if (currentBranch?.id !== branch.id) {
                    toast.success(`Switched workspace to ${branch.name}`);
                    selectBranch(branch);
                    setIsOpen(false);
                    // Short timeout to allow toast to render before reload
                    setTimeout(() => window.location.reload(), 500);
                  } else {
                    setIsOpen(false);
                  }
                }}
              >
                <div className="branch-name">
                  <MapPin size={12} style={{ opacity: 0.6 }} />
                  {branch.name}
                </div>
                {currentBranch?.id === branch.id && <Check size={12} />}
              </div>
            ))}
            {user?.role === 'admin' && (
              <div 
                className="branch-option"
                style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', borderRadius: '0 0 12px 12px', color: '#818cf8' }}
                onClick={() => {
                  setIsOpen(false);
                  window.location.href = '/settings/company'; // or a specific branches settings page
                }}
              >
                <div className="branch-name">
                  <Plus size={12} />
                  Add/Manage Branches
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default BranchSelector;
