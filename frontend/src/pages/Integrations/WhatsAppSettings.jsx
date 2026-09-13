import { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  MessageCircle, Save, Send, Eye, EyeOff, Globe, Phone,
  FileText, ToggleLeft, ToggleRight, CheckCircle, AlertCircle, Info
} from 'lucide-react';
import IntegrationsSubNav from '../../components/Integrations/IntegrationsSubNav';

const WhatsAppSettings = () => {
  const [settings, setSettings] = useState({
    phone_number_id: '',
    access_token: '',
    template_name: '',
    template_language_ar: 'ar',
    template_language_en: 'en_US',
    send_arabic: true,
    send_english: false,
    default_country_code: '20',
    is_active: false,
    has_access_token: false,
    token_preview: ''
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testLang, setTestLang] = useState('ar');
  const [testing, setTesting] = useState(false);

  // -------------------------------------------------------------------
  // Load settings on mount
  // -------------------------------------------------------------------
  useEffect(() => {
    fetchSettings();
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
  // Send test message
  // -------------------------------------------------------------------
  const handleTest = async () => {
    if (!testPhone) return toast.error('Enter a phone number for the test');
    setTesting(true);
    try {
      const res = await api.post('/whatsapp/test', {
        to_phone: testPhone,
        language: testLang
      });
      toast.success(res.data.message || 'Test message sent!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
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
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Phone Number ID (معرّف رقم الهاتف) *
              </label>
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
              <div style={{ margin: '6px 0 0', fontSize: 12, color: '#b45309', background: '#fffbeb', padding: '8px 12px', borderRadius: 8, border: '1px solid #fde68a', lineHeight: 1.5 }}>
                ⚠️ <strong>تنبيه هام:</strong> تأكد من نسخ <strong>Phone number ID</strong> (معرّف رقم الهاتف) وليس <strong>WhatsApp Business Account ID</strong> من شاشة <code>Meta Developers &rarr; WhatsApp &rarr; API Setup</code>.
              </div>
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
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Template Name *
              </label>
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
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                Must match exactly the approved template name in your Meta Business Manager
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
                <input
                  type="text"
                  value={settings.template_language_ar}
                  onChange={e => handleChange('template_language_ar', e.target.value)}
                  placeholder="ar"
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box'
                  }}
                />
              )}
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>Language code: ar</p>
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
                <input
                  type="text"
                  value={settings.template_language_en}
                  onChange={e => handleChange('template_language_en', e.target.value)}
                  placeholder="en_US"
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box'
                  }}
                />
              )}
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>Language code: en_US</p>
            </div>
          </div>
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
          Verify your configuration by sending a real test message to any phone number.
          The phone number <strong>"Test Lead"</strong> will be used as the name placeholder.
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
    </div>
  );
};

export default WhatsAppSettings;
