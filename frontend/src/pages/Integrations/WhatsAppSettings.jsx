import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  MessageCircle, Save, Send, Eye, EyeOff, Globe, Phone,
  FileText, ToggleLeft, ToggleRight, CheckCircle, AlertCircle, Info, ShieldCheck,
  Star, RefreshCw, ExternalLink, Sparkles, Bot, Check
} from 'lucide-react';
import IntegrationsSubNav from '../../components/Integrations/IntegrationsSubNav';

const WhatsAppSettings = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({
    phone_number_id: '',
    waba_id: '',
    access_token: '',
    template_name: '',
    template_language_ar: 'ar',
    template_language_en: 'en_US',
    send_arabic: true,
    send_english: false,
    default_country_code: '20',
    is_active: false,
    has_access_token: false,
    token_preview: '',
    auto_greeting_enabled: false,
    auto_greeting_triggers: ['meta_lead'],
    auto_greeting_template: '',
    auto_greeting_language: 'ar'
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testLang, setTestLang] = useState('ar');
  const [testing, setTesting] = useState(false);
  const [discoveredNumbers, setDiscoveredNumbers] = useState([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredTemplates, setDiscoveredTemplates] = useState([]);
  const [discoveringTemplates, setDiscoveringTemplates] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState(null);

  // Multi-number WhatsApp accounts
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [syncingAccounts, setSyncingAccounts] = useState(false);

  // -------------------------------------------------------------------
  // Load settings & accounts on mount
  // -------------------------------------------------------------------
  useEffect(() => {
    fetchSettings();
    fetchAccounts();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await api.get('/whatsapp/settings');
      if (res.data?.data) {
        setSettings(prev => ({
          ...prev,
          ...res.data.data,
          access_token: '',
          token_preview: res.data.data.token_preview || ''
        }));
      }
    } catch {
      toast.error('Failed to load WhatsApp settings');
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const res = await api.get('/whatsapp/accounts');
      setAccounts(res.data?.data || []);
    } catch {
      // ignore
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleSyncAccounts = async () => {
    setSyncingAccounts(true);
    try {
      const res = await api.post('/whatsapp/accounts/sync');
      toast.success(res.data?.message || 'تمت مزامنة أرقام واتساب بنجاح من Meta');
      fetchAccounts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشلت مزامنة الأرقام من Meta');
    } finally {
      setSyncingAccounts(false);
    }
  };

  const handleSetDefaultAccount = async (id) => {
    try {
      await api.post(`/whatsapp/accounts/${id}/default`);
      toast.success('تم تعيين الرقم الافتراضي بنجاح');
      fetchAccounts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل تغيير الرقم الافتراضي');
    }
  };

  const handleToggleAccount = async (id) => {
    try {
      await api.patch(`/whatsapp/accounts/${id}/toggle`);
      toast.success('تم تحديث حالة تفعيل الرقم');
      fetchAccounts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل تحديث حالة الرقم');
    }
  };

  // -------------------------------------------------------------------
  // Save settings
  // -------------------------------------------------------------------
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post('/whatsapp/settings', settings);
      toast.success('✅ تم حفظ إعدادات واتساب بنجاح!');
      const newPreview = res.data?.data?.token_preview || settings.token_preview;
      setSettings(prev => ({
        ...prev,
        access_token: '',
        has_access_token: true,
        token_preview: newPreview || prev.token_preview
      }));
      setShowTokenInput(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------------
  // Discover Phone Numbers from Meta using WABA ID
  // -------------------------------------------------------------------
  const handleDiscoverNumbers = async () => {
    if (!settings.phone_number_id) {
      toast.error('أدخل معرّف الحساب في خانة Phone Number ID أولاً للبحث عن الأرقام التابعة له');
      return;
    }
    setDiscovering(true);
    try {
      const res = await api.get(`/whatsapp/phone-numbers?waba_id=${encodeURIComponent(settings.phone_number_id.trim())}`);
      const numbers = res.data?.data || [];
      setDiscoveredNumbers(numbers);
      if (numbers.length > 0) {
        toast.success(res.data.message || `تم العثور على ${numbers.length} رقم`);
      } else {
        toast('لم يتم العثور على أرقام مسجلة لهذا المعرّف');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل جلب أرقام الهواتف من Meta', { duration: 6000 });
    } finally {
      setDiscovering(false);
    }
  };

  // -------------------------------------------------------------------
  // Discover approved templates from Meta
  // -------------------------------------------------------------------
  const handleDiscoverTemplates = async () => {
    if (!settings.phone_number_id && !settings.waba_id) {
      toast.error('أدخل Phone Number ID أو WABA ID أولاً لجلب القوالب');
      return;
    }
    setDiscoveringTemplates(true);
    try {
      const q = settings.waba_id ? `?waba_id=${encodeURIComponent(settings.waba_id.trim())}` : '';
      const res = await api.get(`/whatsapp/templates${q}`);
      const templates = res.data?.data || [];
      setDiscoveredTemplates(templates);
      if (res.data?.wabaId && !settings.waba_id) {
        setSettings(prev => ({ ...prev, waba_id: res.data.wabaId }));
      }
      if (templates.length > 0) {
        toast.success(res.data.message || `تم العثور على ${templates.length} قالب`);
      } else {
        toast('لم يتم العثور على قوالب مسجلة لهذا الحساب');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل جلب القوالب من Meta', { duration: 7000 });
    } finally {
      setDiscoveringTemplates(false);
    }
  };

  // -------------------------------------------------------------------
  // Send test message
  // -------------------------------------------------------------------
  const handleTest = async () => {
    if (!testPhone) return toast.error('Enter a phone number for the test');
    setTesting(true);
    try {
      const res = await api.post('/whatsapp/test', {
        to_phone: testPhone,
        language: testLang,
        language_code: testLang === 'en' ? settings.template_language_en : settings.template_language_ar,
        template_name: settings.template_name
      });
      toast.success(res.data.message || 'Test message sent!');
      if (res.data?.data?.resolvedPhoneId && res.data.data.resolvedPhoneId !== settings.phone_number_id) {
        setSettings(prev => ({ ...prev, phone_number_id: res.data.data.resolvedPhoneId }));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Test failed', { duration: 8000 });
    } finally {
      setTesting(false);
    }
  };

  // -------------------------------------------------------------------
  // Deep diagnostic check with Meta
  // -------------------------------------------------------------------
  const handleDiagnose = async () => {
    setDiagnosing(true);
    setDiagnosticReport(null);
    try {
      const res = await api.get('/whatsapp/diagnose');
      setDiagnosticReport(res.data?.report || res.data);
      if (res.data?.status === 'success') {
        toast.success('الاتصال والتوكن ومعرّف الهاتف سليم 100%!');
      } else {
        toast.error('تم اكتشاف خطأ في الصلاحيات أو المعرّف — راجع التقرير بالأسفل');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل تشخيص الاتصال');
    } finally {
      setDiagnosing(false);
    }
  };

  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleToggleTrigger = (trigger) => {
    setSettings(prev => {
      const current = Array.isArray(prev.auto_greeting_triggers) ? prev.auto_greeting_triggers : [];
      const updated = current.includes(trigger)
        ? current.filter(t => t !== trigger)
        : [...current, trigger];
      return { ...prev, auto_greeting_triggers: updated };
    });
  };

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <MessageCircle size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
        <p>Loading WhatsApp settings…</p>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  return (
    <div style={{ padding: '24px', maxWidth: 800 }}>
      <IntegrationsSubNav />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'linear-gradient(135deg, #25D366, #128C7E)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <MessageCircle size={22} color="#fff" />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>WhatsApp Integration</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            Automatically send a welcome message when a new Meta lead is created
          </p>
        </div>
        {/* Active badge */}
        <div style={{ marginLeft: 'auto' }}>
          {settings.is_active ? (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#dcfce7', color: '#16a34a',
              padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600
            }}>
              <CheckCircle size={14} /> Active
            </span>
          ) : (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#f3f4f6', color: '#6b7280',
              padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600
            }}>
              <AlertCircle size={14} /> Inactive
            </span>
          )}
        </div>
      </div>

      {/* How it works banner */}
      <div style={{
        background: '#eff6ff', border: '1px solid #bfdbfe',
        borderRadius: 10, padding: '14px 18px', marginBottom: 28,
        display: 'flex', gap: 12, alignItems: 'flex-start'
      }}>
        <Info size={18} color="#2563eb" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 13, color: '#1e40af', lineHeight: 1.6 }}>
          <strong>How it works:</strong> When a new lead arrives from Meta (via real-time webhook or manual sync),
          the CRM will automatically send a WhatsApp template message to the customer's phone number.
          You must create a <strong>pre-approved template</strong> in your Meta Business account first,
          then enter its name below.
        </div>
      </div>

      {/* ── Connected WhatsApp Numbers (Multi-Number Management) ── */}
      <div style={{
        background: '#fff', border: '1px solid var(--border)',
        borderRadius: 12, padding: 24, marginBottom: 24,
        boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Phone size={18} color="#25D366" /> Connected WhatsApp Numbers ({accounts.length})
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Manage multiple WhatsApp Business phone numbers for your organization and team inbox
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={handleSyncAccounts}
              disabled={syncingAccounts}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac',
                borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: syncingAccounts ? 'not-allowed' : 'pointer'
              }}
            >
              <RefreshCw size={14} className={syncingAccounts ? 'animate-spin' : ''} />
              {syncingAccounts ? 'Syncing...' : 'Sync Numbers from Meta'}
            </button>

            <button
              type="button"
              onClick={() => navigate('/whatsapp-chat')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                background: 'linear-gradient(135deg, #25D366, #128C7E)', color: 'white', border: 'none',
                borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(37,211,102,0.3)'
              }}
            >
              <MessageCircle size={14} /> Open WhatsApp Chat
            </button>
          </div>
        </div>

        {loadingAccounts ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
            Loading connected numbers...
          </div>
        ) : accounts.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', background: '#f8fafc', borderRadius: 8, border: '1px dashed #cbd5e1' }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#475569' }}>No WhatsApp numbers synced yet</p>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
              Ensure your WABA credentials are saved below, then click "Sync Numbers from Meta" to import all attached numbers automatically.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Phone Number</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Verified Name</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Phone Number ID</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Status</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(acc => (
                  <tr key={acc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{acc.display_phone_number || acc.phone_number_id}</span>
                        {acc.is_default && (
                          <span style={{
                            background: '#dbeafe', color: '#1d4ed8', fontSize: 11,
                            padding: '1px 7px', borderRadius: 12, fontWeight: 700
                          }}>
                            ★ Primary Default
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#475569' }}>
                      {acc.verified_name || '—'}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>
                      {acc.phone_number_id}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: acc.is_active ? '#ecfdf5' : '#fef2f2',
                        color: acc.is_active ? '#15803d' : '#b91c1c'
                      }}>
                        {acc.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        {!acc.is_default && (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultAccount(acc.id)}
                            style={{
                              background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155',
                              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer'
                            }}
                          >
                            Set as Default
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggleAccount(acc.id)}
                          style={{
                            background: acc.is_active ? '#fff1f2' : '#f0fdf4',
                            border: `1px solid ${acc.is_active ? '#fecdd3' : '#bbf7d0'}`,
                            color: acc.is_active ? '#e11d48' : '#16a34a',
                            padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer'
                          }}
                        >
                          {acc.is_active ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form onSubmit={handleSave}>
        {/* ── Section 1: Account Credentials ── */}
        <div style={{
          background: '#fff', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24, marginBottom: 20
        }}>
          <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Phone size={16} /> WhatsApp Business Credentials
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Phone Number ID */}
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>
                  Phone Number ID (معرّف رقم الهاتف) *
                </label>
                <button
                  type="button"
                  onClick={handleDiscoverNumbers}
                  disabled={discovering || !settings.phone_number_id}
                  style={{
                    background: '#f0fdf4', border: '1px solid #86efac', color: '#15803d',
                    padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                    cursor: discovering || !settings.phone_number_id ? 'not-allowed' : 'pointer'
                  }}
                >
                  {discovering ? 'جاري البحث في Meta...' : '🔍 جلب أرقام الهواتف من Meta'}
                </button>
              </div>

              <input
                type="text"
                value={settings.phone_number_id}
                onChange={e => handleChange('phone_number_id', e.target.value)}
                placeholder="e.g. 105829182746193"
                required
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8,
                  border: '1px solid var(--border)', fontSize: 14,
                  fontFamily: 'monospace', boxSizing: 'border-box'
                }}
              />

              {/* Discovered Numbers List */}
              {discoveredNumbers.length > 0 && (
                <div style={{ marginTop: 10, padding: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 8 }}>
                    📱 الأرقام المسجلة في حسابك على Meta:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {discoveredNumbers.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'white', border: '1px solid #dcfce7', borderRadius: 6 }}>
                        <div>
                          <strong>{item.display_phone_number}</strong> {item.verified_name ? `(${item.verified_name})` : ''} — <span style={{ fontSize: 12, color: '#64748b' }}>ID: <code>{item.id}</code></span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            handleChange('phone_number_id', item.id);
                            toast.success(`تم اختيار الرقم: ${item.display_phone_number}`);
                          }}
                          style={{
                            background: '#16a34a', color: 'white', border: 'none',
                            padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          استخدام هذا الرقم
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ margin: '6px 0 0', fontSize: 12, color: '#b45309', background: '#fffbeb', padding: '8px 12px', borderRadius: 8, border: '1px solid #fde68a', lineHeight: 1.5 }}>
                💡 <strong>تنبيه هام:</strong> تأكد من وضع <strong>Phone number ID</strong> (معرّف رقم الهاتف) وليس معرّف التطبيق (App ID) أو معرّف الحساب الإعلاني. تجده في لوحة تحكم Meta Developers تحت: <strong>WhatsApp &gt; API Setup &gt; Phone number ID</strong>.
              </div>
            </div>

            {/* WhatsApp Business Account ID (WABA ID) */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                WhatsApp Business Account ID (WABA ID) (اختياري - لجلب القوالب تلقائياً)
              </label>
              <input
                type="text"
                value={settings.waba_id || ''}
                onChange={e => handleChange('waba_id', e.target.value)}
                placeholder="e.g. 102938475610293 (انسخه من صفحة WhatsApp > API Setup)"
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8,
                  border: '1px solid var(--border)', fontSize: 14,
                  fontFamily: 'monospace', boxSizing: 'border-box'
                }}
              />
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                معرّف الحساب التجاري (تجده في نفس صفحة API Setup أسفل حقل Phone number ID مباشرة)
              </p>
            </div>

            {/* Access Token */}
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>
                  Access Token {settings.has_access_token ? '(محفوظ في النظام)' : '*'}
                </label>
                {settings.has_access_token && (
                  <button
                    type="button"
                    onClick={() => setShowTokenInput(v => !v)}
                    style={{
                      background: 'none', border: 'none', color: '#2563eb', fontSize: 12,
                      fontWeight: 700, cursor: 'pointer', textDecoration: 'underline'
                    }}
                  >
                    {showTokenInput ? 'إلغاء التعديل' : '🔄 تعديل / إدخال توكن جديد'}
                  </button>
                )}
              </div>

              {settings.has_access_token && !showTokenInput ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', background: '#ecfdf5', border: '1px solid #a7f3d0',
                  borderRadius: 8
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#065f46', fontSize: 13, fontWeight: 600 }}>
                    <CheckCircle size={18} color="#10b981" />
                    <span>التوكن محفوظ ونشط في قاعدة البيانات ({settings.token_preview || '••••••••••••••••'})</span>
                  </div>
                  <span style={{ fontSize: 11, background: '#d1fae5', color: '#047857', padding: '3px 10px', borderRadius: 6, fontWeight: 700 }}>
                    جاهز للاستخدام ✅
                  </span>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={settings.access_token}
                    onChange={e => handleChange('access_token', e.target.value)}
                    placeholder={settings.has_access_token ? 'أدخل التوكن الجديد هنا أو اتركه فارغاً للاحتفاظ بالتوكن الحالي...' : 'Permanent system-user token (e.g. EAAB...)'}
                    required={!settings.has_access_token}
                    style={{
                      width: '100%', padding: '9px 40px 9px 12px', borderRadius: 8,
                      border: '1px solid var(--border)', fontSize: 14,
                      fontFamily: 'monospace', boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(v => !v)}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)'
                    }}
                  >
                    {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              )}

              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                استخدم توكن مستخدم النظام الدائم (System User Token) مع صلاحيات <code>whatsapp_business_messaging</code> و <code>whatsapp_business_management</code>
              </p>
            </div>
          </div>
        </div>

        {/* ── Section 2: Template Configuration ── */}
        <div style={{
          background: '#fff', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24, marginBottom: 20
        }}>
          <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={16} /> Message Template
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Template Name */}
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>
                  Template Name *
                </label>
                <button
                  type="button"
                  onClick={handleDiscoverTemplates}
                  disabled={discoveringTemplates || !settings.phone_number_id}
                  style={{
                    background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                    padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                    cursor: discoveringTemplates || !settings.phone_number_id ? 'not-allowed' : 'pointer'
                  }}
                >
                  {discoveringTemplates ? 'جاري جلب القوالب...' : '🔍 جلب القوالب من Meta'}
                </button>
              </div>
              <input
                type="text"
                value={settings.template_name}
                onChange={e => handleChange('template_name', e.target.value)}
                placeholder="e.g. welcome_new_lead"
                required
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8,
                  border: '1px solid var(--border)', fontSize: 14,
                  fontFamily: 'monospace', boxSizing: 'border-box'
                }}
              />

              {/* Discovered Templates List */}
              {discoveredTemplates.length > 0 && (
                <div style={{ marginTop: 10, padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>📑 القوالب المسجلة في حسابك على Meta ({discoveredTemplates.length}):</span>
                    <button
                      type="button"
                      onClick={() => setDiscoveredTemplates([])}
                      style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer' }}
                    >
                      إخفاء القائمة ✕
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                    {discoveredTemplates.map((t, idx) => {
                      const isApproved = t.status === 'APPROVED';
                      return (
                        <div key={t.id || idx} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 12px', background: isApproved ? 'white' : '#fef2f2',
                          border: `1px solid ${isApproved ? '#cbd5e1' : '#fecaca'}`, borderRadius: 6
                        }}>
                          <div>
                            <code style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{t.name}</code>
                            <span style={{
                              marginLeft: 8, marginRight: 8, fontSize: 11, padding: '2px 6px', borderRadius: 4,
                              background: isApproved ? '#dcfce7' : '#fee2e2',
                              color: isApproved ? '#166534' : '#991b1b', fontWeight: 600
                            }}>
                              {t.status}
                            </span>
                            <span style={{ fontSize: 11, color: '#64748b' }}>
                              اللغة: <strong>{t.language}</strong>
                            </span>
                          </div>
                          {isApproved && (
                            <button
                              type="button"
                              onClick={() => {
                                handleChange('template_name', t.name);
                                if (t.language && t.language.startsWith('ar')) {
                                  handleChange('send_arabic', true);
                                  handleChange('template_language_ar', t.language);
                                  setTestLang('ar');
                                } else if (t.language) {
                                  handleChange('send_arabic', false);
                                  handleChange('send_english', true);
                                  handleChange('template_language_en', t.language);
                                  setTestLang('en');
                                }
                                toast.success(`تم اختيار القالب: ${t.name} (${t.language})`);
                              }}
                              style={{
                                background: '#2563eb', color: 'white', border: 'none',
                                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              استخدام هذا القالب
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                يجب أن يطابق اسم القالب في Meta بالضبط (حروف صغيرة وشرطة سفلية، مثل: <code>hello_world</code> أو <code>welcome_lead</code>)
              </p>
            </div>

            {/* Language toggles */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                Arabic Template
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => handleChange('send_arabic', !settings.send_arabic)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {settings.send_arabic
                    ? <ToggleRight size={32} color="#25D366" />
                    : <ToggleLeft size={32} color="#9ca3af" />}
                </button>
                <span style={{ fontSize: 13, color: settings.send_arabic ? '#16a34a' : '#6b7280' }}>
                  {settings.send_arabic ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              {settings.send_arabic && (
                <select
                  value={['ar', 'ar_SA', 'ar_EG'].includes(settings.template_language_ar) ? settings.template_language_ar : 'ar'}
                  onChange={e => handleChange('template_language_ar', e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box',
                    background: 'white'
                  }}
                >
                  <option value="ar">العربية — Arabic (ar)</option>
                  <option value="ar_SA">العربية (السعودية) — (ar_SA)</option>
                  <option value="ar_EG">العربية (مصر) — (ar_EG)</option>
                </select>
              )}
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>رمز لغة القالب المعتمد في Meta</p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                English Template
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => handleChange('send_english', !settings.send_english)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {settings.send_english
                    ? <ToggleRight size={32} color="#25D366" />
                    : <ToggleLeft size={32} color="#9ca3af" />}
                </button>
                <span style={{ fontSize: 13, color: settings.send_english ? '#16a34a' : '#6b7280' }}>
                  {settings.send_english ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              {settings.send_english && (
                <select
                  value={['en_US', 'en', 'en_GB'].includes(settings.template_language_en) ? settings.template_language_en : 'en_US'}
                  onChange={e => handleChange('template_language_en', e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box',
                    background: 'white'
                  }}
                >
                  <option value="en_US">English (US) — (en_US)</option>
                  <option value="en">English — (en)</option>
                  <option value="en_GB">English (UK) — (en_GB)</option>
                </select>
              )}
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>رمز لغة القالب المعتمد في Meta</p>
            </div>
          </div>
        </div>

        {/* ── Section 2.5: Automated Greeting Message ── */}
        <div style={{
          background: '#fff', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24, marginBottom: 20
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a' }}>
                <Sparkles size={18} color="#059669" /> Automated Welcome & Greeting Message
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                Automatically send an approved Meta template to new leads to initiate conversation and open Meta's 24-hour service window once they reply.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={() => handleChange('auto_greeting_enabled', !settings.auto_greeting_enabled)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {settings.auto_greeting_enabled
                  ? <ToggleRight size={36} color="#059669" />
                  : <ToggleLeft size={36} color="#9ca3af" />}
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, color: settings.auto_greeting_enabled ? '#059669' : '#64748b' }}>
                {settings.auto_greeting_enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          {settings.auto_greeting_enabled && (
            <div style={{ background: '#f8fafc', padding: 18, borderRadius: 10, border: '1px solid #e2e8f0', marginTop: 12 }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                When should the automated greeting message be sent? (Select triggers):
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  {
                    id: 'meta_lead',
                    title: 'Meta Lead Ads Leads',
                    desc: 'Send welcome message immediately when a new lead arrives from Facebook / Instagram Lead Ads'
                  },
                  {
                    id: 'manual_customer',
                    title: 'Manual CRM Customer Creation',
                    desc: 'Send welcome message when an agent manually adds a new customer into the CRM'
                  },
                  {
                    id: 'new_inbound',
                    title: 'First Inbound from Unknown Number',
                    desc: 'Send welcome template when an unrecorded phone number sends its first message'
                  }
                ].map(trigger => {
                  const isSelected = Array.isArray(settings.auto_greeting_triggers) && settings.auto_greeting_triggers.includes(trigger.id);
                  return (
                    <div
                      key={trigger.id}
                      onClick={() => handleToggleTrigger(trigger.id)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 8,
                        background: isSelected ? '#ecfdf5' : 'white',
                        border: `1.5px solid ${isSelected ? '#059669' : '#e2e8f0'}`,
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: 4,
                          background: isSelected ? '#059669' : 'white',
                          border: `1.5px solid ${isSelected ? '#059669' : '#cbd5e1'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          {isSelected && <Check size={13} color="white" />}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? '#065f46' : '#1e293b' }}>
                          {trigger.title}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 0 26px', fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
                        {trigger.desc}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Welcome Message Template Name *
                  </label>
                  <input
                    type="text"
                    value={settings.auto_greeting_template || ''}
                    onChange={e => handleChange('auto_greeting_template', e.target.value)}
                    placeholder={settings.template_name || 'e.g. welcome_new_lead'}
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: 8,
                      border: '1px solid var(--border)', fontSize: 14,
                      fontFamily: 'monospace', boxSizing: 'border-box'
                    }}
                  />
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>
                    Leave blank to use primary template: <code>{settings.template_name || 'welcome_new_lead'}</code>
                  </p>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Welcome Template Language
                  </label>
                  <select
                    value={settings.auto_greeting_language || 'ar'}
                    onChange={e => handleChange('auto_greeting_language', e.target.value)}
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: 8,
                      border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box',
                      background: 'white'
                    }}
                  >
                    <option value="ar">Arabic (ar)</option>
                    <option value="ar_SA">Arabic - Saudi Arabia (ar_SA)</option>
                    <option value="ar_EG">Arabic - Egypt (ar_EG)</option>
                    <option value="en_US">English (US) — (en_US)</option>
                    <option value="en">English (en)</option>
                  </select>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>
                    Must match the approved template language code registered in Meta
                  </p>
                </div>
              </div>

              <div style={{ marginTop: 14, padding: '10px 14px', background: '#ecfdf5', borderRadius: 8, border: '1px solid #a7f3d0', fontSize: 12, color: '#065f46', lineHeight: 1.5 }}>
                💡 <strong>How it works:</strong> The system sends your pre-approved Meta template to initiate contact. Once the customer replies with any message, Meta automatically opens the 24-hour service window, allowing your ChatBot scenario or sales representatives to engage without template restrictions.
              </div>
            </div>
          )}
        </div>

        {/* ── Section 3: Phone & Activation ── */}
        <div style={{
          background: '#fff', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24, marginBottom: 20
        }}>
          <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Globe size={16} /> Regional Settings & Activation
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Default Country Code */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Default Country Code
              </label>
              <select
                value={settings.default_country_code}
                onChange={e => handleChange('default_country_code', e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8,
                  border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box'
                }}
              >
                <option value="20">🇪🇬 Egypt (+20)</option>
                <option value="966">🇸🇦 Saudi Arabia (+966)</option>
                <option value="971">🇦🇪 UAE (+971)</option>
                <option value="962">🇯🇴 Jordan (+962)</option>
                <option value="965">🇰🇼 Kuwait (+965)</option>
                <option value="974">🇶🇦 Qatar (+974)</option>
                <option value="973">🇧🇭 Bahrain (+973)</option>
                <option value="968">🇴🇲 Oman (+968)</option>
                <option value="218">🇱🇾 Libya (+218)</option>
                <option value="216">🇹🇳 Tunisia (+216)</option>
                <option value="212">🇲🇦 Morocco (+212)</option>
              </select>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                Applied to phone numbers without a country code (e.g. 01012345678 → +2001012345678)
              </p>
            </div>

            {/* Active Toggle */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                Integration Status
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => handleChange('is_active', !settings.is_active)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {settings.is_active
                    ? <ToggleRight size={36} color="#25D366" />
                    : <ToggleLeft size={36} color="#9ca3af" />}
                </button>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: settings.is_active ? '#16a34a' : '#6b7280' }}>
                    {settings.is_active ? 'Active' : 'Inactive'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {settings.is_active
                      ? 'Messages will be sent automatically'
                      : 'Messages are disabled — leads are still imported'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginBottom: 28 }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 24px', borderRadius: 8,
              background: saving ? '#9ca3af' : '#25D366',
              color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 600
            }}
          >
            <Save size={16} />
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* ── Test Message Section ── */}
      <div style={{
        background: '#fff', border: '1px solid var(--border)',
        borderRadius: 12, padding: 24
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Send size={16} /> Send Test Message
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
          تحقق من الربط بإرسال رسالة تجريبية لأي رقم. يتم فحص الرقم تلقائياً في بيانات العملاء: إذا كان مسجلاً في النظام سيتم استخدام اسمه الفعلي في متغير القالب، وإذا لم يكن مسجلاً سيتم استخدام رقم هاتفه كاسم.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
            placeholder="e.g. 01012345678 or +201012345678"
            style={{
              flex: 1, minWidth: 220, padding: '9px 12px', borderRadius: 8,
              border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box'
            }}
          />
          <select
            value={testLang}
            onChange={e => setTestLang(e.target.value)}
            style={{
              padding: '9px 12px', borderRadius: 8,
              border: '1px solid var(--border)', fontSize: 14
            }}
          >
            <option value="ar">Arabic</option>
            <option value="en">English</option>
          </select>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !testPhone}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 20px', borderRadius: 8,
              background: testing || !testPhone ? '#9ca3af' : '#1d4ed8',
              color: '#fff', border: 'none',
              cursor: testing || !testPhone ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap'
            }}
          >
            <Send size={15} />
            {testing ? 'Sending…' : 'Send Test'}
          </button>
        </div>
      </div>

      {/* ── Diagnostic Tool Section ── */}
      <div style={{
        background: '#fff', border: '1px solid var(--border)',
        borderRadius: 12, padding: 24, marginTop: 20
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} color="#0284c7" /> أداة فحص وتشخيص الاتصال مع Meta
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              تتحقق من صلاحية الـ Token، التطبيق المربوط به، وصلاحية الوصول للرقم لكشف سبب أي رفض من Meta فوراً.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDiagnose}
            disabled={diagnosing}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px',
              background: diagnosing ? '#9ca3af' : '#0284c7', color: 'white', border: 'none',
              borderRadius: 8, fontWeight: 700, cursor: diagnosing ? 'not-allowed' : 'pointer', fontSize: 13
            }}
          >
            {diagnosing ? 'جاري الفحص...' : '🩺 فحص الاتصال والتوكن الآن'}
          </button>
        </div>

        {diagnosticReport && (
          <div style={{ marginTop: 14, padding: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>
              نتائج الفحص والتشخيص من سيرفرات Meta:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {diagnosticReport.steps?.map((s, idx) => (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
                  background: s.status === 'success' ? '#ecfdf5' : '#fef2f2',
                  border: `1px solid ${s.status === 'success' ? '#a7f3d0' : '#fecaca'}`,
                  borderRadius: 6, fontSize: 13
                }}>
                  {s.status === 'success' ? (
                    <CheckCircle size={18} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
                  ) : (
                    <AlertCircle size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 700, color: s.status === 'success' ? '#065f46' : '#991b1b', marginBottom: 2 }}>
                      {s.step}
                    </div>
                    <div style={{ color: s.status === 'success' ? '#047857' : '#b91c1c', lineHeight: 1.4 }}>
                      {s.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppSettings;
