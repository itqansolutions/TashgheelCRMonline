import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Cpu, Plus, Edit2, Trash2, Wifi, WifiOff, Hash, UserCheck, HelpCircle, Check, Info } from 'lucide-react';
import HRSubNav from '../../components/HR/HRSubNav';

const AttendanceDevices = () => {
  const [activeTab, setActiveTab] = useState('devices'); // 'devices' | 'badges'
  const [devices, setDevices] = useState([]);
  const [badgeUsers, setBadgeUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Device Modal
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState(null);
  const [deviceForm, setDeviceForm] = useState({
    name: '',
    serial_number: '',
    ip_address: '',
    location: '',
    is_active: true,
  });

  // Badge Editing State
  const [editingUserId, setEditingUserId] = useState(null);
  const [tempBadge, setTempBadge] = useState('');

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const res = await api.get('/hr/devices');
      setDevices(res.data.data || []);
    } catch (err) {
      toast.error('فشل تحميل بيانات أجهزة البصمة');
    } finally {
      setLoading(false);
    }
  };

  const fetchBadgeNumbers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/hr/devices/badge-numbers');
      setBadgeUsers(res.data.data || []);
    } catch (err) {
      toast.error('فشل تحميل كودات الموظفين (Badge Numbers)');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'devices') fetchDevices();
    else fetchBadgeNumbers();
  }, [activeTab]);

  const handleOpenDeviceModal = (d = null) => {
    if (d) {
      setEditingDeviceId(d.id);
      setDeviceForm({
        name: d.name,
        serial_number: d.serial_number || '',
        ip_address: d.ip_address || '',
        location: d.location || '',
        is_active: d.is_active !== false,
      });
    } else {
      setEditingDeviceId(null);
      setDeviceForm({
        name: '',
        serial_number: '',
        ip_address: '',
        location: '',
        is_active: true,
      });
    }
    setShowDeviceModal(true);
  };

  const handleSaveDevice = async (e) => {
    e.preventDefault();
    if (!deviceForm.name.trim()) return toast.error('اسم الجهاز مطلوب');
    try {
      if (editingDeviceId) {
        await api.put(`/hr/devices/${editingDeviceId}`, deviceForm);
        toast.success('تم تحديث بيانات الجهاز');
      } else {
        await api.post('/hr/devices', deviceForm);
        toast.success('تم إضافة الجهاز بنجاح');
      }
      setShowDeviceModal(false);
      fetchDevices();
    } catch (err) {
      toast.error('فشل حفظ الجهاز');
    }
  };

  const handleDeleteDevice = async (id) => {
    if (!window.confirm('هل أنت تأكد من حذف هذا الجهاز؟')) return;
    try {
      await api.delete(`/hr/devices/${id}`);
      toast.success('تم حذف الجهاز');
      fetchDevices();
    } catch (err) {
      toast.error('فشل في حذف الجهاز');
    }
  };

  const handleStartEditBadge = (u) => {
    setEditingUserId(u.id);
    setTempBadge(u.badge_number || '');
  };

  const handleSaveBadge = async (userId) => {
    try {
      await api.put(`/hr/devices/badge-numbers/${userId}`, { badge_number: tempBadge.trim() });
      toast.success('تم تحديث Badge Number للموظف');
      setEditingUserId(null);
      fetchBadgeNumbers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل تحديث الكود');
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
            <Cpu size={24} style={{ color: '#8b5cf6' }} /> ماكينات البصمة ZKTeco (Attendance Devices)
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
            ربط ماكينات البصمة بنظام ADMS Push التلقائي وإدارة كود الموظف (Badge Number)
          </p>
        </div>
        <button
          onClick={() => handleOpenDeviceModal()}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
            background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: 'white',
            border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(139,92,246,0.25)'
          }}
        >
          <Plus size={18} /> إضافة جهاز جديد
        </button>
      </div>

      {/* ZKTeco Setup Guide Banner */}
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '14px', padding: '16px 20px', marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Info size={22} />
        </div>
        <div style={{ flex: 1, fontSize: '13px', color: '#166534', lineHeight: 1.5 }}>
          <strong>طريقة إعداد ماكينة ZKTeco للإرسال التلقائي (ADMS Push Protocol):</strong>
          <br />
          من شاشة الماكينة اذهب إلى: <code>Menu ➔ Comm ➔ Cloud Server Settings</code> ثم اختر <code>Server Mode: ADMS</code> وأدخل رابط السيرفر الخاص بك والمنفذ <code>443 (HTTPS)</code>.
          ستقوم الماكينة بإرسال الحضور تلقائيًا وبأثر رجعي!
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '2px solid #e2e8f0', marginBottom: '24px' }}>
        <button
          onClick={() => setActiveTab('devices')}
          style={{
            padding: '10px 20px', background: 'transparent', border: 'none',
            borderBottom: activeTab === 'devices' ? '3px solid #8b5cf6' : '3px solid transparent',
            color: activeTab === 'devices' ? '#8b5cf6' : '#64748b', fontWeight: 800, cursor: 'pointer', fontSize: '14px',
            marginBottom: '-2px', display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <Cpu size={16} /> قائمة الأجهزة المسجلة ({devices.length})
        </button>
        <button
          onClick={() => setActiveTab('badges')}
          style={{
            padding: '10px 20px', background: 'transparent', border: 'none',
            borderBottom: activeTab === 'badges' ? '3px solid #8b5cf6' : '3px solid transparent',
            color: activeTab === 'badges' ? '#8b5cf6' : '#64748b', fontWeight: 800, cursor: 'pointer', fontSize: '14px',
            marginBottom: '-2px', display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <Hash size={16} /> أكواد الموظفين على البصمة (Badge Numbers)
        </button>
      </div>

      {/* Tab 1: Devices */}
      {activeTab === 'devices' && (
        <div>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>جاري التحميل...</div>
          ) : devices.length === 0 ? (
            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
              <Cpu size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <p style={{ fontWeight: 700, margin: 0 }}>لا توجد أجهزة بصمة معرفة</p>
              <p style={{ fontSize: '13px', color: '#cbd5e1' }}>تتصل الأجهزة وتتسجل تلقائيًا عند توجيهها لـ Cloud Server أو يمكنك إضافتها يدويًا</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
              {devices.map((d) => {
                const isOnline = d.connection_status === 'online';
                return (
                  <div key={d.id} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1e293b' }}>{d.name}</h3>
                          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                            {d.location ? `📍 ${d.location}` : 'المقر الرئيسي'}
                          </span>
                        </div>
                        <span style={{
                          padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                          display: 'flex', alignItems: 'center', gap: '4px',
                          background: isOnline ? '#dcfce7' : '#f1f5f9',
                          color: isOnline ? '#15803d' : '#64748b'
                        }}>
                          {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
                          {isOnline ? 'Online (نشط)' : 'Offline'}
                        </span>
                      </div>

                      <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', marginBottom: '14px', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8', fontWeight: 600 }}>Serial Number:</span>
                          <span style={{ fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>{d.serial_number || 'تلقائي عند أول Push'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8', fontWeight: 600 }}>IP Address:</span>
                          <span style={{ fontWeight: 700, color: '#475569', fontFamily: 'monospace' }}>{d.ip_address || '—'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8', fontWeight: 600 }}>إجمالي الـ Pushes:</span>
                          <span style={{ fontWeight: 800, color: '#8b5cf6' }}>{d.total_pushes || 0} عملية</span>
                        </div>
                      </div>

                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        آخر مزامنة: {d.last_seen ? new Date(d.last_seen).toLocaleString('ar-EG') : 'لم يتصل بعد'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                      <button onClick={() => handleOpenDeviceModal(d)} style={{ padding: '6px 14px', background: '#f1f5f9', border: 'none', borderRadius: '8px', color: '#4f46e5', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Edit2 size={14} /> تعديل
                      </button>
                      <button onClick={() => handleDeleteDevice(d.id)} style={{ padding: '6px 10px', background: '#fef2f2', border: 'none', borderRadius: '8px', color: '#dc2626', fontWeight: 800, cursor: 'pointer' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Badge Numbers Table */}
      {activeTab === 'badges' && (
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>جاري التحميل...</div>
          ) : badgeUsers.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>لا يوجد موظفون في هذا الفرع</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>الموظف</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>القسم</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>كود الموظف على ماكينة البصمة (Badge Number)</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {badgeUsers.map((u) => {
                  const isEditing = editingUserId === u.id;
                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: '#1e293b' }}>
                        {u.name}
                        <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 400 }}>{u.email}</div>
                      </td>
                      <td style={{ padding: '14px 18px', color: '#64748b', fontWeight: 600 }}>
                        {u.department_name || 'عام'}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        {isEditing ? (
                          <input
                            type="text"
                            placeholder="مثال: 001"
                            value={tempBadge}
                            onChange={(e) => setTempBadge(e.target.value)}
                            style={{ ...inputStyle, width: '180px', fontFamily: 'monospace' }}
                            autoFocus
                          />
                        ) : (
                          <span style={{
                            padding: '4px 12px', borderRadius: '8px', fontSize: '14px', fontWeight: 800, fontFamily: 'monospace',
                            background: u.badge_number ? '#ede9fe' : '#f1f5f9',
                            color: u.badge_number ? '#7c3aed' : '#94a3b8'
                          }}>
                            {u.badge_number || 'غير مخصص'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              onClick={() => handleSaveBadge(u.id)}
                              style={{ padding: '6px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer' }}
                            >
                              <Check size={16} /> حفظ
                            </button>
                            <button
                              onClick={() => setEditingUserId(null)}
                              style={{ padding: '6px 12px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer' }}
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleStartEditBadge(u)}
                            style={{ padding: '6px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: 800, color: '#0f172a', cursor: 'pointer' }}
                          >
                            تحديد Badge Code
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Device Create/Edit Modal */}
      {showDeviceModal && (
        <div style={modalStyle}>
          <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                {editingDeviceId ? 'تعديل بيانات ماكينة البصمة' : 'إضافة ماكينة بصمة جديدة'}
              </h3>
              <button onClick={() => setShowDeviceModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
            </div>

            <form onSubmit={handleSaveDevice} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>اسم الجهاز / الماكينة</label>
                <input
                  type="text"
                  placeholder="مثال: ماكينة الاستقبال - الفرع الرئيسي"
                  value={deviceForm.name}
                  onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })}
                  style={inputStyle}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Serial Number (السيريال)</label>
                <input
                  type="text"
                  placeholder="مثال: ABC123456 (أو اتركه فارغًا للربط التلقائي)"
                  value={deviceForm.serial_number}
                  onChange={(e) => setDeviceForm({ ...deviceForm, serial_number: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>عنوان الـ IP Local (اختياري للعرض)</label>
                <input
                  type="text"
                  placeholder="مثال: 192.168.1.201"
                  value={deviceForm.ip_address}
                  onChange={(e) => setDeviceForm({ ...deviceForm, ip_address: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>الموقع / الوصف</label>
                <input
                  type="text"
                  placeholder="مثال: الطابق الأرضي - مدخل الموظفين"
                  value={deviceForm.location}
                  onChange={(e) => setDeviceForm({ ...deviceForm, location: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowDeviceModal(false)}
                  style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', color: '#475569', fontWeight: 700, cursor: 'pointer' }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}
                >
                  {editingDeviceId ? 'تحديث' : 'إضافة'}
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

export default AttendanceDevices;
