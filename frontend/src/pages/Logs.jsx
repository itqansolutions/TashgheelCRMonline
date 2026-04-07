import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { History, User, Tag, Clock, Info, Shield, Search, Filter } from 'lucide-react';
import DataTable from '../components/Common/DataTable';
import toast from 'react-hot-toast';

const Logs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/logs');
      setLogs(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      toast.error('Failed to load system logs');
    } finally {
      setLoading(false);
    }
  };

  const renderDetails = (details, action) => {
    if (!details) return <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No details</span>;
    
    // For Login/Register
    if (details.email) return <span style={{ fontSize: '13px' }}>User: <strong>{details.email}</strong></span>;
    
    // For Content Actions
    if (action === 'CREATE') return <span style={{ fontSize: '13px' }}>Initial data captured</span>;
    if (action === 'DELETE') return <span style={{ fontSize: '13px' }}>Records: <strong>{details.name || details.title || 'Unknown'}</strong></span>;

    // For Updates (Diff)
    try {
      const changes = typeof details === 'string' ? JSON.parse(details) : details;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {Object.entries(changes).map(([field, change]) => (
            <div key={field} style={{ fontSize: '12px', background: '#f8fafc', padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
              <strong style={{ color: 'var(--primary)', textTransform: 'capitalize' }}>{field.replace('_', ' ')}:</strong>{' '}
              <span style={{ color: '#dc2626', textDecoration: 'line-through' }}>{String(change.old)}</span>{' '}
              <span style={{ color: '#16a34a', fontWeight: 'bold' }}>➔ {String(change.new)}</span>
            </div>
          ))}
        </div>
      );
    } catch (e) {
      return <span style={{ fontSize: '12px' }}>{JSON.stringify(details)}</span>;
    }
  };

  const columns = [
    { 
      key: 'created_at', 
      label: 'Timestamp',
      render: (val) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
          <Clock size={14} />
          {new Date(val).toLocaleString()}
        </div>
      )
    },
    { 
      key: 'user_name', 
      label: 'Operator',
      render: (val, row) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: '600', fontSize: '14px' }}>{val || 'System'}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{row.user_email}</span>
        </div>
      )
    },
    { 
      key: 'action', 
      label: 'Action',
      render: (val) => (
        <span className="status-badge" style={{ 
          background: val === 'DELETE' ? '#fef2f2' : val === 'CREATE' ? '#f0fdf4' : val === 'LOGIN' ? '#eff6ff' : '#fff7ed',
          color: val === 'DELETE' ? '#dc2626' : val === 'CREATE' ? '#16a34a' : val === 'LOGIN' ? '#2563eb' : '#d97706',
          fontWeight: '700',
          fontSize: '11px'
        }}>
          {val}
        </span>
      )
    },
    { 
      key: 'entity_type', 
      label: 'Module',
      render: (val) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '500' }}>
          <Tag size={12} style={{ color: 'var(--primary)' }} />
          {val}
        </div>
      )
    },
    { 
      key: 'details', 
      label: 'Details / Changes',
      render: (val, row) => renderDetails(val, row.action)
    }
  ];

  return (
    <div className="logs-page">
      <div className="page-header" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '800' }}>System Audit Logs</h2>
          <p style={{ color: 'var(--text-muted)' }}>Monitor all administrative actions and data changes across the CRM.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
           <button label="refresh history" className="btn-secondary" onClick={fetchLogs} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
             <History size={16} /> Refresh
           </button>
        </div>
      </div>

      <DataTable 
        title="Recent Activity"
        columns={columns}
        data={logs}
        loading={loading}
      />
    </div>
  );
};

export default Logs;
