import React, { useRef } from 'react';
import { Printer, X, CheckCircle2, ArrowDownLeft, ArrowUpRight, Building2, Calendar, CreditCard, Hash, User } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

// Helper function to convert numbers into English words
function numberToEnglishWords(number, currency = 'EGP') {
    if (!number || isNaN(number)) return '';
    const n = Math.floor(Math.abs(number));
    if (n === 0) return `Zero ${currency} Only`;

    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function inWords(num) {
        if (num < 20) return a[num];
        const digit = num % 10;
        if (num < 100) return b[Math.floor(num / 10)] + (digit ? '-' + a[digit] : '');
        if (num < 1000) return a[Math.floor(num / 100)] + ' Hundred' + (num % 100 !== 0 ? ' and ' + inWords(num % 100) : '');
        if (num < 1000000) return inWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 !== 0 ? ' ' + inWords(num % 1000) : '');
        return inWords(Math.floor(num / 1000000)) + ' Million' + (num % 1000000 !== 0 ? ' ' + inWords(num % 1000000) : '');
    }

    return `${inWords(n)} ${currency} Only`;
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
    const amountWords = numberToEnglishWords(voucher.amount, currency);

    const paymentMethodLabels = {
        cash: 'Cash',
        bank_transfer: 'Bank Transfer',
        check: 'Cheque',
        card: 'Debit / Credit Card'
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
                                <ArrowDownLeft size={16} /> Receipt Voucher
                            </span>
                        ) : (
                            <span style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ArrowUpRight size={16} /> Payment Voucher
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
                            <Printer size={16} /> Print Voucher
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
                            direction: 'ltr'
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
                                    {voucher.branch_name ? `Branch: ${voucher.branch_name}` : ''}
                                    {voucher.tenant_phone ? ` | Phone: ${voucher.tenant_phone}` : ''}
                                </p>
                                {voucher.tax_no && (
                                    <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#64748b' }}>
                                        Tax No: {voucher.tax_no} {voucher.reg_no ? `| Reg No: ${voucher.reg_no}` : ''}
                                    </p>
                                )}
                            </div>

                            <div style={{ textAlign: 'right' }}>
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
                                    {isReceipt ? 'OFFICIAL RECEIPT VOUCHER' : 'OFFICIAL PAYMENT VOUCHER'}
                                </h2>
                                <span style={{ fontSize: '12px', color: isReceipt ? '#047857' : '#b91c1c', fontWeight: 600 }}>
                                    {isReceipt ? 'Cash & Bank Inflow Voucher' : 'Cash & Bank Outflow Voucher'}
                                </span>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>Voucher No:</div>
                                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{voucher.voucher_number}</div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                    Date: {voucher.voucher_date ? new Date(voucher.voucher_date).toLocaleDateString('en-US') : new Date().toLocaleDateString('en-US')}
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
                                <span style={{ fontSize: '12px', color: '#64748b', display: 'block', fontWeight: 600 }}>Amount:</span>
                                <span style={{ fontSize: '24px', fontWeight: 900, color: isReceipt ? '#059669' : '#dc2626' }}>
                                    {amountFormatted} <span style={{ fontSize: '14px', fontWeight: 600 }}>{currency}</span>
                                </span>
                            </div>
                            <div style={{ textAlign: 'right', maxWidth: '65%' }}>
                                <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>In Words:</span>
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
                                <span style={{ width: '180px', fontWeight: 700, color: '#475569' }}>
                                    {isReceipt ? 'Received From:' : 'Paid To:'}
                                </span>
                                <span style={{ flex: 1, fontWeight: 800, color: '#0f172a' }}>
                                    {voucher.party_name || 'Cash Party'}
                                </span>
                            </div>

                            <div style={{ display: 'flex', borderBottom: '1px dashed #cbd5e1', paddingBottom: '10px' }}>
                                <span style={{ width: '180px', fontWeight: 700, color: '#475569' }}>Payment Method:</span>
                                <span style={{ flex: 1, fontWeight: 600, color: '#334155' }}>
                                    {paymentMethodLabels[voucher.payment_method] || voucher.payment_method || 'Cash'}
                                    {voucher.treasury_account ? ` (${voucher.treasury_account})` : ''}
                                    {voucher.reference_no ? ` | Reference / Cheque No: ${voucher.reference_no}` : ''}
                                </span>
                            </div>

                            {voucher.linked_invoice_number && (
                                <div style={{ display: 'flex', borderBottom: '1px dashed #cbd5e1', paddingBottom: '10px' }}>
                                    <span style={{ width: '180px', fontWeight: 700, color: '#475569' }}>Settlement For Invoice:</span>
                                    <span style={{ flex: 1, fontWeight: 700, color: '#2563eb' }}>
                                        {voucher.linked_invoice_number}
                                        {voucher.linked_invoice_total ? ` (Total Invoice: ${parseFloat(voucher.linked_invoice_total).toLocaleString()} ${currency})` : ''}
                                    </span>
                                </div>
                            )}

                            <div style={{ display: 'flex', borderBottom: '1px dashed #cbd5e1', paddingBottom: '10px' }}>
                                <span style={{ width: '180px', fontWeight: 700, color: '#475569' }}>Description / Purpose:</span>
                                <span style={{ flex: 1, color: '#334155' }}>
                                    {voucher.notes || (isReceipt ? 'Payment on account' : 'Operational expense')}
                                </span>
                            </div>

                            <div style={{ display: 'flex', paddingBottom: '6px' }}>
                                <span style={{ width: '180px', fontWeight: 700, color: '#475569' }}>Issued By:</span>
                                <span style={{ flex: 1, color: '#64748b', fontSize: '13px' }}>
                                    {voucher.created_by_name || 'System Administrator'}
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
                                    {isReceipt ? 'Collector / Receiver' : 'Receiver Signature'}
                                </span>
                                <div style={{ borderTop: '1px dashed #94a3b8', width: '80%', margin: '0 auto' }}></div>
                            </div>

                            <div>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '45px' }}>
                                    Accountant
                                </span>
                                <div style={{ borderTop: '1px dashed #94a3b8', width: '80%', margin: '0 auto' }}></div>
                            </div>

                            <div>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '45px' }}>
                                    Management / Seal
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
                            This voucher was electronically generated by Tashgheel Business Management System (CRM).
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VoucherPreviewModal;
