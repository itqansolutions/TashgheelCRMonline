import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Plus, Truck, Search, X, Printer, CreditCard, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

// ─── Vendor Statement Modal (Simple & Printable) ─────────────────
const VendorStatementModal = ({ vendor, onClose }) => {
  const { t, isRTL } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/purchases/vendors/${vendor.id}/statement`)
      .then(res => setData(res.data?.data))
      .catch(() => toast.error(t('vendors.failedStatement')))
      .finally(() => setLoading(false));
  }, [vendor.id, t]);

  const fmt = (num) => (parseFloat(num) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const html = document.getElementById('vendor-statement-content').innerHTML;
    printWindow.document.write(`
      <html dir="${isRTL ? 'rtl' : 'ltr'}"><head><title>${t('vendors.statementTitle')} - ${vendor.name}</title>
      <style>
        body { font-family: Arial, sans-serif; direction: ${isRTL ? 'rtl' : 'ltr'}; padding: 24px; color: #1e293b; }
        h1 { color: #0284c7; border-bottom: 2px solid #0284c7; padding-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
        th { background: #f1f5f9; padding: 10px; text-align: ${isRTL ? 'right' : 'left'}; border: 1px solid #e2e8f0; font-weight: bold; }
        td { padding: 10px; border: 1px solid #e2e8f0; }
        .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; }
        .summary-grid { display: flex; justify-content: space-between; }
        .summary-item { text-align: center; }
        .summary-val { font-size: 18px; font-weight: bold; margin-top: 4px; }
        .debit { color: #0284c7; font-weight: bold; }
        .credit { color: #16a34a; font-weight: bold; }
        .balance { color: #dc2626; font-weight: bold; }
        @media print { .no-print { display: none; } }
      </style></head><body>${html}</body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} dir={isRTL ? 'rtl' : 'ltr'}>
      <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '820px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
        {/* Modal Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
          <div>
            <h2 style={{ margin: 0, color: 'white', fontSize: '18px', fontWeight: 800 }}>{t('vendors.statementTitle')}</h2>
            <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.85)', fontSize: '13px' }}>{vendor.name}</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handlePrint} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '10px', padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '13px' }}>
              <Printer size={15} /> {t('vendors.btnPrint')}
            </button>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>{t('vendors.loadingStatement')}</div>
          ) : !data ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>{t('vendors.failedStatement')}</div>
          ) : (
            <div id="vendor-statement-content">
              <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#1e293b', marginBottom: '4px' }}>{t('vendors.statementHeader')}</h1>
              <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '14px' }}>
                {t('vendors.supplierLabel')} <strong>{data.vendor?.name}</strong> &nbsp;|&nbsp; 
                {t('vendors.phoneLabel')} <strong className="num-en">{data.vendor?.phone || '—'}</strong> &nbsp;|&nbsp;
                {t('vendors.printDateLabel')} <strong className="num-en">{new Date().toLocaleDateString('en-US')}</strong>
              </p>

              {/* Summary Box */}
              <div className="summary-box" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
                <div className="summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', textAlign: 'center' }}>
                  <div className="summary-item">
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>{t('vendors.totalPurchases')}</span>
                    <div className="summary-val num-en" style={{ fontSize: '20px', fontWeight: 800, color: '#0ea5e9' }}>
                      {fmt(data.summary.total_purchases)} EGP
                    </div>
                  </div>

                  <div className="summary-item">
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>{t('vendors.totalPaid')}</span>
                    <div className="summary-val num-en" style={{ fontSize: '20px', fontWeight: 800, color: '#16a34a' }}>
                      {fmt(data.summary.total_paid)} EGP
                    </div>
                  </div>

                  <div className="summary-item">
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>{t('vendors.outstandingDue')}</span>
                    <div className="summary-val num-en" style={{ fontSize: '20px', fontWeight: 800, color: data.summary.outstanding_balance > 0 ? '#dc2626' : '#16a34a' }}>
                      {fmt(data.summary.outstanding_balance)} EGP
                    </div>
                  </div>
                </div>
              </div>

              {/* Ledger Table */}
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', marginBottom: '12px' }}>{t('vendors.txHistory')}</h3>
              {data.transactions.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', background: '#fafafa', borderRadius: '10px' }}>
                  {t('vendors.noTransactions')}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                      <th style={{ padding: '10px 12px', textAlign: isRTL ? 'right' : 'left' }}>{t('vendors.colDate')}</th>
                      <th style={{ padding: '10px 12px', textAlign: isRTL ? 'right' : 'left' }}>{t('vendors.colTxType')}</th>
                      <th style={{ padding: '10px 12px', textAlign: isRTL ? 'right' : 'left' }}>{t('vendors.colReference')}</th>
                      <th style={{ padding: '10px 12px', textAlign: isRTL ? 'left' : 'right' }}>{t('vendors.colDebit')}</th>
                      <th style={{ padding: '10px 12px', textAlign: isRTL ? 'left' : 'right' }}>{t('vendors.colCredit')}</th>
                      <th style={{ padding: '10px 12px', textAlign: isRTL ? 'left' : 'right' }}>{t('vendors.colRunningBalance')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((tx, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td className="num-en" style={{ padding: '10px 12px', color: '#64748b' }}>{new Date(tx.date).toLocaleDateString('en-US')}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{tx.type}</td>
                        <td className="num-en" style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#0ea5e9' }}>{tx.reference}</td>
                        <td className="num-en" style={{ padding: '10px 12px', textAlign: isRTL ? 'left' : 'right', fontWeight: 700, color: tx.debit > 0 ? '#0ea5e9' : '#94a3b8' }}>
                          {tx.debit > 0 ? `${fmt(tx.debit)}` : '—'}
                        </td>
                        <td className="num-en" style={{ padding: '10px 12px', textAlign: isRTL ? 'left' : 'right', fontWeight: 700, color: tx.credit > 0 ? '#16a34a' : '#94a3b8' }}>
                          {tx.credit > 0 ? `${fmt(tx.credit)}` : '—'}
                        </td>
                        <td className="num-en" style={{ padding: '10px 12px', textAlign: isRTL ? 'left' : 'right', fontWeight: 800, color: tx.running_balance > 0 ? '#dc2626' : '#16a34a' }}>
                          {fmt(tx.running_balance)} EGP
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Record Payment Modal (Reusing finance_vouchers) ──────────────
const RecordPaymentModal = ({ vendor, onClose, onSuccess }) => {
  const { t, isRTL } = useLanguage();
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payVal = parseFloat(amount);
    if (!payVal || payVal <= 0) return toast.error(t('vendors.toastValidAmount'));

    setSaving(true);
    try {
      await api.post(`/purchases/vendors/${vendor.id}/payments`, {
        amount: payVal,
        payment_method: paymentMethod,
        voucher_date: voucherDate,
        notes: notes || `Payment to supplier ${vendor.name}`
      });
      toast.success(t('vendors.toastPaymentSuccess'));
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || t('vendors.toastPaymentFailed'));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', fontWeight: 600, outline: 'none', boxSizing: 'border-box', background: '#fafafa' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} dir={isRTL ? 'rtl' : 'ltr'}>
      <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #10b981, #059669)' }}>
          <h3 style={{ margin: 0, color: 'white', fontWeight: 800, fontSize: '18px' }}>{t('vendors.modalPayment', { name: vendor.name })}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>{t('vendors.lblAmount')}</label>
            <input
              type="number"
              step="any"
              min="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={t('vendors.placeholderAmount')}
              style={inputStyle}
              className="num-en"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>{t('vendors.lblMethod')}</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={inputStyle}>
                <option value="cash">{t('vendors.methodCash')}</option>
                <option value="bank_transfer">{t('vendors.methodBankTransfer')}</option>
                <option value="check">{t('vendors.methodCheck')}</option>
                <option value="card">{t('vendors.methodCard')}</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>{t('vendors.lblPaymentDate')}</label>
              <input type="date" value={voucherDate} onChange={e => setVoucherDate(e.target.value)} style={inputStyle} required />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>{t('vendors.lblNotes')}</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('vendors.placeholderNotes')} style={inputStyle} />
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>{t('vendors.btnCancel')}</button>
            <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? t('vendors.saving') : t('vendors.btnConfirmPay')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Main Vendors Component ───────────────────────────────────────
const ContactsVendors = () => {
  const { t, isRTL } = useLanguage();
  const { hasFinancialPermission } = useAuth();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  // Statement & Payment Modals
  const [statementVendor, setStatementVendor] = useState(null);
  const [paymentVendor, setPaymentVendor] = useState(null);

  const emptyForm = { name: '', phone: '', address: '', tax_no: '', reg_no: '' };
  const [form, setForm] = useState(emptyForm);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const res = await api.get('/vendors');
      setVendors(res.data.data || []);
    } catch { toast.error(t('vendors.toastLoadError')); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchVendors(); }, []);

  const filtered = vendors.filter(v => {
    const q = search.toLowerCase();
    return !q || v.name?.toLowerCase().includes(q) || v.phone?.includes(q);
  });

  const openAdd = () => { setEditing(null); setForm(emptyForm); setIsModalOpen(true); };
  const openEdit = (v) => { setEditing(v); setForm({ name: v.name || '', phone: v.phone || '', address: v.address || '', tax_no: v.tax_no || '', reg_no: v.reg_no || '' }); setIsModalOpen(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error(t('vendors.toastNameReq'));
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/vendors/${editing.id}`, form);
        toast.success(t('vendors.toastVendorUpdated'));
      } else {
        await api.post('/vendors', form);
        toast.success(t('vendors.toastVendorAdded'));
      }
      setIsModalOpen(false);
      fetchVendors();
    } catch (err) {
      toast.error(err.response?.data?.message || t('vendors.toastLoadError'));
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('vendors.confirmDelete'))) return;
    try { await api.delete(`/vendors/${id}`); toast.success(t('vendors.toastVendorDeleted')); fetchVendors(); }
    catch { toast.error(t('vendors.toastDeleteFailed')); }
  };

  const inputStyle = { width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', fontWeight: 600, outline: 'none', boxSizing: 'border-box', background: '#fafafa' };

  return (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#1e293b', margin: 0, letterSpacing: '-0.02em' }}>{t('vendors.title')}</h1>
          <p className="num-en" style={{ color: '#64748b', margin: '6px 0 0', fontSize: '14px', fontWeight: 600 }}>{t('vendors.registeredCount', { count: filtered.length })}</p>
        </div>
        <button onClick={openAdd} style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: 'white', border: 'none', borderRadius: '12px', padding: '12px 22px', cursor: 'pointer', fontWeight: 800, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(14,165,233,0.35)' }}>
          <Plus size={18} /> {t('vendors.btnAdd')}
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: '380px', marginBottom: '20px' }}>
        <Search size={16} style={{ position: 'absolute', [isRTL ? 'left' : 'right']: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('vendors.searchPlaceholder')} style={{ ...inputStyle, [isRTL ? 'paddingLeft' : 'paddingRight']: '38px' }} />
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.04)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
            <Truck size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
            <p style={{ fontWeight: 700, margin: 0 }}>{t('vendors.noVendors')}</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {[
                  t('vendors.colName'),
                  t('vendors.colPhone'),
                  t('vendors.colAddress'),
                  t('vendors.colTaxId'),
                  t('vendors.colRegNo'),
                  t('vendors.colActions')
                ].map(h => (
                  <th key={h} style={{ padding: '14px 16px', textAlign: isRTL ? 'right' : 'left', fontSize: '11px', fontWeight: 800, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((v, i) => (
                <tr key={v.id}
                  style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafbfc', transition: 'background 0.15s' }}
                >
                  <td style={{ padding: '14px 16px', fontWeight: 800, color: '#1e293b', fontSize: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', fontWeight: 900, flexShrink: 0 }}>
                        {v.name?.charAt(0).toUpperCase()}
                      </div>
                      {v.name}
                    </div>
                  </td>
                  <td className="num-en" style={{ padding: '14px 16px', color: '#475569', fontSize: '13px' }}>{v.phone || '—'}</td>
                  <td style={{ padding: '14px 16px', color: '#475569', fontSize: '13px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.address || '—'}</td>
                  <td className="num-en" style={{ padding: '14px 16px', color: '#475569', fontSize: '13px' }}>{v.tax_no || '—'}</td>
                  <td className="num-en" style={{ padding: '14px 16px', color: '#475569', fontSize: '13px' }}>{v.reg_no || '—'}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {/* Statement Button */}
                      <button
                        onClick={() => setStatementVendor(v)}
                        title={t('vendors.btnStatement')}
                        style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <FileText size={13} /> {t('vendors.btnStatement')}
                      </button>

                      {/* Pay Button */}
                      {hasFinancialPermission?.('payment.create') && (
                        <button
                          onClick={() => setPaymentVendor(v)}
                          title={t('vendors.btnPay')}
                          style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <CreditCard size={13} /> {t('vendors.btnPay')}
                        </button>
                      )}

                      {/* Edit */}
                      <button onClick={() => openEdit(v)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                        {t('vendors.btnEdit')}
                      </button>

                      {/* Delete */}
                      <button onClick={() => handleDelete(v.id)} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                        {t('vendors.btnDelete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: Add / Edit Vendor */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} dir={isRTL ? 'rtl' : 'ltr'}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', borderRadius: '20px 20px 0 0' }}>
              <h3 style={{ margin: 0, color: 'white', fontWeight: 800 }}>{editing ? t('vendors.modalEdit') : t('vendors.modalAdd')}</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>{t('vendors.lblName')}</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('vendors.placeholderName')} style={inputStyle} required />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>{t('vendors.lblPhone')}</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="01xxxxxxxxx" style={inputStyle} className="num-en" />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>{t('vendors.lblAddress')}</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder={t('vendors.lblAddress')} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>{t('vendors.lblTaxId')}</label>
                  <input value={form.tax_no} onChange={e => setForm(f => ({ ...f, tax_no: e.target.value }))} placeholder="123456789" style={inputStyle} className="num-en" />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>{t('vendors.lblRegNo')}</label>
                  <input value={form.reg_no} onChange={e => setForm(f => ({ ...f, reg_no: e.target.value }))} placeholder="987654321" style={inputStyle} className="num-en" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '8px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>{t('vendors.btnCancel')}</button>
                <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? t('vendors.saving') : editing ? t('vendors.btnSave') : t('vendors.btnAdd')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Supplier Account Statement */}
      {statementVendor && (
        <VendorStatementModal
          vendor={statementVendor}
          onClose={() => setStatementVendor(null)}
        />
      )}

      {/* Modal: Record Supplier Payment */}
      {paymentVendor && (
        <RecordPaymentModal
          vendor={paymentVendor}
          onClose={() => setPaymentVendor(null)}
          onSuccess={() => {
            fetchVendors();
            if (statementVendor?.id === paymentVendor.id) {
              setStatementVendor(null);
            }
          }}
        />
      )}
    </div>
  );
};

export default ContactsVendors;
