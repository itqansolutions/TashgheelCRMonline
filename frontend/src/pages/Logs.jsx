import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { 
  History, User, Tag, Clock, Info, Shield, Search, Filter, 
  Download, ChevronDown, Eye, AlertCircle, CheckCircle, Activity,
  ArrowRight, X
} from 'lucide-react';
import DataTable from '../components/Common/DataTable';
import Modal from '../components/Common/Modal';
import toast from 'react-hot-toast';

const Logs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState([]);
  
  // Filters
  const [filters, setFilters] = useState({
    user_id: '',
    action: '',
    entity_type: '',
    level: '',
    from: '',
    to: '',
    limit: 50,
    offset: 0
  });

  // Modal State
  const [selectedLog, setSelectedLog] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchLogs();
    fetchUsers();
  }, [filters.offset, filters.limit]);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data.data || []);
    } catch (err) {
      console.error('Failed to load users for filter');
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, val]) => {
        if (val) queryParams.append(key, val);
      });

      const res = await api.get(`/logs?${queryParams.toString()}`);
      setLogs(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      toast.error('Failed to load system logs');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value, offset: 0 }));
  };

  const resetFilters = () => {
    setFilters({
      user_id: '',
      action: '',
      entity_type: '',
      level: '',
      from: '',
      to: '',
      limit: 50,
      offset: 0
    });
  };

  const exportToCSV = () => {
    if (logs.length === 0) return toast.error('No logs to export');
    
    const headers = ['Timestamp', 'Operator', 'Action', 'Module', 'Severity', 'Details'];
    const rows = logs.map(log => [
      new Date(log.created_at).toLocaleString(),
      log.user_name || 'System',
      log.action,
      log.entity_type,
      log.level,
      JSON.stringify(log.details)
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers, ...rows].map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `system_audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Logs exported successfully');
  };

  const getActionColor = (action) => {
    const colors = {
      CREATE: { bg: '#f0fdf4', text: '#16a34a' },
      UPDATE: { bg: '#eff6ff', text: '#2563eb' },
      DELETE: { bg: '#fef2f2', text: '#dc2626' },
      LOGIN: { bg: '#f5f3ff', text: '#7c3aed' },
      LOGIN_FAIL: { bg: '#fff1f2', text: '#e11d48' },
      STAGE_CHANGE: { bg: '#fff7ed', text: '#d97706' }
    };
    return colors[action] || { bg: '#f8fafc', text: '#64748b' };
  };

  const getLevelColor = (level) => {
    const colors = {
      INFO: { bg: '#f8fafc', text: '#64748b', icon: <CheckCircle size={14} /> },
      WARNING: { bg: '#fffbeb', text: '#d97706', icon: <Info size={14} /> },
      CRITICAL: { bg: '#fef2f2', text: '#dc2626', icon: <AlertCircle size={14} /> }
    };
    return colors[level] || colors.INFO;
  };

  const renderDiffView = (details) => {
    if (!details || (!details.before && !details.after)) {
      return <pre style={{ fontSize: '12px', background: '#f1f5f9', padding: '10px', borderRadius: '8px' }}>{JSON.stringify(details, null, 2)}</pre>;
    }

    const before = details.before || {};
    const after = details.after || {};
    const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

    return (
      <div className="diff-viewer">
        <div className="diff-header">
          <div className="diff-col">Previous State</div>
          <div className="diff-col">New State</div>
        </div>
        <div className="diff-body">
          {allKeys.map(key => (
            <div key={key} className="diff-row">
              <div className="diff-key">{key.replace('_', ' ')}</div>
              <div className="diff-compare">
                <div className="diff-val old">{String(before[key] !== undefined ? before[key] : '-')}</div>
                <ArrowRight size={14} style={{ color: '#94a3b8' }} />
                <div className="diff-val new">{String(after[key] !== undefined ? after[key] : '-')}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const columns = [
    { 
      key: 'created_at', 
      label: 'Timestamp',
      render: (val) => (
        <div style={{ display: 'flex', flexDirection: 'column', color: '#475569' }}>
          <span style={{ fontSize: '13px', fontWeight: '600' }}>{new Date(val).toLocaleDateString()}</span>
          <span style={{ fontSize: '11px' }}>{new Date(val).toLocaleTimeString()}</span>
        </div>
      )
    },
    { 
      key: 'user_name', 
      label: 'Operator',
      render: (val, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f633, #3b82f611)', display: 'flex', alignItems: 'center', justify: 'center', fontSize: '12px', fontWeight: 'bold', color: '#3b82f6' }}>
            {val ? val.charAt(0).toUpperCase() : 'S'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: '600' }}>{val || 'System'}</span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{row.user_email || 'Automation'}</span>
          </div>
        </div>
      )
    },
    { 
      key: 'level', 
      label: 'Severity',
      render: (val) => {
        const conf = getLevelColor(val);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: conf.text, fontWeight: '700', fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: conf.bg, border: `1px solid ${conf.text}22` }}>
            {conf.icon} {val}
          </div>
        )
      }
    },
    { 
      key: 'action', 
      label: 'Action',
      render: (val) => {
        const conf = getActionColor(val);
        return (
          <span className="status-badge" style={{ background: conf.bg, color: conf.text, fontWeight: '800' }}>{val}</span>
        )
      }
    },
    { 
        key: 'entity_type', 
        label: 'Module',
        render: (val) => <span style={{ fontWeight: '500', color: '#1e293b' }}>{val}</span>
    }
  ];

  const todayLogs = (logs || []).filter(l => l.created_at && new Date(l.created_at).toDateString() === new Date().toDateString());
  const criticalCount = total > 0 ? (logs || []).filter(l => l.level === 'CRITICAL').length : 0;

  return (
    <div className="logs-page">
      <style>{`
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .stat-card { background: white; padding: 20px; border-radius: 16px; border: 1px solid var(--border); display: flex; align-items: center; gap: 15px; }
        .stat-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify: center; }
        
        .filter-section { background: white; padding: 20px; border-radius: 16px; border: 1px solid var(--border); margin-bottom: 24px; }
        .filter-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; align-items: end; }
        .filter-group label { display: block; font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 6px; text-transform: uppercase; }
        .filter-group select, .filter-group input { width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); outline: none; transition: 0.2s; font-size: 13px; }
        .filter-group select:focus, .filter-group input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
        
        .diff-viewer { display: flex; flexDirection: column; gap: 12px; }
        .diff-header { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 10px; font-weight: 800; font-size: 12px; color: #64748b; padding: 0 100px 0 150px; }
        .diff-row { display: grid; grid-template-columns: 150px 1fr; gap: 20px; align-items: center; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
        .diff-key { font-weight: 700; font-size: 12px; color: #1e293b; text-transform: capitalize; }
        .diff-compare { display: grid; grid-template-columns: 1fr 20px 1fr; gap: 10px; align-items: center; }
        .diff-val { font-family: monospace; font-size: 12px; padding: 4px 8px; border-radius: 4px; overflow-wrap: anywhere; }
        .diff-val.old { background: #fee2e2; color: #991b1b; text-decoration: line-through; }
        .diff-val.new { background: #dcfce7; color: #166534; font-weight: bold; }

        .btn-refresh { background: #f1f5f9; color: #475569; padding: 8px 16px; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; cursor: pointer; border: none; }
        .btn-export { background: #1e293b; color: white; padding: 8px 16px; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; cursor: pointer; border: none; }
      `}</style>

      <div className="page-header" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: '900', letterSpacing: '-0.02em' }}>Audit & Monitoring</h2>
          <p style={{ color: 'var(--text-muted)' }}>Real-time forensic visibility across the CRM ecosystem.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-refresh" onClick={fetchLogs}><History size={16} /> Refresh</button>
          <button className="btn-export" onClick={exportToCSV}><Download size={16} /> Export CSV</button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}><Activity size={24} /></div>
          <div><div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>TOTAL EVENTS</div><div style={{ fontSize: '20px', fontWeight: '800' }}>{total}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}><CheckCircle size={24} /></div>
          <div><div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>TODAY'S ACTIVITY</div><div style={{ fontSize: '20px', fontWeight: '800' }}>{todayLogs.length}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#fef2f2', color: '#dc2626' }}><AlertCircle size={24} /></div>
          <div><div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>CRITICAL ALERTS</div><div style={{ fontSize: '20px', fontWeight: '800', color: criticalCount > 0 ? '#dc2626' : 'inherit' }}>{criticalCount}</div></div>
        </div>
      </div>

      <div className="filter-section">
        <div className="filter-grid">
          <div className="filter-group">
            <label>Operator</label>
            <select name="user_id" value={filters.user_id} onChange={handleFilterChange}>
              <option value="">All Operators</option>
              {(users || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Action</label>
            <select name="action" value={filters.action} onChange={handleFilterChange}>
              <option value="">All Actions</option>
              <option value="LOGIN">LOGIN</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="STAGE_CHANGE">STAGE CHANGE</option>
              <option value="BILLING">BILLING</option>
              <option value="PAYMENT">PAYMENT</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Severity</label>
            <select name="level" value={filters.level} onChange={handleFilterChange}>
              <option value="">All Levels</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Date From</label>
            <input type="date" name="from" value={filters.from} onChange={handleFilterChange} />
          </div>
          <div className="filter-group">
            <label>Date To</label>
            <input type="date" name="to" value={filters.to} onChange={handleFilterChange} />
          </div>
          <div className="filter-group" style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-secondary" onClick={fetchLogs} style={{ height: '36px', width: '100px', fontWeight: '700' }}>Apply</button>
            <button className="btn-cancel" onClick={resetFilters} style={{ height: '36px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}><X size={16} /></button>
          </div>
        </div>
      </div>

      <DataTable 
        title="Audit Trail"
        columns={columns}
        data={logs}
        loading={loading}
        actions={(row) => (
          <button 
            label="view log details"
            className="btn-icon" 
            onClick={() => {
              setSelectedLog(row);
              setIsModalOpen(true);
            }}
            title="Inspect Data"
          >
            <Eye size={16} />
          </button>
        )}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Log Inspection: ${selectedLog?.action} on ${selectedLog?.entity_type}`}
        width="800px"
        footer={<button className="btn-cancel" onClick={() => setIsModalOpen(false)}>Close</button>}
      >
        {selectedLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', padding: '15px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
               <div><label style={{ fontSize: '10px', display: 'block', color: '#64748b', fontWeight: '800' }}>OPERATOR</label><strong>{selectedLog.user_name || 'System'}</strong></div>
               <div><label style={{ fontSize: '10px', display: 'block', color: '#64748b', fontWeight: '800' }}>IP ADDRESS</label><strong>{selectedLog.ip_address || 'Internal'}</strong></div>
               <div><label style={{ fontSize: '10px', display: 'block', color: '#64748b', fontWeight: '800' }}>TIMESTAMP</label><strong>{new Date(selectedLog.created_at).toLocaleString()}</strong></div>
             </div>
             
             <div>
               <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <Tag size={16} style={{ color: 'var(--primary)' }} /> Data Delta / Details
               </h4>
               {renderDiffView(selectedLog.details)}
             </div>

             <div style={{ fontSize: '11px', color: '#64748b', padding: '10px', background: '#f1f5f9', borderRadius: '8px' }}>
               <strong>User Agent:</strong> {selectedLog.user_agent}
             </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Logs;
