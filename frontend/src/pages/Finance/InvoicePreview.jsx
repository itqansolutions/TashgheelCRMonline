import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Printer, ArrowLeft, ArrowRight, Send, MessageSquare, CheckCircle, Clock, AlertCircle, RefreshCw, X, History } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useLanguage } from '../../context/LanguageContext';
import { useData } from '../../context/DataContext';

const InvoicePreview = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { currentBranch } = useBranch();
    const { t, isRTL } = useLanguage();
    const { tenant: contextTenant } = useData();
    
    const [invoiceData, setInvoiceData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [recipientPhone, setRecipientPhone] = useState('');
    const [customMessage, setCustomMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [latestDelivery, setLatestDelivery] = useState(null);
    const [deliveryHistory, setDeliveryHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    
    const componentRef = useRef(null);

    const handlePrint = useReactToPrint({
        contentRef: componentRef,
        documentTitle: `Invoice_${invoiceData?.invoice?.invoice_number || 'document'}`,
        pageStyle: `
            @page {
                size: A4;
                margin: 12mm;
            }
            @media print {
                body {
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .print-container {
                    box-shadow: none !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    max-width: 100% !important;
                }
            }
        `
    });

    const fetchDeepInvoice = async () => {
        try {
            const res = await api.get(`/finance/invoices/${id}`);
            setInvoiceData(res.data.data);
            if (res.data.data?.latest_delivery) {
                setLatestDelivery(res.data.data.latest_delivery);
            }
        } catch (err) {
            console.error(err);
            toast.error(isRTL ? 'الفاتورة غير موجودة أو غير مصرح بالوصول' : 'Invoice not found or unauthorized');
            navigate('/finance');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDeepInvoice();
    }, [id, navigate, isRTL]);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', color: 'var(--primary)' }}>
            {t('finance.invoicePreview.loading')}
        </div>
    );
    if (!invoiceData) return null;

    const { invoice, items, payments, tenant: apiTenant } = invoiceData;
    const tenant = apiTenant || contextTenant || {};

    const handleOpenWhatsAppModal = () => {
        const inv = invoice;
        const customerName = inv?.customer_name || (isRTL ? 'العميل العزيز' : 'Valued Customer');
        const formattedTotal = Number(inv?.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
        const formattedRemaining = Number(inv?.remaining_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
        const dueDate = inv?.due_date ? new Date(inv.due_date).toLocaleDateString('ar-EG') : (isRTL ? 'عند الاستلام' : 'On Receipt');
        const orgName = tenant?.name || 'Tashgheel';

        setRecipientPhone(inv?.customer_phone || '');
        setCustomMessage(
            `مرحباً ${customerName}،\n` +
            `مرفق تفاصيل الفاتورة رقم (${inv?.invoice_number}) الصادرة من ${orgName}:\n` +
            `• إجمالي الفاتورة: ${formattedTotal} ج.م\n` +
            `• المبلغ المتبقي: ${formattedRemaining} ج.م\n` +
            `• موعد الاستحقاق: ${dueDate}\n\n` +
            `شكراً لتعاملكم معنا.`
        );
        setShowWhatsAppModal(true);
    };

    const handleSendWhatsApp = async () => {
        if (!recipientPhone || !recipientPhone.trim()) {
            toast.error(isRTL ? 'يرجى إدخال رقم هاتف العميل' : 'Please provide recipient phone number');
            return;
        }

        setIsSending(true);
        try {
            const res = await api.post(`/finance/invoices/${id}/send-whatsapp`, {
                recipient_phone: recipientPhone.trim(),
                custom_message: customMessage.trim(),
                client_action_id: `manual_send_${Date.now()}`
            });

            toast.success(res.data?.message || (isRTL ? 'تمت جدولة إرسال الفاتورة عبر واتساب بنجاح' : 'Invoice queued for WhatsApp delivery'));
            setShowWhatsAppModal(false);

            setLatestDelivery({
                delivery_status: 'queued',
                recipient_phone: res.data?.data?.recipientPhone || recipientPhone,
                sent_at: null,
                created_at: new Date().toISOString()
            });

            setTimeout(() => {
                fetchDeepInvoice();
            }, 2500);
        } catch (err) {
            console.error('Send WhatsApp Error:', err);
            const msg = err.response?.data?.message || (isRTL ? 'فشل إرسال الفاتورة عبر واتساب' : 'Failed to send invoice via WhatsApp');
            toast.error(msg);
        } finally {
            setIsSending(false);
        }
    };

    const handleOpenHistoryModal = async () => {
        setShowHistoryModal(true);
        setLoadingHistory(true);
        try {
            const res = await api.get(`/finance/invoices/${id}/delivery-history`);
            setDeliveryHistory(res.data?.data || []);
        } catch (err) {
            console.error('Fetch history error:', err);
            toast.error(isRTL ? 'تعذر جلب سجل الإرسال' : 'Failed to load delivery history');
        } finally {
            setLoadingHistory(false);
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'delivered':
                return { label: isRTL ? 'تم الاستلام' : 'Delivered', bg: '#D1FAE5', color: '#065F46', icon: <CheckCircle size={12} /> };
            case 'read':
                return { label: isRTL ? 'تمت القراءة' : 'Read', bg: '#EDE9FE', color: '#5B21B6', icon: <CheckCircle size={12} /> };
            case 'sent':
                return { label: isRTL ? 'تم الإرسال' : 'Sent', bg: '#DBEAFE', color: '#1E40AF', icon: <Clock size={12} /> };
            case 'failed':
                return { label: isRTL ? 'فشل الإرسال' : 'Failed', bg: '#FEE2E2', color: '#991B1B', icon: <AlertCircle size={12} /> };
            case 'queued':
            default:
                return { label: isRTL ? 'قيد الإرسال' : 'Queued', bg: '#FEF3C7', color: '#92400E', icon: <Clock size={12} /> };
        }
    };

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', direction: isRTL ? 'rtl' : 'ltr' }}>
            <style>{`
                .preview-action-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; background: var(--bg-card); padding: 16px 24px; border-radius: 12px; border: 1px solid var(--glass-border); flex-wrap: wrap; gap: 12px; }
                .print-container { background: white; padding: 40px; border-radius: 12px; box-shadow: var(--shadow-xl); color: #000; min-height: 297mm; max-width: 210mm; margin: 0 auto; direction: ${isRTL ? 'rtl' : 'ltr'}; }
                
                /* A4 PDF Styling */
                .invoice-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e5e7eb; padding-bottom: 24px; margin-bottom: 32px; }
                .org-brand { font-size: 28px; font-weight: 900; color: #111827; letter-spacing: -0.5px; }
                .org-sub { font-size: 13px; color: #6b7280; font-weight: 500; }
                .inv-title { font-size: 32px; font-weight: 800; color: #4f46e5; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0; line-height: 1; }
                
                .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
                .meta-box { background: #f9fafb; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb;}
                .meta-label { font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; margin-bottom: 4px; display: block; }
                .meta-value { font-size: 14px; font-weight: 700; color: #111827; }
                
                .inv-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
                .inv-table th { background: #4f46e5; color: white; padding: 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
                .inv-table td { padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #374151; font-weight: 500; }
                .inv-table tr:nth-child(even) td { background: #f9fafb; }
                
                .totals-box { width: 300px; float: ${isRTL ? 'left' : 'right'}; background: #f9fafb; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; }
                .total-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; color: #4b5563; font-weight: 500; }
                .total-row.grand { border-top: 2px solid #e5e7eb; padding-top: 12px; font-size: 20px; font-weight: 800; color: #111827; }
                .total-row.remaining { color: #ef4444; font-weight: 700; margin-top: 8px;}
                .total-row.paid { color: #10b981; font-weight: 700; }
                
                .clearfix::after { content: ""; clear: both; display: table; }

                .signature-area { margin-top: 80px; display: flex; justify-content: space-between; }
                .sig-box { width: 250px; text-align: center; border-top: 1px dashed #9ca3af; padding-top: 8px; font-size: 13px; color: #6b7280; font-weight: 600; }

                /* Print Media Query Enforcement */
                @media print {
                    body * { visibility: hidden; }
                    .print-container, .print-container * { visibility: visible; }
                    .print-container { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; box-shadow: none; border-radius: 0; }
                    .totals-box { border: none !important; background: transparent !important; }
                    .inv-table th { background: #000 !important; -webkit-print-color-adjust: exact; }
                }
            `}</style>
            
            <div className="preview-action-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    <button onClick={() => navigate('/finance')} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                        {isRTL ? <ArrowRight size={18} /> : <ArrowLeft size={18} />} {t('finance.invoicePreview.backToLedger')}
                    </button>

                    {latestDelivery && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '5px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{isRTL ? 'واتساب:' : 'WhatsApp:'}</span>
                            {(() => {
                                const badge = getStatusBadge(latestDelivery.delivery_status);
                                return (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                                        {badge.icon} {badge.label}
                                    </span>
                                );
                            })()}
                            <button
                                onClick={handleOpenHistoryModal}
                                title={isRTL ? 'سجل الإرسال' : 'Delivery History'}
                                style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 600, padding: '2px 4px' }}
                            >
                                <History size={13} /> {isRTL ? 'السجل' : 'History'}
                            </button>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button 
                        onClick={handleOpenWhatsAppModal} 
                        style={{ 
                            background: '#25D366', 
                            border: 'none', 
                            color: 'white', 
                            padding: '8px 16px', 
                            borderRadius: '8px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            cursor: 'pointer', 
                            fontWeight: 700,
                            boxShadow: '0 2px 8px rgba(37, 211, 102, 0.25)'
                        }}
                    >
                        <MessageSquare size={16} /> {isRTL ? 'إرسال عبر واتساب' : 'Send via WhatsApp'}
                    </button>
                    <button style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'white', padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                        <Send size={16} /> {t('finance.invoicePreview.emailPdf')}
                    </button>
                    <button onClick={() => handlePrint()} style={{ background: 'var(--primary)', border: 'none', color: 'white', padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                        <Printer size={16} /> {t('finance.invoicePreview.printA4')}
                    </button>
                </div>
            </div>

            <div className="print-container" ref={componentRef}>
                <div className="invoice-header">
                    <div style={{ maxWidth: '58%' }}>
                        {tenant?.logo_url && (
                            <img 
                                src={`/${tenant.logo_url.replace(/\\/g, '/')}`} 
                                alt={tenant.name || 'Company Logo'} 
                                style={{ maxHeight: '60px', maxWidth: '200px', objectFit: 'contain', marginBottom: '8px', display: 'block' }} 
                            />
                        )}
                        <div className="org-brand">{tenant?.name || currentBranch?.name || 'TASHGHEEL CRM'}</div>
                        {tenant?.invoice_header_subtitle && (
                            <div className="org-sub" style={{ fontWeight: 700, color: '#374151', fontSize: '13px', marginTop: '3px' }}>
                                {tenant.invoice_header_subtitle}
                            </div>
                        )}
                        {(currentBranch?.address || tenant?.address) && (
                            <div className="org-sub" style={{ marginTop: '3px' }}>
                                {currentBranch?.address || tenant?.address}
                            </div>
                        )}
                        {(tenant?.phone || tenant?.tax_no || tenant?.reg_no) && (
                            <div className="org-sub" style={{ fontSize: '11px', marginTop: '4px', color: '#4b5563', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {tenant.phone && <span>📞 <span className="num-en">{tenant.phone}</span></span>}
                                {tenant.tax_no && <span>| {isRTL ? 'ب.ض:' : 'Tax ID:'} <span className="num-en">{tenant.tax_no}</span></span>}
                                {tenant.reg_no && <span>| {isRTL ? 'س.ت:' : 'CR:'} <span className="num-en">{tenant.reg_no}</span></span>}
                            </div>
                        )}
                    </div>
                    <div style={{ textAlign: isRTL ? 'left' : 'right' }}>
                        <h1 className="inv-title" style={{ color: tenant?.primary_color || '#4f46e5' }}>
                            {tenant?.invoice_header_title || t('finance.invoicePreview.title')}
                        </h1>
                        <div className="org-sub">{t('finance.invoicePreview.invoiceNo')} <strong className="num-en" style={{ color: '#111827' }}>{invoice.invoice_number}</strong></div>
                        <div className="org-sub">{t('finance.invoicePreview.date')} <span className="num-en">{new Date(invoice.created_at).toLocaleDateString('en-GB')}</span></div>
                    </div>
                </div>

                <div className="meta-grid">
                    <div className="meta-box">
                        <span className="meta-label">{t('finance.invoicePreview.billedTo')}</span>
                        <div className="meta-value" style={{ fontSize: '15px', fontWeight: 800 }}>
                            {invoice.customer_name || invoice.party_name || t('finance.invoices.customer')}
                        </div>
                        {invoice.customer_phone && (
                            <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '3px' }}>
                                📞 <span className="num-en">{invoice.customer_phone}</span>
                            </div>
                        )}
                        {invoice.customer_email && (
                            <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '2px' }}>
                                ✉️ {invoice.customer_email}
                            </div>
                        )}
                        {invoice.unit_no && (
                            <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '2px' }}>
                                🏢 {t('finance.invoicePreview.unit')} <span className="num-en">{invoice.unit_no}</span> {invoice.project_name ? `(${invoice.project_name})` : ''}
                            </div>
                        )}
                        {invoice.deal_id && invoice.deal_id !== 'N/A' && invoice.deal_id !== '#N/A' && String(invoice.deal_id).trim() !== '' && (
                            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                {t('finance.invoicePreview.dealId')} #<span className="num-en">{invoice.deal_id}</span>
                            </div>
                        )}
                    </div>
                    <div className="meta-box">
                        <span className="meta-label">{t('finance.invoicePreview.paymentTerms')}</span>
                        <div className="meta-value">{tenant?.terms || t('finance.invoicePreview.dueOnReceipt')}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                            {t('finance.invoicePreview.status')} <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>
                                {t(`finance.invoices.statuses.${(invoice.status || '').toLowerCase()}`) || invoice.status}
                            </span>
                        </div>
                    </div>
                </div>

                <table className="inv-table">
                    <thead>
                        <tr>
                            <th style={{ textAlign: isRTL ? 'right' : 'left' }}>{t('finance.invoicePreview.itemDescription')}</th>
                            <th style={{ textAlign: 'center' }}>{t('finance.invoicePreview.qty')}</th>
                            <th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('finance.invoicePreview.unitPrice')}</th>
                            <th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('finance.invoicePreview.subtotal')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items && items.length > 0 ? items.map((item, idx) => (
                            <tr key={idx}>
                                <td>
                                    <div style={{ fontWeight: 600, color: '#111827' }}>
                                        {item.description || item.product_name || item.item_title || (item.product_id ? `Product #${item.product_id}` : 'Product / Service Item')}
                                    </div>
                                    {item.description && item.product_name && item.description !== item.product_name && (
                                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                                            {item.product_name}
                                        </div>
                                    )}
                                </td>
                                <td className="num-en" style={{ textAlign: 'center' }}>{item.quantity}</td>
                                <td className="num-en" style={{ textAlign: isRTL ? 'left' : 'right' }}>{parseFloat(item.unit_price).toLocaleString('en-US')}</td>
                                <td className="num-en" style={{ textAlign: isRTL ? 'left' : 'right', fontWeight: 700 }}>{parseFloat(item.subtotal).toLocaleString('en-US')}</td>
                            </tr>
                        )) : (
                            <tr><td colSpan="4" style={{ textAlign: 'center', color: '#9ca3af' }}>{t('finance.invoices.noInvoices')}</td></tr>
                        )}
                    </tbody>
                </table>

                <div className="clearfix">
                    <div className="totals-box">
                        <div className="total-row">
                            <span>{t('finance.invoicePreview.subtotal')}</span>
                            <span className="num-en">{parseFloat(invoice.total_amount).toLocaleString('en-US')} {t('common.currency')}</span>
                        </div>
                        <div className="total-row">
                            <span>{t('finance.invoicePreview.tax')}</span>
                            <span className="num-en">0.00 {t('common.currency')}</span>
                        </div>
                        <div className="total-row grand">
                            <span>{t('finance.invoicePreview.total')}</span>
                            <span className="num-en">{parseFloat(invoice.total_amount).toLocaleString('en-US')} {t('common.currency')}</span>
                        </div>
                        <div className="total-row paid">
                            <span>{t('finance.invoicePreview.amountPaid')}</span>
                            <span className="num-en">- {parseFloat(invoice.total_paid).toLocaleString('en-US')} {t('common.currency')}</span>
                        </div>
                        <div className="total-row remaining">
                            <span>{t('finance.invoicePreview.balanceDue')}</span>
                            <span className="num-en">{parseFloat(invoice.remaining_balance).toLocaleString('en-US')} {t('common.currency')}</span>
                        </div>
                    </div>
                </div>

                {payments && payments.length > 0 && (
                    <div style={{ marginTop: '40px', fontSize: '12px', color: '#6b7280' }}>
                        <strong style={{ display: 'block', marginBottom: '8px', color: '#374151', textTransform: 'uppercase' }}>
                            {t('finance.invoicePreview.paymentHistory')}
                        </strong>
                        {payments.map((p, i) => (
                            <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #e5e7eb' }}>
                                <span className="num-en">{new Date(p.payment_date).toLocaleDateString('en-GB')}</span> — <span className="num-en">{parseFloat(p.amount).toLocaleString('en-US')}</span> {t('common.currency')} ({p.payment_method.toUpperCase()})
                            </div>
                        ))}
                    </div>
                )}

                <div className="signature-area">
                    <div className="sig-box">
                        {t('finance.invoicePreview.authorizedSignature')}
                    </div>
                    <div className="sig-box">
                        {t('finance.invoicePreview.customerAcceptance')}
                    </div>
                </div>

                <div style={{ marginTop: '60px', textAlign: 'center', fontSize: '12px', color: '#6b7280', borderTop: '1px solid #e5e7eb', paddingTop: '16px', whiteSpace: 'pre-wrap' }}>
                    {tenant?.invoice_footer || t('finance.invoicePreview.footerNote')}
                </div>
            </div>

            {/* WhatsApp Confirmation Modal */}
            {showWhatsAppModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '16px'
                }}>
                    <div style={{
                        background: 'var(--bg-card, #1e293b)',
                        border: '1px solid var(--glass-border, #334155)',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '520px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                        color: 'var(--text-main, #f8fafc)',
                        overflow: 'hidden'
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '18px 24px',
                            borderBottom: '1px solid var(--glass-border, #334155)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ background: 'rgba(37, 211, 102, 0.15)', color: '#25D366', padding: '8px', borderRadius: '10px' }}>
                                    <MessageSquare size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>
                                        {isRTL ? 'إرسال الفاتورة عبر واتساب' : 'Send Invoice via WhatsApp'}
                                    </h3>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)' }}>
                                        {invoice?.invoice_number}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowWhatsAppModal(false)}
                                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Customer & Amount Summary Card */}
                            <div style={{
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid var(--glass-border, #334155)',
                                borderRadius: '10px',
                                padding: '14px',
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '12px',
                                fontSize: '13px'
                            }}>
                                <div>
                                    <span style={{ color: 'var(--text-muted, #94a3b8)', display: 'block', fontSize: '11px', marginBottom: '2px' }}>
                                        {isRTL ? 'المستلم:' : 'Recipient:'}
                                    </span>
                                    <strong style={{ color: '#fff' }}>{invoice?.customer_name || (isRTL ? 'عميل' : 'Customer')}</strong>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--text-muted, #94a3b8)', display: 'block', fontSize: '11px', marginBottom: '2px' }}>
                                        {isRTL ? 'المبلغ المتبقي:' : 'Balance Due:'}
                                    </span>
                                    <strong style={{ color: '#ef4444' }}>
                                        {Number(invoice?.remaining_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} {t('common.currency')}
                                    </strong>
                                </div>
                            </div>

                            {/* Recipient Phone Input */}
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#f8fafc' }}>
                                    {isRTL ? 'رقم هاتف المستلم (صيغة دولية):' : 'Recipient Phone Number (E.164):'} <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    value={recipientPhone}
                                    onChange={(e) => setRecipientPhone(e.target.value)}
                                    placeholder="+201012345678"
                                    dir="ltr"
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        background: 'rgba(0, 0, 0, 0.25)',
                                        border: '1px solid var(--glass-border, #475569)',
                                        borderRadius: '8px',
                                        color: '#fff',
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        fontFamily: 'monospace'
                                    }}
                                />
                                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginTop: '4px' }}>
                                    {isRTL ? 'يُرجى التأكد من كود الدولة (مثال مصر: 010... تتحول تلقائياً إلى +2010...)' : 'Will be normalised to international E.164 (+20 for Egypt)'}
                                </span>
                            </div>

                            {/* Message Preview */}
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#f8fafc' }}>
                                    {isRTL ? 'نص الرسالة المرسلة للعميل:' : 'Message Content:'}
                                </label>
                                <textarea
                                    rows={5}
                                    value={customMessage}
                                    onChange={(e) => setCustomMessage(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        background: 'rgba(0, 0, 0, 0.25)',
                                        border: '1px solid var(--glass-border, #475569)',
                                        borderRadius: '8px',
                                        color: '#e2e8f0',
                                        fontSize: '12px',
                                        lineHeight: '1.6',
                                        resize: 'vertical'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div style={{
                            padding: '16px 24px',
                            borderTop: '1px solid var(--glass-border, #334155)',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '12px',
                            background: 'rgba(0, 0, 0, 0.15)'
                        }}>
                            <button
                                onClick={() => setShowWhatsAppModal(false)}
                                disabled={isSending}
                                style={{
                                    background: 'transparent',
                                    border: '1px solid var(--glass-border, #475569)',
                                    color: '#cbd5e1',
                                    padding: '8px 18px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: '13px'
                                }}
                            >
                                {isRTL ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleSendWhatsApp}
                                disabled={isSending}
                                style={{
                                    background: '#25D366',
                                    border: 'none',
                                    color: '#fff',
                                    padding: '8px 20px',
                                    borderRadius: '8px',
                                    cursor: isSending ? 'not-allowed' : 'pointer',
                                    fontWeight: 700,
                                    fontSize: '13px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    opacity: isSending ? 0.7 : 1
                                }}
                            >
                                {isSending ? (
                                    <>
                                        <RefreshCw size={14} className="animate-spin" /> {isRTL ? 'جاري الإرسال...' : 'Sending...'}
                                    </>
                                ) : (
                                    <>
                                        <Send size={14} /> {isRTL ? 'تأكيد وإرسال عبر واتساب' : 'Confirm & Send'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delivery History Modal */}
            {showHistoryModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '16px'
                }}>
                    <div style={{
                        background: 'var(--bg-card, #1e293b)',
                        border: '1px solid var(--glass-border, #334155)',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '650px',
                        maxHeight: '85vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                        color: 'var(--text-main, #f8fafc)',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            padding: '18px 24px',
                            borderBottom: '1px solid var(--glass-border, #334155)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <History size={20} color="var(--primary)" />
                                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>
                                    {isRTL ? 'سجل تسليم الفاتورة عبر واتساب' : 'WhatsApp Delivery History'}
                                </h3>
                            </div>
                            <button
                                onClick={() => setShowHistoryModal(false)}
                                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                            {loadingHistory ? (
                                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                                    <div>{isRTL ? 'جاري تحميل السجل...' : 'Loading history...'}</div>
                                </div>
                            ) : deliveryHistory.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                    <Clock size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                                    <div>{isRTL ? 'لم يتم إرسال هذه الفاتورة عبر واتساب حتى الآن.' : 'No WhatsApp deliveries recorded for this invoice yet.'}</div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {deliveryHistory.map((item, idx) => {
                                        const badge = getStatusBadge(item.delivery_status);
                                        return (
                                            <div key={item.id || idx} style={{
                                                background: 'rgba(255, 255, 255, 0.03)',
                                                border: '1px solid var(--glass-border, #334155)',
                                                borderRadius: '10px',
                                                padding: '14px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'flex-start'
                                            }}>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                                                            {badge.icon} {badge.label}
                                                        </span>
                                                        <strong style={{ fontSize: '13px', color: '#fff' }} dir="ltr">
                                                            {item.recipient_phone}
                                                        </strong>
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)' }}>
                                                        {isRTL ? 'تاريخ الإنشاء:' : 'Created:'} {new Date(item.created_at).toLocaleString('en-GB')}
                                                        {item.delivered_at && (
                                                            <span style={{ marginInlineStart: '10px', color: '#059669' }}>
                                                                ✓ {isRTL ? 'تم التسليم:' : 'Delivered:'} {new Date(item.delivered_at).toLocaleTimeString('en-GB')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {item.error_message && (
                                                        <div style={{ marginTop: '6px', fontSize: '12px', color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                                                            {item.error_message}
                                                        </div>
                                                    )}
                                                </div>
                                                {item.meta_message_id && (
                                                    <span style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }}>
                                                        {item.meta_message_id.slice(0, 15)}...
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div style={{
                            padding: '12px 24px',
                            borderTop: '1px solid var(--glass-border, #334155)',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            background: 'rgba(0, 0, 0, 0.15)'
                        }}>
                            <button
                                onClick={() => setShowHistoryModal(false)}
                                style={{
                                    background: 'var(--primary)',
                                    border: 'none',
                                    color: '#fff',
                                    padding: '6px 16px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 600
                                }}
                            >
                                {isRTL ? 'إغلاق' : 'Close'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InvoicePreview;
