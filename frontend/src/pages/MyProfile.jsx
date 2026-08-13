import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import toast from 'react-hot-toast';
import { UserCircle, CheckSquare, Handshake, Users, Building2, LayoutGrid, List, ChevronLeft, ChevronRight, Activity } from 'lucide-react';
import DataTable from '../components/Common/DataTable';

const MyProfile = () => {
  const { user } = useAuth();
  const { taskStatuses } = useData();
  const isRealEstate = user?.template_name === 'real_estate';

  const [activeTab, setActiveTab] = useState('tasks');
  const [data, setData] = useState({ tasks: [], deals: [], customers: [], units: [] });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
  const [loading, setLoading] = useState(true);

  // Re-fetch when tab or page changes
  useEffect(() => {
    fetchProfileData();
  }, [activeTab, pagination.page]);

  const fetchProfileData = async () => {
    setLoading(true);
    try {
      const endpointMap = {
        'tasks': '/profile/tasks',
        'deals': '/profile/deals',
        'customers': '/profile/customers',
        'units': '/profile/units'
      };
      
      const res = await api.get(`${endpointMap[activeTab]}?page=${pagination.page}&limit=${pagination.limit}`);
      
      setData(prev => ({ ...prev, [activeTab]: res.data.data }));
      setPagination(prev => ({ 
        ...prev, 
        total: res.data?.meta?.total ?? (res.data?.data?.length || 0),
        page: res.data?.meta?.page ?? 1
      }));
    } catch (err) {
      toast.error(`Failed to load ${activeTab}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const TABS = [
    { id: 'tasks', label: 'My Tasks', icon: <CheckSquare size={16} /> },
    { id: 'deals', label: 'My Deals', icon: <Handshake size={16} /> },
    { id: 'customers', label: 'My Customers', icon: <Users size={16} /> },
    ...(isRealEstate ? [{ id: 'units', label: 'My Units', icon: <Building2 size={16} /> }] : [])
  ];

  const renderTabContent = () => {
    if (loading) {
      return (
        <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
          <Activity size={32} style={{ animation: 'spin 2s linear infinite' }} />
          <p style={{ marginTop: '16px', fontWeight: 600 }}>Loading data...</p>
        </div>
      );
    }

    if (activeTab === 'tasks') {
      const columns = [
        { key: 'title', label: 'Task Title', render: (val) => <span style={{ fontWeight: 700, color: '#1e293b' }}>{val}</span> },
        { key: 'priority', label: 'Priority', render: (val) => <span style={{ textTransform: 'capitalize' }}>{val}</span> },
        { 
          key: 'status_id', 
          label: 'Status', 
          render: (val) => {
            const status = taskStatuses.find(s => s.id === val) || { name: 'Todo', color: '#64748b' };
            return <span style={{ background: status.color, color: 'white', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800 }}>{status.name}</span>;
          }
        },
        { key: 'due_date', label: 'Due Date', render: (val) => val ? new Date(val).toLocaleDateString() : '—' }
      ];
      return <DataTable columns={columns} data={data.tasks} />;
    }

    if (activeTab === 'deals') {
      const columns = [
        { key: 'title', label: 'Deal Title', render: (val) => <span style={{ fontWeight: 700, color: '#1e293b' }}>{val}</span> },
        { key: 'value', label: 'Value', render: (val) => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{val} EGP</span> },
        { 
          key: 'pipeline_stage', 
          label: 'Stage', 
          render: (val) => <span style={{ textTransform: 'capitalize', fontWeight: 600, color: '#475569' }}>{val}</span> 
        },
        { key: 'expected_close_date', label: 'Close Date', render: (val) => val ? new Date(val).toLocaleDateString() : '—' }
      ];
      return <DataTable columns={columns} data={data.deals} />;
    }

    if (activeTab === 'customers') {
      const columns = [
        { key: 'name', label: 'Name', render: (val) => <span style={{ fontWeight: 700, color: '#1e293b' }}>{val}</span> },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'created_at', label: 'Added On', render: (val) => new Date(val).toLocaleDateString() }
      ];
      return <DataTable columns={columns} data={data.customers} />;
    }

    if (activeTab === 'units') {
      const columns = [
        { key: 'unit_number', label: 'Unit No.', render: (val) => <span style={{ fontWeight: 700, color: '#1e293b' }}>{val}</span> },
        { key: 'project_name', label: 'Project' },
        { key: 'price', label: 'Price', render: (val) => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{Number(val).toLocaleString()} EGP</span> },
        { 
          key: 'status', 
          label: 'Status',
          render: (val) => (
            <span style={{ 
              background: val === 'Available' ? '#dcfce7' : '#f1f5f9', 
              color: val === 'Available' ? '#16a34a' : '#475569', 
              padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 
            }}>
              {val}
            </span>
          )
        }
      ];
      return <DataTable columns={columns} data={data.units} />;
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= Math.ceil(pagination.total / pagination.limit)) {
      setPagination(prev => ({ ...prev, page: newPage }));
    }
  };

  return (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', marginBottom: '32px' }}>
        <div style={{ width: '80px', height: '80px', borderRadius: '20px', background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 10px 25px rgba(99, 102, 241, 0.3)' }}>
          <UserCircle size={40} />
        </div>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 900, color: '#1e293b', margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>
            {user?.name || 'Employee Profile'}
          </h1>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {user?.role === 'manager' ? 'Team Manager' : user?.role || 'Employee'}
            </span>
            <span style={{ color: '#94a3b8', fontSize: '14px', fontWeight: 600 }}>
              {user?.email}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginBottom: '24px' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setPagination({ ...pagination, page: 1 }); }}
            style={{
              padding: '12px 24px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #6366f1' : '2px solid transparent',
              color: activeTab === tab.id ? '#6366f1' : '#64748b',
              fontWeight: 800,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginBottom: '-2px'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fbfcfd' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
            {TABS.find(t => t.id === activeTab)?.label}
          </h3>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '4px 12px', borderRadius: '20px' }}>
            Total: {pagination.total}
          </span>
        </div>
        
        {renderTabContent()}

        {/* Pagination */}
        {!loading && pagination.total > 0 && (
          <div style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fbfcfd' }}>
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
              Showing Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                style={{ padding: '6px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: pagination.page === 1 ? 'not-allowed' : 'pointer', opacity: pagination.page === 1 ? 0.5 : 1, display: 'flex', alignItems: 'center' }}
              >
                <ChevronLeft size={16} />
              </button>
              <button 
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
                style={{ padding: '6px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: pagination.page >= Math.ceil(pagination.total / pagination.limit) ? 'not-allowed' : 'pointer', opacity: pagination.page >= Math.ceil(pagination.total / pagination.limit) ? 0.5 : 1, display: 'flex', alignItems: 'center' }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyProfile;
