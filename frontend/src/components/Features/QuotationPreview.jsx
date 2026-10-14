import React from 'react';
import { useData } from '../../context/DataContext';
import { useLanguage } from '../../context/LanguageContext';
import { Mail, Phone, MapPin, Globe, CreditCard, Building2, Tag } from 'lucide-react';

const QuotationPreview = ({ quotation }) => {
  const { tenant } = useData();
  const { t, isRTL } = useLanguage();
  
  // Backwards compatibility / Fallback to settings if tenant is empty
  const branding = tenant?.id ? tenant : {};

  if (!quotation) return null;

  return (
    <div className="quotation-preview-container">
      <style>{`
        .quotation-preview-container {
          background: white;
          color: #1e293b;
          font-family: 'Inter', sans-serif;
          direction: ${isRTL ? 'rtl' : 'ltr'};
        }
        .quotation-box {
          max-width: 800px;
          margin: auto;
          padding: 40px;
          border: 1px solid #f1f5f9;
          box-shadow: 0 0 20px rgba(0, 0, 0, 0.05);
          border-radius: 8px;
        }
        .header-section {
          display: flex;
          justify-content: space-between;
          margin-bottom: 50px;
          border-bottom: 2px solid #f1f5f9;
          padding-bottom: 30px;
        }
        .logo-placeholder {
          height: 60px;
          max-width: 200px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .logo-placeholder img {
          max-height: 100%;
          object-fit: contain;
        }
        .comp-name {
          font-size: 18px;
          font-weight: 700;
          color: #475569;
          letter-spacing: -0.01em;
        }
        .quotation-title-block {
          text-align: ${isRTL ? 'left' : 'right'};
        }
        .quotation-title-block h1 {
          font-size: 28px;
          margin: 0;
          color: ${branding?.primary_color || '#f59e0b'};
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .quot-meta {
          margin-top: 8px;
          color: #64748b;
          font-weight: 600;
          font-size: 13px;
        }

        .billing-info {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-bottom: 40px;
        }
        .info-block h4 {
          text-transform: uppercase;
          font-size: 12px;
          color: #94a3b8;
          margin-bottom: 12px;
          letter-spacing: 0.1em;
        }
        .info-block p {
          margin: 4px 0;
          font-weight: 700;
          font-size: 15px;
        }

        .quotation-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 40px;
        }
        .quotation-table th {
          background: #fffbeb;
          padding: 15px;
          text-align: ${isRTL ? 'right' : 'left'};
          font-size: 12px;
          text-transform: uppercase;
          color: ${branding?.primary_color || '#d97706'};
          border-bottom: 2px solid #fef3c7;
        }
        .quotation-table td {
          padding: 20px 15px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 14px;
        }
        .total-row {
          background: #fffbeb;
          font-weight: 800;
          font-size: 18px;
        }
        .total-row td {
          color: ${branding?.primary_color || '#d97706'};
        }

        .quotation-footer {
          margin-top: 60px;
          padding-top: 30px;
          border-top: 2px solid #f1f5f9;
        }
        .notes-section {
          margin-bottom: 30px;
          font-size: 13px;
          color: #64748b;
          line-height: 1.6;
        }
        .notes-section h4 {
          color: #1e293b;
          margin-bottom: 8px;
        }
        .branding-footer {
          text-align: center;
          font-size: 12px;
          color: #94a3b8;
          font-style: italic;
        }

        @media print {
          @page { size: A4; margin: 0; }
          body { background: white; margin: 0; padding: 0; }
          nav, aside, header, .no-print, button, .sidebar, .navbar { display: none !important; }
          .quotation-preview-container { 
            width: 100%; 
            padding: 0; 
            margin: 0; 
          }
          .quotation-box {
            box-shadow: none;
            border: none;
            padding: 40px;
            width: 100%;
            max-width: 100%;
          }
        }
      `}</style>

      <div className="quotation-box">
        {/* Header */}
        <div className="header-section">
          <div className="logo-placeholder">
            {branding?.logo_url ? (
              <img src={`/${branding.logo_url.replace(/\\/g, '/')}`} alt="Logo" />
            ) : null}
            {!branding?.logo_url && <span className="comp-name">{branding?.name || 'Tashgheel CRM'}</span>}
            {branding?.logo_url && branding?.name && <span className="comp-name" style={{ fontSize: '14px', color: '#64748b' }}>{branding.name}</span>}
          </div>
          <div className="quotation-title-block">
            <h1>{t('finance.quotationPreview.title')}</h1>
            <div className="quot-meta">
              <div>{t('finance.quotationPreview.ref')} <span className="num-en">{quotation.number || `${branding?.quotation_prefix || 'QUO-'}${quotation.id}`}</span></div>
              <div>{t('finance.quotationPreview.date')} <span className="num-en">{new Date(quotation.created_at).toLocaleDateString('en-GB')}</span></div>
            </div>
          </div>
        </div>

        {/* Billing Info */}
        <div className="billing-info">
          <div className="info-block">
            <h4>{t('finance.quotationPreview.preparedFor')}</h4>
            <p>{quotation.client_name || t('finance.invoices.cashCustomer')}</p>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>
              {t('finance.quotationPreview.deal')} {quotation.deal_title || (isRTL ? 'بيع مباشر' : 'Direct Sale')}
              {quotation.unit_number && (
                  <div style={{ marginTop: '4px', fontWeight: '700', color: '#1e293b' }}>
                      {t('finance.quotationPreview.unit')} <span className="num-en">{quotation.unit_number}</span> {quotation.project_name ? `(${quotation.project_name})` : ''}
                  </div>
              )}
            </div>
          </div>
          <div className="info-block" style={{ textAlign: isRTL ? 'left' : 'right' }}>
            <h4>{t('finance.quotationPreview.validity')}</h4>
            <p>{t('finance.quotationPreview.validUntil')} <span className="num-en">{new Date(quotation.valid_until).toLocaleDateString('en-GB')}</span></p>
          </div>
        </div>

        {/* Line Items Table */}
        <table className="quotation-table">
          <thead>
            <tr>
              <th style={{ textAlign: isRTL ? 'right' : 'left' }}>{t('finance.quotationPreview.itemService')}</th>
              <th style={{ textAlign: 'center' }}>{t('finance.quotationPreview.qty')}</th>
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
                            {item.description && <div style={{ fontSize: '11px', color: '#64748b' }}>{item.description}</div>}
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
            <tr className="total-row">
              <td colSpan="3" style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('finance.quotationPreview.estimatedTotal')}</td>
              <td className="num-en" style={{ textAlign: isRTL ? 'left' : 'right' }}>{parseFloat(quotation.total_amount).toLocaleString('en-US')} {t('common.currency')}</td>
            </tr>
          </tbody>
        </table>

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
  );
};

export default QuotationPreview;
