import React, { useState } from 'react';
import { MoreHorizontal, Calendar, Zap, AlertCircle, TrendingUp, Handshake, Mail, User, Target, Building2 } from 'lucide-react';
import { safeArray } from '../../utils/dataUtils';
import { useLanguage } from '../../context/LanguageContext';

const KanbanBoard = ({ deals, pipelineStages, onEdit, onStageChange }) => {
  const { t, isRTL } = useLanguage();
  const [dragOverStage, setDragOverStage] = useState(null);
  const [openMenuDealId, setOpenMenuDealId] = useState(null);
  const stages = safeArray(pipelineStages).length > 0 ? pipelineStages : ['discovery', 'proposal', 'negotiation', 'won', 'lost'];
  
  // Group deals by stage
  const dealsByStage = stages.reduce((acc, stage) => {
    acc[stage.toLowerCase()] = safeArray(deals).filter(d => (d.pipeline_stage || '').toLowerCase() === stage.toLowerCase());
    return acc;
  }, {});

  const getStageLabel = (stage) => {
    const raw = (stage || '').toLowerCase().replace(/[\s-]/g, '_');
    return t(`deals.stages.${raw}`, stage.replace(/_/g, ' '));
  };

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

  const handleDragStart = (e, deal) => {
    e.dataTransfer.setData('text/plain', String(deal.id));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, stage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stage) {
      setDragOverStage(stage);
    }
  };

  const handleDrop = (e, targetStage) => {
    e.preventDefault();
    setDragOverStage(null);
    const dealId = e.dataTransfer.getData('text/plain');
    if (!dealId || typeof onStageChange !== 'function') return;
    const draggedDeal = safeArray(deals).find(d => String(d.id) === String(dealId));
    if (draggedDeal && String(draggedDeal.pipeline_stage || '').toLowerCase() !== String(targetStage || '').toLowerCase()) {
      onStageChange(draggedDeal, targetStage);
    }
  };

  return (
    <div className="kanban-container" style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '20px', minHeight: '65vh', direction: isRTL ? 'rtl' : 'ltr' }}>
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
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .kanban-lane.drag-over {
          border: 2px dashed var(--primary);
          background: rgba(79, 70, 229, 0.04);
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
          cursor: grab;
          position: relative;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .k-card:active {
          cursor: grabbing;
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
          <div
            key={stage}
            className={`kanban-lane ${dragOverStage === stage ? 'drag-over' : ''}`}
            onDragOver={(e) => handleDragOver(e, stage)}
            onDragLeave={() => setDragOverStage(null)}
            onDrop={(e) => handleDrop(e, stage)}
          >
            <div className="kanban-lane-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>
                  {getStageLabel(stage)}
                </h3>
                <div style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                  <span className="num-en">{stageDeals.length}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary)' }}>
                <TrendingUp size={14} />
                <span className="num-en" style={{ fontSize: '14px', fontWeight: 900 }}>{totalValue.toLocaleString('en-US')}</span>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>{t('common.currency', 'EGP')}</span>
              </div>
            </div>

            <div className="kanban-cards-wrapper kanban-scroll">
              {stageDeals.map(deal => (
                <div 
                  key={deal.id} 
                  className="k-card" 
                  draggable={typeof onStageChange === 'function'}
                  onDragStart={(e) => handleDragStart(e, deal)}
                  onClick={() => onEdit(deal)}
                  style={{
                    borderInlineStart: (deal.is_overdue || deal.sla?.isOverdue) ? '4px solid #ef4444' : undefined,
                    background: (deal.is_overdue || deal.sla?.isOverdue) ? '#fffbfb' : 'white'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', gap: '8px' }}>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-main)', lineHeight: 1.3 }}>
                      {deal.title}
                    </div>
                    <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        title={t('common.actions', 'Move Stage')}
                        onClick={() => setOpenMenuDealId(openMenuDealId === deal.id ? null : deal.id)}
                        style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '2px 4px', color: '#64748b', cursor: 'pointer' }}
                      >
                        <MoreHorizontal size={16}/>
                      </button>
                      {openMenuDealId === deal.id && (
                        <div style={{
                          position: 'absolute',
                          top: '26px',
                          insetInlineEnd: 0,
                          zIndex: 50,
                          background: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          boxShadow: '0 10px 25px rgba(15, 23, 42, 0.15)',
                          minWidth: '160px',
                          padding: '6px'
                        }}>
                          <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', padding: '4px 8px', textTransform: 'uppercase' }}>
                            {t('deals.moveToStage', 'نقل إلى مرحلة')}
                          </div>
                          {stages.map(targetStg => {
                            const isCurrent = String(deal.pipeline_stage || '').toLowerCase() === String(targetStg || '').toLowerCase();
                            return (
                              <button
                                key={targetStg}
                                type="button"
                                disabled={isCurrent}
                                onClick={() => {
                                  setOpenMenuDealId(null);
                                  if (typeof onStageChange === 'function') {
                                    onStageChange(deal, targetStg);
                                  } else {
                                    onEdit({ ...deal, pipeline_stage: targetStg });
                                  }
                                }}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  textAlign: isRTL ? 'right' : 'left',
                                  padding: '6px 10px',
                                  fontSize: '12px',
                                  fontWeight: isCurrent ? 800 : 600,
                                  color: isCurrent ? 'var(--primary)' : '#334155',
                                  background: isCurrent ? '#eef2ff' : 'transparent',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: isCurrent ? 'default' : 'pointer'
                                }}
                              >
                                {getStageLabel(targetStg)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--primary)', marginBottom: '12px' }}>
                    <span className="num-en">{Number(deal.value || 0).toLocaleString('en-US')}</span> <span style={{ fontSize: '12px', color: '#64748b' }}>{t('common.currency', 'EGP')}</span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                    <div className="k-metric-pill" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569' }}>
                      <User size={12}/> {deal.client_name?.split(' ')[0] || t('deals.client', 'Client')}
                    </div>
                    <div className="k-metric-pill" style={{ background: `${getProbabilityColor(deal.probability || 0)}15`, color: getProbabilityColor(deal.probability || 0) }}>
                      <Target size={12}/> <span className="num-en">{deal.probability || 0}%</span> {t('deals.win', 'Win')}
                    </div>
                    {deal.unit_id && (deal.unit_number || deal.unit_name || deal.unit_project) && (
                      <div className="k-metric-pill" style={{ background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1' }}>
                        <Building2 size={12} />
                        <span>
                          {deal.unit_project ? `${deal.unit_project} • ` : ''}
                          <span className="num-en">{deal.unit_number || deal.unit_name}</span>
                        </span>
                      </div>
                    )}
                    {!deal.unit_id && deal.source_type === 'property_finder' && (deal.custom_fields?.pf_listing_reference || deal.custom_fields?.pf_listing_id || deal.custom_fields?.pf_project_id) && (
                      <div className="k-metric-pill" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309' }}>
                        <Building2 size={12} />
                        <span>PF: <span className="num-en">{deal.custom_fields?.pf_listing_reference || deal.custom_fields?.pf_listing_id || deal.custom_fields?.pf_project_id}</span></span>
                      </div>
                    )}
                    {(deal.is_overdue || deal.sla?.isOverdue) && (
                      <div className="k-metric-pill" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontWeight: 900 }}>
                        <AlertCircle size={12} color="#dc2626" />
                        <span>{t('deals.sla.overdueBadge', 'OVERDUE (>48h)')}</span>
                      </div>
                    )}
                  </div>

                  <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {deal.expected_close_date && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                        <Calendar size={13} color="#f59e0b" />
                        {t('deals.estClose', 'Est. Close:')} <span className="num-en">{new Date(deal.expected_close_date).toLocaleDateString('en-GB')}</span>
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
                  {t('deals.noDealsInStage', 'No deals in this stage')}
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
