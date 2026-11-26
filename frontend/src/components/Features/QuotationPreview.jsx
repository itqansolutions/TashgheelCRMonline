import React from 'react';
import { useData } from '../../context/DataContext';
import { useLanguage } from '../../context/LanguageContext';
import { Mail, Phone, MapPin, Globe, CreditCard, Building2, Tag } from 'lucide-react';

const QuotationPreview = ({ quotation }) => {
  const { tenant } = useData();
  const { t, isRTL } = useLanguage();
  
  // Prefer quotation.tenant if attached, fallback to context tenant
  const branding = quotation?.tenant || (tenant?.id ? tenant : {}) || {};
  const accent = branding?.primary_color || '#1d4ed8';

  if (!quotation) return null;

  return (
    <div className="quotation-preview-container">
      <style>{`
        .quotation-preview-container {
          background: white;
          color: #1e293b;
          font-family: 'Inter', 'Cairo', 'Tajawal', sans-serif;
          direction: ${isRTL ? 'rtl' : 'ltr'};
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .quotation-box {
          max-width: 800px;
          margin: auto;
          padding: 0;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          overflow: hidden;
          background: #fff;
        }
        .q-accent { height: 8px; background: ${accent}; }
        .q-body { padding: 36px 44px 28px; }
        .header-section {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
          padding-bottom: 24px;
          margin-bottom: 28px;
          border-bottom: 1px solid #e2e8f0;
        }
        .comp-name { font-size: 20px; font-weight: 800; color: #0f172a; }
        .quotation-title-block { text-align: ${isRTL ? 'left' : 'right'}; flex-shrink: 0; }
        .quotation-title-block h1 {
          font-size: 30px; font-weight: 800; margin: 0; line-height: 1.1;
          color: ${accent}; letter-spacing: ${isRTL ? '0' : '0.06em'}; text-transform: uppercase;
        }
        .quot-meta { margin-top: 12px; display: inline-block; text-align: ${isRTL ? 'right' : 'left'}; font-size: 13px; color: #475569; font-weight: 600; line-height: 1.8; }
        .quot-meta .num-en { color: #0f172a; font-weight: 700; }

        .billing-info {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 28px;
        }
        .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; }
        .info-card h4 { margin: 0 0 8px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: ${isRTL ? '0' : '0.1em'}; }
        .info-card p { margin: 0; font-weight: 800; font-size: 16px; color: #0f172a; }
        .info-sub { font-size: 13px; color: #475569; margin-top: 6px; }

        .quotation-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; table-layout: auto; }
        .quotation-table th {
          background: ${accent};
          color: #fff;
          padding: 11px 14px;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: ${isRTL ? '0' : '0.05em'};
          white-space: nowrap;
        }
        .quotation-table th:first-child { border-radius: ${isRTL ? '0 8px 8px 0' : '8px 0 0 8px'}; }
        .quotation-table th:last-child { border-radius: ${isRTL ? '8px 0 0 8px' : '0 8px 8px 0'}; }
        .quotation-table td {
          padding: 14px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 14px;
          vertical-align: top;
        }
        .quotation-table tbody tr { page-break-inside: avoid; }
        .quotation-table td.num-en, .quotation-table th.num-en {
          display: table-cell !important;
          white-space: nowrap;
          unicode-bidi: plaintext;
        }
        .quotation-table tr.sum-row td { border-bottom: none; padding: 8px 14px; color: #475569; font-size: 14px; }
        .quotation-table tr.sum-row td.lbl { font-weight: 600; }
        .quotation-table tr.total-row td {
          background: #f1f5f9;
          border-top: 2px solid ${accent};
          border-bottom: none;
          padding: 14px;
          font-weight: 800;
          font-size: 17px;
          color: ${accent};
        }
        .item-desc { font-size: 12px; color: #64748b; margin-top: 3px; }

        .quotation-footer { margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
        .notes-section { margin-bottom: 20px; font-size: 12.5px; color: #475569; line-height: 1.7; page-break-inside: avoid; }
        .notes-section h4 { color: #0f172a; margin: 0 0 6px; font-size: 13px; font-weight: 800; padding-${isRTL ? 'right' : 'left'}: 10px; border-${isRTL ? 'right' : 'left'}: 3px solid ${accent}; }
        .branding-footer { text-align: center; font-size: 11.5px; color: #94a3b8; }

        @media print {
          @page { size: A4; margin: 10mm; }
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; }
          nav, aside, header, .no-print, button, .sidebar, .navbar { display: none !important; }
          .quotation-preview-page { padding: 0 !important; }
          .quotation-preview-container { width: 100%; padding: 0; margin: 0; }
          .quotation-box { border: none; border-radius: 0; max-width: 100%; width: 100%; }
          .q-body { padding: 20px 8px 0; }
        }
      `}</style>

      <div className="quotation-box">
        <div className="q-accent" />
        <div className="q-body">
        {/* Header */}
        <div className="header-section">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: isRTL ? 'flex-start' : 'flex-start', maxWidth: '58%' }}>
            {branding?.logo_url ? (
              <img src={`/${branding.logo_url.replace(/\\/g, '/')}`} alt="Logo" style={{ maxHeight: '60px', maxWidth: '180px', objectFit: 'contain', marginBottom: '8px' }} />
            ) : null}
            <div className="comp-name" style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b' }}>
              {branding?.name || 'Tashgheel CRM'}
            </div>
            {branding?.quotation_header_subtitle && (
              <div style={{ fontSize: '13px', color: '#4b5563', fontWeight: 600, marginTop: '3px' }}>
                {branding.quotation_header_subtitle}
              </div>
            )}
            {branding?.address && (
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                {branding.address}
              </div>
            )}
            {(branding?.phone || branding?.tax_no || branding?.reg_no) && (
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {branding.phone && <span>📞 <span className="num-en">{branding.phone}</span></span>}
                {branding.tax_no && <span>| {isRTL ? 'ب.ض:' : 'Tax ID:'} <span className="num-en">{branding.tax_no}</span></span>}
                {branding.reg_no && <span>| {isRTL ? 'س.ت:' : 'CR:'} <span className="num-en">{branding.reg_no}</span></span>}
              </div>
            )}
          </div>
          <div className="quotation-title-block">
            <h1>
              {branding?.quotation_header_title || t('finance.quotationPreview.title')}
            </h1>
            <div className="quot-meta">
              <div>{t('finance.quotationPreview.ref')} <span className="num-en">{quotation.number || `${branding?.quotation_prefix || 'QUO-'}${quotation.id}`}</span></div>
              <div>{t('finance.quotationPreview.date')} <span className="num-en">{new Date(quotation.created_at).toLocaleDateString('en-GB')}</span></div>
            </div>
          </div>
        </div>

        {/* Billing Info */}
        <div className="billing-info">
          <div className="info-card">
            <h4>{t('finance.quotationPreview.preparedFor')}</h4>
            <p>{quotation.client_name || t('finance.invoices.cashCustomer')}</p>
            <div className="info-sub">
              {t('finance.quotationPreview.deal')} {quotation.deal_title || (isRTL ? 'بيع مباشر' : 'Direct Sale')}
              {quotation.unit_number && (
                  <div style={{ marginTop: '4px', fontWeight: '700', color: '#1e293b' }}>
                      {t('finance.quotationPreview.unit')} <span className="num-en">{quotation.unit_number}</span> {quotation.project_name ? `(${quotation.project_name})` : ''}
                  </div>
              )}
            </div>
          </div>
          <div className="info-card">
            <h4>{t('finance.quotationPreview.validity')}</h4>
            <p>{t('finance.quotationPreview.validUntil')} <span className="num-en">{new Date(quotation.valid_until).toLocaleDateString('en-GB')}</span></p>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="responsive-table-region" role="region" tabIndex={0}><table className="quotation-table">
          <thead>
            <tr>
              <th style={{ textAlign: isRTL ? 'right' : 'left' }}>{t('finance.quotationPreview.itemService')}</th>
              <th style={{ textAlign: 'center', width: '70px' }}>{t('finance.quotationPreview.qty')}</th>
              <th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('finance.quotationPreview.unitPrice')}</th>
              <th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('finance.quotationPreview.total')}</th>
            </tr>
          </thead>
          <tbody>
            {(quotation.items && quotation.items.length > 0) ? (
                quotation.items.map((item, idx) => (
                    <tr key={idx}>
                        <td>
                            <div style={{ fontWeight: '700' }}>{item.product_name || item.description || (isRTL ? 'بند خدمة' : 'Service Item')}</div>
                            {item.description && <div className="item-desc">{item.description}</div>}
                        </td>
                        <td className="num-en" style={{ textAlign: 'center' }}>{item.quantity}</td>
                        <td className="num-en" style={{ textAlign: isRTL ? 'left' : 'right' }}>{parseFloat(item.unit_price).toLocaleString('en-US')}</td>
                        <td className="num-en" style={{ textAlign: isRTL ? 'left' : 'right' }}>{parseFloat(item.subtotal).toLocaleString('en-US')} {t('common.currency')}</td>
                    </tr>
                ))
            ) : (
                <tr>
                    <td>
                        <div style={{ fontWeight: '700', marginBottom: '8px' }}>{isRTL ? 'خدمات تقديرية / مقترح عمل' : 'Estimated Services / Proposal'}</div>
                        <div style={{ fontSize: '13px', color: '#64748b', whiteSpace: 'pre-wrap' }}>
                            {quotation.notes || (isRTL ? 'عرض أسعار احترافي وفق المتطلبات المحددة.' : 'Professional quotation based on requested requirements.')}
                        </div>
                    </td>
                    <td className="num-en" style={{ textAlign: 'center' }}>1</td>
                    <td className="num-en" style={{ textAlign: isRTL ? 'left' : 'right' }}>{parseFloat(quotation.total_amount).toLocaleString('en-US')}</td>
                    <td className="num-en" style={{ textAlign: isRTL ? 'left' : 'right' }}>{parseFloat(quotation.total_amount).toLocaleString('en-US')} {t('common.currency')}</td>
                </tr>
            )}
            {parseFloat(quotation.discount_amount) > 0 && (
              <>
                <tr className="sum-row">
                  <td colSpan="3" className="lbl" style={{ textAlign: isRTL ? 'left' : 'right' }}>{isRTL ? 'الإجمالي قبل الخصم' : 'Subtotal'}</td>
                  <td className="num-en" style={{ textAlign: isRTL ? 'left' : 'right' }}>{parseFloat(quotation.subtotal_before_discount).toLocaleString('en-US')} {t('common.currency')}</td>
                </tr>
                <tr className="sum-row">
                  <td colSpan="3" className="lbl" style={{ textAlign: isRTL ? 'left' : 'right' }}>{isRTL ? 'الخصم' : 'Discount'}{quotation.discount_type === 'percent' ? ` (${parseFloat(quotation.discount_value)}%)` : ''}</td>
                  <td className="num-en" style={{ textAlign: isRTL ? 'left' : 'right' }}>- {parseFloat(quotation.discount_amount).toLocaleString('en-US')} {t('common.currency')}</td>
                </tr>
              </>
            )}
            <tr className="total-row">
              <td colSpan="3" style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('finance.quotationPreview.estimatedTotal')}</td>
              <td className="num-en" style={{ textAlign: isRTL ? 'left' : 'right' }}>{parseFloat(quotation.total_amount).toLocaleString('en-US')} {t('common.currency')}</td>
            </tr>
          </tbody>
        </table></div>

        {/* Footer */}
        <div className="quotation-footer">
          {branding?.quotation_terms && (
            <div className="notes-section">
              <h4>{t('finance.quotationPreview.termsConditions')}</h4>
              <div style={{ whiteSpace: 'pre-wrap' }}>{branding.quotation_terms}</div>
            </div>
          )}
          
          {quotation.notes && (quotation.items && quotation.items.length > 0) && (
             <div className="notes-section">
               <h4>{t('finance.quotationPreview.proposalNotes')}</h4>
               <div style={{ whiteSpace: 'pre-wrap' }}>{quotation.notes}</div>
             </div>
          )}

          {branding?.quotation_footer && (
             <div className="branding-footer" style={{ marginTop: '30px', fontStyle: 'italic', color: '#94a3b8' }}>
                {branding.quotation_footer}
             </div>
          )}
          
          <div className="branding-footer" style={{ marginTop: '20px' }}>
             © <span className="num-en">{new Date().getFullYear()}</span> {branding?.name || 'Tashgheel CRM'} • {t('finance.quotationPreview.businessProposal')}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default QuotationPreview;
