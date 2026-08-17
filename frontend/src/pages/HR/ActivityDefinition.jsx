import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, CheckCircle2, XCircle, Clock, Calendar, Sliders } from 'lucide-react';
import HRSubNav from '../../components/HR/HRSubNav';

const ActivityDefinition = () => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    name: '',
    unit: 'hours',
    start_post: 0,
    end_post: 0,
    min_value: 0.5,
    max_value: 8,
    is_active: true,
  });

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const res = await api.get('/hr/activity-types');
      setActivities(res.data.data || []);
    } catch (err) {
      toast.error('فشل في تحميل تعريفات الأنشطة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, []);

  const handleOpenModal = (act = null) => {
    if (act) {
      setEditingId(act.id);
      setForm({
        name: act.name,
        unit: act.unit || 'hours',
        start_post: act.start_post || 0,
        end_post: act.end_post || 0,
        min_value: act.min_value || 0,
        max_value: act.max_value || 30,
        is_active: act.is_active !== false,
      });
    } else {
      setEditingId(null);
      setForm({
        name: '',
        unit: 'hours',
        start_post: 0,
        end_post: 0,
        min_value: 0.5,
        max_value: 8,
        is_active: true,
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('يرجى إدخال اسم النشاط');
    try {
      if (editingId) {
        await api.put(`/hr/activity-types/${editingId}`, form);
        toast.success('تم تحديث النشاط بنجاح');
      } else {
        await api.post('/hr/activity-types', form);
        toast.success('تم إضافة النشاط بنجاح');
      }
      setShowModal(false);
      fetchActivities();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء الحفظ');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت تأكد من حذف هذا النشاط؟')) return;
    try {
      await api.delete(`/hr/activity-types/${id}`);
      toast.success('تم حذف النشاط بنجاح');
      fetchActivities();
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل في حذف النشاط');
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
    <div>
      <HRSubNav />
      <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sliders size={24} style={{ color: '#4f46e5' }} /> تعريف الأنشطة (Activity Definition)
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
            تعريف أنواع الأنشطة والأذونات والمدد المتاحة للطلب وإدخالها بالنظام
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white',
            border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(79,70,229,0.25)'
          }}
        >
          <Plus size={18} /> إضافة نشاط جديد
        </button>
      </div>

      {/* Main Table */}
      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>جاري التحميل...</div>
        ) : activities.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
            <Sliders size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <p style={{ fontWeight: 700, margin: 0 }}>لا توجد أنشطة معرفة حتى الآن</p>
            <p style={{ fontSize: '13px', color: '#cbd5e1' }}>اضغط على "إضافة نشاط جديد" لتعريف أول نشاط في الشركة</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>اسم النشاط</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>الوحدة</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>مدة الطلب (Start / End Post)</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>الحد الأدنى والأقصى</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>الحالة</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((act) => (
                <tr key={act.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '14px 18px', fontWeight: 800, color: '#1e293b' }}>
                    {act.name}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 800,
                      background: act.unit === 'hours' ? '#e0e7ff' : '#fef3c7',
                      color: act.unit === 'hours' ? '#4338ca' : '#b45309'
                    }}>
                      {act.unit === 'hours' ? '⏱️ بالساعات' : '📅 بالأيام'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', fontSize: '13px', color: '#475569', fontWeight: 600 }}>
                    من {act.start_post >= 0 ? `+${act.start_post}` : act.start_post} يوم إلى {act.end_post >= 0 ? `+${act.end_post}` : act.end_post} يوم
                  </td>
                  <td style={{ padding: '14px 18px', fontSize: '13px', color: '#475569', fontWeight: 700 }}>
                    {act.min_value} — {act.max_value} {act.unit === 'hours' ? 'ساعة' : 'يوم'}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                      background: act.is_active ? '#dcfce7' : '#fee2e2',
                      color: act.is_active ? '#15803d' : '#b91c1c'
                    }}>
                      {act.is_active ? 'نشط' : 'غير نشط'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <button onClick={() => handleOpenModal(act)} style={{ padding: '6px', border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white', cursor: 'pointer', color: '#4f46e5' }}>
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(act.id)} style={{ padding: '6px', border: '1px solid #fee2e2', borderRadius: '8px', background: '#fef2f2', cursor: 'pointer', color: '#dc2626' }}>
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

      {/* Add / Edit Modal */}
      {showModal && (
        <div style={modalStyle}>
          <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '520px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                {editingId ? 'تعديل تعريف النشاط' : 'إضافة نشاط جديد'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>اسم النشاط</label>
                <input
                  type="text"
                  placeholder="مثال: إذن تأخير / إجازة اعتيادية"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={inputStyle}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>وحدة الحساب</label>
                <select
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  style={inputStyle}
                >
                  <option value="hours">بالساعات (Hours)</option>
                  <option value="days">بالأيام (Days)</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Start Post (بالأيام)</label>
                  <input
                    type="number"
                    value={form.start_post}
                    onChange={(e) => setForm({ ...form, start_post: parseInt(e.target.value) || 0 })}
                    style={inputStyle}
                    placeholder="سالب = قبل التاريخ"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>End Post (بالأيام)</label>
                  <input
                    type="number"
                    value={form.end_post}
                    onChange={(e) => setForm({ ...form, end_post: parseInt(e.target.value) || 0 })}
                    style={inputStyle}
                    placeholder="موجب = بعد التاريخ"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>الحد الأدنى للقيمة</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.min_value}
                    onChange={(e) => setForm({ ...form, min_value: parseFloat(e.target.value) || 0 })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>الحد الأقصى للقيمة</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.max_value}
                    onChange={(e) => setForm({ ...form, max_value: parseFloat(e.target.value) || 0 })}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="is_active" style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', cursor: 'pointer' }}>النشاط مفعل ونشط</label>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', color: '#475569', fontWeight: 700, cursor: 'pointer' }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}
                >
                  {editingId ? 'تحديث' : 'حفظ'}
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

export default ActivityDefinition;
