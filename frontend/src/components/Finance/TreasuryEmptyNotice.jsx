import React, { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Shown under a treasury picker when it has no matching account.
 * For cash it offers one-click creation of the main cash treasury (opening balance 0).
 */
const TreasuryEmptyNotice = ({ type = 'cash', onCreated }) => {
  const { isRTL } = useLanguage();
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      await api.post('/finance/treasury/accounts', { name: isRTL ? 'الخزينة الرئيسية' : 'Main Cash', type: 'cash', opening_balance: 0, is_default: true });
      toast.success(isRTL ? 'تم إنشاء الخزينة الرئيسية.' : 'Main cash treasury created.');
      onCreated && onCreated();
    } catch (err) {
      toast.error(err.response?.data?.message || (isRTL ? 'تعذر إنشاء الخزينة.' : 'Could not create the treasury.'));
    } finally { setBusy(false); }
  };
  return (
    <div role="alert" style={{ marginTop: 8, padding: '8px 10px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
      {type === 'cash'
        ? (isRTL ? 'مفيش خزينة نقدية متسجلة، ومينفعش تسجل تحصيل أو مصروف من غيرها.' : 'No cash treasury exists yet. Create one before recording money in or out.')
        : (isRTL ? 'مفيش حساب بنكي متسجل. أضيفه من تبويب الخزينة أو اختار نقدي.' : 'No bank account exists yet. Add one in the Treasury tab or choose cash.')}
      {type === 'cash' && (
        <div style={{ marginTop: 6 }}>
          <button type="button" onClick={create} disabled={busy} style={{ padding: '5px 12px', background: '#92400e', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {busy ? (isRTL ? 'جاري الإنشاء...' : 'Creating...') : (isRTL ? 'إنشاء الخزينة الرئيسية' : 'Create main treasury')}
          </button>
        </div>
      )}
    </div>
  );
};
export default TreasuryEmptyNotice;
