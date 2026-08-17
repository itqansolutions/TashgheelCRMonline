import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Wallet, Filter, Search, UserCheck } from 'lucide-react';
import HRSubNav from '../../components/HR/HRSubNav';

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

const MONTHS_AR = [
  'يناير (1)', 'فبراير (2)', 'مارس (3)', 'أبريل (4)', 'مايو (5)', 'يونيو (6)',
  'يوليو (7)', 'أغسطس (8)', 'سبتمبر (9)', 'أكتوبر (10)', 'نوفمبر (11)', 'ديسمبر (12)'
];

const ActivityBalance = () => {
  const [balances, setBalances] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [activityTypes, setActivityTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedType, setSelectedType] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    user_id: '',
    activity_type_id: '',
    period_month: currentMonth,
    period_year: currentYear,
    allocated: 0,
    used: 0,
    notes: '',
  });

  const fetchDropdownData = async () => {
    try {
      const [empRes, typeRes] = await Promise.all([
        api.get('/users'),
        api.get('/hr/activity-types')
      ]);
      setEmployees(empRes.data.data || empRes.data || []);
      setActivityTypes(typeRes.data.data || []);
    } catch (err) {
      console.error('Failed to load dropdowns', err);
    }
  };

  const fetchBalances = async () => {
    setLoading(true);
    try {
      let query = `/hr/activity-balances?year=${selectedYear}&month=${selectedMonth}`;
      if (selectedUser) query += `&user_id=${selectedUser}`;
      if (selectedType) query += `&activity_type_id=${selectedType}`;
      const res = await api.get(query);
      setBalances(res.data.data || []);
    } catch (err) {
      toast.error('فشل تحميل أرصدة الأنشطة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDropdownData();
  }, []);

  useEffect(() => {
    fetchBalances();
  }, [selectedMonth, selectedYear, selectedUser, selectedType]);

  const handleOpenModal = (b = null) => {
    if (b) {
      setEditingId(b.id);
      setForm({
        user_id: b.user_id,
        activity_type_id: b.activity_type_id,
        period_month: b.period_month,
        period_year: b.period_year,
        allocated: b.allocated || 0,
        used: b.used || 0,
        notes: b.notes || '',
      });
    } else {
      setEditingId(null);
      setForm({
        user_id: employees[0]?.id || '',
        activity_type_id: activityTypes[0]?.id || '',
        period_month: selectedMonth,
        period_year: selectedYear,
        allocated: 0,
        used: 0,
        notes: '',
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.user_id || !form.activity_type_id) {
      return toast.error('يرجى اختيار الموظف ونوع النشاط');
    }
    try {
      if (editingId) {
        await api.put(`/hr/activity-balances/${editingId}`, form);
        toast.success('تم تحديث رصيد النشاط بنجاح');
      } else {
        await api.post('/hr/activity-balances', form);
        toast.success('تم إسناد رصيد النشاط بنجاح');
      }
      setShowModal(false);
      fetchBalances();
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل في حفظ الرصيد');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت تأكد من حذف هذا الرصيد؟')) return;
    try {
      await api.delete(`/hr/activity-balances/${id}`);
      toast.success('تم حذف الرصيد');
      fetchBalances();
    } catch (err) {
      toast.error('فشل في الحذف');
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
            <Wallet size={24} style={{ color: '#10b981' }} /> أرصدة الأنشطة (Activity Balance)
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
            تحديد وأرشفة أرصدة الأنشطة لكل موظف خلال فترات الشهور والسنين
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
          <Plus size={18} /> إضافة رصيد لموظف
        </button>
      </div>

      {/* Filter Bar */}
      <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569', fontWeight: 800, fontSize: '14px' }}>
          <Filter size={18} /> تصفية:
        </div>

        <div>
          <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} style={inputStyle}>
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>سنة {y}</option>
            ))}
          </select>
        </div>

        <div>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} style={inputStyle}>
            {MONTHS_AR.map((m, idx) => (
              <option key={idx + 1} value={idx + 1}>{m}</option>
            ))}
          </select>
        </div>

        <div>
          <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} style={inputStyle}>
            <option value="">جميع الموظفين</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>

        <div>
          <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} style={inputStyle}>
            <option value="">جميع الأنشطة</option>
            {activityTypes.map(at => (
              <option key={at.id} value={at.id}>{at.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>جاري التحميل...</div>
        ) : balances.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
            <Wallet size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <p style={{ fontWeight: 700, margin: 0 }}>لا توجد أرصدة أنشطة مسجلة لهذه الفترة</p>
            <p style={{ fontSize: '13px', color: '#cbd5e1' }}>قم باختيار فترة أخرى أو إضافة رصيد جديد للموظفين</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>الموظف</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>نوع النشاط</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>الفترة</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>الرصيد المخصص</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>المستخدم</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>المتبقي</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>ملاحظات</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => {
                const rem = parseFloat(b.remaining ?? (b.allocated - b.used));
                return (
                  <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 18px', fontWeight: 800, color: '#1e293b' }}>
                      {b.employee_name}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: '#4f46e5' }}>
                      {b.activity_name}
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                      شهر {b.period_month} / {b.period_year}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0f172a' }}>
                      {b.allocated} {b.unit === 'hours' ? 'ساعة' : 'يوم'}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: '#dc2626' }}>
                      {b.used} {b.unit === 'hours' ? 'ساعة' : 'يوم'}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 800,
                        background: rem > 0 ? '#dcfce7' : '#fee2e2',
                        color: rem > 0 ? '#15803d' : '#b91c1c'
                      }}>
                        {rem} {b.unit === 'hours' ? 'ساعة' : 'يوم'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: '12px', color: '#94a3b8' }}>
                      {b.notes || '—'}
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button onClick={() => handleOpenModal(b)} style={{ padding: '6px', border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white', cursor: 'pointer', color: '#4f46e5' }}>
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(b.id)} style={{ padding: '6px', border: '1px solid #fee2e2', borderRadius: '8px', background: '#fef2f2', cursor: 'pointer', color: '#dc2626' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={modalStyle}>
          <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '500px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                {editingId ? 'تعديل رصيد النشاط' : 'إسناد رصيد جديد للموظف'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>الموظف</label>
                <select
                  value={form.user_id}
                  onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                  style={inputStyle}
                  disabled={!!editingId}
                  required
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>نوع النشاط</label>
                <select
                  value={form.activity_type_id}
                  onChange={(e) => setForm({ ...form, activity_type_id: e.target.value })}
                  style={inputStyle}
                  disabled={!!editingId}
                  required
                >
                  <option value="">اختر النشاط...</option>
                  {activityTypes.map(at => (
                    <option key={at.id} value={at.id}>{at.name} ({at.unit === 'hours' ? 'ساعات' : 'أيام'})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>الشهر</label>
                  <select
                    value={form.period_month}
                    onChange={(e) => setForm({ ...form, period_month: parseInt(e.target.value) })}
                    style={inputStyle}
                    disabled={!!editingId}
                  >
                    {MONTHS_AR.map((m, idx) => (
                      <option key={idx + 1} value={idx + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>السنة</label>
                  <input
                    type="number"
                    value={form.period_year}
                    onChange={(e) => setForm({ ...form, period_year: parseInt(e.target.value) || currentYear })}
                    style={inputStyle}
                    disabled={!!editingId}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>الرصيد المخصص (Allocated)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.allocated}
                    onChange={(e) => setForm({ ...form, allocated: parseFloat(e.target.value) || 0 })}
                    style={inputStyle}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>المستنفذ (Used)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.used}
                    onChange={(e) => setForm({ ...form, used: parseFloat(e.target.value) || 0 })}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>ملاحظات</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  rows={2}
                />
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
                  style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}
                >
                  {editingId ? 'تحديث' : 'إسناد'}
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

export default ActivityBalance;
