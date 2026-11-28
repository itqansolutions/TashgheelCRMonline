import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  Smartphone, QrCode, RefreshCw, Unlink, Trash2, CheckCircle, AlertCircle,
  Loader, Info, ShieldAlert, Wifi
} from 'lucide-react';
import IntegrationsSubNav from '../../components/Integrations/IntegrationsSubNav';
import { useLanguage } from '../../context/LanguageContext';

const COPY = {
  ar: {
    title: 'ربط واتساب بالـQR',
    subtitle: 'اربط رقم واتساب بيزنس بتاع الشركة بمسح كود QR من الموبايل — من غير Meta ولا توثيق بيزنس.',
    infoTitle: 'إزاي بيشتغل',
    info: [
      'اضغط "اربط رقم جديد" واكتب اسم للرقم (مثال: رقم المبيعات).',
      'افتح واتساب على الموبايل → الإعدادات → الأجهزة المرتبطة → ربط جهاز.',
      'امسح الكود الظاهر هنا. الرقم يفضل شغال على الموبايل عادي.',
      'بعد الربط، أي رسالة توصل للرقم تظهر في "محادثات واتساب"، وتقدر ترد منها.'
    ],
    warning: 'الطريقة دي غير رسمية (زي واتساب ويب). الرقم ممكن يتقفل لو اتعمله سبام كتير، فالأفضل تستخدم رقم مخصص للمبيعات.',
    newLink: 'اربط رقم جديد',
    labelPlaceholder: 'اسم الرقم (مثال: واتساب المبيعات)',
    create: 'إنشاء وربط',
    cancel: 'إلغاء',
    numbers: 'الأرقام المربوطة',
    noNumbers: 'مفيش أرقام مربوطة بالـQR لحد الآن.',
    scanTitle: 'امسح الكود من واتساب',
    scanHint: 'واتساب → الإعدادات → الأجهزة المرتبطة → ربط جهاز',
    status: {
      pending: 'جاري التجهيز',
      qr_ready: 'بانتظار المسح',
      connected: 'متصل',
      reconnecting: 'بيعيد الاتصال',
      disconnected: 'غير متصل',
      logged_out: 'الجهاز اتفصل',
      error: 'خطأ'
    },
    refresh: 'كود جديد',
    unlink: 'فصل الجهاز',
    remove: 'حذف الرقم',
    connectedAs: 'متصل كـ',
    lastSeen: 'آخر نشاط',
    confirmUnlink: 'هتفصل الجهاز عن واتساب؟ لازم تمسح كود جديد لو حبيت ترجع.',
    confirmDelete: 'هتحذف الرقم من النظام؟',
    loading: 'جاري التحميل...',
    errorLoad: 'مش قادر أجيب الأرقام',
    errorCreate: 'مش قادر أنشئ الرقم',
    errorRefresh: 'مش قادر أجيب كود جديد',
    errorUnlink: 'مش قادر أفصل الجهاز',
    errorDelete: 'مش قادر أحذف الرقم',
    successCreate: 'تم إنشاء الرقم، امسح الكود من واتساب',
    successRefresh: 'كود جديد جاهز',
    successUnlink: 'تم فصل الجهاز',
    successDelete: 'تم حذف الرقم',
    openChat: 'افتح المحادثات',
    chatNote: 'الرسائل بتوصل هنا وفي صفحة محادثات واتساب.'
  },
  en: {
    title: 'WhatsApp QR linking',
    subtitle: 'Link the company WhatsApp Business number by scanning a QR from the phone. No Meta app and no business verification.',
    infoTitle: 'How it works',
    info: [
      'Click "Link a new number" and give it a name (e.g. Sales line).',
      'On the phone: WhatsApp → Settings → Linked devices → Link a device.',
      'Scan the code shown here. The number keeps working on the phone as usual.',
      'After linking, incoming messages appear in WhatsApp chat and you can reply from there.'
    ],
    warning: 'This route is unofficial (WhatsApp Web style). A number can be blocked if it is used for spam, so prefer a dedicated sales number.',
    newLink: 'Link a new number',
    labelPlaceholder: 'Number label (e.g. Sales WhatsApp)',
    create: 'Create and link',
    cancel: 'Cancel',
    numbers: 'Linked numbers',
    noNumbers: 'No QR-linked numbers yet.',
    scanTitle: 'Scan this code from WhatsApp',
    scanHint: 'WhatsApp → Settings → Linked devices → Link a device',
    status: {
      pending: 'Preparing',
      qr_ready: 'Waiting for scan',
      connected: 'Connected',
      reconnecting: 'Reconnecting',
      disconnected: 'Disconnected',
      logged_out: 'Device unlinked',
      error: 'Error'
    },
    refresh: 'New code',
    unlink: 'Unlink device',
    remove: 'Remove number',
    connectedAs: 'Connected as',
    lastSeen: 'Last activity',
    confirmUnlink: 'Unlink this device? You will need a fresh QR code to link it again.',
    confirmDelete: 'Remove this number from the system?',
    loading: 'Loading...',
    errorLoad: 'Could not load numbers',
    errorCreate: 'Could not create the number',
    errorRefresh: 'Could not fetch a new code',
    errorUnlink: 'Could not unlink the device',
    errorDelete: 'Could not remove the number',
    successCreate: 'Number created, scan the code from WhatsApp',
    successRefresh: 'New code ready',
    successUnlink: 'Device unlinked',
    successDelete: 'Number removed',
    openChat: 'Open chat',
    chatNote: 'Messages land here and in the WhatsApp chat page.'
  }
};

