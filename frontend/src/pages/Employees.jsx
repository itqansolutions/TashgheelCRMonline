import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { User, Shield, Briefcase, Plus, Save, X, Lock, CheckCircle, Trash2 } from 'lucide-react';
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
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [userPermissions, setUserPermissions] = useState([]);
  
  // New User Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'employee',
    department_id: ''
  });

  // Department Table State
  const [newDeptName, setNewDeptName] = useState('');

  useEffect(() => {
    fetchUsers();
    fetchDepartments();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    // Cleanup data
    const submissionData = { ...formData };
    if (!submissionData.department_id || submissionData.department_id === '') {
      submissionData.department_id = null;
    }

    try {
      await api.post('/users', submissionData);
      toast.success('Employee created successfully');
      setIsAddModalOpen(false);
      setFormData({ name: '', email: '', password: '', role: 'employee', department_id: '' });
      fetchUsers(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create employee');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDept = async () => {
    if (!newDeptName) return;
    setLoading(true);
    try {
      await api.post('/departments', { name: newDeptName });
      toast.success('Department created');
      setNewDeptName('');
      fetchDepartments();
    } catch (err) {
      toast.error('Failed to create department');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDept = async (id) => {
    if (!window.confirm('Are you sure? This might affect employees assigned to this department.')) return;
    try {
      await api.delete(`/departments/${id}`);
      toast.success('Department removed');
      fetchDepartments();
    } catch (err) {
      toast.error('Failed to delete department (might be in use)');
    }
  };

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
        
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .header-actions { display: flex; gap: 12px; }
        .btn-add { background: var(--primary); color: white; padding: 10px 20px; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-weight: 600; }
        .btn-dept { background: white; border: 1px solid var(--border); color: var(--text-main); padding: 10px 20px; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-weight: 600; }
        
        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; }
        .form-group input, .form-group select { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; outline: none; }
        .form-group input:focus { border-color: var(--primary); }

        .dept-list { margin-top: 16px; }
        .dept-row { display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid var(--border); }
        .dept-row:last-child { border-bottom: none; }
      `}</style>

      <div className="page-header">
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '800' }}>Team Management</h2>
          <p style={{ color: 'var(--text-muted)' }}>Manage user roles, departments, and granular module access.</p>
        </div>
        <div className="header-actions">
          <button label="manage departments" className="btn-dept" onClick={() => setIsDeptModalOpen(true)}>
            <Briefcase size={18} />
            Manage Departments
          </button>
          <button label="add user button" className="btn-add" onClick={() => setIsAddModalOpen(true)}>
            <Plus size={18} />
            Add Employee
          </button>
        </div>
      </div>

      <DataTable 
        title="Active Users"
        columns={columns}
        data={users}
        loading={loading}
        onEdit={openPermissions} 
        editIcon={<Shield size={16} />}
        editLabel="Manage Access"
        onDelete={() => toast.error('User deletion restricted for security')}
      />

      {/* Departments Modal */}
      <Modal
        isOpen={isDeptModalOpen}
        onClose={() => setIsDeptModalOpen(false)}
        title="Organization Departments"
      >
        <div className="dept-manager">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <input 
              type="text" 
              placeholder="New Department Name" 
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: '8px' }}
            />
            <button label="add department" className="btn-primary" onClick={handleCreateDept} style={{ background: 'var(--primary)', color: 'white', padding: '0 20px', borderRadius: '8px' }}>Add</button>
          </div>
          
          <div className="dept-list" style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            {departments && departments.length > 0 ? departments.map(dept => (
              <div key={dept.id} className="dept-row">
                <span style={{ fontWeight: '600' }}>{dept.name}</span>
                <button label="delete department" onClick={() => handleDeleteDept(dept.id)} style={{ color: '#ef4444', padding: '6px' }}><Trash2 size={16} /></button>
              </div>
            )) : <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No departments yet.</div>}
          </div>
        </div>
      </Modal>

      {/* Add Employee Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register New Employee"
        footer={
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button label="cancel creation" className="btn-secondary" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
            <button label="save creation" className="btn-primary" onClick={handleCreateUser} style={{ background: 'var(--primary)', color: 'white', padding: '10px 20px', borderRadius: '8px' }}>Create Account</button>
          </div>
        }
      >
        <form className="user-form">
          <div className="form-group">
            <label>Full Name</label>
            <input 
              type="text" 
              placeholder="e.g. John Doe"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
            />
          </div>
          <div className="form-group">
            <label>Email Address</label>
            <input 
              type="email" 
              placeholder="email@tashgheel.com"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              required
            />
          </div>
          <div className="form-group">
            <label>Initial Password</label>
            <input 
              type="password" 
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              required
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label>Role</label>
              <select 
                value={formData.role}
                onChange={(e) => setFormData({...formData, role: e.target.value})}
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="form-group">
              <label>Department</label>
              <select 
                value={formData.department_id}
                onChange={(e) => setFormData({...formData, department_id: e.target.value})}
              >
                <option value="">None / External</option>
                {departments && departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
        </form>
      </Modal>

      {/* Permissions Modal */}
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
