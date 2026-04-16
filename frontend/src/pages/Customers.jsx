import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Plus, User, Building, Mail, Phone, MapPin } from 'lucide-react';
import DataTable from '../components/Common/DataTable';
import Modal from '../components/Common/Modal';
import FileUploader from '../components/Common/FileUploader';

import { useAuth } from '../context/AuthContext';

const Customers = () => {
  const { user } = useAuth();
  const { customers, fetchCustomers, users, fetchUsers, leadSources, fetchLeadSources, loading } = useData();
  const isRealEstate = user?.template_name === 'real_estate';
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [isViewingDetails, setIsViewingDetails] = useState(false);
  
  // UI Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState('all'); // all, customer, vendor, broker
  const [roomsFilter, setRoomsFilter] = useState('');  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    company_name: '',
    email: '',
    phone: '',
    address: '',
    status: 'lead',
    source_id: '',
    manager_id: '',
    entity_type: 'customer',
    budget_min: 0,
    budget_max: 0,
    preferred_area_min: 0,
    preferred_area_max: 0,
    preferred_location: '',
    preferred_rooms: 0
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
        manager_id: customer.manager_id || '',
        entity_type: customer.entity_type || 'customer',
        budget_min: customer.budget_min || 0,
        budget_max: customer.budget_max || 0,
        preferred_area_min: customer.preferred_area_min || 0,
        preferred_area_max: customer.preferred_area_max || 0,
        preferred_location: customer.preferred_location || '',
        preferred_rooms: customer.preferred_rooms || 0
      });
    } else {
      setEditingCustomer(null);
      setFormData({ 
          name: '', company_name: '', email: '', phone: '', address: '', status: 'lead', source_id: '', manager_id: '',
          entity_type: 'customer', budget_min: 0, budget_max: 0, preferred_area_min: 0, preferred_area_max: 0, preferred_location: '', preferred_rooms: 0
      });
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
    if (user?.role !== 'admin') {
        toast.error('Access Denied: Only Admins can delete data.');
        return;
    }
    if (window.confirm('CRITICAL: Are you sure you want to delete this client? This action is permanent.')) {
      try {
        await api.delete(`/customers/${id}`);
        toast.success('Record deleted permanently.');
        fetchCustomers(false);
      } catch (err) {
        toast.error('Failed to delete.');
      }
    }
  };

  // Filtered Data Logic (Instant Client-side Search & Filter)
  const filteredCustomers = (customers || []).filter(c => {
    const matchesSearch = 
        c.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        c.phone?.includes(searchQuery);
    
    const matchesEntity = entityFilter === 'all' || c.entity_type === entityFilter;
    const matchesRooms = !roomsFilter || c.preferred_rooms === parseInt(roomsFilter);
    
    return matchesSearch && matchesEntity && matchesRooms;
  });

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
          <h2 style={{ fontSize: '24px', fontWeight: '800' }}>
            {isRealEstate ? 'Leads & Prospective Buyers' : 'Customers'}
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            {isRealEstate 
              ? 'Manage your real estate interests and potential buyers.' 
              : 'Manage your leads and active clients.'}
          </p>
        </div>
        <button label="add customer control" className="btn-add" onClick={() => handleOpenModal()}>
          <Plus size={20} />
          {isRealEstate ? 'Add New Lead / Vendor' : 'Add Customer'}
        </button>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="search-box">
          <Phone size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder={isRealEstate ? "Instant search by Name or Mobile..." : "Search customers..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
          <option value="all">All Entities</option>
          <option value="customer">Customers (Buyers)</option>
          <option value="vendor">Vendors (Owners)</option>
          <option value="broker">Brokers</option>
        </select>

        {isRealEstate && (
          <select value={roomsFilter} onChange={(e) => setRoomsFilter(e.target.value)}>
            <option value="">Preferred Rooms</option>
            <option value="1">1 Room</option>
            <option value="2">2 Rooms</option>
            <option value="3">3 Rooms</option>
            <option value="4">4+ Rooms</option>
          </select>
        )}
      </div>

      <style>{`
        .filter-bar {
            display: flex;
            gap: 12px;
            margin-bottom: 20px;
            background: var(--glass-bg);
            padding: 12px;
            border-radius: 12px;
            border: 1px solid var(--glass-border);
        }
        .search-box {
            position: relative;
            flex: 1;
        }
        .search-box input {
            width: 100%;
            padding: 10px 10px 10px 40px;
            border: 1px solid var(--border);
            border-radius: 10px;
            background: var(--bg-main);
        }
        .search-icon {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-muted);
        }
        .filter-bar select {
            padding: 0 16px;
            border-radius: 10px;
            border: 1px solid var(--border);
            background: var(--bg-main);
            min-width: 160px;
        }
      `}</style>

      <DataTable 
        title={isRealEstate ? "Prospective Buyers" : "Customer Directory"}
        columns={columns}
        data={filteredCustomers}
        loading={loading}
        onEdit={handleOpenModal}
        onDelete={handleDelete}
        actions={(item) => (
          <button 
            onClick={() => {
                setEditingCustomer(item);
                setIsViewingDetails(true);
                setIsModalOpen(true);
            }}
            style={{ 
                padding: '6px 12px', background: 'rgba(79, 70, 229, 0.1)', 
                color: 'var(--primary)', border: 'none', borderRadius: '6px', 
                fontSize: '12px', fontWeight: '800' 
            }}
          >
            VIEW CARD
          </button>
        )}
      />

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
            setIsModalOpen(false);
            setIsViewingDetails(false);
        }}
        title={isViewingDetails ? 'Lead Identity Card' : (editingCustomer ? 'Edit Customer' : 'Add New Customer')}
        footer={
          !isViewingDetails ? (
            <>
              <button label="cancel addition" className="btn-cancel" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button label="save addition" className="btn-save" onClick={handleSubmit}>
                {editingCustomer ? 'Update Customer' : 'Create Customer'}
              </button>
            </>
          ) : null
        }
      >
        {isViewingDetails ? (
            <div className="lead-card">
                <div className="lc-header">
                    <div className="lc-avatar">
                        {editingCustomer.name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                        <h3>{editingCustomer.name}</h3>
                        <div className="lc-badge">{editingCustomer.entity_type?.toUpperCase()}</div>
                    </div>
                </div>

                <div className="lc-grid">
                    <div className="lc-item">
                        <label><Phone size={14}/> Phone</label>
                        <span>{editingCustomer.phone || 'N/A'}</span>
                    </div>
                    <div className="lc-item">
                        <label><Mail size={14}/> Email</label>
                        <span>{editingCustomer.email || 'N/A'}</span>
                    </div>
                    <div className="lc-item">
                        <label><MapPin size={14}/> Location</label>
                        <span>{editingCustomer.address || 'N/A'}</span>
                    </div>
                    <div className="lc-item">
                        <label><Building size={14}/> Branch</label>
                        <span>{editingCustomer.branch_name || 'Main Branch'}</span>
                    </div>
                </div>

                {isRealEstate && (
                    <div className="lc-specs">
                        <h4>Real Estate Specifications</h4>
                        <div className="lc-grid">
                            <div className="lc-item">
                                <label>Budget Range</label>
                                <span>{Number(editingCustomer.budget_min).toLocaleString()} - {Number(editingCustomer.budget_max).toLocaleString()} EGP</span>
                            </div>
                            <div className="lc-item">
                                <label>Area Range</label>
                                <span>{editingCustomer.preferred_area_min} - {editingCustomer.preferred_area_max} sqm</span>
                            </div>
                            <div className="lc-item">
                                <label>Rooms</label>
                                <span>{editingCustomer.preferred_rooms} Rooms</span>
                            </div>
                            <div className="lc-item">
                                <label>Location</label>
                                <span>{editingCustomer.preferred_location || 'Anywhere'}</span>
                            </div>
                        </div>
                    </div>
                )}

                <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                    <button className="btn-save" onClick={() => setIsViewingDetails(false)}>Edit Details</button>
                    <button className="btn-cancel" onClick={() => window.print()}>Print Card</button>
                </div>
            </div>
        ) : (
            <form className="form-grid">
              <div className="form-group">
                <label>Entity Type</label>
                <select 
                  value={formData.entity_type}
                  onChange={(e) => setFormData({...formData, entity_type: e.target.value})}
                >
                  <option value="customer">Customer (Buyer)</option>
                  <option value="vendor">Vendor (Owner)</option>
                  <option value="broker">Broker</option>
                  <option value="partner">Partner</option>
                </select>
              </div>
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
                <label>Phone Number</label>
                <input 
                  type="text" 
                  placeholder="+20 123 456 789"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
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

              {isRealEstate && (
                  <div className="form-group full specs-section">
                      <h4>Real Estate Specifications</h4>
                      <div className="form-grid">
                          <div className="form-group">
                              <label>Budget (Min - Max) EGP</label>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <input type="number" placeholder="Min" value={formData.budget_min} onChange={(e) => setFormData({...formData, budget_min: e.target.value})} />
                                <input type="number" placeholder="Max" value={formData.budget_max} onChange={(e) => setFormData({...formData, budget_max: e.target.value})} />
                              </div>
                          </div>
                          <div className="form-group">
                              <label>Area (Min - Max) sqm</label>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <input type="number" placeholder="Min" value={formData.preferred_area_min} onChange={(e) => setFormData({...formData, preferred_area_min: e.target.value})} />
                                <input type="number" placeholder="Max" value={formData.preferred_area_max} onChange={(e) => setFormData({...formData, preferred_area_max: e.target.value})} />
                              </div>
                          </div>
                          <div className="form-group">
                              <label>Preferred Rooms</label>
                              <select value={formData.preferred_rooms} onChange={(e) => setFormData({...formData, preferred_rooms: e.target.value})}>
                                  <option value="0">Any</option>
                                  <option value="1">1</option>
                                  <option value="2">2</option>
                                  <option value="3">3</option>
                                  <option value="4">4+</option>
                              </select>
                          </div>
                          <div className="form-group">
                              <label>Preferred Location</label>
                              <input type="text" placeholder="e.g. New Cairo" value={formData.preferred_location} onChange={(e) => setFormData({...formData, preferred_location: e.target.value})} />
                          </div>
                      </div>
                  </div>
              )}

              <div className="form-group">
                <label>Director/Manager</label>
                <select 
                  value={formData.manager_id}
                  onChange={(e) => setFormData({...formData, manager_id: e.target.value})}
                >
                  <option value="">-- None --</option>
                  {(users || []).map(u => (
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
                  {(leadSources || []).map(s => (
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
                  rows="2"
                  placeholder="Notes or physical address"
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                ></textarea>
              </div>
            </form>
        )}

        {!isViewingDetails && editingCustomer && (
          <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '12px' }}>Customer Attachments</h4>
            <FileUploader linkedType="customer" linkedId={editingCustomer.id} />
          </div>
        )}
      </Modal>

      <style>{`
        .specs-section {
            background: #f8fafc;
            padding: 16px;
            border-radius: 12px;
            margin: 10px 0;
            border: 1px dashed #cbd5e1;
        }
        .specs-section h4 { font-size: 14px; font-weight: 800; color: var(--primary); margin-bottom: 12px; }
        
        .lead-card { padding: 8px; }
        .lc-header { display: flex; gap: 16px; align-items: center; margin-bottom: 24px; }
        .lc-avatar { 
            width: 60px; height: 60px; background: var(--primary); color: white; 
            border-radius: 16px; display: flex; align-items: center; justify-content: center;
            font-size: 24px; font-weight: 800;
        }
        .lc-header h3 { font-size: 20px; font-weight: 800; margin: 0; }
        .lc-badge { 
            display: inline-block; padding: 2px 8px; background: #e0e7ff; 
            color: #4338ca; border-radius: 6px; font-size: 10px; font-weight: 800; margin-top: 4px;
        }
        .lc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .lc-item label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
        .lc-item span { font-weight: 700; color: var(--text-main); }
        .lc-specs { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border); }
        .lc-specs h4 { font-size: 15px; font-weight: 800; color: var(--primary); margin-bottom: 16px; }
      `}</style>
    </div>
  );
};

export default Customers;
