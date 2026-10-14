import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ShoppingBag, Users, CheckSquare, 
  ArrowRight, ChevronRight, AlertTriangle, Package,
  TrendingUp, CreditCard
} from 'lucide-react';
import KPICard from '../components/Dashboard/KPICard';
import EmptyState from '../components/Dashboard/EmptyState';
import { safeArray } from '../utils/dataUtils';
import { useLanguage } from '../context/LanguageContext';

const GeneralDashboard = ({ data, timeFilter, setTimeFilter, modules }) => {
  const navigate = useNavigate();
  const { t, isRTL } = useLanguage();

  const finance = data?.financeMetrics || { accessible: false };
  const pipeline = data?.pipeline || { stages: [], counts: {}, values: {} };
  const procurement = data?.procurement || { accessible: false };
  const inventory = data?.inventory || { accessible: false };
  const hr = data?.hrMetrics || { accessible: false };
  const pendingActions = data?.pendingActions || { tasks: [], pendingQuotations: [] };

  const formatEgp = (num) => `${(num || 0).toLocaleString('en-US')} ${t('common.currency')}`;

  const getTimeFilterLabel = (filter) => {
    switch (filter) {
      case 'TODAY': return t('dashboard.today');
      case 'THIS_WEEK': return t('dashboard.thisWeek');
      case 'THIS_MONTH': return t('dashboard.thisMonth');
      default: return filter;
    }
  };

  const getStageLabel = (stage) => {
    if (!stage) return '';
    const key = stage.toLowerCase().replace(/[\s_-]+/g, '');
    const stageMap = {
      lead: 'lead',
      interested: 'interested',
      sitevisit: 'siteVisit',
      negotiation: 'negotiation',
      proposal: 'proposal',
      quotation: 'proposal',
      closedwon: 'closedWon',
      closedlost: 'closedLost'
    };
    const translationKey = stageMap[key];
    if (translationKey) {
      return t(`dashboard.stages.${translationKey}`);
    }
    return stage.toUpperCase();
  };

  const getPriorityLabel = (priority) => {
    if (!priority) return t('dashboard.priorities.normal');
    const key = priority.toLowerCase();
    return t(`dashboard.priorities.${key}`, priority);
  };

  return (
    <div className="gen-dashboard-content">
      {/* HEADER CONTROLS */}
      <div className="dashboard-subbar">
        <div className="dashboard-meta-info">
          <h2>{t('dashboard.general.title')}</h2>
          <p>{t('dashboard.general.subtitle')}</p>
        </div>
        <div className="dashboard-actions">
          <select 
            value={timeFilter} 
            onChange={(e) => setTimeFilter(e.target.value)}
            className="time-filter-select"
          >
            <option value="TODAY">{t('dashboard.today')}</option>
            <option value="THIS_WEEK">{t('dashboard.thisWeek')}</option>
            <option value="THIS_MONTH">{t('dashboard.thisMonth')}</option>
          </select>
        </div>
      </div>

      {/* SECTION A: KPI CARDS (Module-Aware) */}
      <div className="dashboard-grid-4">
        {finance.accessible && (
          <>
            <KPICard 
              title={t('dashboard.salesToday')} 
              value={formatEgp(finance.salesToday)}
              icon={<ShoppingBag size={20} />}
              color="primary"
              subtitle={t('dashboard.salesTodaySub')}
              onClick={() => navigate('/finance')}
            />
            <KPICard 
              title={t('dashboard.salesThisMonth')} 
              value={formatEgp(finance.salesThisMonth)}
              icon={<TrendingUp size={20} />}
              color="success"
              subtitle={t('dashboard.salesThisMonthSub')}
              onClick={() => navigate('/finance')}
            />
            <KPICard 
              title={t('dashboard.outstandingReceivables')} 
              value={formatEgp(finance.receivables?.outstanding)}
              icon={<CreditCard size={20} />}
              color="warning"
              subtitle={t('dashboard.overdueAmount', { amount: formatEgp(finance.receivables?.overdue) })}
              onClick={() => navigate('/finance')}
            />
          </>
        )}

        {procurement.accessible && (
          <KPICard 
            title={t('dashboard.pendingPurchaseRequests')} 
            value={procurement.pendingPurchaseRequests}
            icon={<ShoppingBag size={20} />}
            color="purple"
            subtitle={t('dashboard.totalRequestsSub', { count: procurement.totalPurchaseRequests })}
            onClick={() => navigate('/purchases/requests')}
          />
        )}

        {inventory.accessible && (
          <KPICard 
            title={t('dashboard.lowStockItems')} 
            value={inventory.lowStock}
            icon={<Package size={20} />}
            color="danger"
            subtitle={t('dashboard.outOfStockSub', { count: inventory.outOfStock })}
            onClick={() => navigate('/inventory/balances')}
          />
        )}

        {hr.accessible && (
          <KPICard 
            title={t('dashboard.employeesPresentToday')} 
            value={hr.employeesPresentToday}
            icon={<Users size={20} />}
            color="info"
            subtitle={t('dashboard.employeesPresentTodaySub')}
            onClick={() => navigate('/hr/dashboard')}
          />
        )}
      </div>

      {/* SECTION B & C: SALES PERFORMANCE + SALES PIPELINE */}
      <div className="dashboard-row-split">
        {/* Sales Trend Performance */}
        {finance.accessible ? (
          <div className="dashboard-card">
            <div className="card-header">
              <h3>{t('dashboard.salesPerformancePeriod', { period: finance.periodLabel || getTimeFilterLabel(timeFilter) })}</h3>
              <button className="text-btn" onClick={() => navigate('/finance')}>
                {t('dashboard.viewInvoices')} <ChevronRight size={14} className="rtl-flip" />
              </button>
            </div>
            <div className="card-body">
              {finance.trend?.length > 0 ? (
                <div className="sales-trend-list">
                  {finance.trend.slice(-6).map((tItem) => (
                    <div key={tItem.date} className="trend-row">
                      <span className="trend-date num-en">{tItem.date}</span>
                      <div className="trend-bar-container">
                        <div 
                          className="trend-bar-fill" 
                          style={{ width: `${Math.min(100, Math.max(10, (tItem.sales / (finance.salesThisMonth || 1)) * 100))}%` }} 
                        />
                      </div>
                      <span className="trend-amount num-en">{formatEgp(tItem.sales)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message={t('dashboard.noSalesRecorded')} compact={true} />
              )}
            </div>
          </div>
        ) : (
          <div className="dashboard-card">
            <div className="card-header">
              <h3>{t('dashboard.salesPerformance')}</h3>
            </div>
            <div className="card-body">
              <EmptyState message={t('dashboard.financeRestricted')} compact={true} />
            </div>
          </div>
        )}

        {/* General CRM Sales Pipeline */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3>{t('dashboard.salesPipeline')}</h3>
            <button className="text-btn" onClick={() => navigate('/deals')}>
              {t('dashboard.dealsKanban')} <ChevronRight size={14} className="rtl-flip" />
            </button>
          </div>
          <div className="card-body">
            <div className="gen-pipeline-flow">
              {pipeline.stages?.map((stg) => {
                const count = pipeline.counts[stg] || 0;
                const val = pipeline.values[stg] || 0;
                return (
                  <div key={stg} className="gen-pipeline-step">
                    <span className="step-label">{getStageLabel(stg)}</span>
                    <span className="step-count num-en">{count}</span>
                    <span className="step-value num-en">{val > 0 ? formatEgp(val) : '—'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION D: RECEIVABLES / PAYABLES */}
      {finance.accessible && (
        <div className="dashboard-card">
          <div className="card-header">
            <div>
              <h3>{t('dashboard.receivablesPayables')}</h3>
              <span className="card-subtitle">{t('dashboard.receivablesPayablesSub')}</span>
            </div>
            <button className="text-btn" onClick={() => navigate('/finance')}>
              {t('dashboard.financialLedger')} <ChevronRight size={14} className="rtl-flip" />
            </button>
          </div>
          <div className="card-body">
            <div className="rec-pay-grid">
              <div className="rec-pay-box" onClick={() => navigate('/finance')}>
                <span className="rp-label">{t('dashboard.outstandingReceivables')}</span>
                <span className="rp-val num-en">{formatEgp(finance.receivables?.outstanding)}</span>
                <span className="rp-sub">{t('dashboard.fromClients')}</span>
              </div>
              <div className="rec-pay-box box-danger" onClick={() => navigate('/finance')}>
                <span className="rp-label">{t('dashboard.overdueInvoices')}</span>
                <span className="rp-val num-en">{formatEgp(finance.receivables?.overdue)}</span>
                <span className="rp-sub">{t('dashboard.requiresFollowUp')}</span>
              </div>
              <div className="rec-pay-box box-warning" onClick={() => navigate('/finance')}>
                <span className="rp-label">{t('dashboard.dueIn7Days')}</span>
                <span className="rp-val num-en">{formatEgp(finance.receivables?.dueSoon)}</span>
                <span className="rp-sub">{t('dashboard.expectedInflows')}</span>
              </div>
              <div className="rec-pay-box" onClick={() => navigate('/finance')}>
                <span className="rp-label">{t('dashboard.vendorPayables')}</span>
                <span className="rp-val num-en">{formatEgp(finance.payables?.outstanding)}</span>
                <span className="rp-sub">{t('dashboard.outstandingSupplyInvoices')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION E & F: PROCUREMENT + INVENTORY (Only if enabled) */}
      {(procurement.accessible || inventory.accessible) && (
        <div className="dashboard-row-split">
          {procurement.accessible && (
            <div className="dashboard-card">
              <div className="card-header">
                <h3>{t('dashboard.procurementStatus')}</h3>
                <button className="text-btn" onClick={() => navigate('/purchases/requests')}>
                  {t('dashboard.procurementCenter')} <ChevronRight size={14} className="rtl-flip" />
                </button>
              </div>
              <div className="card-body">
                <div className="proc-list">
                  <div className="proc-item" onClick={() => navigate('/purchases/requests')}>
                    <span className="proc-title">{t('dashboard.pendingPurchaseRequests')}</span>
                    <span className="proc-badge num-en">{procurement.pendingPurchaseRequests}</span>
                  </div>
                  <div className="proc-item" onClick={() => navigate('/purchases/rfqs')}>
                    <span className="proc-title">{t('dashboard.activeRfqs')}</span>
                    <span className="proc-badge num-en">{procurement.pendingRfqs}</span>
                  </div>
                  <div className="proc-item" onClick={() => navigate('/purchases/orders')}>
                    <span className="proc-title">{t('dashboard.pendingPurchaseOrders')}</span>
                    <span className="proc-badge num-en">{procurement.pendingPurchaseOrders}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {inventory.accessible && (
            <div className="dashboard-card">
              <div className="card-header">
                <h3>{t('dashboard.inventoryHealth')}</h3>
                <button className="text-btn" onClick={() => navigate('/inventory/balances')}>
                  {t('dashboard.stockBalances')} <ChevronRight size={14} className="rtl-flip" />
                </button>
              </div>
              <div className="card-body">
                <div className="inv-stats-grid">
                  <div className="inv-stat-item">
                    <span className="inv-label">{t('dashboard.totalSkuCatalog')}</span>
                    <span className="inv-val num-en">{inventory.totalProducts}</span>
                  </div>
                  <div className="inv-stat-item text-danger">
                    <span className="inv-label">{t('dashboard.outOfStock')}</span>
                    <span className="inv-val num-en">{inventory.outOfStock}</span>
                  </div>
                  <div className="inv-stat-item text-warning">
                    <span className="inv-label">{t('dashboard.lowStockWarning')}</span>
                    <span className="inv-val num-en">{inventory.lowStock}</span>
                  </div>
                  <div className="inv-stat-item">
                    <span className="inv-label">{t('dashboard.stockValuation')}</span>
                    <span className="inv-val num-en">{formatEgp(inventory.stockValue)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION G: MY PENDING ACTIONS */}
      <div className="dashboard-card">
        <div className="card-header">
          <div>
            <h3>{t('dashboard.actionItems')}</h3>
            <span className="card-subtitle">{t('dashboard.actionItemsSub')}</span>
          </div>
          <button className="text-btn" onClick={() => navigate('/tasks')}>
            {t('dashboard.tasksWorkspace')} <ChevronRight size={14} className="rtl-flip" />
          </button>
        </div>
        <div className="card-body">
          {safeArray(pendingActions.tasks).length > 0 || safeArray(pendingActions.pendingQuotations).length > 0 ? (
            <div className="pending-actions-split">
              <div className="action-col">
                <h4 className="col-heading">{t('dashboard.myAssignedTasks')}</h4>
                {safeArray(pendingActions.tasks).length > 0 ? (
                  <div className="action-list">
                    {pendingActions.tasks.map((task) => (
                      <div key={task.id} className="action-item" onClick={() => navigate('/tasks')}>
                        <div className="action-bullet"><CheckSquare size={14} /></div>
                        <div className="action-text">
                          <span className="action-title">{task.title}</span>
                          <span className="action-meta">{t('dashboard.taskPriority', { priority: getPriorityLabel(task.priority) })}</span>
                        </div>
                        <span className="action-arrow"><ArrowRight size={14} className="rtl-flip" /></span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState message={t('dashboard.noPendingTasks')} compact={true} />
                )}
              </div>

              <div className="action-col">
                <h4 className="col-heading">{t('dashboard.openQuotations')}</h4>
                {safeArray(pendingActions.pendingQuotations).length > 0 ? (
                  <div className="action-list">
                    {pendingActions.pendingQuotations.map((quote) => (
                      <div key={quote.id} className="action-item" onClick={() => navigate('/finance?tab=Quotations')}>
                        <div className="action-bullet"><ShoppingBag size={14} /></div>
                        <div className="action-text">
                          <span className="action-title">{t('dashboard.quotation')} <span className="num-en">#{quote.id}</span></span>
                          <span className="action-meta">{t('dashboard.quoteValue', { value: formatEgp(quote.total_amount) })}</span>
                        </div>
                        <span className="action-arrow"><ArrowRight size={14} className="rtl-flip" /></span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState message={t('dashboard.noPendingQuotations')} compact={true} />
                )}
              </div>
            </div>
          ) : (
            <EmptyState message={t('dashboard.allActionItemsUpToDate')} compact={true} />
          )}
        </div>
      </div>

      <style>{`
        .gen-dashboard-content {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .dashboard-subbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 4px;
        }
        .dashboard-meta-info h2 {
          font-size: 20px;
          font-weight: 800;
          color: var(--text-main);
          letter-spacing: -0.02em;
          margin: 0;
        }
        .dashboard-meta-info p {
          color: var(--text-muted);
          font-size: 13px;
          margin: 4px 0 0 0;
        }
        .time-filter-select {
          background: var(--bg-card);
          color: var(--text-main);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 600;
          outline: none;
        }
        .dashboard-grid-4 {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 14px;
        }
        .dashboard-row-split {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 900px) {
          .dashboard-row-split {
            grid-template-columns: 1fr;
          }
        }
        .dashboard-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 18px;
          box-shadow: var(--shadow-sm);
        }
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }
        .card-header h3 {
          font-size: 15px;
          font-weight: 700;
          color: var(--text-main);
          margin: 0;
        }
        .card-subtitle {
          font-size: 11.5px;
          color: var(--text-muted);
          display: block;
          margin-top: 2px;
        }
        .text-btn {
          background: transparent;
          border: none;
          color: var(--primary);
          font-weight: 600;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 2px;
          cursor: pointer;
        }
        .sales-trend-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .trend-row {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 12.5px;
        }
        .trend-date {
          width: 90px;
          color: var(--text-muted);
          font-weight: 600;
        }
        .trend-bar-container {
          flex: 1;
          height: 8px;
          background: rgba(0, 0, 0, 0.05);
          border-radius: 4px;
          overflow: hidden;
        }
        .trend-bar-fill {
          height: 100%;
          background: var(--primary);
          border-radius: 4px;
        }
        .trend-amount {
          font-weight: 700;
          color: var(--text-main);
          width: 120px;
          text-align: end;
        }

        .gen-pipeline-flow {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 6px;
        }
        .gen-pipeline-step {
          flex: 1;
          background: rgba(0, 0, 0, 0.02);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          min-width: 90px;
        }
        .step-label {
          font-size: 10.5px;
          font-weight: 700;
          color: var(--text-muted);
        }
        .step-count {
          font-size: 18px;
          font-weight: 800;
          color: var(--text-main);
          margin: 4px 0 2px 0;
        }
        .step-value {
          font-size: 10.5px;
          color: var(--text-muted);
        }

        .rec-pay-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        @media (max-width: 900px) {
          .rec-pay-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .rec-pay-box {
          background: rgba(0, 0, 0, 0.02);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
        }
        .rec-pay-box:hover {
          border-color: var(--primary);
        }
        .rp-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
        }
        .rp-val {
          font-size: 16px;
          font-weight: 800;
          color: var(--text-main);
          margin-top: 4px;
        }
        .rp-sub {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .proc-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .proc-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          background: rgba(0, 0, 0, 0.02);
          border-radius: 8px;
          border: 1px solid var(--border);
          cursor: pointer;
        }
        .proc-item:hover {
          border-color: var(--primary);
        }
        .proc-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-main);
        }
        .proc-badge {
          background: var(--primary);
          color: white;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
        }

        .inv-stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .inv-stat-item {
          background: rgba(0, 0, 0, 0.02);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px;
          display: flex;
          flex-direction: column;
        }
        .inv-label {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 600;
        }
        .inv-val {
          font-size: 16px;
          font-weight: 800;
          margin-top: 2px;
          color: var(--text-main);
        }

        .pending-actions-split {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 768px) {
          .pending-actions-split {
            grid-template-columns: 1fr;
          }
        }
        .col-heading {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-main);
          margin: 0 0 10px 0;
        }
        .action-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .action-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          cursor: pointer;
        }
        .action-item:hover {
          border-color: var(--primary);
        }
        .action-bullet {
          color: var(--primary);
        }
        .action-text {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .action-title {
          font-size: 12.5px;
          font-weight: 600;
          color: var(--text-main);
        }
        .action-meta {
          font-size: 11px;
          color: var(--text-muted);
        }
        .action-arrow {
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
};

export default GeneralDashboard;
