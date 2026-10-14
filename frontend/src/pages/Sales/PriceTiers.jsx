import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Layers, Plus, Edit2, Trash2, X } from 'lucide-react';
import SalesSubNav from '../../components/Sales/SalesSubNav';
import { useLanguage } from '../../context/LanguageContext';

const PriceTiers = () => {
  const { t, isRTL } = useLanguage();
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    code: 'TIER-01',
    discount_percentage: 10,
    min_order_quantity: 1,
    description: '',
    is_active: true,
  });

  const fetchTiers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/sales/price-tiers').catch(() => ({ data: { data: [] } }));
      setTiers(res.data?.data || []);
    } catch (err) {
      toast.error(t('sales.priceTiers.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTiers();
  }, []);

  const handleOpenModal = (tierObj = null) => {
    if (tierObj) {
      setEditingId(tierObj.id);
      setForm({
        name: tierObj.name,
        code: tierObj.code || '',
        discount_percentage: tierObj.discount_percentage || 0,
        min_order_quantity: tierObj.min_order_quantity || 1,
        description: tierObj.description || '',
        is_active: tierObj.is_active !== false,
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error(t('sales.priceTiers.nameRequired'));

    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/sales/price-tiers/${editingId}`, form);
        toast.success(t('sales.priceTiers.updateSuccess'));
      } else {
        await api.post('/sales/price-tiers', form);
        toast.success(t('sales.priceTiers.createSuccess'));
      }
      setShowModal(false);
      fetchTiers();
    } catch (err) {
      toast.error(err.response?.data?.message || t('sales.priceTiers.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('sales.priceTiers.confirmDelete'))) return;
    try {
      await api.delete(`/sales/price-tiers/${id}`);
      toast.success(t('sales.priceTiers.deleteSuccess'));
      fetchTiers();
    } catch (err) {
      toast.error(t('sales.priceTiers.deleteError'));
    }
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
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <SalesSubNav />
      <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Layers size={24} style={{ color: '#10b981' }} /> {t('sales.priceTiers.title')}
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              {t('sales.priceTiers.subtitle')}
            </p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white',
              border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(16,185,129,0.25)', fontSize: '13px'
            }}
          >
            <Plus size={18} /> {t('sales.priceTiers.addTier')}
          </button>
        </div>

        {/* Tiers Grid */}
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', background: 'white', borderRadius: '16px' }}>
            {t('sales.priceTiers.loading')}
          </div>
        ) : tiers.length === 0 ? (
          <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '60px', textAlign: 'center' }}>
            <Layers size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{t('sales.priceTiers.noTiersTitle')}</h3>
            <p style={{ margin: '0 0 20px 0', color: '#64748b', fontSize: '14px' }}>{t('sales.priceTiers.noTiersDesc')}</p>
            <button
              onClick={() => handleOpenModal()}
              style={{ padding: '10px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={16} /> {t('sales.priceTiers.addFirstTier')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
            {tiers.map((tItem) => (
              <div key={tItem.id} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{tItem.name}</h3>
                      <span className="num-en" style={{ fontSize: '12px', fontFamily: 'monospace', color: '#10b981', fontWeight: 800 }}>{tItem.code}</span>
                    </div>
                    <span style={{
                      padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                      background: tItem.is_active ? '#dcfce7' : '#fee2e2', color: tItem.is_active ? '#15803d' : '#b91c1c'
                    }}>
                      {tItem.is_active ? t('sales.priceTiers.activeTier') : t('sales.priceTiers.disabled')}
                    </span>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', marginBottom: '14px', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>{t('sales.priceTiers.discountRate')}</span>
                      <span style={{ fontWeight: 800, color: '#10b981', fontSize: '15px' }}>
                        <span className="num-en">{tItem.discount_percentage}</span>% {t('sales.priceTiers.off')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>{t('sales.priceTiers.minVolume')}</span>
                      <span style={{ fontWeight: 800, color: '#1e293b' }}>
                        <span className="num-en">{tItem.min_order_quantity}</span> {t('sales.priceTiers.units')}
                      </span>
                    </div>
                    {tItem.description && (
                      <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>
                        {tItem.description}
                      </p>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                  <button onClick={() => handleOpenModal(tItem)} style={{ padding: '6px 14px', background: '#f1f5f9', border: 'none', borderRadius: '8px', color: '#10b981', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                    <Edit2 size={14} /> {t('sales.priceTiers.edit')}
                  </button>
                  <button onClick={() => handleDelete(tItem.id)} style={{ padding: '6px 10px', background: '#fef2f2', border: 'none', borderRadius: '8px', color: '#dc2626', fontWeight: 800, cursor: 'pointer' }} title={t('sales.priceTiers.delete')}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div style={modalStyle} dir={isRTL ? 'rtl' : 'ltr'}>
            <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                  {editingId ? t('sales.priceTiers.editTier') : t('sales.priceTiers.newTier')}
                </h3>
                <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{t('sales.priceTiers.tierName')}</label>
                  <input
                    type="text"
                    placeholder={t('sales.priceTiers.tierNamePlaceholder')}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    style={inputStyle}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{t('sales.priceTiers.tierCode')}</label>
                    <input
                      type="text"
                      placeholder={t('sales.priceTiers.tierCodePlaceholder')}
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      style={inputStyle}
                      className="num-en"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{t('sales.priceTiers.discount')}</label>
                    <input
                      type="number"
                      step="0.5"
                      placeholder={t('sales.priceTiers.discountPlaceholder')}
                      value={form.discount_percentage}
                      onChange={(e) => setForm({ ...form, discount_percentage: parseFloat(e.target.value) || 0 })}
                      style={inputStyle}
                      className="num-en"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{t('sales.priceTiers.minQuantity')}</label>
                  <input
                    type="number"
                    placeholder={t('sales.priceTiers.minQuantityPlaceholder')}
                    value={form.min_order_quantity}
                    onChange={(e) => setForm({ ...form, min_order_quantity: parseInt(e.target.value) || 1 })}
                    style={inputStyle}
                    className="num-en"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{t('sales.priceTiers.description')}</label>
                  <textarea
                    placeholder={t('sales.priceTiers.descriptionPlaceholder')}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
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
                    disabled={saving}
                    style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}
                  >
                    {saving ? t('sales.priceTiers.saving') : editingId ? t('sales.priceTiers.update') : t('sales.priceTiers.save')}
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

export default PriceTiers;
