import React from 'react';
import { MoreHorizontal, Calendar, Zap, AlertCircle, TrendingUp, Handshake, Mail, User } from 'lucide-react';
import { safeArray } from '../../utils/dataUtils';

const KanbanBoard = ({ deals, pipelineStages, onEdit }) => {
  const stages = safeArray(pipelineStages).length > 0 ? pipelineStages : ['discovery', 'proposal', 'negotiation', 'won', 'lost'];
  
  // Group deals by stage
  const dealsByStage = stages.reduce((acc, stage) => {
    acc[stage.toLowerCase()] = safeArray(deals).filter(d => (d.pipeline_stage || '').toLowerCase() === stage.toLowerCase());
    return acc;
  }, {});

  const getProbabilityColor = (prob) => {
    if (prob >= 80) return '#10b981'; // Green
    if (prob >= 50) return '#f59e0b'; // Amber
    if (prob >= 20) return '#3b82f6'; // Blue
    return '#ef4444'; // Red
  };

  const getActionIcon = (actionStr) => {
    const s = (actionStr || '').toLowerCase();
    if (s.includes('call')) return <Zap size={12} />;
    if (s.includes('email') || s.includes('mail')) return <Mail size={12} />;
    if (s.includes('meet')) return <User size={12} />;
    return <AlertCircle size={12} />;
  };

  return (
    <div className="kanban-container" style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '20px', minHeight: '65vh' }}>
      <style>{`
        .kanban-lane {
          flex: 0 0 320px;
          background: rgba(248, 250, 252, 0.7);
          border-radius: 16px;
          border: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          max-height: 100%;
          overflow: hidden;
        }
        .kanban-lane-header {
          padding: 16px;
          border-bottom: 2px solid var(--border);
          background: white;
        }
        .kanban-cards-wrapper {
          padding: 16px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
          flex: 1;
        }
        .k-card {
          background: white;
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
          border: 1px solid var(--border);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .k-card:hover {
          box-shadow: 0 8px 24px rgba(79, 70, 229, 0.12);
          transform: translateY(-2px);
          border-color: rgba(79, 70, 229, 0.3);
        }
        .k-metric-pill {
          padding: 2px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .kanban-scroll::-webkit-scrollbar { height: 8px; width: 8px; }
        .kanban-scroll::-webkit-scrollbar-track { background: transparent; }
        .kanban-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      `}</style>

      {stages.map(stage => {
        const stageDeals = dealsByStage[stage.toLowerCase()] || [];
        const totalValue = stageDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
        
        return (
          <div key={stage} className="kanban-lane">
            <div className="kanban-lane-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-main)', textTransform: 'capitalize' }}>
                  {stage.replace('_', ' ')}
                </h3>
                <div style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                  {stageDeals.length}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary)' }}>
                <TrendingUp size={14} />
                <span style={{ fontSize: '14px', fontWeight: 900 }}>EGP {totalValue.toLocaleString()}</span>
              </div>
            </div>

            <div className="kanban-cards-wrapper kanban-scroll">
              {stageDeals.map(deal => (
                <div key={deal.id} className="k-card" onClick={() => onEdit(deal)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-main)', lineHeight: 1.3 }}>
                      {deal.title}
                    </div>
                    <button style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><MoreHorizontal size={16}/></button>
                  </div>
                  
                  <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--primary)', marginBottom: '12px' }}>
                    {Number(deal.value || 0).toLocaleString()} <span style={{ fontSize: '12px', color: '#64748b' }}>EGP</span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                    <div className="k-metric-pill" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569' }}>
                      <User size={12}/> {deal.client_name?.split(' ')[0] || 'Client'}
                    </div>
                    <div className="k-metric-pill" style={{ background: `${getProbabilityColor(deal.probability || 0)}15`, color: getProbabilityColor(deal.probability || 0) }}>
                      <Target size={12}/> {deal.probability || 0}% Win
                    </div>
                  </div>

                  <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {deal.expected_close_date && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                        <Calendar size={13} color="#f59e0b" />
                        Est. Close: {new Date(deal.expected_close_date).toLocaleDateString()}
                      </div>
                    )}
                    {deal.next_action && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#0369a1', fontWeight: 700, background: '#f0f9ff', padding: '4px 8px', borderRadius: '4px' }}>
                        {getActionIcon(deal.next_action)}
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{deal.next_action}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {stageDeals.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', fontWeight: 600, border: '2px dashed #e2e8f0', borderRadius: '12px' }}>
                  No deals in this stage
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default KanbanBoard;
