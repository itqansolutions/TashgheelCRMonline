import React, { useRef } from 'react';
import { Printer, X, CheckCircle2, ArrowDownLeft, ArrowUpRight, Building2, Calendar, CreditCard, Hash, User } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

// Helper function for Arabic number-to-words tafqeet (up to millions)
function tafqeetArabic(number, currency = 'جنيه مصري') {
    if (!number || isNaN(number)) return '';
    const n = Math.floor(Math.abs(number));
    if (n === 0) return `صفر ${currency}`;

    const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
        'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
    const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
    const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

    function convertGroup(val) {
        let res = '';
        const h = Math.floor(val / 100);
        const rem = val % 100;
        if (h > 0) res += hundreds[h];
        if (rem > 0) {
            if (res) res += ' و ';
            if (rem < 20) {
                res += ones[rem];
            } else {
                const t = Math.floor(rem / 10);
                const o = rem % 10;
                if (o > 0) res += ones[o] + ' و ';
                res += tens[t];
            }
        }
        return res;
    }

    let words = '';
    const millions = Math.floor(n / 1000000);
    const thousands = Math.floor((n % 1000000) / 1000);
    const remainder = n % 1000;

    if (millions > 0) {
        words += (millions === 1 ? 'مليون' : millions === 2 ? 'مليونان' : convertGroup(millions) + ' ملايين');
    }
    if (thousands > 0) {
        if (words) words += ' و ';
        words += (thousands === 1 ? 'ألف' : thousands === 2 ? 'ألفان' : convertGroup(thousands) + ' آلاف');
    }
    if (remainder > 0) {
        if (words) words += ' و ';
        words += convertGroup(remainder);
    }

    return `فقط ${words} ${currency} لا غير`;
}