const STATUS_COLORS = {
  connected: { bg: '#dcfce7', color: '#15803d' },
  qr_ready: { bg: '#fef3c7', color: '#b45309' },
  pending: { bg: '#e0f2fe', color: '#0369a1' },
  reconnecting: { bg: '#fef9c3', color: '#a16207' },
  disconnected: { bg: '#f1f5f9', color: '#475569' },
  logged_out: { bg: '#fee2e2', color: '#b91c1c' },
  error: { bg: '#fee2e2', color: '#b91c1c' }
};

const WhatsAppQrLink = () => {
  const { lang, isRTL } = useLanguage();
  const copy = COPY[lang] || COPY.ar;
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [status, setStatus] = useState(null);
  const [busyAction, setBusyAction] = useState(false);
  const pollRef = useRef(null);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await api.get('/whatsapp/qr/accounts');
      const rows = res.data?.data || [];
      setAccounts(rows);
      if (!activeId && rows.length) {
        const connected = rows.find((r) => r.session_status === 'connected');
        setActiveId((connected || rows[0]).id);
      }
      return rows;
    } catch (err) {
      toast.error(copy.errorLoad);
      return [];
    } finally {
      setLoading(false);
    }
  }, [activeId, copy.errorLoad]);

  const loadStatus = useCallback(async (id) => {
    if (!id) return null;
    try {
      const res = await api.get(`/whatsapp/qr/accounts/${id}/status`);
      const data = res.data?.data || null;
      setStatus(data);
      return data;
    } catch (err) {
      return null;
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeId) {
      setStatus(null);
      return;
    }
    loadStatus(activeId);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const data = await loadStatus(activeId);
      if (data && data.status === 'connected') {
        clearInterval(pollRef.current);
        pollRef.current = null;
        loadAccounts();
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [activeId, loadStatus, loadAccounts]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await api.post('/whatsapp/qr/accounts', { label: newLabel.trim() || copy.labelPlaceholder });
      const account = res.data?.data;
      toast.success(copy.successCreate);
      setShowCreate(false);
      setNewLabel('');
      await loadAccounts();
      if (account && account.id) setActiveId(account.id);
    } catch (err) {
      toast.error(err?.response?.data?.message || copy.errorCreate);
    } finally {
      setCreating(false);
    }
  };

  const handleRefresh = async () => {
    if (!activeId) return;
    setBusyAction(true);
    try {
      await api.post(`/whatsapp/qr/accounts/${activeId}/refresh`);
      toast.success(copy.successRefresh);
      await loadStatus(activeId);
      await loadAccounts();
    } catch (err) {
      toast.error(err?.response?.data?.message || copy.errorRefresh);
    } finally {
      setBusyAction(false);
    }
  };

  const handleUnlink = async () => {
    if (!activeId || !window.confirm(copy.confirmUnlink)) return;
    setBusyAction(true);
    try {
      await api.post(`/whatsapp/qr/accounts/${activeId}/unlink`);
      toast.success(copy.successUnlink);
      await loadStatus(activeId);
      await loadAccounts();
    } catch (err) {
      toast.error(err?.response?.data?.message || copy.errorUnlink);
    } finally {
      setBusyAction(false);
    }
  };

  const handleDelete = async () => {
    if (!activeId || !window.confirm(copy.confirmDelete)) return;
    setBusyAction(true);
    try {
      await api.delete(`/whatsapp/qr/accounts/${activeId}`);
      toast.success(copy.successDelete);
      setActiveId(null);
      setStatus(null);
      await loadAccounts();
    } catch (err) {
      toast.error(err?.response?.data?.message || copy.errorDelete);
    } finally {
      setBusyAction(false);
    }
  };

  const activeAccount = accounts.find((a) => String(a.id) === String(activeId));
  const effectiveStatus = (status && status.status) || activeAccount?.session_status || 'pending';
  const chip = STATUS_COLORS[effectiveStatus] || STATUS_COLORS.pending;

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} style={{ background: '#f8fafc', minHeight: '100vh', paddingBottom: 40 }}>
      <IntegrationsSubNav />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <QrCode size={26} color="#0ea5e9" />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a' }}>{copy.title}</h1>
        </div>
        <p style={{ margin: '6px 0 18px', color: '#64748b', fontSize: 14 }}>{copy.subtitle}</p>

        <div style={{ background: 'white', borderRadius: 14, padding: 18, border: '1px solid #e2e8f0', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
            <Info size={16} color="#0ea5e9" /> {copy.infoTitle}
          </div>
          <ol style={{ margin: 0, paddingInlineStart: 20, color: '#475569', fontSize: 13, lineHeight: 1.9 }}>
            {copy.info.map((line) => <li key={line}>{line}</li>)}
          </ol>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, color: '#92400e', fontSize: 12.5 }}>
            <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{copy.warning}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) 1fr', gap: 18, alignItems: 'start' }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 18, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 15 }}>{copy.numbers}</div>
              <button
                onClick={() => setShowCreate((v) => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#0ea5e9,#0284c7)', color: 'white', border: 'none', borderRadius: 10, padding: '8px 12px', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}
              >
                <Smartphone size={14} /> {copy.newLink}
              </button>
            </div>

            {showCreate && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={copy.labelPlaceholder}
                  style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 13, marginBottom: 8 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleCreate} disabled={creating} style={{ flex: 1, background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 9, padding: '9px 12px', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>
                    {creating ? <Loader size={14} className="spin" /> : copy.create}
                  </button>
                  <button onClick={() => setShowCreate(false)} style={{ background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 9, padding: '9px 12px', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>
                    {copy.cancel}
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div style={{ color: '#64748b', fontSize: 13 }}>{copy.loading}</div>
            ) : accounts.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: 13 }}>{copy.noNumbers}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {accounts.map((acc) => {
                  const st = acc.session_status || acc.qr_status || 'pending';
                  const c = STATUS_COLORS[st] || STATUS_COLORS.pending;
                  const isActive = String(acc.id) === String(activeId);
                  return (
                    <button
                      key={acc.id}
                      onClick={() => setActiveId(acc.id)}
                      style={{
                        textAlign: isRTL ? 'right' : 'left', background: isActive ? '#eff6ff' : 'white',
                        border: `1px solid ${isActive ? '#93c5fd' : '#e2e8f0'}`, borderRadius: 11, padding: 11, cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>{acc.label || acc.display_phone_number || `#${acc.id}`}</span>
                        <span style={{ background: c.bg, color: c.color, fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 999 }}>
                          {copy.status[st] || st}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }} dir="ltr">
                        {acc.phone_e164 || acc.display_phone_number || '—'}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ background: 'white', borderRadius: 14, padding: 20, border: '1px solid #e2e8f0', minHeight: 340 }}>
            {!activeId ? (
              <div style={{ color: '#64748b', fontSize: 13 }}>{copy.noNumbers}</div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 16, color: '#0f172a' }}>{activeAccount?.label || `#${activeId}`}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <Wifi size={13} color={effectiveStatus === 'connected' ? '#15803d' : '#94a3b8'} />
                      <span style={{ background: chip.bg, color: chip.color, fontSize: 11.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999 }}>
                        {copy.status[effectiveStatus] || effectiveStatus}
                      </span>
                      {status?.phone && <span style={{ fontSize: 12.5, color: '#475569' }} dir="ltr">{copy.connectedAs} {status.phone}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={handleRefresh} disabled={busyAction} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: 9, padding: '8px 11px', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
                      <RefreshCw size={13} /> {copy.refresh}
                    </button>
                    <button onClick={handleUnlink} disabled={busyAction} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fef3c7', color: '#b45309', border: 'none', borderRadius: 9, padding: '8px 11px', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
                      <Unlink size={13} /> {copy.unlink}
                    </button>
                    <button onClick={handleDelete} disabled={busyAction} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: 9, padding: '8px 11px', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
                      <Trash2 size={13} /> {copy.remove}
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  {effectiveStatus === 'connected' ? (
                    <div style={{ textAlign: 'center', padding: '28px 12px' }}>
                      <CheckCircle size={44} color="#16a34a" />
                      <div style={{ fontWeight: 900, fontSize: 16, color: '#0f172a', marginTop: 8 }}>
                        {copy.connectedAs} <span dir="ltr">{status?.phone || activeAccount?.phone_e164 || ''}</span>
                      </div>
                      <div style={{ color: '#64748b', fontSize: 13, marginTop: 6 }}>{copy.chatNote}</div>
                    </div>
                  ) : status?.qr ? (
                    <>
                      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>{copy.scanTitle}</div>
                      <div style={{ background: 'white', padding: 10, border: '1px solid #e2e8f0', borderRadius: 12 }}>
                        <img src={status.qr} alt="WhatsApp QR" width={260} height={260} style={{ display: 'block', borderRadius: 6 }} />
                      </div>
                      <div style={{ color: '#64748b', fontSize: 12.5, textAlign: 'center', maxWidth: 380 }}>{copy.scanHint}</div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '30px 12px', color: '#64748b' }}>
                      {['pending', 'reconnecting'].includes(effectiveStatus) ? (
                        <>
                          <Loader size={30} color="#0ea5e9" />
                          <div style={{ marginTop: 10, fontSize: 13 }}>{copy.status[effectiveStatus]}</div>
                        </>
                      ) : (
                        <>
                          <AlertCircle size={34} color="#f59e0b" />
                          <div style={{ marginTop: 10, fontSize: 13 }}>{copy.status[effectiveStatus] || effectiveStatus}</div>
                          {status?.lastError && <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 6 }}>{status.lastError}</div>}
                          <button onClick={handleRefresh} style={{ marginTop: 12, background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>
                            {copy.refresh}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppQrLink;
