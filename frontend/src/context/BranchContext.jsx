import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';
import api from '../services/api';

const BranchContext = createContext();

export const BranchProvider = ({ children }) => {
  const { user } = useAuth();
  const [currentBranch, setCurrentBranch] = useState(null);
  const [branches, setBranches] = useState([]);

  // Sync branches from user profile on login
  useEffect(() => {
    if (user?.branches) {
      setBranches(user.branches);
      
      // Auto-select first branch if none selected
      const savedBranchId = localStorage.getItem('branch_id');
      const branchToSelect = user.branches.find(b => b.id === savedBranchId) || user.branches[0];
      
      if (branchToSelect) {
        selectBranch(branchToSelect);
        
        // --- UX Killer Feature: Welcome Experience ---
        const hasWelcomed = sessionStorage.getItem('has_welcomed');
        if (!hasWelcomed && branchToSelect.name) {
             setTimeout(() => {
                 toast((t) => (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '15px' }}>Welcome to Tashgheel 🎉</span>
                        <span style={{ color: '#4b5563', fontSize: '13px' }}>
                            You are working in: <br/>
                            <strong style={{ color: '#4f46e5' }}>→ {branchToSelect.name}</strong>
                        </span>
                    </div>
                  ), { duration: 4000, position: 'top-center' });
             }, 500);
             sessionStorage.setItem('has_welcomed', 'true');
        }
      }
    } else {
      setBranches([]);
      setCurrentBranch(null);
    }
  }, [user]);

  const selectBranch = (branch) => {
    // Only log if it's an actual switch (not just initialization)
    if (currentBranch && currentBranch.id !== branch.id) {
       api.post('/branches/log-switch', { branchId: branch.id, branchName: branch.name }).catch(err => console.error("Logging switch failed", err));
    }
    
    setCurrentBranch(branch);
    localStorage.setItem('branch_id', branch.id);
  };

  return (
    <BranchContext.Provider value={{ currentBranch, branches, selectBranch }}>
      {children}
    </BranchContext.Provider>
  );
};

export const useBranch = () => {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
};
