import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { User, Shield, Briefcase, Plus, Save, X, Lock, CheckCircle } from 'lucide-react';
import DataTable from '../components/Common/DataTable';
import Modal from '../components/Common/Modal';

const ALL_PAGES = [
  { id: '/dashboard', label: 'Dashboard' },
  { id: '/customers', label: 'Customers' },
  { id: '/products', label: 'Products' },
  { id: '/deals', label: 'Deals' },
  { id: '/tasks', label: 'Tasks' },
  { id: '/accounting', label: 'Accounting' },
  { id: '/files', label: 'Files' },
  { id: '/reports', label: 'Reports' },
  { id: '/employees', label: 'Employees' }
];

const Employees = () => {
  const { users, fetchUsers, departments, fetchDepartments } = useData();
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isPermModalOpen, setIsPermModalOpen] = useState(false);
  const [userPermissions, setUserPermissions] = useState([]);

  useEffect(() => {
    fetchUsers();
    fetchDepartments();
  }, []);

  const openPermissions = async (user) => {
    setSelectedUser(user);
    setLoading(true);
    try {
      // Fetch permissions for this specific user
      const res = await api.get(`/users/${user.id}/permissions`);
      setUserPermissions(res.data.data.map(p => p.page_path));
      setIsPermModalOpen(true);
    } catch (err) {
      toast.error('Failed to load user permissions');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePermission = (path) => {
    setUserPermissions(prev => 
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const savePermissions = async () => {
    setLoading(true);
    try {
      await api.post(`/users/${selectedUser.id}/permissions`, {
        allowedPages: userPermissions
      });
      toast.success('Permissions updated successfully');
      setIsPermModalOpen(false);
      fetchUsers(false);
    } catch (err) {
      toast.error('Failed to update permissions');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { 
      key: 'name', 
      label: 'Full Name',
      render: (val) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', borderRadius: '50%', background: '#eff6ff', color: 'var(--primary)' }}>
            <User size={16} />
          </div>
          <span style={{ fontWeight: '600' }}>{val}</span>
        </div>
      )
    },
    { key: 'email', label: 'Email' },
    { 
      key: 'role', 
      label: 'Role',
      render: (val) => (
        <span className={`status-badge role-${val}`} style={{ 
          background: val === 'admin' ? '#fef2f2' : val === 'manager' ? '#fff7ed' : '#f0fdf4',
          color: val === 'admin' ? '#dc2626' : val === 'manager' ? '#d97706' : '#16a34a',
          textTransform: 'capitalize'
        }}>
          {val}
        </span>
      )
    },
    { 
      key: 'department_name', 
      label: 'Department',
      render: (val) => val || <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Unassigned</span>
    }
  ];

  return (
    <div className="employees-page">
      <style>{`
        .perm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin-top: 16px; }
        .perm-item { display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: 0.2s; }
        .perm-item:hover { border-color: var(--primary); background: #f8fafc; }
        .perm-item.active { border-color: var(--primary); background: #eff6ff; color: var(--primary); }
        .role-admin { font-weight: 700; }
      `}</style>

      <div className="page-header" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '800' }}>Team Management</h2>
        <p style={{ color: 'var(--text-muted)' }}>Manage user roles, departments, and granular module access.</p>
      </div>

      <DataTable 
        title="Active Users"
        columns={columns}
        data={users}
        loading={loading}
        onEdit={openPermissions} // Using Edit for Permissions in this module
        onDelete={() => toast.error('User deletion restricted for security')}
      />

      <Modal 
        isOpen={isPermModalOpen} 
        onClose={() => setIsPermModalOpen(false)}
        title={`Manage Access: ${selectedUser?.name}`}
        footer={
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button label="cancel modal" className="btn-secondary" style={{ padding: '8px 16px' }} onClick={() => setIsPermModalOpen(false)}>Cancel</button>
            <button label="save permissions" className="btn-primary" style={{ padding: '8px 24px', background: 'var(--primary)', color: 'white', borderRadius: '8px' }} onClick={savePermissions}>Save Changes</button>
          </div>
        }
      >
        <div className="permissions-editor">
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
            Select the modules this user is allowed to access. Admins always have full access.
          </p>
          
          <div className="perm-grid">
            {ALL_PAGES.map(page => (
              <div 
                key={page.id} 
                className={`perm-item ${userPermissions.includes(page.id) ? 'active' : ''}`}
                onClick={() => handleTogglePermission(page.id)}
              >
                {userPermissions.includes(page.id) ? <CheckCircle size={16} /> : <Lock size={16} />}
                <span style={{ fontSize: '13px', fontWeight: '600' }}>{page.label}</span>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Employees;
