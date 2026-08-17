import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Users, Plus, Edit2, Trash2, Award, Phone, Mail, MapPin, DollarSign } from 'lucide-react';
import SalesSubNav from '../../components/Sales/SalesSubNav';

const Salesmen = () => {
  const [salesmen, setSalesmen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    territory: 'Cairo Region',
    commission_rate: 3.5,
    is_active: true,
  });

  useEffect(() => {
    // Initial / mock data
    setSalesmen([
      { id: 1, name: 'Khaled Omar', phone: '+20 100 555 1122', email: 'khaled.o@tashgheel.com', territory: 'Greater Cairo & Giza', commission_rate: 4.0, total_sales: 185000, active_deals: 12, is_active: true },
      { id: 2, name: 'Nader Tarek', phone: '+20 111 444 3322', email: 'nader.t@tashgheel.com', territory: 'Alexandria & North Coast', commission_rate: 3.5, total_sales: 142000, active_deals: 8, is_active: true },
      { id: 3, name: 'Mostafa Ali', phone: '+20 122 777 8899', email: 'mostafa.a@tashgheel.com', territory: 'Red Sea & Canal Cities', commission_rate: 5.0, total_sales: 98000, active_deals: 5, is_active: true },
    ]);
    setLoading(false);
  }, []);

  const handleOpenModal = (s = null) => {
    if (s) {
      setEditingId(s.id);
      setForm({
        name: s.name,
        phone: s.phone || '',
        email: s.email || '',
        territory: s.territory || 'Cairo Region',
        commission_rate: s.commission_rate || 3.5,
        is_active: s.is_active !== false,
      });
    } else {
      setEditingId(null);
      setForm({
        name: '',
        phone: '',
        email: '',
        territory: 'Cairo Region',
        commission_rate: 3.5,
        is_active: true,
      });
    }
    setShowModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Salesman name is required');

    if (editingId) {
      setSalesmen(salesmen.map(s => s.id === editingId ? { ...s, ...form } : s));
      toast.success('Sales representative updated successfully');
    } else {
      const newRep = { id: Date.now(), total_sales: 0, active_deals: 0, ...form };
      setSalesmen([...salesmen, newRep]);
      toast.success('Sales representative added successfully');
    }
    setShowModal(false);
  };

  const handleDelete = (id) => {
    if (!window.confirm('Are you sure you want to remove this sales representative?')) return;
    setSalesmen(salesmen.filter(s => s.id !== id));
    toast.success('Sales representative removed');
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
      <SalesSubNav />
      <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Users size={24} style={{ color: '#10b981' }} /> Sales Representatives & Agents
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              Manage sales team members, assigned territories, and commission schemes
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
            <Plus size={18} /> Add Sales Representative
          </button>
        </div>

        {/* Salesmen Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {salesmen.map((s) => (
            <div key={s.id} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{s.name}</h3>
                    <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                      <MapPin size={13} /> {s.territory}
                    </span>
                  </div>
                  <span style={{
                    padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                    background: s.is_active ? '#dcfce7' : '#fee2e2', color: s.is_active ? '#15803d' : '#b91c1c'
                  }}>
                    {s.is_active ? 'Active Agent' : 'Inactive'}
                  </span>
                </div>

                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', marginBottom: '14px', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>Closed Volume YTD:</span>
                    <span style={{ fontWeight: 800, color: '#0ea5e9' }}>${s.total_sales.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>Commission Rate:</span>
                    <span style={{ fontWeight: 800, color: '#8b5cf6' }}>{s.commission_rate}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>Active Pipeline Deals:</span>
                    <span style={{ fontWeight: 800, color: '#f59e0b' }}>{s.active_deals} deals</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '6px', marginTop: '2px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>Contact:</span>
                    <span style={{ fontWeight: 700, color: '#334155' }}>{s.phone}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                <button onClick={() => handleOpenModal(s)} style={{ padding: '6px 14px', background: '#f1f5f9', border: 'none', borderRadius: '8px', color: '#10b981', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Edit2 size={14} /> Edit
                </button>
                <button onClick={() => handleDelete(s.id)} style={{ padding: '6px 10px', background: '#fef2f2', border: 'none', borderRadius: '8px', color: '#dc2626', fontWeight: 800, cursor: 'pointer' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Modal */}
        {showModal && (
          <div style={modalStyle}>
            <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                  {editingId ? 'Edit Sales Representative' : 'Add Sales Representative'}
                </h3>
                <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
              </div>

              <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Khaled Omar"
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
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Commission Rate (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 3.5"
                      value={form.commission_rate}
                      onChange={(e) => setForm({ ...form, commission_rate: parseFloat(e.target.value) || 0 })}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Email</label>
                  <input
                    type="email"
                    placeholder="sales.agent@tashgheel.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Assigned Territory / Sector</label>
                  <input
                    type="text"
                    placeholder="e.g. Greater Cairo & Giza"
                    value={form.territory}
                    onChange={(e) => setForm({ ...form, territory: e.target.value })}
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

export default Salesmen;
