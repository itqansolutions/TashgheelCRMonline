import React from 'react';
import { useData } from '../../context/DataContext';
import { Mail, Phone, MapPin, Globe, CreditCard, Building2, Tag } from 'lucide-react';

const QuotationPreview = ({ quotation }) => {
  const { settings } = useData();

  if (!quotation) return null;

  return (
    <div className="quotation-preview-container">
      <style>{`
        .quotation-preview-container {
          background: white;
          color: #1e293b;
          font-family: 'Inter', sans-serif;
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
          text-align: right;
        }
        .quotation-title-block h1 {
          font-size: 28px;
          margin: 0;
          color: ${settings?.primary_color || '#f59e0b'};
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
          text-align: left;
          font-size: 12px;
          text-transform: uppercase;
          color: ${settings?.primary_color || '#d97706'};
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
          color: ${settings?.primary_color || '#d97706'};
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
          font-italic: true;
        }

        @media print {
          .quotation-box {
            box-shadow: none;
            border: none;
            padding: 0;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="quotation-box">
        {/* Header */}
        <div className="header-section">
          <div className="logo-placeholder">
            {settings?.company_logo ? (
              <img src={`/${settings.company_logo.replace(/\\/g, '/')}`} alt="Logo" />
            ) : null}
            {!settings?.company_logo && <span className="comp-name">{settings?.company_name || 'Tashgheel CRM'}</span>}
            {settings?.company_logo && settings?.company_name && <span className="comp-name" style={{ fontSize: '14px', color: '#64748b' }}>{settings.company_name}</span>}
          </div>
            <div className="quotation-title-block">
              <h1>Price Quotation</h1>
              <div className="quot-meta">
                <div>Ref: {settings?.quotation_prefix || 'QUO-'}{quotation.id}</div>
                <div>Date: {new Date(quotation.created_at).toLocaleDateString()}</div>
              </div>
            </div>
        </div>

        {/* Billing Info */}
        <div className="billing-info">
          <div className="info-block">
            <h4>Prepared For</h4>
            <p>{quotation.client_name || 'Generic Customer'}</p>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>
              Deal: {quotation.deal_title || 'Direct Sale'}
              {quotation.unit_number && (
                  <div style={{ marginTop: '4px', fontWeight: '700', color: '#1e293b' }}>
                      Unit: {quotation.unit_number} ({quotation.project_name})
                  </div>
              )}
            </div>
          </div>
          <div className="info-block" style={{ textAlign: 'right' }}>
            <h4>Validity</h4>
            <p>Valid Until: {new Date(quotation.valid_until).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Line Items Table */}
        <table className="quotation-table">
          <thead>
            <tr>
              <th>Item / Service</th>
              <th style={{ textAlign: 'center' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Unit Price</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {(quotation.items && quotation.items.length > 0) ? (
                quotation.items.map((item, idx) => (
                    <tr key={idx}>
                        <td>
                            <div style={{ fontWeight: '700' }}>{item.product_name || item.description || 'Service Item'}</div>
                            {item.description && <div style={{ fontSize: '11px', color: '#64748b' }}>{item.description}</div>}
                        </td>
                        <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                        <td style={{ textAlign: 'right' }}>{parseFloat(item.unit_price).toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }}>{parseFloat(item.subtotal).toLocaleString()} EGP</td>
                    </tr>
                ))
            ) : (
                <tr>
                    <td>
                        <div style={{ fontWeight: '700', marginBottom: '8px' }}>Estimated Services / Proposal</div>
                        <div style={{ fontSize: '13px', color: '#64748b', whiteSpace: 'pre-wrap' }}>
                            {quotation.notes || 'Professional quotation based on requested requirements.'}
                        </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>1</td>
                    <td style={{ textAlign: 'right' }}>{parseFloat(quotation.total_amount).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{parseFloat(quotation.total_amount).toLocaleString()} EGP</td>
                </tr>
            )}
            <tr className="total-row">
              <td colSpan="3" style={{ textAlign: 'right' }}>Estimated Total:</td>
              <td style={{ textAlign: 'right' }}>{parseFloat(quotation.total_amount).toLocaleString()} EGP</td>
            </tr>
          </tbody>
        </table>

        {/* Footer */}
        <div className="quotation-footer">
          {settings?.quotation_terms && (
            <div className="notes-section">
              <h4>Terms & Conditions</h4>
              <div style={{ whiteSpace: 'pre-wrap' }}>{settings.quotation_terms}</div>
            </div>
          )}
          
          {quotation.notes && (quotation.items && quotation.items.length > 0) && (
             <div className="notes-section">
               <h4>Proposal Notes</h4>
               <div style={{ whiteSpace: 'pre-wrap' }}>{quotation.notes}</div>
             </div>
          )}

          {settings?.quotation_footer && (
             <div className="branding-footer" style={{ marginTop: '30px', fontStyle: 'italic', color: '#94a3b8' }}>
                {settings.quotation_footer}
             </div>
          )}
          
          <div className="branding-footer" style={{ marginTop: '20px' }}>
             © {new Date().getFullYear()} {settings?.company_name || 'Tashgheel CRM'} • Professional Business Proposal
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuotationPreview;
