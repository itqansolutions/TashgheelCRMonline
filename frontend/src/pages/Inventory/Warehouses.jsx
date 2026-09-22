import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Building, Plus, Edit2, Trash2, MapPin, Users, Search, X } from 'lucide-react';
import WarehouseSubNav from '../../components/Warehouse/WarehouseSubNav';

const Warehouses = () => {
  const [warehouses, setWarehouses] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: '',
    code: '',
    location: '',
    is_active: true,
    keeper_ids: [],
  });

  const fetchWarehouses = async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/warehouses');
      setWarehouses(res.data?.data || []);
    } catch (err) {
      toast.error('Failed to load warehouses');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data?.data || []);
    } catch (err) {
      console.warn('Failed to load users for keepers assignment');
    }
  };

  useEffect(() => {
    fetchWarehouses();
    fetchUsers();
  }, []);

  const handleOpenModal = (w = null) => {
    if (w) {
      setEditingId(w.id);
      setForm({
        name: w.name || '',
        code: w.code || '',
        location: w.location || '',
        is_active: w.is_active !== false,
        keeper_ids: (w.keepers || []).map(k => k.id),
      });
    } else {
      setEditingId(null);
      setForm({
        name: '',
        code: `WH-0${warehouses.length + 1}`,
        location: '',
        is_active: true,
        keeper_ids: [],
      });
    }
    setShowModal(true);
  };

  const handleKeeperToggle = (userId) => {
    setForm(prev => {
      const exists = prev.keeper_ids.includes(userId);
      return {
        ...prev,
        keeper_ids: exists
          ? prev.keeper_ids.filter(id => id !== userId)
          : [...prev.keeper_ids, userId]
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Warehouse name is required');

    setSubmitting(true);
    try {
      if (editingId) {
        await api.put(`/inventory/warehouses/${editingId}`, form);
        toast.success('Warehouse updated successfully');
      } else {
        await api.post('/inventory/warehouses', form);
        toast.success('Warehouse created successfully');
      }
      setShowModal(false);
      fetchWarehouses();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save warehouse');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete or deactivate this warehouse?')) return;
    try {
      const res = await api.delete(`/inventory/warehouses/${id}`);
      toast.success(res.data?.message || 'Warehouse removed');
      fetchWarehouses();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete warehouse');
    }
  };

  const filtered = warehouses.filter(w => 
    (w.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.location || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const modalStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '16px'
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px',
    fontSize: '14px', fontWeight: 600, outline: 'none', background: '#f8fafc', boxSizing: 'border-box'
  };

  return (
    <div>
      <WarehouseSubNav />
      <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Building size={24} style={{ color: '#0ea5e9' }} /> Warehouses Directory
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              Manage physical stores, facility locations, and assigned storekeepers
            </p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: 'white',
              border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(14,165,233,0.25)'
            }}
          >
            <Plus size={18} /> Add Warehouse
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '14px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Search size={18} style={{ color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search warehouse by name, code or location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '14px', fontWeight: 600, color: '#1e293b' }}
          />
        </div>

        {/* Grid Cards */}
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading warehouses...</div>
        ) : filtered.length === 0 ? (
          <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
            <Building size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <p style={{ fontWeight: 700, margin: 0 }}>No warehouses found</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
            {filtered.map((w) => (
              <div key={w.id} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      {w.code && (
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#0ea5e9', background: '#e0f2fe', padding: '2px 8px', borderRadius: '6px', fontFamily: 'monospace' }}>
                          {w.code}
                        </span>
                      )}
                      <h3 style={{ margin: '6px 0 0 0', fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{w.name}</h3>
                    </div>
                    <span style={{
                      padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                      background: w.is_active ? '#dcfce7' : '#fee2e2', color: w.is_active ? '#15803d' : '#b91c1c'
                    }}>
                      {w.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', marginBottom: '14px', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569' }}>
                      <MapPin size={16} style={{ color: '#0ea5e9' }} />
                      <span>{w.location || 'Location Not Specified'}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#475569' }}>
                      <Users size={16} style={{ color: '#8b5cf6', marginTop: '2px' }} />
                      <div>
                        <span style={{ fontWeight: 700, display: 'block', marginBottom: '4px' }}>Keepers:</span>
                        {(!w.keepers || w.keepers.length === 0) ? (
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>No keepers assigned</span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {w.keepers.map(k => (
                              <span key={k.id} style={{ background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                                {k.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                  <button onClick={() => handleOpenModal(w)} style={{ padding: '6px 14px', background: '#f1f5f9', border: 'none', borderRadius: '8px', color: '#0ea5e9', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Edit2 size={14} /> Edit
                  </button>
                  <button onClick={() => handleDelete(w.id)} style={{ padding: '6px 10px', background: '#fef2f2', border: 'none', borderRadius: '8px', color: '#dc2626', fontWeight: 800, cursor: 'pointer' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div style={modalStyle}>
            <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '540px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
                <h3 style={{ margin: 0, color: 'white', fontWeight: 800, fontSize: '18px' }}>
                  {editingId ? 'Edit Warehouse' : 'Add New Warehouse'}
                </h3>
                <button onClick={() => setShowModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>
                    Warehouse Name *
                  </label>
                  <input
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Main Central Warehouse"
                    style={inputStyle}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>
                      Warehouse Code
                    </label>
                    <input
                      value={form.code}
                      onChange={e => setForm({ ...form, code: e.target.value })}
                      placeholder="e.g. WH-01"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>
                      Status
                    </label>
                    <select
                      value={form.is_active ? 'active' : 'inactive'}
                      onChange={e => setForm({ ...form, is_active: e.target.value === 'active' })}
                      style={inputStyle}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>
                    Location / Address
                  </label>
                  <input
                    value={form.location}
                    onChange={e => setForm({ ...form, location: e.target.value })}
                    placeholder="e.g. 10th of Ramadan City, Cairo"
                    style={inputStyle}
                  />
                </div>

                {/* Keepers Multi-Select */}
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>
                    Assign Keepers (Employees)
                  </label>
                  <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#64748b' }}>
                    Select one or more employees responsible for this warehouse.
                  </p>
                  <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '10px', background: '#fafafa' }}>
                    {users.length === 0 ? (
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>No employees found</span>
                    ) : (
                      users.map(u => {
                        const checked = form.keeper_ids.includes(u.id);
                        return (
                          <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', background: checked ? '#f0f9ff' : 'transparent', marginBottom: '4px' }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleKeeperToggle(u.id)}
                            />
                            <span style={{ fontSize: '13px', fontWeight: checked ? 700 : 500, color: '#1e293b' }}>
                              {u.name} {u.email ? `(${u.email})` : ''}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                  <button type="button" onClick={() => setShowModal(false)} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting} style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
                    {submitting ? 'Saving...' : editingId ? 'Update Warehouse' : 'Create Warehouse'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Warehouses;
