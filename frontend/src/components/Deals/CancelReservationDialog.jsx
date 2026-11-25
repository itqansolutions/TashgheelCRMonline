import React, { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import Modal from '../Common/Modal';

const ERROR_AR = {
  REASON_REQUIRED: 'اكتب سبب إلغاء الحجز (3 حروف على الأقل).',
  REASON_TOO_LONG: 'سبب الإلغاء طويل، اختصره في 500 حرف.',
  NO_ACTIVE_RESERVATION: 'مفيش حجز شغال على الوحدة دي للصفقة دي.',
  CONTRACT_EXISTS: 'الصفقة دي عليها عقد، استخدم إلغاء الصفقة وتحرير الوحدة بدل إلغاء الحجز.'
};

/**
 * Cancels ONLY the reservation: unit goes back to Available, the deal stays open.
 * deal: { id, title, unit_number, unit_project }
 */
const CancelReservationDialog = ({ deal, onClose, onDone }) => {
  const { isRTL } = useLanguage();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!deal) return null;

  const submit = async () => {
    const clean = reason.trim();
    if (clean.length < 3) return toast.error(ERROR_AR.REASON_REQUIRED);
    setBusy(true);
    try {
      await api.post(`/deals/${deal.id}/cancel-reservation`, { reason: clean });
      toast.success('تم إلغاء الحجز. الوحدة بقت متاحة والصفقة لسه مفتوحة.');
      setReason('');
      onDone && onDone();
    } catch (err) {
      const code = err.response?.data?.code;
      toast.error(ERROR_AR[code] || err.response?.data?.message || 'تعذر إلغاء الحجز');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={busy ? () => {} : onClose}
      title="إلغاء الحجز"
      footer={(
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-cancel" onClick={onClose} disabled={busy}>رجوع</button>
          <button type="button" className="btn-save" onClick={submit} disabled={busy || reason.trim().length < 3} style={{ background: '#dc2626' }}>
            {busy ? 'جاري الإلغاء...' : 'تأكيد إلغاء الحجز'}
          </button>
        </div>
      )}
    >
      <div dir="rtl" style={{ textAlign: 'right' }}>
        <p style={{ fontSize: '13px', marginTop: 0 }}>
          هتلغي حجز الوحدة <strong>{deal.unit_project ? `${deal.unit_project} • ` : ''}<span dir="ltr" style={{ display: 'inline-block', unicodeBidi: 'isolate' }}>{deal.unit_number || ''}</span></strong> للصفقة <strong>{deal.title}</strong>.
          الوحدة هترجع متاحة، والصفقة هتفضل مفتوحة ومش هتتلغي.
        </p>
        <label style={{ fontWeight: 700, fontSize: '13px', display: 'block', marginBottom: '6px' }}>سبب إلغاء الحجز (مطلوب)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="مثال: العميل طلب يأجل القرار"
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
        />
      </div>
    </Modal>
  );
};

export default CancelReservationDialog;