const VoucherPreviewModal = ({ voucher, onClose }) => {
    const printRef = useRef();

    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: `${voucher?.voucher_type === 'receipt' ? 'Receipt' : 'Payment'}_Voucher_${voucher?.voucher_number || 'doc'}`
    });

    if (!voucher) return null;

    const isReceipt = voucher.voucher_type === 'receipt';
    const currency = voucher.currency || 'EGP';
    const amountFormatted = parseFloat(voucher.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const amountWords = tafqeetArabic(voucher.amount, currency === 'EGP' ? 'جنيه مصري' : currency === 'SAR' ? 'ريال سعودي' : currency);

    const paymentMethodLabels = {
        cash: 'نقداً / Cash',
        bank_transfer: 'تحويل بنكي / Bank Transfer',
        check: 'شيك مصرفي / Cheque',
        card: 'بطاقة دفع / Card'
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
            overflowY: 'auto'
        }}>
            <div style={{
                background: 'var(--bg-card, #1e293b)',
                borderRadius: '16px',
                border: '1px solid var(--glass-border, rgba(255,255,255,0.1))',
                width: '100%',
                maxWidth: '850px',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                overflow: 'hidden'
            }}>
                {/* Modal Toolbar */}
                <div style={{
                    padding: '16px 24px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--glass-border, rgba(255,255,255,0.1))',
                    background: 'rgba(255,255,255,0.02)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {isReceipt ? (
                            <span style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ArrowDownLeft size={16} /> سند قبض رسمي (Receipt Voucher)
                            </span>
                        ) : (
                            <span style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ArrowUpRight size={16} /> سند صرف رسمي (Payment Voucher)
                            </span>
                        )}
                        <span style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '14px', fontWeight: 600 }}>
                            {voucher.voucher_number}
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            onClick={handlePrint}
                            style={{
                                background: 'var(--primary, #3b82f6)',
                                color: '#fff',
                                border: 'none',
                                padding: '8px 18px',
                                borderRadius: '8px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '14px'
                            }}
                        >
                            <Printer size={16} /> طباعة السند (Print)
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted, #94a3b8)',
                                cursor: 'pointer',
                                padding: '6px',
                                borderRadius: '6px'
                            }}
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Printable Document Container */}
                <div style={{ overflowY: 'auto', padding: '24px', flex: 1, background: '#f1f5f9' }}>
                    <div
                        ref={printRef}
                        style={{
                            background: '#ffffff',
                            color: '#0f172a',
                            borderRadius: '12px',
                            padding: '36px 44px',
                            margin: '0 auto',
                            maxWidth: '750px',
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                            direction: 'rtl'
                        }}
                    >
                        {/* Print Header */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderBottom: '2px solid #0f172a',
                            paddingBottom: '20px',
                            marginBottom: '24px'
                        }}>
                            <div>
                                <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>
                                    {voucher.tenant_name || 'Tashgheel Business System'}
                                </h1>
                                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                                    {voucher.branch_name ? `الفرع: ${voucher.branch_name}` : ''}
                                    {voucher.tenant_phone ? ` | هاتف: ${voucher.tenant_phone}` : ''}
                                </p>
                                {voucher.tax_no && (
                                    <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#64748b' }}>
                                        الرقم الضريبي: {voucher.tax_no} {voucher.reg_no ? `| السجل التجاري: ${voucher.reg_no}` : ''}
                                    </p>
                                )}
                            </div>

                            <div style={{ textAlign: 'left', direction: 'ltr' }}>
                                {voucher.logo_url ? (
                                    <img src={voucher.logo_url} alt="Logo" style={{ maxHeight: '55px', maxWidth: '140px', objectFit: 'contain' }} />
                                ) : (
                                    <div style={{
                                        width: '50px',
                                        height: '50px',
                                        borderRadius: '10px',
                                        background: isReceipt ? '#10b981' : '#ef4444',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#ffffff',
                                        fontWeight: 900,
                                        fontSize: '20px'
                                    }}>
                                        {isReceipt ? 'RV' : 'PV'}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Title Bar with Voucher Number & Date */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: isReceipt ? '#ecfdf5' : '#fef2f2',
                            border: `1px solid ${isReceipt ? '#a7f3d0' : '#fecaca'}`,
                            borderRadius: '8px',
                            padding: '12px 20px',
                            marginBottom: '24px'
                        }}>
                            <div>
                                <h2 style={{
                                    margin: 0,
                                    fontSize: '20px',
                                    fontWeight: 800,
                                    color: isReceipt ? '#065f46' : '#991b1b'
                                }}>
                                    {isReceipt ? 'سَنَد قَبْض نَقْدِي / بَنْكِي' : 'سَنَد صَرْف نَقْدِي / بَنْكِي'}
                                </h2>
                                <span style={{ fontSize: '12px', color: isReceipt ? '#047857' : '#b91c1c', fontWeight: 600 }}>
                                    {isReceipt ? 'Official Receipt Voucher' : 'Official Payment Voucher'}
                                </span>
                            </div>

                            <div style={{ textAlign: 'left', direction: 'ltr' }}>
                                <div style={{ fontSize: '13px', color: '#64748b' }}>رقم السند / Voucher No:</div>
                                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{voucher.voucher_number}</div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                    التاريخ: {voucher.voucher_date ? new Date(voucher.voucher_date).toLocaleDateString('ar-EG') : new Date().toLocaleDateString('ar-EG')}
                                </div>
                            </div>
                        </div>

                        {/* Amount Highlight Box */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '14px 20px',
                            marginBottom: '24px'
                        }}>
                            <div>
                                <span style={{ fontSize: '12px', color: '#64748b', display: 'block', fontWeight: 600 }}>المبلغ المدفوع / Amount:</span>
                                <span style={{ fontSize: '24px', fontWeight: 900, color: isReceipt ? '#059669' : '#dc2626' }}>
                                    {amountFormatted} <span style={{ fontSize: '14px', fontWeight: 600 }}>{currency}</span>
                                </span>
                            </div>
                            <div style={{ textAlign: 'left', maxWidth: '65%' }}>
                                <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>المبلغ بالحروف:</span>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>{amountWords}</span>
                            </div>
                        </div>

                        {/* Voucher Body Details */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '14px',
                            fontSize: '14px',
                            lineHeight: 1.8,
                            color: '#1e293b',
                            marginBottom: '36px'
                        }}>
                            <div style={{ display: 'flex', borderBottom: '1px dashed #cbd5e1', paddingBottom: '10px' }}>
                                <span style={{ width: '170px', fontWeight: 700, color: '#475569' }}>
                                    {isReceipt ? 'استلمنا من السيد / السادة:' : 'يُصرف للسيد / السادة:'}
                                </span>
                                <span style={{ flex: 1, fontWeight: 800, color: '#0f172a' }}>
                                    {voucher.party_name || 'عميل نقدي'}
                                </span>
                            </div>

                            <div style={{ display: 'flex', borderBottom: '1px dashed #cbd5e1', paddingBottom: '10px' }}>
                                <span style={{ width: '170px', fontWeight: 700, color: '#475569' }}>طريقة الدفع / الوسيلة:</span>
                                <span style={{ flex: 1, fontWeight: 600, color: '#334155' }}>
                                    {paymentMethodLabels[voucher.payment_method] || voucher.payment_method || 'نقداً'}
                                    {voucher.treasury_account ? ` (${voucher.treasury_account})` : ''}
                                    {voucher.reference_no ? ` | رقم المرجع/الشيك: ${voucher.reference_no}` : ''}
                                </span>
                            </div>

                            {voucher.linked_invoice_number && (
                                <div style={{ display: 'flex', borderBottom: '1px dashed #cbd5e1', paddingBottom: '10px' }}>
                                    <span style={{ width: '170px', fontWeight: 700, color: '#475569' }}>سداد الفاتورة رقم:</span>
                                    <span style={{ flex: 1, fontWeight: 700, color: '#2563eb' }}>
                                        {voucher.linked_invoice_number}
                                        {voucher.linked_invoice_total ? ` (إجمالي الفاتورة: ${parseFloat(voucher.linked_invoice_total).toLocaleString()} ${currency})` : ''}
                                    </span>
                                </div>
                            )}

                            <div style={{ display: 'flex', borderBottom: '1px dashed #cbd5e1', paddingBottom: '10px' }}>
                                <span style={{ width: '170px', fontWeight: 700, color: '#475569' }}>وذلك مقابل / البيان:</span>
                                <span style={{ flex: 1, color: '#334155' }}>
                                    {voucher.notes || (isReceipt ? 'سداد دفعة تحت الحساب' : 'مصروفات تشغيلية')}
                                </span>
                            </div>

                            <div style={{ display: 'flex', paddingBottom: '6px' }}>
                                <span style={{ width: '170px', fontWeight: 700, color: '#475569' }}>المستخدم المسؤول:</span>
                                <span style={{ flex: 1, color: '#64748b', fontSize: '13px' }}>
                                    {voucher.created_by_name || 'النظام'}
                                </span>
                            </div>
                        </div>

                        {/* Signatures Footer */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 1fr',
                            gap: '20px',
                            textAlign: 'center',
                            marginTop: '50px',
                            paddingTop: '20px',
                            borderTop: '1px solid #e2e8f0'
                        }}>
                            <div>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '45px' }}>
                                    {isReceipt ? 'توقيع المستلم / المحصل' : 'توقيع المستلم'}
                                </span>
                                <div style={{ borderTop: '1px dashed #94a3b8', width: '80%', margin: '0 auto' }}></div>
                            </div>

                            <div>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '45px' }}>
                                    توقيع الحسابات / المالية
                                </span>
                                <div style={{ borderTop: '1px dashed #94a3b8', width: '80%', margin: '0 auto' }}></div>
                            </div>

                            <div>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '45px' }}>
                                    اعتماد الإدارة / الختم
                                </span>
                                <div style={{ borderTop: '1px dashed #94a3b8', width: '80%', margin: '0 auto' }}></div>
                            </div>
                        </div>

                        {/* Document Footer Notice */}
                        <div style={{
                            marginTop: '40px',
                            textAlign: 'center',
                            fontSize: '10px',
                            color: '#94a3b8',
                            borderTop: '1px dotted #cbd5e1',
                            paddingTop: '8px'
                        }}>
                            تم إصدار هذا السند إلكترونياً عبر نظام تشغيل لإدارة الأعمال (Tashgheel CRM) - صالح قانونياً بعد التوقيع والاعتماد.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VoucherPreviewModal;
