import React, { useRef } from 'react';
import { Printer, X, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { useLanguage } from '../../context/LanguageContext';

// Helper function to convert numbers into English words
function numberToEnglishWords(number, currency = 'EGP') {
    if (number === null || number === undefined || isNaN(number) || String(number).trim() === '') {
        return '';
    }
    const val = Math.abs(parseFloat(number));
    if (isNaN(val)) return '';

    const roundedTotal = Math.round(val * 100);
    const pounds = Math.floor(roundedTotal / 100);
    const piasters = roundedTotal % 100;

    if (pounds === 0 && piasters === 0) {
        return `Zero ${currency} Only`;
    }

    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function inWords(num) {
        if (num < 20) return a[num];
        const digit = num % 10;
        if (num < 100) return b[Math.floor(num / 10)] + (digit ? '-' + a[digit] : '');
        if (num < 1000) return a[Math.floor(num / 100)] + ' Hundred' + (num % 100 !== 0 ? ' and ' + inWords(num % 100) : '');
        if (num < 1000000) return inWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 !== 0 ? ' ' + inWords(num % 1000) : '');
        if (num < 1000000000) return inWords(Math.floor(num / 1000000)) + ' Million' + (num % 1000000 !== 0 ? ' ' + inWords(num % 1000000) : '');
        return inWords(Math.floor(num / 1000000000)) + ' Billion' + (num % 1000000000 !== 0 ? ' ' + inWords(num % 1000000000) : '');
    }

    let result = '';
    if (pounds > 0) {
        result = `${inWords(pounds)} ${currency}`;
    }
    if (piasters > 0) {
        const piastersText = `${inWords(piasters)} ${currency === 'EGP' ? (piasters === 1 ? 'Piaster' : 'Piasters') : (piasters === 1 ? 'Cent' : 'Cents')}`;
        if (pounds > 0) {
            result += ` and ${piastersText}`;
        } else {
            result = piastersText;
        }
    }

    return `${result} Only`;
}

// Helper function to convert numbers into Arabic words (Tafqeet)
function numberToArabicWords(number, currency = 'جنيه مصري') {
    if (number === null || number === undefined || isNaN(number) || String(number).trim() === '') {
        return '';
    }
    const val = Math.abs(parseFloat(number));
    if (isNaN(val)) return '';

    const roundedTotal = Math.round(val * 100);
    const pounds = Math.floor(roundedTotal / 100);
    const piasters = roundedTotal % 100;

    const currLabel = (currency === 'EGP' || currency === 'جنيه مصري') ? 'جنيه مصري' : currency;

    if (pounds === 0 && piasters === 0) {
        return `فقط صفر ${currLabel} لا غير`;
    }

    const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
        'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
    const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
    const hundreds = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

    function convertGroup(num) {
        if (num === 0) return '';
        let res = '';
        const h = Math.floor(num / 100);
        const rem = num % 100;
        if (h > 0) res += hundreds[h];
        if (rem > 0) {
            if (res) res += ' و';
            if (rem < 20) {
                res += ones[rem];
            } else {
                const t = Math.floor(rem / 10);
                const o = rem % 10;
                if (o > 0) res += ones[o] + ' و' + tens[t];
                else res += tens[t];
            }
        }
        return res;
    }

    function numberToWordsUnderBillion(num) {
        if (num === 0) return '';
        let parts = [];
        const billions = Math.floor(num / 1000000000);
        const millions = Math.floor((num % 1000000000) / 1000000);
        const thousands = Math.floor((num % 1000000) / 1000);
        const remainder = num % 1000;

        if (billions > 0) {
            if (billions === 1) parts.push('مليار');
            else if (billions === 2) parts.push('ملياران');
            else if (billions >= 3 && billions <= 10) parts.push(convertGroup(billions) + ' مليارات');
            else parts.push(convertGroup(billions) + ' مليار');
        }

        if (millions > 0) {
            if (millions === 1) parts.push('مليون');
            else if (millions === 2) parts.push('مليونان');
            else if (millions >= 3 && millions <= 10) parts.push(convertGroup(millions) + ' ملايين');
            else parts.push(convertGroup(millions) + ' مليون');
        }

        if (thousands > 0) {
            if (thousands === 1) parts.push('ألف');
            else if (thousands === 2) parts.push('ألفان');
            else if (thousands >= 3 && thousands <= 10) parts.push(convertGroup(thousands) + ' آلاف');
            else parts.push(convertGroup(thousands) + ' ألف');
        }

        if (remainder > 0) {
            parts.push(convertGroup(remainder));
        }

        return parts.join(' و');
    }

    function formatPiasters(p) {
        if (p === 0) return '';
        if (p === 1) return 'قرش واحد';
        if (p === 2) return 'قرشان';
        if (p >= 3 && p <= 10) return convertGroup(p) + ' قروش';
        return convertGroup(p) + ' قرشاً';
    }

    function formatPounds(p) {
        if (p === 0) return '';
        if (currLabel === 'جنيه مصري') {
            if (p === 1) return 'جنيه مصري واحد';
            if (p === 2) return 'جنيهان مصريان';
            const lastTwo = p % 100;
            if (p < 100 && lastTwo >= 3 && lastTwo <= 10) return numberToWordsUnderBillion(p) + ' جنيهات مصرية';
            if (lastTwo >= 11 && lastTwo <= 99) return numberToWordsUnderBillion(p) + ' جنيهاً مصرياً';
            return numberToWordsUnderBillion(p) + ' جنيه مصري';
        }
        return numberToWordsUnderBillion(p) + ' ' + currLabel;
    }

    let result = '';
    if (pounds > 0 && piasters > 0) {
        result = formatPounds(pounds) + ' و' + formatPiasters(piasters);
    } else if (pounds > 0) {
        result = formatPounds(pounds);
    } else {
        result = formatPiasters(piasters);
    }

    return `فقط ${result} لا غير`;
}

