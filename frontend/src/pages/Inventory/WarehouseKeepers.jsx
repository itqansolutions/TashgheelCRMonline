import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { ShieldCheck, Plus, Edit2, Trash2, Building, Phone, Mail, CheckCircle2 } from 'lucide-react';
import WarehouseSubNav from '../../components/Warehouse/WarehouseSubNav';
import { useLanguage } from '../../context/LanguageContext';

const WarehouseKeepers = () => {
  const { t, isRTL } = useLanguage();
  const [keepers, setKeepers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    assigned_warehouse: 'Main Central Warehouse',
    access_level: 'Chief Keeper',
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
          access_level: u.role === 'admin' ? 'Chief Keeper' : 'Store Supervisor',
          is_active: u.is_working !== false
        }));
        setKeepers(mapped);
      } catch (err) {
        toast.error(t('inventory.keepers.loadError'));
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
        access_level: k.access_level || 'Chief Keeper',
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
    if (!form.name.trim()) return toast.error(t('inventory.keepers.nameValidation'));

    if (editingId) {
      setKeepers(keepers.map(k => k.id === editingId ? { ...k, ...form } : k));
      toast.success(t('inventory.keepers.updateSuccess'));
    } else {
      setKeepers([...keepers, { id: Date.now(), ...form }]);
      toast.success(t('inventory.keepers.createSuccess'));
    }
    setShowModal(false);
  };

  const handleDelete = (id) => {
    if (!window.confirm(t('inventory.keepers.confirmDelete'))) return;
    setKeepers(keepers.filter(k => k.id !== id));
    toast.success(t('inventory.keepers.deleteSuccess'));
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

  const formatRole = (role) => {
    if (role === 'Chief Keeper' || role === 'Full Manager') return t('inventory.keepers.roles.chief');
    if (role === 'Store Supervisor') return t('inventory.keepers.roles.supervisor');
    if (role === 'Stock Inspector') return t('inventory.keepers.roles.inspector');
    if (role === 'Store Keeper') return t('inventory.keepers.roles.storeKeeper');
    return role;
  };

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <WarehouseSubNav />
      <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={24} style={{ color: '#10b981' }} /> {t('inventory.keepers.title')}
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              {t('inventory.keepers.subtitle')}
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
            <Plus size={18} /> {t('inventory.keepers.addKeeper')}
          </button>
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>{t('inventory.keepers.loading')}</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: isRTL ? 'right' : 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.keepers.name')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.keepers.assignedWarehouse')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.keepers.contactDetails')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.keepers.roleAuth')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('inventory.keepers.status')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>{t('inventory.keepers.actions')}</th>
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
                      <div>📞 <span className="num-en">{k.phone}</span></div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>✉️ {k.email}</div>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ padding: '4px 10px', background: '#f3e8ff', color: '#7e22ce', borderRadius: '20px', fontSize: '12px', fontWeight: 800 }}>
                        {formatRole(k.access_level)}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                        background: k.is_active ? '#dcfce7' : '#fee2e2', color: k.is_active ? '#15803d' : '#b91c1c'
                      }}>
                        {k.is_active ? t('inventory.keepers.active') : t('inventory.keepers.disabled')}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button onClick={() => handleOpenModal(k)} style={{ padding: '6px', border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white', cursor: 'pointer', color: '#10b981' }} title={t('common.edit')}>
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(k.id)} style={{ padding: '6px', border: '1px solid #fee2e2', borderRadius: '8px', background: '#fef2f2', cursor: 'pointer', color: '#dc2626' }} title={t('common.delete')}>
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
          <div style={modalStyle} dir={isRTL ? 'rtl' : 'ltr'}>
            <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                  {editingId ? t('inventory.keepers.editKeeper') : t('inventory.keepers.addKeeper')}
                </h3>
                <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
              </div>

              <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{t('inventory.keepers.fullName')}</label>
                  <input
                    type="text"
                    placeholder={t('inventory.keepers.fullNamePlaceholder')}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    style={inputStyle}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{t('inventory.keepers.phone')}</label>
                    <input
                      type="text"
                      placeholder={t('inventory.keepers.phonePlaceholder')}
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      style={inputStyle}
                      className="num-en"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{t('inventory.keepers.email')}</label>
                    <input
                      type="email"
                      placeholder={t('inventory.keepers.emailPlaceholder')}
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{t('inventory.keepers.assignedWarehouse')}</label>
                  <select
                    value={form.assigned_warehouse}
                    onChange={(e) => setForm({ ...form, assigned_warehouse: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="Main Central Warehouse">{t('inventory.keepers.warehouses.mainCentral')}</option>
                    <option value="Retail Branch Store">{t('inventory.keepers.warehouses.retailBranch')}</option>
                    <option value="Damaged & Returns Depot">{t('inventory.keepers.warehouses.damagedDepot')}</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{t('inventory.keepers.authLevel')}</label>
                  <select
                    value={form.access_level}
                    onChange={(e) => setForm({ ...form, access_level: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="Chief Keeper">{t('inventory.keepers.roles.chief')}</option>
                    <option value="Store Supervisor">{t('inventory.keepers.roles.supervisor')}</option>
                    <option value="Stock Inspector">{t('inventory.keepers.roles.inspector')}</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', color: '#475569', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    {editingId ? t('inventory.keepers.update') : t('inventory.keepers.save')}
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
