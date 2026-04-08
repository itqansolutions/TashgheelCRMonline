import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Plus, User, Building, Mail, Phone, MapPin } from 'lucide-react';
import DataTable from '../components/Common/DataTable';
import Modal from '../components/Common/Modal';
import FileUploader from '../components/Common/FileUploader';

const Customers = () => {
  const { customers, fetchCustomers, users, fetchUsers, leadSources, fetchLeadSources, loading } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    company_name: '',
    email: '',
    phone: '',
    address: '',
    status: 'lead',
    source_id: '',
    manager_id: ''
  });

  useEffect(() => {
    fetchCustomers();
    if (users.length === 0) fetchUsers();
    if (leadSources.length === 0) fetchLeadSources();
  }, []);

  const handleOpenModal = (customer = null) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name || '',
        company_name: customer.company_name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        address: customer.address || '',
        status: customer.status || 'lead',
        source_id: customer.source_id || '',
        manager_id: customer.manager_id || ''
      });
    } else {
      setEditingCustomer(null);
      setFormData({ name: '', company_name: '', email: '', phone: '', address: '', status: 'lead', source_id: '', manager_id: '' });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer.id}`, formData);
        toast.success('Customer updated successfully');
      } else {
        await api.post('/customers', formData);
        toast.success('Customer added successfully');
      }
      fetchCustomers(false); // Refresh list without full loading spinner
      setIsModalOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      try {
        await api.delete(`/customers/${id}`);
        toast.success('Customer deleted');
        fetchCustomers(false);
      } catch (err) {
        toast.error('Failed to delete customer');
      }
    }
  };

  const columns = [
    { 
      key: 'name', 
      label: 'Customer Name',
      render: (val, item) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
            <User size={16} />
          </div>
          <span style={{ fontWeight: '600' }}>{val}</span>
        </div>
      )
    },
    { key: 'company_name', label: 'Company' },
    { 
      key: 'source_name', 
      label: 'Source',
      render: (val) => val || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Direct/Other</span>
    },
    { 
      key: 'manager_name', 
      label: 'Director/Manager',
      render: (val) => val || 'Not Assigned'
    },
    { 
      key: 'status', 
      label: 'Status',
      render: (val) => (
        <span className={`status-badge`}>{val}</span>
      )
    }
  ];

  return (
    <div className="customers-page">
      <style>{`
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .btn-add {
          background-color: var(--primary);
          color: white;
          padding: 10px 20px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          transition: background 0.2s;
        }
        .btn-add:hover { background-color: var(--primary-hover); }
        
        /* Form Styles */
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .form-group { margin-bottom: 16px; }
        .form-group.full { grid-column: span 2; }
        .form-group label {
          display: block;
          margin-bottom: 6px;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-main);
        }
        .form-group input, .form-group textarea, .form-group select {
          width: 100%;
          padding: 10px;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 14px;
          background: var(--bg-main);
          outline: none;
        }
        .form-group input:focus { border-color: var(--primary); }
        
        .btn-cancel {
          background: #f1f5f9;
          color: var(--text-muted);
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 600;
        }
        .btn-save {
          background: var(--primary);
          color: white;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 600;
        }
      `}</style>

      <div className="page-header">
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '800' }}>Customers</h2>
          <p style={{ color: 'var(--text-muted)' }}>Manage your leads and active clients.</p>
        </div>
        <button label="add customer control" className="btn-add" onClick={() => handleOpenModal()}>
          <Plus size={20} />
          Add Customer
        </button>
      </div>

      <DataTable 
        title="All Customers"
        columns={columns}
        data={customers}
        loading={loading}
        onEdit={handleOpenModal}
        onDelete={handleDelete}
      />

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={editingCustomer ? 'Edit Customer' : 'Add New Customer'}
        footer={
          <>
            <button label="cancel addition" className="btn-cancel" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button label="save addition" className="btn-save" onClick={handleSubmit}>
              {editingCustomer ? 'Update Customer' : 'Create Customer'}
            </button>
          </>
        }
      >
        <form className="form-grid">
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
            <label>Company Name</label>
            <input 
              type="text" 
              placeholder="e.g. Acme Corp"
              value={formData.company_name}
              onChange={(e) => setFormData({...formData, company_name: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>Email Address</label>
            <input 
              type="email" 
              placeholder="johndoe@email.com"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>Phone Number</label>
            <input 
              type="text" 
              placeholder="+20 123 456 789"
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>Director/Manager</label>
            <select 
              value={formData.manager_id}
              onChange={(e) => setFormData({...formData, manager_id: e.target.value})}
            >
              <option value="">-- None --</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Lead Source</label>
            <select 
              value={formData.source_id}
              onChange={(e) => setFormData({...formData, source_id: e.target.value})}
            >
              <option value="">-- No Source --</option>
              {leadSources.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Lead Status</label>
            <select 
              value={formData.status}
              onChange={(e) => setFormData({...formData, status: e.target.value})}
            >
              <option value="lead">Lead</option>
              <option value="active">Active Client</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="form-group full">
            <label>Address</label>
            <textarea 
              rows="3"
              placeholder="Customer's physical address"
              value={formData.address}
              onChange={(e) => setFormData({...formData, address: e.target.value})}
            ></textarea>
          </div>
        </form>

        {editingCustomer && (
          <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '12px' }}>Customer Attachments</h4>
            <FileUploader linkedType="customer" linkedId={editingCustomer.id} />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Customers;
