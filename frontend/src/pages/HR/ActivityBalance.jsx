import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Wallet, Filter, Search, UserCheck } from 'lucide-react';
import HRSubNav from '../../components/HR/HRSubNav';
import { useLanguage } from '../../context/LanguageContext';

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

const ActivityBalance = () => {
  const { t, isRTL } = useLanguage();
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

  const getMonthName = (idx) => {
    return `${new Date(2026, idx).toLocaleString(isRTL ? 'ar-EG' : 'default', { month: 'long' })} (${idx + 1})`;
  };

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
      toast.error(t('hr.activityBalance.fetchError', 'Failed to load activity balances'));
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
      return toast.error(t('hr.activityBalance.employeeAndTypeRequired', 'Employee and activity type are required'));
    }
    try {
      if (editingId) {
        await api.put(`/hr/activity-balances/${editingId}`, form);
        toast.success(t('hr.activityBalance.updateSuccess', 'Activity balance updated successfully'));
      } else {
        await api.post('/hr/activity-balances', form);
        toast.success(t('hr.activityBalance.assignSuccess', 'Activity balance assigned successfully'));
      }
      setShowModal(false);
      fetchBalances();
    } catch (err) {
      toast.error(err.response?.data?.message || t('hr.activityBalance.saveFailed', 'Failed to save balance'));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('hr.activityBalance.confirmDelete', 'Are you sure you want to delete this balance?'))) return;
    try {
      await api.delete(`/hr/activity-balances/${id}`);
      toast.success(t('hr.activityBalance.deleteSuccess', 'Balance deleted successfully'));
      fetchBalances();
    } catch (err) {
      toast.error(t('hr.activityBalance.deleteFailed', 'Failed to delete balance'));
    }
  };

  const modalStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '16px'
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px',
    fontSize: '14px', fontWeight: 600, outline: 'none', background: '#f8fafc', boxSizing: 'border-box',
    textAlign: isRTL ? 'right' : 'left'
  };

  const getUnitLabel = (unit) => {
    return unit === 'hours' ? t('hr.activityBalance.unitHours', 'Hours') : t('hr.activityBalance.unitDays', 'Days');
  };

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <HRSubNav />
      <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', textAlign: isRTL ? 'right' : 'left' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Wallet size={24} style={{ color: '#10b981' }} /> {t('hr.activityBalance.title', 'Activity Balances')}
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              {t('hr.activityBalance.subtitle', 'Allocate and track per-employee activity balances across monthly periods')}
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
            <Plus size={18} /> {t('hr.activityBalance.assignBalanceBtn', 'Assign Employee Balance')}
          </button>
        </div>

        {/* Filter Bar */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569', fontWeight: 800, fontSize: '14px' }}>
            <Filter size={18} /> {t('hr.activityBalance.filterLabel', 'Filter:')}
          </div>

          <div>
            <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} style={inputStyle} className="num-en">
              {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                <option key={y} value={y}>{t('hr.activityBalance.yearOption', { year: y, defaultValue: `Year ${y}` })}</option>
              ))}
            </select>
          </div>

          <div>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} style={inputStyle}>
              {Array.from({ length: 12 }, (_, idx) => (
                <option key={idx + 1} value={idx + 1}>{getMonthName(idx)}</option>
              ))}
            </select>
          </div>

          <div>
            <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} style={inputStyle}>
              <option value="">{t('hr.activityBalance.allEmployees', 'All Employees')}</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          <div>
            <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} style={inputStyle}>
              <option value="">{t('hr.activityBalance.allActivities', 'All Activities')}</option>
              {activityTypes.map(at => (
                <option key={at.id} value={at.id}>{at.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>{t('hr.activityBalance.loading', 'Loading...')}</div>
          ) : balances.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
              <Wallet size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <p style={{ fontWeight: 700, margin: 0 }}>{t('hr.activityBalance.noBalancesAllocated', 'No activity balances allocated for this period')}</p>
              <p style={{ fontSize: '13px', color: '#cbd5e1' }}>{t('hr.activityBalance.noBalancesDesc', 'Select a different period or assign new balances to employees')}</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: isRTL ? 'right' : 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('hr.activityBalance.colEmployee', 'Employee')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('hr.activityBalance.colActivityType', 'Activity Type')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('hr.activityBalance.colPeriod', 'Period')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('hr.activityBalance.colAllocated', 'Allocated')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('hr.activityBalance.colUsed', 'Used')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('hr.activityBalance.colRemaining', 'Remaining')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('hr.activityBalance.colNotes', 'Notes')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>{t('hr.activityBalance.colActions', 'Actions')}</th>
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
                      <td style={{ padding: '14px 18px', fontSize: '13px', color: '#64748b', fontWeight: 600 }} className="num-en">
                        {b.period_month} / {b.period_year}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0f172a' }}>
                        <span className="num-en">{b.allocated}</span> {getUnitLabel(b.unit)}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: '#dc2626' }}>
                        <span className="num-en">{b.used}</span> {getUnitLabel(b.unit)}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 800,
                          background: rem > 0 ? '#dcfce7' : '#fee2e2',
                          color: rem > 0 ? '#15803d' : '#b91c1c'
                        }}>
                          <span className="num-en">{rem}</span> {getUnitLabel(b.unit)}
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
                  {editingId ? t('hr.activityBalance.editModalTitle', 'Edit Activity Balance') : t('hr.activityBalance.assignModalTitle', 'Assign Employee Activity Balance')}
                </h3>
                <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
              </div>

              <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', textAlign: isRTL ? 'right' : 'left' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{t('hr.activityBalance.fieldEmployee', 'Employee')}</label>
                  <select
                    value={form.user_id}
                    onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                    style={inputStyle}
                    disabled={!!editingId}
                    required
                  >
                    <option value="">{t('hr.activityBalance.selectEmployeePlaceholder', 'Select Employee...')}</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{t('hr.activityBalance.fieldActivityType', 'Activity Type')}</label>
                  <select
                    value={form.activity_type_id}
                    onChange={(e) => setForm({ ...form, activity_type_id: e.target.value })}
                    style={inputStyle}
                    disabled={!!editingId}
                    required
                  >
                    <option value="">{t('hr.activityBalance.selectActivityPlaceholder', 'Select Activity...')}</option>
                    {activityTypes.map(at => (
                      <option key={at.id} value={at.id}>{at.name} ({getUnitLabel(at.unit)})</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{t('hr.activityBalance.fieldMonth', 'Month')}</label>
                    <select
                      value={form.period_month}
                      onChange={(e) => setForm({ ...form, period_month: parseInt(e.target.value) })}
                      style={inputStyle}
                      disabled={!!editingId}
                    >
                      {Array.from({ length: 12 }, (_, idx) => (
                        <option key={idx + 1} value={idx + 1}>{getMonthName(idx)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{t('hr.activityBalance.fieldYear', 'Year')}</label>
                    <input
                      type="number"
                      value={form.period_year}
                      onChange={(e) => setForm({ ...form, period_year: parseInt(e.target.value) || currentYear })}
                      style={inputStyle}
                      disabled={!!editingId}
                      className="num-en"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{t('hr.activityBalance.fieldAllocatedBalance', 'Allocated Balance')}</label>
                    <input
                      type="number"
                      step="0.5"
                      value={form.allocated}
                      onChange={(e) => setForm({ ...form, allocated: parseFloat(e.target.value) || 0 })}
                      style={inputStyle}
                      required
                      className="num-en"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{t('hr.activityBalance.fieldUsed', 'Used')}</label>
                    <input
                      type="number"
                      step="0.5"
                      value={form.used}
                      onChange={(e) => setForm({ ...form, used: parseFloat(e.target.value) || 0 })}
                      style={inputStyle}
                      className="num-en"
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{t('hr.activityBalance.fieldNotes', 'Notes')}</label>
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
                    {t('hr.activityBalance.btnCancel', 'Cancel')}
                  </button>
                  <button
                    type="submit"
                    style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    {editingId ? t('hr.activityBalance.btnUpdate', 'Update') : t('hr.activityBalance.btnAssign', 'Assign')}
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
