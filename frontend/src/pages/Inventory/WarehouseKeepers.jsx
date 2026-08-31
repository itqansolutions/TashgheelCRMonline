import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { ShieldCheck, Plus, Edit2, Trash2, Building, Phone, Mail, CheckCircle2 } from 'lucide-react';
import WarehouseSubNav from '../../components/Warehouse/WarehouseSubNav';

const WarehouseKeepers = () => {
  const [keepers, setKeepers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    assigned_warehouse: 'Main Central Warehouse',
    access_level: 'Full Manager',
    is_active: true,
  });

  useEffect(() => {
    const fetchKeepers = async () => {
      setLoading(true);
      try {
        const res = await api.get('/users').catch(() => ({ data: { data: [] } }));
        const users = res.data?.data || [];
        const mapped = users.map(u => ({
          id: u.id,
          name: u.name,
          phone: u.phone || 'N/A',
          email: u.email,
          assigned_warehouse: 'Main Warehouse',
          access_level: u.role === 'admin' ? 'Full Manager' : 'Store Keeper',
          is_active: u.is_working !== false
        }));
        setKeepers(mapped);
      } catch (err) {
        toast.error('Failed to load warehouse keepers');
      } finally {
        setLoading(false);
      }
    };
    fetchKeepers();
  }, []);

  const handleOpenModal = (k = null) => {
    if (k) {
      setEditingId(k.id);
      setForm({
        name: k.name,
        phone: k.phone || '',
        email: k.email || '',
        assigned_warehouse: k.assigned_warehouse || 'Main Central Warehouse',
        access_level: k.access_level || 'Full Manager',
        is_active: k.is_active !== false,
      });
    } else {
      setEditingId(null);
      setForm({
        name: '',
        phone: '',
        email: '',
        assigned_warehouse: 'Main Central Warehouse',
        access_level: 'Store Supervisor',
        is_active: true,
      });
    }
    setShowModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Keeper name is required');

    if (editingId) {
      setKeepers(keepers.map(k => k.id === editingId ? { ...k, ...form } : k));
      toast.success('Keeper updated successfully');
    } else {
      setKeepers([...keepers, { id: Date.now(), ...form }]);
      toast.success('Keeper added successfully');
    }
    setShowModal(false);
  };

  const handleDelete = (id) => {
    if (!window.confirm('Are you sure you want to remove this keeper?')) return;
    setKeepers(keepers.filter(k => k.id !== id));
    toast.success('Keeper removed successfully');
  };

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
              <ShieldCheck size={24} style={{ color: '#10b981' }} /> Warehouse Keepers & Staff
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              Assign warehouse managers, inventory officers, and authorization privileges
            </p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white',
              border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(16,185,129,0.25)'
            }}
          >
            <Plus size={18} /> Add Keeper
          </button>
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Keeper Name</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Assigned Warehouse</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Contact Details</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Role / Authorization</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Status</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keepers.map((k) => (
                  <tr key={k.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 18px', fontWeight: 800, color: '#1e293b' }}>
                      {k.name}
                    </td>
                    <td style={{ padding: '14px 18px', color: '#0ea5e9', fontWeight: 700 }}>
                      🏢 {k.assigned_warehouse}
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: '13px', color: '#64748b' }}>
                      <div>📞 {k.phone}</div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>✉️ {k.email}</div>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ padding: '4px 10px', background: '#f3e8ff', color: '#7e22ce', borderRadius: '20px', fontSize: '12px', fontWeight: 800 }}>
                        {k.access_level}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                        background: k.is_active ? '#dcfce7' : '#fee2e2', color: k.is_active ? '#15803d' : '#b91c1c'
                      }}>
                        {k.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button onClick={() => handleOpenModal(k)} style={{ padding: '6px', border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white', cursor: 'pointer', color: '#10b981' }}>
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(k.id)} style={{ padding: '6px', border: '1px solid #fee2e2', borderRadius: '8px', background: '#fef2f2', cursor: 'pointer', color: '#dc2626' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal */}
        {showModal && (
          <div style={modalStyle}>
            <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                  {editingId ? 'Edit Keeper Assignment' : 'Add Keeper'}
                </h3>
                <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
              </div>

              <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Keeper Full Name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    style={inputStyle}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Phone</label>
                    <input
                      type="text"
                      placeholder="+20 100 000 0000"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Email</label>
                    <input
                      type="email"
                      placeholder="keeper@tashgheel.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Assigned Warehouse</label>
                  <select
                    value={form.assigned_warehouse}
                    onChange={(e) => setForm({ ...form, assigned_warehouse: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="Main Central Warehouse">Main Central Warehouse</option>
                    <option value="Retail Branch Store">Retail Branch Store</option>
                    <option value="Damaged & Returns Depot">Damaged & Returns Depot</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Authorization Level</label>
                  <select
                    value={form.access_level}
                    onChange={(e) => setForm({ ...form, access_level: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="Chief Keeper">Chief Keeper (Full Control)</option>
                    <option value="Store Supervisor">Store Supervisor (In/Out Approval)</option>
                    <option value="Stock Inspector">Stock Inspector (Read Only)</option>
                  </select>
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
                    style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}
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

export default WarehouseKeepers;
