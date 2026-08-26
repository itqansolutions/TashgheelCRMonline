import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Layers, Plus, Edit2, Trash2, Tag, Percent, Users, CheckCircle2 } from 'lucide-react';

const PriceTiers = () => {
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    name: '',
    code: 'TIER-01',
    discount_percentage: 10,
    min_order_quantity: 1,
    description: '',
    is_active: true,
  });

  useEffect(() => {
    // Initial / mock price tiers data
    setTiers([
      { id: 1, name: 'Standard Retail', code: 'TIER-RETAIL', discount_percentage: 0, min_order_quantity: 1, description: 'Default retail pricing for walk-in customers', assigned_customers_count: 45, is_active: true },
      { id: 2, name: 'Wholesale Tier 1 (10+ Units)', code: 'TIER-WHOLESALE-1', discount_percentage: 10, min_order_quantity: 10, description: '10% discount for orders above 10 units', assigned_customers_count: 18, is_active: true },
      { id: 3, name: 'Contractor & Bulk Partner', code: 'TIER-CONTRACTOR', discount_percentage: 18, min_order_quantity: 50, description: '18% volume discount for registered contractors', assigned_customers_count: 12, is_active: true },
      { id: 4, name: 'VIP Enterprise Corporate', code: 'TIER-VIP-CORP', discount_percentage: 25, min_order_quantity: 100, description: 'Custom enterprise corporate tier with 25% discount', assigned_customers_count: 5, is_active: true },
    ]);
    setLoading(false);
  }, []);

  const handleOpenModal = (t = null) => {
    if (t) {
      setEditingId(t.id);
      setForm({
        name: t.name,
        code: t.code || '',
        discount_percentage: t.discount_percentage || 0,
        min_order_quantity: t.min_order_quantity || 1,
        description: t.description || '',
        is_active: t.is_active !== false,
      });
    } else {
      setEditingId(null);
      setForm({
        name: '',
        code: `TIER-0${tiers.length + 1}`,
        discount_percentage: 10,
        min_order_quantity: 1,
        description: '',
        is_active: true,
      });
    }
    setShowModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Tier name is required');

    if (editingId) {
      setTiers(tiers.map(t => t.id === editingId ? { ...t, ...form } : t));
      toast.success('Price tier updated successfully');
    } else {
      const newTier = {
        id: Date.now(),
        ...form,
        assigned_customers_count: 0
      };
      setTiers([...tiers, newTier]);
      toast.success('Price tier added successfully');
    }
    setShowModal(false);
  };

  const handleDelete = (id) => {
    if (!window.confirm('Are you sure you want to delete this price tier?')) return;
    setTiers(tiers.filter(t => t.id !== id));
    toast.success('Price tier deleted');
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
    <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Layers size={24} style={{ color: '#10b981' }} /> Customer Price Tiers & Lists
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
            Define wholesale, retail, contractor, and VIP volume pricing levels
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
          <Plus size={18} /> Add Price Tier
        </button>
      </div>

        {/* Tiers Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {tiers.map((t) => (
            <div key={t.id} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#10b981', background: '#dcfce7', padding: '2px 8px', borderRadius: '6px', fontFamily: 'monospace' }}>
                      {t.code}
                    </span>
                    <h3 style={{ margin: '6px 0 0 0', fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{t.name}</h3>
                  </div>
                  <span style={{
                    padding: '4px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: 800,
                    background: '#ede9fe', color: '#7c3aed'
                  }}>
                    {t.discount_percentage}% OFF
                  </span>
                </div>

                <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                  {t.description || 'No description set'}
                </p>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', marginBottom: '14px', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>Min Order Quantity:</span>
                    <span style={{ fontWeight: 800, color: '#0f172a' }}>{t.min_order_quantity} units</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>Assigned Customers:</span>
                    <span style={{ fontWeight: 800, color: '#0ea5e9' }}>{t.assigned_customers_count} accounts</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                <button onClick={() => handleOpenModal(t)} style={{ padding: '6px 14px', background: '#f1f5f9', border: 'none', borderRadius: '8px', color: '#10b981', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Edit2 size={14} /> Edit
                </button>
                <button onClick={() => handleDelete(t.id)} style={{ padding: '6px 10px', background: '#fef2f2', border: 'none', borderRadius: '8px', color: '#dc2626', fontWeight: 800, cursor: 'pointer' }}>
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
                  {editingId ? 'Edit Price Tier' : 'Add Price Tier'}
                </h3>
                <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
              </div>

              <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Tier Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Wholesale Tier 1"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    style={inputStyle}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Tier Code</label>
                    <input
                      type="text"
                      placeholder="e.g. TIER-01"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Discount (%)</label>
                    <input
                      type="number"
                      placeholder="e.g. 10"
                      value={form.discount_percentage}
                      onChange={(e) => setForm({ ...form, discount_percentage: parseFloat(e.target.value) || 0 })}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Minimum Order Quantity</label>
                  <input
                    type="number"
                    placeholder="e.g. 10"
                    value={form.min_order_quantity}
                    onChange={(e) => setForm({ ...form, min_order_quantity: parseInt(e.target.value) || 1 })}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Description</label>
                  <input
                    type="text"
                    placeholder="e.g. Wholesale discount rate for bulk orders"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
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
  );
};

export default PriceTiers;
