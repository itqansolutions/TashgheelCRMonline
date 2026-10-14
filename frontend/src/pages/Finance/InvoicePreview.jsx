import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Printer, ArrowLeft, ArrowRight, Send } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
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

    useEffect(() => {
        const fetchDeepInvoice = async () => {
            try {
                const res = await api.get(`/finance/invoices/${id}`);
                setInvoiceData(res.data.data);
            } catch (err) {
                console.error(err);
                alert(isRTL ? 'الفاتورة غير موجودة أو غير مصرح بالوصول' : 'Invoice not found or unauthorized');
                navigate('/finance');
            } finally {
                setLoading(false);
            }
        };
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

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', direction: isRTL ? 'rtl' : 'ltr' }}>
            <style>{`
                .preview-action-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; background: var(--bg-card); padding: 16px 24px; border-radius: 12px; border: 1px solid var(--glass-border); }
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
                <button onClick={() => navigate('/finance')} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                    {isRTL ? <ArrowRight size={18} /> : <ArrowLeft size={18} />} {t('finance.invoicePreview.backToLedger')}
                </button>
                <div style={{ display: 'flex', gap: '12px' }}>
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
        </div>
    );
};

export default InvoicePreview;
