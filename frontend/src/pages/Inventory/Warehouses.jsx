import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Building, Plus, Edit2, Trash2, MapPin, User, Package, Search } from 'lucide-react';
import WarehouseSubNav from '../../components/Warehouse/WarehouseSubNav';

const Warehouses = () => {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    name: '',
    code: '',
    location: '',
    keeper_name: '',
    capacity: '',
    is_active: true,
  });

  const fetchWarehouses = async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/warehouses').catch(() => ({ data: { data: [] } }));
      setWarehouses(res.data?.data || res.data || []);
    } catch (err) {
      toast.error('Failed to load warehouses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const handleOpenModal = (w = null) => {
    if (w) {
      setEditingId(w.id);
      setForm({
        name: w.name,
        code: w.code || '',
        location: w.location || '',
        keeper_name: w.keeper_name || '',
        capacity: w.capacity || '',
        is_active: w.is_active !== false,
      });
    } else {
      setEditingId(null);
      setForm({
        name: '',
        code: `WH-0${warehouses.length + 1}`,
        location: '',
        keeper_name: '',
        capacity: '',
        is_active: true,
      });
    }
    setShowModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Warehouse name is required');

    if (editingId) {
      setWarehouses(warehouses.map(w => w.id === editingId ? { ...w, ...form } : w));
      toast.success('Warehouse updated successfully');
    } else {
      const newWh = { id: Date.now(), ...form };
      setWarehouses([...warehouses, newWh]);
      toast.success('Warehouse added successfully');
    }
    setShowModal(false);
  };

  const handleDelete = (id) => {
    if (!window.confirm('Are you sure you want to delete this warehouse?')) return;
    setWarehouses(warehouses.filter(w => w.id !== id));
    toast.success('Warehouse deleted successfully');
  };

  const filtered = warehouses.filter(w => 
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.location.toLowerCase().includes(searchTerm.toLowerCase())
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
              Manage physical and virtual storage facilities, locations, and capacities
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
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
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
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#0ea5e9', background: '#e0f2fe', padding: '2px 8px', borderRadius: '6px', fontFamily: 'monospace' }}>
                        {w.code}
                      </span>
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
                      <span>{w.location || 'Location Not Set'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569' }}>
                      <User size={16} style={{ color: '#8b5cf6' }} />
                      <span>Keeper: <strong>{w.keeper_name || 'Unassigned'}</strong></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569' }}>
                      <Package size={16} style={{ color: '#10b981' }} />
                      <span>Capacity: {w.capacity || 'N/A'}</span>
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
            <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                  {editingId ? 'Edit Warehouse' : 'Add Warehouse'}
                </h3>
                <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
              </div>

              <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Warehouse Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Main Central Warehouse"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    style={inputStyle}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Code</label>
                    <input
                      type="text"
                      placeholder="e.g. WH-01"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Capacity</label>
                    <input
                      type="text"
                      placeholder="e.g. 5,000 sqm"
                      value={form.capacity}
                      onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Location Address</label>
                  <input
                    type="text"
                    placeholder="e.g. Industrial Area, Zone B"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Keeper / Manager Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Ahmed Hassan"
                    value={form.keeper_name}
                    onChange={(e) => setForm({ ...form, keeper_name: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', color: '#475569', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    {editingId ? 'Update' : 'Save'}
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
