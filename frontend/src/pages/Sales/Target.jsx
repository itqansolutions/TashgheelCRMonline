import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Target as TargetIcon, Plus, Edit2, TrendingUp, Award, DollarSign, Calendar, CheckCircle2 } from 'lucide-react';

const Target = () => {
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('Q3 2025');

  useEffect(() => {
    // Initial / mock targets data
    setTargets([
      { id: 1, salesman_name: 'Khaled Omar', period: 'Q3 2025', target_amount: 250000, achieved_amount: 185000, commission_earned: 6475, bonus_threshold: 200000 },
      { id: 2, salesman_name: 'Nader Tarek', period: 'Q3 2025', target_amount: 200000, achieved_amount: 142000, commission_earned: 4970, bonus_threshold: 180000 },
      { id: 3, salesman_name: 'Mostafa Ali', period: 'Q3 2025', target_amount: 150000, achieved_amount: 98000, commission_earned: 4900, bonus_threshold: 120000 },
    ]);
    setLoading(false);
  }, []);

  const totalTargetSum = targets.reduce((acc, t) => acc + t.target_amount, 0);
  const totalAchievedSum = targets.reduce((acc, t) => acc + t.achieved_amount, 0);
  const overallPercentage = totalTargetSum > 0 ? Math.round((totalAchievedSum / totalTargetSum) * 100) : 0;

  return (
    <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <TargetIcon size={24} style={{ color: '#10b981' }} /> Sales Targets & Goals
          </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              Track sales volume quotas, target achievement progress, and incentive bonuses
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              style={{ padding: '8px 16px', borderRadius: '10px', border: '1.5px solid #10b981', fontWeight: 700, outline: 'none', background: '#ecfdf5', color: '#047857', fontSize: '14px' }}
            >
              <option value="Q3 2025">Q3 2025 (Jul - Sep)</option>
              <option value="Q4 2025">Q4 2025 (Oct - Dec)</option>
              <option value="FY 2025">Full Year 2025</option>
            </select>
          </div>
        </div>

        {/* Total Target Progress Widget */}
        <div style={{ background: 'linear-gradient(135deg, #064e3b 0%, #047857 100%)', color: 'white', padding: '24px', borderRadius: '20px', marginBottom: '24px', boxShadow: '0 10px 25px rgba(4,120,87,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Overall Team Target Performance</span>
              <h2 style={{ margin: '4px 0 0 0', fontSize: '28px', fontWeight: 800 }}>${totalAchievedSum.toLocaleString()} <span style={{ fontSize: '16px', fontWeight: 500, color: '#a7f3d0' }}>/ ${totalTargetSum.toLocaleString()}</span></h2>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.15)', padding: '12px 20px', borderRadius: '14px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.2)' }}>
              <span style={{ fontSize: '11px', color: '#a7f3d0', display: 'block', fontWeight: 700 }}>Achievement</span>
              <span style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff' }}>{overallPercentage}%</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div style={{ height: '10px', background: 'rgba(255,255,255,0.2)', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(overallPercentage, 100)}%`, background: '#34d399', transition: 'width 0.6s ease' }} />
          </div>
        </div>

        {/* Salesmen Individual Quota Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {targets.map((t) => {
            const pct = Math.round((t.achieved_amount / t.target_amount) * 100);
            const isTargetMet = pct >= 100;
            return (
              <div key={t.id} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{t.salesman_name}</h3>
                    <span style={{
                      padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                      background: isTargetMet ? '#dcfce7' : '#e0f2fe',
                      color: isTargetMet ? '#15803d' : '#0369a1'
                    }}>
                      {isTargetMet ? 'Goal Achieved! 🎉' : `${pct}% Completed`}
                    </span>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', marginBottom: '14px', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>Assigned Quota:</span>
                      <span style={{ fontWeight: 800, color: '#1e293b' }}>${t.target_amount.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>Closed Revenue:</span>
                      <span style={{ fontWeight: 800, color: '#10b981' }}>${t.achieved_amount.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>Commission Accrued:</span>
                      <span style={{ fontWeight: 800, color: '#8b5cf6' }}>${t.commission_earned.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Individual Bar */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
                      <span>Quota Progress</span>
                      <span>{pct}%</span>
                    </div>
                    <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444' }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
  );
};

export default Target;
