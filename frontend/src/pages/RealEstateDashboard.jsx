import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Building2, Key, Calendar, 
  Clock, CheckCircle2, ChevronRight,
  TrendingUp, Layers
} from 'lucide-react';
import KPICard from '../components/Dashboard/KPICard';
import EmptyState from '../components/Dashboard/EmptyState';
import { safeArray } from '../utils/dataUtils';

const RealEstateDashboard = ({ data, timeFilter, setTimeFilter, modules }) => {
  const navigate = useNavigate();

  const unitsOverview = data?.unitsOverview || { total: 0, available: 0, reserved: 0, sold: 0 };
  const pipeline = data?.pipeline || { stages: [], counts: {}, values: {}, activeDealsCount: 0 };
  const expiringReservations = safeArray(data?.expiringReservations);
  const contractsAndInstallments = data?.contractsAndInstallments || {
    contracts: { totalContracts: 0, contractsThisMonth: 0, totalContractedValue: 0, contractedValueThisMonth: 0 },
    installments: { dueToday: 0, dueThisWeek: 0, overdue: 0, overdueCount: 0, totalPaidInSchedules: 0 }
  };
  const collectionsFlow = data?.collectionsFlow || { accessible: false };
  const commissionsOverview = data?.commissionsOverview || { topAgents: [], commissions: null };
  const upcomingHandovers = safeArray(data?.upcomingHandovers);

  const formatEgp = (num) => `${(num || 0).toLocaleString()} EGP`;

  return (
    <div className="re-dashboard-content">
      {/* HEADER CONTROLS */}
      <div className="dashboard-subbar">
        <div className="dashboard-meta-info">
          <h2>Real Estate Management Cockpit</h2>
          <p>Portfolio overview, active pipeline, payment plans, and handover operations.</p>
        </div>
        <div className="dashboard-actions">
          <select 
            value={timeFilter} 
            onChange={(e) => setTimeFilter(e.target.value)}
            className="time-filter-select"
          >
            <option value="TODAY">Today</option>
            <option value="THIS_WEEK">This Week</option>
            <option value="THIS_MONTH">This Month</option>
          </select>
        </div>
      </div>

      {/* SECTION A: KPI CARDS */}
      <div className="dashboard-grid-4">
        <KPICard 
          title="Available Units" 
          value={unitsOverview.available}
          icon={<Building2 size={20} />}
          color="success"
          subtitle={`Out of ${unitsOverview.total} total inventory`}
          onClick={() => navigate('/units-registry')}
        />
        <KPICard 
          title="Reserved Units" 
          value={unitsOverview.reserved}
          icon={<Clock size={20} />}
          color="warning"
          subtitle="Awaiting contract signing"
          onClick={() => navigate('/deals?tab=reservations')}
        />
        <KPICard 
          title="Sold Units" 
          value={unitsOverview.sold}
          icon={<CheckCircle2 size={20} />}
          color="info"
          subtitle="Finalized property acquisitions"
          onClick={() => navigate('/units-registry')}
        />
        <KPICard 
          title="Active Deals" 
          value={pipeline.activeDealsCount}
          icon={<TrendingUp size={20} />}
          color="primary"
          subtitle="Pipeline opportunities in progress"
          onClick={() => navigate('/deals')}
        />
        {collectionsFlow.accessible && (
          <>
            <KPICard 
              title="Contracted Value" 
              value={formatEgp(collectionsFlow.contractedValue)}
              icon={<Layers size={20} />}
              color="purple"
              subtitle="From formal binding contracts"
              onClick={() => navigate('/deals?tab=contracts')}
            />
            <KPICard 
              title="Collected Amount" 
              value={formatEgp(collectionsFlow.collectedAmount)}
              icon={<CheckCircle2 size={20} />}
              color="success"
              subtitle="Verified receipts in finance vouchers"
              onClick={() => navigate('/finance')}
            />
          </>
        )}
      </div>

      {/* SECTION B & C: UNIT STATUS + REAL ESTATE SALES PIPELINE */}
      <div className="dashboard-row-split">
        {/* Unit Status Breakdown */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3>Inventory Status</h3>
            <button className="text-btn" onClick={() => navigate('/units-registry')}>
              View Units <ChevronRight size={14} />
            </button>
          </div>
          <div className="card-body">
            <div className="unit-status-bar">
              {unitsOverview.total > 0 ? (
                <>
                  <div 
                    className="bar-segment bar-avail" 
                    style={{ width: `${(unitsOverview.available / unitsOverview.total) * 100}%` }} 
                    title={`Available: ${unitsOverview.available}`}
                  />
                  <div 
                    className="bar-segment bar-res" 
                    style={{ width: `${(unitsOverview.reserved / unitsOverview.total) * 100}%` }} 
                    title={`Reserved: ${unitsOverview.reserved}`}
                  />
                  <div 
                    className="bar-segment bar-sold" 
                    style={{ width: `${(unitsOverview.sold / unitsOverview.total) * 100}%` }} 
                    title={`Sold: ${unitsOverview.sold}`}
                  />
                </>
              ) : (
                <div className="bar-segment bar-empty" style={{ width: '100%' }} />
              )}
            </div>
            <div className="unit-legend">
              <div className="legend-item" onClick={() => navigate('/units-registry')}>
                <span className="dot dot-avail" />
                <span>Available ({unitsOverview.available})</span>
              </div>
              <div className="legend-item" onClick={() => navigate('/deals?tab=reservations')}>
                <span className="dot dot-res" />
                <span>Reserved ({unitsOverview.reserved})</span>
              </div>
              <div className="legend-item" onClick={() => navigate('/units-registry')}>
                <span className="dot dot-sold" />
                <span>Sold ({unitsOverview.sold})</span>
              </div>
            </div>
          </div>
        </div>

        {/* Real Estate Pipeline (Lead -> Interested -> Site Visit -> Negotiation -> Closed) */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3>Deal Pipeline</h3>
            <button className="text-btn" onClick={() => navigate('/deals')}>
              Open Deals <ChevronRight size={14} />
            </button>
          </div>
          <div className="card-body">
            <div className="re-pipeline-flow">
              {pipeline.stages.map((stg) => {
                const count = pipeline.counts[stg] || 0;
                const val = pipeline.values[stg] || 0;
                return (
                  <div key={stg} className="pipeline-step-item">
                    <span className="step-label">{stg}</span>
                    <span className="step-count">{count}</span>
                    <span className="step-value">{val > 0 ? formatEgp(val) : '—'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION D: EXPIRING RESERVATIONS */}
      <div className="dashboard-card">
        <div className="card-header">
          <div>
            <h3>Expiring Reservations</h3>
            <span className="card-subtitle">Units currently on temporary hold requiring customer commitment</span>
          </div>
          <button className="text-btn" onClick={() => navigate('/deals?tab=reservations')}>
            Manage Reservations <ChevronRight size={14} />
          </button>
        </div>
        <div className="card-body">
          {expiringReservations.length > 0 ? (
            <div className="table-responsive">
              <table className="compact-table">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Project</th>
                    <th>Client</th>
                    <th>Price</th>
                    <th>Reservation Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringReservations.map((resItem) => (
                    <tr key={resItem.unitId}>
                      <td className="font-semibold">{resItem.unitNumber}</td>
                      <td>{resItem.projectName}</td>
                      <td>
                        <div className="client-cell">
                          <span>{resItem.customerName}</span>
                          {resItem.customerPhone && <span className="cell-sub">{resItem.customerPhone}</span>}
                        </div>
                      </td>
                      <td>{formatEgp(resItem.unitPrice)}</td>
                      <td>
                        <span className={`status-pill ${resItem.isExpired ? 'pill-expired' : 'pill-active'}`}>
                          {resItem.isExpired 
                            ? 'Expired' 
                            : resItem.remainingMinutes 
                              ? `${Math.floor(resItem.remainingMinutes / 60)}h ${resItem.remainingMinutes % 60}m remaining` 
                              : 'Pending Confirmation'}
                        </span>
                      </td>
                      <td>
                        <button 
                          className="table-action-btn"
                          onClick={() => navigate('/deals?tab=reservations')}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="No reservations approaching expiration." />
          )}
        </div>
      </div>

      {/* SECTION E & F: CONTRACTS & INSTALLMENTS + FINANCIAL COLLECTIONS */}
      <div className="dashboard-row-split">
        {/* Contracts & Installments Schedule */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3>Contracts & Installments</h3>
            <button className="text-btn" onClick={() => navigate('/deals?tab=contracts')}>
              Contracts Workspace <ChevronRight size={14} />
            </button>
          </div>
          <div className="card-body">
            <div className="stats-subgrid">
              <div className="stat-box" onClick={() => navigate('/deals?tab=contracts')}>
                <span className="stat-label">Contracts This Month</span>
                <span className="stat-val">{contractsAndInstallments.contracts.contractsThisMonth}</span>
                <span className="stat-sub">{formatEgp(contractsAndInstallments.contracts.contractedValueThisMonth)}</span>
              </div>
              <div className="stat-box" onClick={() => navigate('/deals?tab=installments')}>
                <span className="stat-label">Installments Due Today</span>
                <span className="stat-val">{formatEgp(contractsAndInstallments.installments.dueToday)}</span>
                <span className="stat-sub">Immediate collections</span>
              </div>
              <div className="stat-box" onClick={() => navigate('/deals?tab=installments')}>
                <span className="stat-label">Due This Week</span>
                <span className="stat-val">{formatEgp(contractsAndInstallments.installments.dueThisWeek)}</span>
                <span className="stat-sub">Upcoming cash inflows</span>
              </div>
              <div className="stat-box box-danger" onClick={() => navigate('/deals?tab=installments')}>
                <span className="stat-label">Overdue Schedule</span>
                <span className="stat-val">{formatEgp(contractsAndInstallments.installments.overdue)}</span>
                <span className="stat-sub">{contractsAndInstallments.installments.overdueCount} installments past due</span>
              </div>
            </div>
          </div>
        </div>

        {/* Collections Overview */}
        {collectionsFlow.accessible ? (
          <div className="dashboard-card">
            <div className="card-header">
              <h3>Financial Collections Flow</h3>
              <button className="text-btn" onClick={() => navigate('/finance')}>
                Finance Vouchers <ChevronRight size={14} />
              </button>
            </div>
            <div className="card-body">
              <div className="collections-progress">
                <div className="coll-row">
                  <span>Contracted Value</span>
                  <span className="font-semibold">{formatEgp(collectionsFlow.contractedValue)}</span>
                </div>
                <div className="coll-row text-success">
                  <span>Actual Collected (Vouchers)</span>
                  <span className="font-semibold">{formatEgp(collectionsFlow.collectedAmount)}</span>
                </div>
                <div className="coll-row text-muted">
                  <span>Outstanding Balance</span>
                  <span className="font-semibold">{formatEgp(collectionsFlow.outstandingAmount)}</span>
                </div>
                <div className="coll-row text-danger">
                  <span>Overdue Installments</span>
                  <span className="font-semibold">{formatEgp(collectionsFlow.overdueAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="dashboard-card">
            <div className="card-header">
              <h3>Financial Collections</h3>
            </div>
            <div className="card-body">
              <EmptyState message="Financial information is restricted for your role." />
            </div>
          </div>
        )}
      </div>

      {/* SECTION G & H: TOP SALESMEN / COMMISSIONS + UPCOMING HANDOVER */}
      <div className="dashboard-row-split">
        {/* Top Salesmen */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3>Sales Representatives</h3>
            <button className="text-btn" onClick={() => navigate('/deals?tab=commissions')}>
              Commissions Workspace <ChevronRight size={14} />
            </button>
          </div>
          <div className="card-body">
            {commissionsOverview.topAgents?.length > 0 ? (
              <div className="agents-list">
                {commissionsOverview.topAgents.map((ag, idx) => (
                  <div key={ag.userId} className="agent-item">
                    <div className="agent-rank">{idx + 1}</div>
                    <div className="agent-meta">
                      <span className="agent-name">{ag.name}</span>
                      <span className="agent-deals">{ag.dealsCount} closed deals</span>
                    </div>
                    <span className="agent-val">{formatEgp(ag.dealValue)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No sales performance data available yet." />
            )}
          </div>
        </div>

        {/* Upcoming Handover */}
        <div className="dashboard-card">
          <div className="card-header">
            <div>
              <h3>Upcoming Deliveries</h3>
              <span className="card-subtitle">Scheduled unit keys and snagging handovers</span>
            </div>
            <button className="text-btn" onClick={() => navigate('/deals?tab=handover')}>
              Handover Workspace <ChevronRight size={14} />
            </button>
          </div>
          <div className="card-body">
            {upcomingHandovers.length > 0 ? (
              <div className="handovers-list">
                {upcomingHandovers.map((h) => (
                  <div key={h.id} className="handover-item" onClick={() => navigate('/deals?tab=handover')}>
                    <div className="ho-icon"><Key size={16} /></div>
                    <div className="ho-details">
                      <span className="ho-unit">{h.unitNumber} ({h.projectName})</span>
                      <span className="ho-client">{h.customerName}</span>
                    </div>
                    <div className="ho-date-meta">
                      <span className="ho-date">{h.scheduledDate ? new Date(h.scheduledDate).toLocaleDateString() : 'TBD'}</span>
                      <span className="ho-status">{h.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No pending unit deliveries scheduled." />
            )}
          </div>
        </div>
      </div>

      <style>{`
        .re-dashboard-content {
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
        .unit-status-bar {
          display: flex;
          height: 12px;
          border-radius: 6px;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.05);
          margin: 12px 0 16px 0;
        }
        .bar-segment {
          height: 100%;
          transition: width 0.3s;
        }
        .bar-avail { background: #10b981; }
        .bar-res { background: #f59e0b; }
        .bar-sold { background: #3b82f6; }
        .bar-empty { background: rgba(0, 0, 0, 0.08); }
        .unit-legend {
          display: flex;
          gap: 16px;
          justify-content: space-around;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-main);
          cursor: pointer;
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .dot-avail { background: #10b981; }
        .dot-res { background: #f59e0b; }
        .dot-sold { background: #3b82f6; }

        .re-pipeline-flow {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 6px;
        }
        .pipeline-step-item {
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
          font-size: 11px;
          font-weight: 600;
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

        .compact-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12.5px;
        }
        .compact-table th {
          text-align: left;
          padding: 8px 10px;
          color: var(--text-muted);
          font-weight: 600;
          border-bottom: 1px solid var(--border);
        }
        .compact-table td {
          padding: 10px;
          border-bottom: 1px solid var(--border);
        }
        .client-cell {
          display: flex;
          flex-direction: column;
        }
        .cell-sub {
          font-size: 11px;
          color: var(--text-muted);
        }
        .status-pill {
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
        }
        .pill-active {
          background: rgba(245, 158, 11, 0.12);
          color: #d97706;
        }
        .pill-expired {
          background: rgba(239, 68, 68, 0.12);
          color: #dc2626;
        }
        .table-action-btn {
          padding: 4px 10px;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: transparent;
          font-size: 11.5px;
          font-weight: 600;
          color: var(--primary);
          cursor: pointer;
        }
        .table-action-btn:hover {
          background: rgba(79, 70, 229, 0.06);
        }

        .stats-subgrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .stat-box {
          background: rgba(0, 0, 0, 0.02);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px 12px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
        }
        .stat-box:hover {
          border-color: var(--primary);
        }
        .box-danger {
          border-color: rgba(239, 68, 68, 0.3);
          background: rgba(239, 68, 68, 0.02);
        }
        .stat-label {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 600;
        }
        .stat-val {
          font-size: 16px;
          font-weight: 800;
          color: var(--text-main);
          margin-top: 2px;
        }
        .stat-sub {
          font-size: 10.5px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .collections-progress {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .coll-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          border-radius: 6px;
          background: rgba(0, 0, 0, 0.02);
          font-size: 13px;
        }
        .text-success { color: #10b981; }
        .text-danger { color: #ef4444; }

        .agents-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .agent-item {
          display: flex;
          align-items: center;
          padding: 8px 10px;
          border-radius: 6px;
          background: rgba(0, 0, 0, 0.02);
          font-size: 12.5px;
        }
        .agent-rank {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--primary);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          margin-right: 10px;
        }
        .agent-meta {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .agent-name {
          font-weight: 700;
          color: var(--text-main);
        }
        .agent-deals {
          font-size: 11px;
          color: var(--text-muted);
        }
        .agent-val {
          font-weight: 800;
          color: var(--primary);
        }

        .handovers-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .handover-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 6px;
          border: 1px solid var(--border);
          cursor: pointer;
        }
        .handover-item:hover {
          border-color: var(--primary);
        }
        .ho-icon {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          background: rgba(79, 70, 229, 0.1);
          color: var(--primary);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ho-details {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .ho-unit {
          font-weight: 700;
          font-size: 12.5px;
          color: var(--text-main);
        }
        .ho-client {
          font-size: 11px;
          color: var(--text-muted);
        }
        .ho-date-meta {
          text-align: right;
          display: flex;
          flex-direction: column;
        }
        .ho-date {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-main);
        }
        .ho-status {
          font-size: 10.5px;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
};

export default RealEstateDashboard;
