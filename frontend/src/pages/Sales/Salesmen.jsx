import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import {
  Users, Plus, Edit2, Trash2, Award, Phone, Mail, MapPin, DollarSign,
  X, Eye, Calendar, Building2, TrendingUp, CheckCircle2, AlertTriangle,
  Clock, FileText, Home, ArrowRight, ShieldCheck, ChevronRight
} from 'lucide-react';

const PERIOD_OPTIONS = [
  { value: '2026-10', label: '2026-10 (أكتوبر 2026 - الحالي)' },
  { value: '2026-11', label: '2026-11 (نوفمبر 2026)' },
  { value: '2026-12', label: '2026-12 (ديسمبر 2026)' },
  { value: '2026-09', label: '2026-09 (سبتمبر 2026)' },
  { value: '2026-Q4', label: '2026-Q4 (الربع الرابع)' },
  { value: '2026-Q3', label: '2026-Q3 (الربع الثالث)' },
  { value: '2026-Q2', label: '2026-Q2 (الربع الثاني)' },
  { value: '2026-Q1', label: '2026-Q1 (الربع الأول)' },
  { value: '2026', label: 'Full Year 2026 (سنوي)' },
];

const Salesmen = () => {
  const { user } = useAuth();
  const isRealEstate = user?.template_name === 'real_estate';

  const [salesmen, setSalesmen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('2026-10');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('ALL');

  // Modal State (Add / Edit User)
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    role: 'sales',
    password: ''
  });

  // 360° Drawer State
  const [showDrawer, setShowDrawer] = useState(false);
  const [activeSalesman, setActiveSalesman] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Drawer Datasets
  const [rePerformance, setRePerformance] = useState(null);
  const [reCommissions, setReCommissions] = useState([]);
  const [genTarget, setGenTarget] = useState(null);
  const [genCommissions, setGenCommissions] = useState([]);
  const [genSettlements, setGenSettlements] = useState([]);

  // Fetch Salesmen List from the appropriate vertical engine
  const fetchSalesmen = async () => {
    setLoading(true);
    try {
      const endpoint = isRealEstate ? '/re-targets/salesmen' : '/sales/salesmen';
      const res = await api.get(endpoint);
      const list = res.data?.data || [];
      setSalesmen(list);
    } catch (err) {
      console.error('[Salesmen] Error loading salesmen:', err);
      toast.error('فشل تحميل قائمة المندوبين ومسؤولي المبيعات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalesmen();
  }, [isRealEstate]);

  // Open 360° Drawer and fetch detailed performance & commissions
  const handleOpen360Drawer = async (rep) => {
    setActiveSalesman(rep);
    setShowDrawer(true);
    setDrawerLoading(true);
    setDrawerError(null);
    setActiveTab('overview');

    // Reset previous drawer datasets to prevent showing stale numbers
    setRePerformance(null);
    setReCommissions([]);
    setGenTarget(null);
    setGenCommissions([]);
    setGenSettlements([]);

    try {
      if (isRealEstate) {
        // Fetch Real Estate 3D Performance Detail & Commissions
        const [perfRes, commRes] = await Promise.all([
          api.get(`/re-targets/salesmen/${rep.id}/performance?period=${encodeURIComponent(selectedPeriod)}`)
            .catch(err => {
              if (err.response?.status === 403) throw new Error('FORBIDDEN');
              return { data: { data: null } };
            }),
          api.get(`/re-commissions?beneficiary_user_id=${rep.id}`)
            .catch(err => {
              if (err.response?.status === 403) throw new Error('FORBIDDEN');
              return { data: { data: [] } };
            })
        ]);
        setRePerformance(perfRes.data?.data || null);
        setReCommissions(commRes.data?.data || []);
      } else {
        // Fetch General Sales Targets, Commissions & Settlements
        const [targetRes, commRes, settRes] = await Promise.all([
          api.get(`/sales/targets?user_id=${rep.id}&period=${encodeURIComponent(selectedPeriod)}`)
            .catch(err => {
              if (err.response?.status === 403) throw new Error('FORBIDDEN');
              return { data: { data: [] } };
            }),
          api.get(`/sales/commissions?user_id=${rep.id}&period=${encodeURIComponent(selectedPeriod)}`)
            .catch(err => {
              if (err.response?.status === 403) throw new Error('FORBIDDEN');
              return { data: { data: [] } };
            }),
          api.get(`/sales/commissions/settlements?user_id=${rep.id}&period=${encodeURIComponent(selectedPeriod)}`)
            .catch(err => {
              if (err.response?.status === 403) throw new Error('FORBIDDEN');
              return { data: { data: [] } };
            })
        ]);

        const targetsList = targetRes.data?.data || [];
        setGenTarget(targetsList.length > 0 ? targetsList[0] : null);
        setGenCommissions(commRes.data?.data || []);
        setGenSettlements(settRes.data?.data || []);
      }
    } catch (err) {
      if (err.message === 'FORBIDDEN') {
        setDrawerError('عفوًا، ليس لديك صلاحية للاطلاع على كشف أداء هذا الموظف وفقًا لقواعد العزل والصلاحيات.');
      } else {
        setDrawerError('تعذر جلب تفاصيل أداء المندوب لهذه الفترة.');
      }
    } finally {
      setDrawerLoading(false);
    }
  };

  // Re-fetch drawer metrics when selectedPeriod changes while drawer is open
  useEffect(() => {
    if (showDrawer && activeSalesman) {
      handleOpen360Drawer(activeSalesman);
    }
  }, [selectedPeriod]);

  // Modal Handlers
  const handleOpenModal = (s = null) => {
    if (s) {
      setEditingId(s.id);
      setForm({
        name: s.name,
        phone: s.phone === 'N/A' ? '' : s.phone || '',
        email: s.email || '',
        role: s.role || 'sales',
        password: ''
      });
    } else {
      setEditingId(null);
      setForm({
        name: '',
        phone: '',
        email: '',
        role: 'sales',
        password: ''
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('اسم المندوب مطلوب');

    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/users/${editingId}`, {
          name: form.name,
          phone: form.phone,
          email: form.email,
          role: form.role
        }).catch(() => null);
        toast.success('تم تحديث بيانات مسؤول المبيعات بنجاح');
      } else {
        await api.post('/users', {
          name: form.name,
          email: form.email || `rep.${Date.now()}@crm.local`,
          phone: form.phone,
          role: form.role,
          password: form.password || 'Password@123'
        });
        toast.success('تمت إضافة مسؤول المبيعات بنجاح');
      }
      setShowModal(false);
      fetchSalesmen();
    } catch (err) {
      toast.error('حدث خطأ أثناء حفظ البيانات');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف مسؤول المبيعات؟')) return;
    try {
      await api.delete(`/users/${id}`);
      setSalesmen(salesmen.filter(s => s.id !== id));
      toast.success('تم حذف مسؤول المبيعات بنجاح');
    } catch (err) {
      toast.error('فشل حذف مسؤول المبيعات');
    }
  };

  // Unique branches for branch filter
  const branchOptions = Array.from(new Set(salesmen.map(s => s.branch_name).filter(Boolean)));

  // Filtered salesmen based on search and branch
  const filteredSalesmen = salesmen.filter(s => {
    const matchesSearch =
      (s.name && s.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.email && s.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.phone && s.phone.includes(searchQuery)) ||
      (s.department_name && s.department_name.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesBranch = selectedBranch === 'ALL' || s.branch_name === selectedBranch;
    return matchesSearch && matchesBranch;
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1350px', margin: '0 auto', fontFamily: 'inherit' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '12px',
              background: isRealEstate ? 'linear-gradient(135deg, #0284c7, #0369a1)' : 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white'
            }}>
              {isRealEstate ? <Home size={22} /> : <Users size={22} />}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b' }}>
                {isRealEstate ? 'فريق المبيعات العقارية (Real Estate Sales Team)' : 'مسؤولو المبيعات والمناديب (Sales Representatives)'}
              </h2>
              <span style={{
                display: 'inline-block', marginTop: '4px', padding: '2px 8px', borderRadius: '6px',
                fontSize: '11px', fontWeight: 700,
                background: isRealEstate ? '#e0f2fe' : '#dcfce7',
                color: isRealEstate ? '#0369a1' : '#15803d'
              }}>
                {isRealEstate ? 'نظام التطوير والتسويق العقاري 3D Engine' : 'نظام المبيعات والعمولات التجارية'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls & Period Selector */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={16} style={{ color: '#64748b' }} />
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              style={{
                padding: '9px 14px', borderRadius: '10px',
                border: `1.5px solid ${isRealEstate ? '#0284c7' : '#10b981'}`,
                fontWeight: 700, outline: 'none',
                background: isRealEstate ? '#f0f9ff' : '#ecfdf5',
                color: isRealEstate ? '#0369a1' : '#047857',
                fontSize: '13px'
              }}
            >
              {PERIOD_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {['admin', 'manager', 'supervisor'].includes(user?.role) && (
            <button
              onClick={() => handleOpenModal()}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px',
                background: isRealEstate
                  ? 'linear-gradient(135deg, #0284c7, #0369a1)'
                  : 'linear-gradient(135deg, #10b981, #059669)',
                color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800,
                cursor: 'pointer', boxShadow: '0 4px 12px rgba(2,132,199,0.25)', fontSize: '13px'
              }}
            >
              <Plus size={16} /> إضافة مسؤول مبيعات
            </button>
          )}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div style={{
        background: 'white', padding: '14px 18px', borderRadius: '14px',
        border: '1px solid #e2e8f0', marginBottom: '22px', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px'
      }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, minWidth: '280px' }}>
          <input
            type="text"
            placeholder="بحث بالاسم أو البريد أو رقم الهاتف أو القسم..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%', maxWidth: '420px', padding: '9px 14px', borderRadius: '8px',
              border: '1.5px solid #e2e8f0', fontSize: '13px', outline: 'none', background: '#f8fafc'
            }}
          />
        </div>

        {branchOptions.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={16} style={{ color: '#64748b' }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>الفرع:</span>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                fontSize: '13px', fontWeight: 600, outline: 'none', background: 'white'
              }}
            >
              <option value="ALL">جميع الفروع</option>
              {branchOptions.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Salesmen Grid */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', background: 'white', borderRadius: '16px' }}>
          جاري تحميل بيانات مسؤولي المبيعات...
        </div>
      ) : filteredSalesmen.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '60px', textAlign: 'center' }}>
          <Users size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>
            لم يتم العثور على مسؤولي مبيعات
          </h3>
          <p style={{ margin: '0 0 20px 0', color: '#64748b', fontSize: '14px' }}>
            أضف مسؤولي مبيعات إلى المؤسسة لبدء تعيين الصفقات والتارجت والعمولات.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {filteredSalesmen.map((s) => (
            <div
              key={s.id}
              style={{
                background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0',
                padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease'
              }}
            >
              <div>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{
                      width: '46px', height: '46px', borderRadius: '12px',
                      background: isRealEstate ? '#e0f2fe' : '#dcfce7',
                      color: isRealEstate ? '#0369a1' : '#15803d',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px', fontWeight: 800
                    }}>
                      {s.name?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1e293b' }}>{s.name}</h3>
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '11px', padding: '2px 8px', borderRadius: '6px',
                          background: '#f1f5f9', color: '#475569', fontWeight: 700
                        }}>
                          {s.role}
                        </span>
                        {s.branch_name && (
                          <span style={{
                            fontSize: '11px', padding: '2px 8px', borderRadius: '6px',
                            background: '#eff6ff', color: '#1d4ed8', fontWeight: 700
                          }}>
                            {s.branch_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <span style={{
                    padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                    background: s.is_active !== false ? '#dcfce7' : '#fee2e2',
                    color: s.is_active !== false ? '#15803d' : '#b91c1c'
                  }}>
                    {s.is_active !== false ? 'نشط' : 'معطل'}
                  </span>
                </div>

                {/* Performance & Department Card */}
                <div style={{
                  background: '#f8fafc', padding: '14px', borderRadius: '12px',
                  marginBottom: '14px', border: '1px solid #f1f5f9',
                  display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px'
                }}>
                  {s.department_name && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>القسم:</span>
                      <span style={{ fontWeight: 700, color: '#334155' }}>{s.department_name}</span>
                    </div>
                  )}

                  {!isRealEstate && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>إجمالي المبيعات المغلقة:</span>
                        <span style={{ fontWeight: 800, color: '#0ea5e9' }}>
                          {(s.total_sales || 0).toLocaleString()} ج.م
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b', fontWeight: 600 }}>الصفقات النشطة قيد المتابعة:</span>
                        <span style={{ fontWeight: 800, color: '#f59e0b' }}>
                          {s.active_deals || 0} صفقة
                        </span>
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '6px', marginTop: '2px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>الهاتف:</span>
                    <span style={{ fontWeight: 700, color: '#334155' }}>{s.phone || 'غير مسجل'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>البريد:</span>
                    <span style={{ fontWeight: 700, color: '#334155', fontSize: '12px' }}>{s.email}</span>
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                <button
                  onClick={() => handleOpen360Drawer(s)}
                  style={{
                    flex: 1, padding: '8px 14px',
                    background: isRealEstate ? '#f0f9ff' : '#ecfdf5',
                    color: isRealEstate ? '#0284c7' : '#059669',
                    border: `1px solid ${isRealEstate ? '#bae6fd' : '#a7f3d0'}`,
                    borderRadius: '8px', fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px'
                  }}
                >
                  <Eye size={15} /> كشف أداء 360°
                </button>

                {['admin', 'manager'].includes(user?.role) && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => handleOpenModal(s)}
                      style={{ padding: '8px 10px', background: '#f1f5f9', border: 'none', borderRadius: '8px', color: '#475569', fontWeight: 700, cursor: 'pointer' }}
                      title="تعديل"
                    >
                      <Edit2 size={14} />
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        onClick={() => handleDelete(s.id)}
                        style={{ padding: '8px 10px', background: '#fef2f2', border: 'none', borderRadius: '8px', color: '#dc2626', fontWeight: 700, cursor: 'pointer' }}
                        title="حذف"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SALESMEN 360° DRAWER (SLIDE-IN PERFORMANCE & COMMISSIONS HUB) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showDrawer && activeSalesman && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(6px)',
          zIndex: 1200, display: 'flex', justifyContent: 'flex-end'
        }}>
          <div style={{
            width: '100%', maxWidth: '820px', height: '100%', background: 'white',
            boxShadow: '-8px 0 30px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column',
            overflowY: 'auto', animation: 'slideInRight 0.25s ease-out'
          }}>
            {/* Drawer Header */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '12px',
                    background: isRealEstate ? '#0284c7' : '#10b981', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '18px'
                  }}>
                    {activeSalesman.name?.charAt(0)}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>
                      {activeSalesman.name} — ملف الأداء 360°
                    </h3>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                      <span>{activeSalesman.branch_name || 'بدون فرع'}</span>
                      <span>•</span>
                      <span>{activeSalesman.department_name || 'بدون قسم'}</span>
                      <span>•</span>
                      <span>الفترة: <strong style={{ color: '#0f172a' }}>{selectedPeriod}</strong></span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowDrawer(false)}
                style={{
                  width: '36px', height: '36px', borderRadius: '8px', border: 'none',
                  background: '#e2e8f0', color: '#475569', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Body */}
            <div style={{ padding: '24px', flex: 1 }}>
              {drawerLoading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                  جاري جلب مؤشرات الأداء والعمولات المحسوبة...
                </div>
              ) : drawerError ? (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px',
                  padding: '24px', textAlign: 'center', color: '#b91c1c'
                }}>
                  <AlertTriangle size={36} style={{ marginBottom: '10px' }} />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '15px' }}>{drawerError}</p>
                </div>
              ) : (
                <div>
                  {/* REAL ESTATE VERTICAL DRAWER CONTENT */}
                  {isRealEstate && rePerformance && (
                    <div>
                      {/* Summary KPI Cards Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px', marginBottom: '24px' }}>
                        <div style={{ background: '#f0f9ff', padding: '16px', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                          <span style={{ fontSize: '12px', color: '#0369a1', fontWeight: 700 }}>صافي قيمة العقود</span>
                          <div style={{ fontSize: '20px', fontWeight: 800, color: '#0c4a6e', marginTop: '6px' }}>
                            {(rePerformance.summary?.total_contract_value || 0).toLocaleString()} ج.م
                          </div>
                          <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 600 }}>
                            إنجاز: {rePerformance.summary?.contracts_achievement_pct || 0}%
                          </span>
                        </div>

                        <div style={{ background: '#ecfdf5', padding: '16px', borderRadius: '12px', border: '1px solid #a7f3d0' }}>
                          <span style={{ fontSize: '12px', color: '#047857', fontWeight: 700 }}>الوحدات المتعاقدة</span>
                          <div style={{ fontSize: '20px', fontWeight: 800, color: '#064e3b', marginTop: '6px' }}>
                            {rePerformance.summary?.units_contracted_count || 0} وحدة
                          </div>
                          <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>
                            كوتة: {rePerformance.target?.target_units || 0} وحدة
                          </span>
                        </div>

                        <div style={{ background: '#f5f3ff', padding: '16px', borderRadius: '12px', border: '1px solid #ddd6fe' }}>
                          <span style={{ fontSize: '12px', color: '#6d28d9', fontWeight: 700 }}>النقد المحصل الفعلي</span>
                          <div style={{ fontSize: '20px', fontWeight: 800, color: '#4c1d95', marginTop: '6px' }}>
                            {(rePerformance.summary?.total_collected_amount || 0).toLocaleString()} ج.م
                          </div>
                          <span style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 600 }}>
                            مقدمات: {(rePerformance.summary?.total_down_payment || 0).toLocaleString()} ج.م
                          </span>
                        </div>

                        <div style={{ background: '#fffbeb', padding: '16px', borderRadius: '12px', border: '1px solid #fde68a' }}>
                          <span style={{ fontSize: '12px', color: '#b45309', fontWeight: 700 }}>الحجوزات النشطة</span>
                          <div style={{ fontSize: '20px', fontWeight: 800, color: '#78350f', marginTop: '6px' }}>
                            {rePerformance.summary?.active_reservations_count || 0} حجز
                          </div>
                          <span style={{ fontSize: '11px', color: '#d97706', fontWeight: 600 }}>
                            إلغاءات: {rePerformance.summary?.cancellations_count || 0}
                          </span>
                        </div>
                      </div>

                      {/* Navigation Tabs */}
                      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', marginBottom: '18px' }}>
                        {[
                          { key: 'overview', label: 'العقود المبرمة' },
                          { key: 'collections', label: 'التحصيلات النقدية' },
                          { key: 'reservations', label: 'الحجوزات والتسويات' },
                          { key: 'commissions', label: `العمولات (${reCommissions.length})` }
                        ].map(t => (
                          <button
                            key={t.key}
                            onClick={() => setActiveTab(t.key)}
                            style={{
                              padding: '10px 16px', border: 'none', background: 'transparent',
                              borderBottom: activeTab === t.key ? '2.5px solid #0284c7' : '2.5px solid transparent',
                              color: activeTab === t.key ? '#0284c7' : '#64748b', fontWeight: 800,
                              cursor: 'pointer', fontSize: '13px'
                            }}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>

                      {/* Tab 1: Contracts */}
                      {activeTab === 'overview' && (
                        <div>
                          {rePerformance.contracts?.length === 0 ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>لا توجد عقود مبرمة في هذه الفترة</div>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                              <thead>
                                <tr style={{ background: '#f8fafc', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>
                                  <th style={{ padding: '10px' }}>رقم العقد</th>
                                  <th style={{ padding: '10px' }}>العميل</th>
                                  <th style={{ padding: '10px' }}>المشروع والوحدة</th>
                                  <th style={{ padding: '10px' }}>قيمة العقد</th>
                                  <th style={{ padding: '10px' }}>الحالة</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rePerformance.contracts?.map(c => (
                                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '10px', fontWeight: 700 }}>{c.contract_number}</td>
                                    <td style={{ padding: '10px' }}>{c.customer_name}</td>
                                    <td style={{ padding: '10px' }}>{c.project_name} - {c.unit_number}</td>
                                    <td style={{ padding: '10px', fontWeight: 800, color: '#0284c7' }}>
                                      {parseFloat(c.contract_value || 0).toLocaleString()} ج.م
                                    </td>
                                    <td style={{ padding: '10px' }}>
                                      <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>
                                        {c.contract_status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}

                      {/* Tab 2: Collections */}
                      {activeTab === 'collections' && (
                        <div>
                          {rePerformance.collections?.length === 0 ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>لا توجد تحصيلات نقدية في هذه الفترة</div>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                              <thead>
                                <tr style={{ background: '#f8fafc', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>
                                  <th style={{ padding: '10px' }}>المرجع</th>
                                  <th style={{ padding: '10px' }}>النوع</th>
                                  <th style={{ padding: '10px' }}>العقد والوحدة</th>
                                  <th style={{ padding: '10px' }}>المبلغ المحصل</th>
                                  <th style={{ padding: '10px' }}>تاريخ السداد</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rePerformance.collections?.map(col => (
                                  <tr key={col.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '10px', fontWeight: 700 }}>{col.reference_number}</td>
                                    <td style={{ padding: '10px' }}>{col.collection_type_label}</td>
                                    <td style={{ padding: '10px' }}>{col.contract_number} ({col.unit_number})</td>
                                    <td style={{ padding: '10px', fontWeight: 800, color: '#059669' }}>
                                      {parseFloat(col.amount || 0).toLocaleString()} ج.م
                                    </td>
                                    <td style={{ padding: '10px', color: '#64748b' }}>
                                      {col.payment_date ? new Date(col.payment_date).toLocaleDateString('ar-EG') : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}

                      {/* Tab 3: Reservations & Cancellations */}
                      {activeTab === 'reservations' && (
                        <div>
                          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#1e293b' }}>الحجوزات النشطة:</h4>
                          {rePerformance.reservations?.length === 0 ? (
                            <p style={{ color: '#94a3b8', fontSize: '13px' }}>لا توجد حجوزات نشطة حالياً</p>
                          ) : (
                            <div style={{ display: 'grid', gap: '8px', marginBottom: '20px' }}>
                              {rePerformance.reservations.map(r => (
                                <div key={r.id} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                  <span>{r.title} ({r.project_name} - {r.unit_number})</span>
                                  <strong style={{ color: '#d97706' }}>{parseFloat(r.value || 0).toLocaleString()} ج.م</strong>
                                </div>
                              ))}
                            </div>
                          )}

                          <h4 style={{ margin: '14px 0 10px 0', fontSize: '14px', color: '#1e293b' }}>تسويات الإلغاء في الفترة:</h4>
                          {rePerformance.cancellations?.length === 0 ? (
                            <p style={{ color: '#94a3b8', fontSize: '13px' }}>لا توجد تسويات إلغاء</p>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                              <thead>
                                <tr style={{ background: '#fef2f2', textAlign: 'right', borderBottom: '1px solid #fee2e2' }}>
                                  <th style={{ padding: '8px' }}>العقد</th>
                                  <th style={{ padding: '8px' }}>نوع التسوية</th>
                                  <th style={{ padding: '8px' }}>المبلغ المدفوع</th>
                                  <th style={{ padding: '8px' }}>خصم التسوية</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rePerformance.cancellations?.map(c => (
                                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '8px', fontWeight: 700 }}>{c.contract_number}</td>
                                    <td style={{ padding: '8px', color: '#dc2626' }}>{c.settlement_type_label}</td>
                                    <td style={{ padding: '8px' }}>{c.total_paid_amount?.toLocaleString()} ج.م</td>
                                    <td style={{ padding: '8px', fontWeight: 800, color: '#dc2626' }}>
                                      {c.deduction_amount?.toLocaleString()} ج.م
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}

                      {/* Tab 4: Commissions */}
                      {activeTab === 'commissions' && (
                        <div>
                          {reCommissions.length === 0 ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>لا توجد عمولات مسجلة لهذا المندوب</div>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                              <thead>
                                <tr style={{ background: '#f8fafc', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>
                                  <th style={{ padding: '10px' }}>الصفقة / العقد</th>
                                  <th style={{ padding: '10px' }}>النسبة</th>
                                  <th style={{ padding: '10px' }}>المبلغ المحسوب</th>
                                  <th style={{ padding: '10px' }}>المدفوع</th>
                                  <th style={{ padding: '10px' }}>الحالة</th>
                                </tr>
                              </thead>
                              <tbody>
                                {reCommissions.map(comm => (
                                  <tr key={comm.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '10px' }}>
                                      <div style={{ fontWeight: 700 }}>{comm.deal_title || 'صفقة عقارية'}</div>
                                      <div style={{ fontSize: '11px', color: '#64748b' }}>عقد: {comm.contract_number || '—'}</div>
                                    </td>
                                    <td style={{ padding: '10px' }}>{comm.rate}%</td>
                                    <td style={{ padding: '10px', fontWeight: 800, color: '#0284c7' }}>
                                      {parseFloat(comm.calculated_amount || 0).toLocaleString()} ج.م
                                    </td>
                                    <td style={{ padding: '10px', fontWeight: 700, color: '#16a34a' }}>
                                      {parseFloat(comm.paid_amount || 0).toLocaleString()} ج.م
                                    </td>
                                    <td style={{ padding: '10px' }}>
                                      <span style={{
                                        padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 800,
                                        background: comm.status === 'Clawback' ? '#fee2e2' : comm.status === 'Paid' ? '#dcfce7' : '#eff6ff',
                                        color: comm.status === 'Clawback' ? '#dc2626' : comm.status === 'Paid' ? '#15803d' : '#1d4ed8'
                                      }}>
                                        {comm.status === 'Clawback' ? 'استرداد (Clawback)' : comm.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {isRealEstate && !rePerformance && (
                    <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                      <AlertTriangle size={36} style={{ marginBottom: '10px', color: '#cbd5e1' }} />
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '15px', color: '#64748b' }}>
                        لا توجد بيانات أداء مسجلة لهذا الموظف في فترة {selectedPeriod}
                      </p>
                    </div>
                  )}

                  {/* GENERAL BUSINESS VERTICAL DRAWER CONTENT */}
                  {!isRealEstate && (
                    <div>
                      {/* Summary KPI Cards Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '24px' }}>
                        <div style={{ background: '#ecfdf5', padding: '16px', borderRadius: '12px', border: '1px solid #a7f3d0' }}>
                          <span style={{ fontSize: '12px', color: '#047857', fontWeight: 700 }}>تارجت التحصيلات</span>
                          <div style={{ fontSize: '20px', fontWeight: 800, color: '#064e3b', marginTop: '6px' }}>
                            {genTarget ? parseFloat(genTarget.target_amount || 0).toLocaleString() : '—'} ج.م
                          </div>
                          <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>
                            إنجاز: {genTarget?.progress_percentage || 0}%
                          </span>
                        </div>

                        <div style={{ background: '#f0f9ff', padding: '16px', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                          <span style={{ fontSize: '12px', color: '#0369a1', fontWeight: 700 }}>المبيعات المغلقة</span>
                          <div style={{ fontSize: '20px', fontWeight: 800, color: '#0c4a6e', marginTop: '6px' }}>
                            {(activeSalesman.total_sales || 0).toLocaleString()} ج.م
                          </div>
                          <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 600 }}>إجمالي الفواتير</span>
                        </div>

                        <div style={{ background: '#f5f3ff', padding: '16px', borderRadius: '12px', border: '1px solid #ddd6fe' }}>
                          <span style={{ fontSize: '12px', color: '#6d28d9', fontWeight: 700 }}>العمولات المحسوبة</span>
                          <div style={{ fontSize: '20px', fontWeight: 800, color: '#4c1d95', marginTop: '6px' }}>
                            {genCommissions.reduce((sum, c) => sum + (parseFloat(c.calculated_amount) || 0), 0).toLocaleString()} ج.م
                          </div>
                          <span style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 600 }}>
                            عدد الحركات: {genCommissions.length}
                          </span>
                        </div>
                      </div>

                      {/* Navigation Tabs */}
                      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', marginBottom: '18px' }}>
                        {[
                          { key: 'overview', label: 'التارجت والإنجاز' },
                          { key: 'commissions', label: `سجل العمولات (${genCommissions.length})` },
                          { key: 'settlements', label: `التسويات الشهرية (${genSettlements.length})` }
                        ].map(t => (
                          <button
                            key={t.key}
                            onClick={() => setActiveTab(t.key)}
                            style={{
                              padding: '10px 16px', border: 'none', background: 'transparent',
                              borderBottom: activeTab === t.key ? '2.5px solid #10b981' : '2.5px solid transparent',
                              color: activeTab === t.key ? '#059669' : '#64748b', fontWeight: 800,
                              cursor: 'pointer', fontSize: '13px'
                            }}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>

                      {/* Tab 1: Target Overview */}
                      {activeTab === 'overview' && (
                        <div>
                          {genTarget ? (
                            <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <span style={{ fontWeight: 700, color: '#1e293b' }}>قيمة الهدف (Quota):</span>
                                <strong style={{ color: '#10b981', fontSize: '16px' }}>
                                  {parseFloat(genTarget.target_amount || 0).toLocaleString()} ج.م
                                </strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <span style={{ fontWeight: 700, color: '#1e293b' }}>المتحصل الفعلي:</span>
                                <strong style={{ color: '#0ea5e9', fontSize: '16px' }}>
                                  {parseFloat(genTarget.achieved_amount || 0).toLocaleString()} ج.م
                                </strong>
                              </div>
                              <div style={{ background: '#e2e8f0', height: '8px', borderRadius: '4px', overflow: 'hidden', margin: '14px 0' }}>
                                <div style={{
                                  width: `${Math.min(parseFloat(genTarget.progress_percentage || 0), 100)}%`,
                                  background: '#10b981', height: '100%'
                                }} />
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
                                <span>نسبة الإنجاز: {genTarget.progress_percentage || 0}%</span>
                                <span>فترة التارجت: {genTarget.period}</span>
                              </div>
                            </div>
                          ) : (
                            <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                              لا يوجد تارجت مسجل لهذا المندوب في فترة {selectedPeriod}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tab 2: General Commissions */}
                      {activeTab === 'commissions' && (
                        <div>
                          {genCommissions.length === 0 ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>لا توجد عمولات مسجلة لهذه الفترة</div>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                              <thead>
                                <tr style={{ background: '#f8fafc', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>
                                  <th style={{ padding: '10px' }}>الفاتورة / الأمر</th>
                                  <th style={{ padding: '10px' }}>المبلغ الأساسي</th>
                                  <th style={{ padding: '10px' }}>النسبة</th>
                                  <th style={{ padding: '10px' }}>العمولة المحسوبة</th>
                                  <th style={{ padding: '10px' }}>الحالة</th>
                                </tr>
                              </thead>
                              <tbody>
                                {genCommissions.map(comm => (
                                  <tr key={comm.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '10px', fontWeight: 700 }}>
                                      {comm.invoice_number || comm.order_number || 'حركة مبيعات'}
                                    </td>
                                    <td style={{ padding: '10px' }}>
                                      {parseFloat(comm.base_amount || 0).toLocaleString()} ج.م
                                    </td>
                                    <td style={{ padding: '10px' }}>{comm.applied_rate}%</td>
                                    <td style={{ padding: '10px', fontWeight: 800, color: '#10b981' }}>
                                      {parseFloat(comm.calculated_amount || 0).toLocaleString()} ج.م
                                    </td>
                                    <td style={{ padding: '10px' }}>
                                      <span style={{
                                        padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                                        background: comm.status === 'settled' ? '#dcfce7' : '#eff6ff',
                                        color: comm.status === 'settled' ? '#15803d' : '#1d4ed8'
                                      }}>
                                        {comm.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}

                      {/* Tab 3: Monthly Settlements */}
                      {activeTab === 'settlements' && (
                        <div>
                          {genSettlements.length === 0 ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>لا توجد تسويات شهرية مسجلة لهذه الفترة</div>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                              <thead>
                                <tr style={{ background: '#f8fafc', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>
                                  <th style={{ padding: '10px' }}>الفترة</th>
                                  <th style={{ padding: '10px' }}>إجمالي العمولات</th>
                                  <th style={{ padding: '10px' }}>المكافأة</th>
                                  <th style={{ padding: '10px' }}>صافي المستحق</th>
                                  <th style={{ padding: '10px' }}>حالة الصرف</th>
                                </tr>
                              </thead>
                              <tbody>
                                {genSettlements.map(sett => (
                                  <tr key={sett.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '10px', fontWeight: 700 }}>{sett.period}</td>
                                    <td style={{ padding: '10px' }}>
                                      {parseFloat(sett.gross_commission || 0).toLocaleString()} ج.م
                                    </td>
                                    <td style={{ padding: '10px', color: '#0ea5e9' }}>
                                      {parseFloat(sett.bonus_amount || 0).toLocaleString()} ج.م
                                    </td>
                                    <td style={{ padding: '10px', fontWeight: 800, color: '#10b981' }}>
                                      {parseFloat(sett.total_settlement || 0).toLocaleString()} ج.م
                                    </td>
                                    <td style={{ padding: '10px' }}>
                                      <span style={{
                                        padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                                        background: sett.payout_status === 'paid' ? '#dcfce7' : '#fef3c7',
                                        color: sett.payout_status === 'paid' ? '#15803d' : '#b45309'
                                      }}>
                                        {sett.payout_status || sett.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL: ADD / EDIT SALES REPRESENTATIVE                        */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300, padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px',
            overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{
              padding: '18px 24px', borderBottom: '1px solid #f1f5f9',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                {editingId ? 'تعديل بيانات مسؤول المبيعات' : 'إضافة مسؤول مبيعات جديد'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>الاسم الكامل *</label>
                <input
                  type="text"
                  placeholder="مثال: أحمد محمود"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', fontWeight: 600, outline: 'none', background: '#f8fafc', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>الهاتف</label>
                  <input
                    type="text"
                    placeholder="01012345678"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', fontWeight: 600, outline: 'none', background: '#f8fafc', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>الدور الوظيفي</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', fontWeight: 600, outline: 'none', background: '#f8fafc', boxSizing: 'border-box' }}
                  >
                    <option value="sales">مندوب مبيعات (Sales)</option>
                    <option value="agent">وكيل عقاري (Agent)</option>
                    <option value="manager">مدير مبيعات (Manager)</option>
                    <option value="supervisor">مشرف فريق (Supervisor)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>البريد الإلكتروني</label>
                <input
                  type="email"
                  placeholder="sales.rep@company.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', fontWeight: 600, outline: 'none', background: '#f8fafc', boxSizing: 'border-box' }}
                />
              </div>

              {!editingId && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>كلمة المرور المؤقتة</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', fontWeight: 600, outline: 'none', background: '#f8fafc', boxSizing: 'border-box' }}
                  />
                </div>
              )}

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
                  disabled={saving}
                  style={{
                    padding: '10px 22px',
                    background: isRealEstate
                      ? 'linear-gradient(135deg, #0284c7, #0369a1)'
                      : 'linear-gradient(135deg, #10b981, #059669)',
                    color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800,
                    cursor: saving ? 'not-allowed' : 'pointer'
                  }}
                >
                  {saving ? 'جاري الحفظ...' : editingId ? 'تحديث' : 'حفظ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Salesmen;