const VoucherPreviewModal = ({ voucher, onClose }) => {
    const printRef = useRef();
    const { t, isRTL } = useLanguage();

    const isReceipt = voucher?.voucher_type === 'receipt';
    const currency = voucher?.currency || t('common.currency', 'EGP');

    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: `${isReceipt ? (isRTL ? 'سند_قبض' : 'Receipt_Voucher') : (isRTL ? 'سند_صرف' : 'Payment_Voucher')}_${voucher?.voucher_number || 'doc'}`
    });

    if (!voucher) return null;

    const amountFormatted = parseFloat(voucher.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const amountWordsEnglish = numberToEnglishWords(voucher.amount, 'EGP');
    const amountWordsArabic = numberToArabicWords(voucher.amount, 'جنيه مصري');
    const amountWords = isRTL ? amountWordsArabic : amountWordsEnglish;

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
            overflowY: 'auto',
            direction: isRTL ? 'rtl' : 'ltr'
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
                                <ArrowDownLeft size={16} /> {t('finance.receipts.title')}
                            </span>
                        ) : (
                            <span style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ArrowUpRight size={16} /> {t('finance.payments.title')}
                            </span>
                        )}
                        <span className="num-en" style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '14px', fontWeight: 600 }}>
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
                            <Printer size={16} /> {t('finance.voucherPreview.printVoucher')}
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
                            direction: isRTL ? 'rtl' : 'ltr'
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
                                    {voucher.branch_name ? `${t('finance.voucherPreview.branch')} ${voucher.branch_name}` : ''}
                                    {voucher.tenant_phone ? ` | ${t('finance.voucherPreview.phone')} ` : ''}
                                    {voucher.tenant_phone && <span className="num-en">{voucher.tenant_phone}</span>}
                                </p>
                                {voucher.tax_no && (
                                    <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#64748b' }}>
                                        {t('finance.voucherPreview.taxNo')} <span className="num-en">{voucher.tax_no}</span> {voucher.reg_no ? `| ${t('finance.voucherPreview.regNo')} ` : ''}
                                        {voucher.reg_no && <span className="num-en">{voucher.reg_no}</span>}
                                    </p>
                                )}
                            </div>

                            <div style={{ textAlign: isRTL ? 'left' : 'right' }}>
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
                            padding: '14px 20px',
                            marginBottom: '24px'
                        }}>
                            <div>
                                <h2 style={{
                                    margin: 0,
                                    fontSize: '18px',
                                    fontWeight: 800,
                                    color: isReceipt ? '#065f46' : '#991b1b',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em'
                                }}>
                                    {isReceipt ? t('finance.voucherPreview.receiptTitle') : t('finance.voucherPreview.paymentTitle')}
                                </h2>
                                <span style={{ fontSize: '12px', color: isReceipt ? '#047857' : '#b91c1c', fontWeight: 600 }}>
                                    {isReceipt ? t('finance.voucherPreview.receiptSub') : t('finance.voucherPreview.paymentSub')}
                                </span>
                            </div>

                            <div style={{ textAlign: isRTL ? 'left' : 'right' }}>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>{t('finance.voucherPreview.voucherNo')}</div>
                                <div className="num-en" style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{voucher.voucher_number}</div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                    {t('finance.voucherPreview.date')} <span className="num-en">{voucher.voucher_date ? new Date(voucher.voucher_date).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')}</span>
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
                                <span style={{ fontSize: '12px', color: '#64748b', display: 'block', fontWeight: 600 }}>{t('finance.voucherPreview.amount')}</span>
                                <span style={{ fontSize: '24px', fontWeight: 900, color: isReceipt ? '#059669' : '#dc2626' }}>
                                    <span className="num-en">{amountFormatted}</span> <span style={{ fontSize: '14px', fontWeight: 600 }}>{t('common.currency')}</span>
                                </span>
                            </div>
                            <div style={{ textAlign: isRTL ? 'left' : 'right', maxWidth: '65%' }}>
                                <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>{t('finance.voucherPreview.inWords')}</span>
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
                                <span style={{ width: '200px', fontWeight: 700, color: '#475569' }}>
                                    {isReceipt ? t('finance.voucherPreview.receivedFrom') : t('finance.voucherPreview.paidTo')}
                                </span>
                                <span style={{ flex: 1, fontWeight: 800, color: '#0f172a' }}>
                                    {voucher.party_name || t('finance.voucherPreview.cashParty')}
                                </span>
                            </div>

                            <div style={{ display: 'flex', borderBottom: '1px dashed #cbd5e1', paddingBottom: '10px' }}>
                                <span style={{ width: '200px', fontWeight: 700, color: '#475569' }}>{t('finance.voucherPreview.paymentMethod')}</span>
                                <span style={{ flex: 1, fontWeight: 600, color: '#334155' }}>
                                    {t(`finance.paymentModal.methods.${voucher.payment_method}`, voucher.payment_method || 'Cash')}
                                    {voucher.treasury_account ? ` (${voucher.treasury_account})` : ''}
                                    {voucher.reference_no ? ` | ${t('finance.voucherPreview.refNo')} ${voucher.reference_no}` : ''}
                                </span>
                            </div>

                            {voucher.linked_invoice_number && (
                                <div style={{ display: 'flex', borderBottom: '1px dashed #cbd5e1', paddingBottom: '10px' }}>
                                    <span style={{ width: '200px', fontWeight: 700, color: '#475569' }}>{t('finance.voucherPreview.settlementForInvoice')}</span>
                                    <span style={{ flex: 1, fontWeight: 700, color: '#2563eb' }}>
                                        <span className="num-en">{voucher.linked_invoice_number}</span>
                                        {voucher.linked_invoice_total ? ` (${t('finance.voucherPreview.totalInvoice', { total: parseFloat(voucher.linked_invoice_total).toLocaleString('en-US'), currency: t('common.currency') })})` : ''}
                                    </span>
                                </div>
                            )}

                            <div style={{ display: 'flex', borderBottom: '1px dashed #cbd5e1', paddingBottom: '10px' }}>
                                <span style={{ width: '200px', fontWeight: 700, color: '#475569' }}>{t('finance.voucherPreview.description')}</span>
                                <span style={{ flex: 1, color: '#334155' }}>
                                    {voucher.notes || (isReceipt ? t('finance.receipts.paymentOnAccount') : t('finance.payments.operationalExpenses'))}
                                </span>
                            </div>

                            <div style={{ display: 'flex', paddingBottom: '6px' }}>
                                <span style={{ width: '200px', fontWeight: 700, color: '#475569' }}>{t('finance.voucherPreview.issuedBy')}</span>
                                <span style={{ flex: 1, color: '#64748b', fontSize: '13px' }}>
                                    {voucher.created_by_name || t('finance.voucherPreview.systemAdmin')}
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
                                    {isReceipt ? t('finance.voucherPreview.sigCollector') : t('finance.voucherPreview.sigReceiver')}
                                </span>
                                <div style={{ borderTop: '1px dashed #94a3b8', width: '80%', margin: '0 auto' }}></div>
                            </div>

                            <div>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '45px' }}>
                                    {t('finance.voucherPreview.sigAccountant')}
                                </span>
                                <div style={{ borderTop: '1px dashed #94a3b8', width: '80%', margin: '0 auto' }}></div>
                            </div>

                            <div>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '45px' }}>
                                    {t('finance.voucherPreview.sigManagement')}
                                </span>
                                <div style={{ borderTop: '1px dashed #94a3b8', width: '80%', margin: '0 auto' }}></div>
                            </div>
                        </div>

                        {/* Document Footer Notice */}
                        <div style={{
                            marginTop: '40px',
                            textAlign: 'center',
                            fontSize: '11px',
                            color: '#94a3b8',
                            borderTop: '1px dotted #cbd5e1',
                            paddingTop: '10px'
                        }}>
                            {t('finance.voucherPreview.footerNotice')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VoucherPreviewModal;
