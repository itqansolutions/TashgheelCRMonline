import React from 'react';
import { useData } from '../../context/DataContext';
import { Mail, Phone, MapPin, Globe, CreditCard, Building2 } from 'lucide-react';

const InvoicePreview = ({ invoice }) => {
  const { settings } = useData();

  if (!invoice) return null;

  return (
    <div className="invoice-preview-container">
      <style>{`
        .invoice-preview-container {
          background: white;
          color: #1e293b;
          font-family: 'Inter', sans-serif;
        }
        .invoice-box {
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
          height: 80px;
          max-width: 250px;
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .logo-placeholder img {
          max-height: 100%;
          object-fit: contain;
        }
        .comp-name {
          font-size: 24px;
          font-weight: 800;
          color: var(--primary);
          letter-spacing: -0.02em;
        }
        .invoice-title-block {
          text-align: right;
        }
        .invoice-title-block h1 {
          font-size: 32px;
          margin: 0;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .inv-meta {
          margin-top: 10px;
          color: #94a3b8;
          font-weight: 600;
          font-size: 14px;
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

        .invoice-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 40px;
        }
        .invoice-table th {
          background: #f8fafc;
          padding: 15px;
          text-align: left;
          font-size: 12px;
          text-transform: uppercase;
          color: #64748b;
          border-bottom: 2px solid #f1f5f9;
        }
        .invoice-table td {
          padding: 20px 15px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 14px;
        }
        .total-row {
          background: #fdf2f2;
          font-weight: 800;
          font-size: 18px;
        }
        .total-row td {
          color: #dc2626;
        }

        .invoice-footer {
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
          .invoice-box {
            box-shadow: none;
            border: none;
            padding: 0;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="invoice-box">
        {/* Header */}
        <div className="header-section">
          <div className="logo-placeholder">
            {settings?.company_logo ? (
              <img src={`/${settings.company_logo}`} alt="Company Logo" />
            ) : null}
            <span className="comp-name">{settings?.company_name || 'Tashgheel CRM'}</span>
          </div>
          <div className="invoice-title-block">
            <h1>Invoice</h1>
            <div className="inv-meta">
              <div># {invoice.invoice_number}</div>
              <div>Date: {new Date(invoice.created_at).toLocaleDateString()}</div>
            </div>
          </div>
        </div>

        {/* Billing Info */}
        <div className="billing-info">
          <div className="info-block">
            <h4>Billed To</h4>
            <p>{invoice.client_name || 'Generic Customer'}</p>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>
              Reference ID: {invoice.client_id || 'N/A'}
            </div>
          </div>
          <div className="info-block" style={{ textAlign: 'right' }}>
            <h4>Payment Info</h4>
            <p>Due By: {new Date(invoice.due_date).toLocaleDateString()}</p>
            <p style={{ color: invoice.status === 'paid' ? '#16a34a' : '#dc2626' }}>
              Status: {invoice.status.toUpperCase()}
            </p>
          </div>
        </div>

        {/* Line Items Table */}
        <table className="invoice-table">
          <thead>
            <tr>
              <th>Description</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div style={{ fontWeight: '700', marginBottom: '8px' }}>Services/Products Rendered</div>
                
                {invoice.notes?.includes('🏢') ? (
                  <div style={{ 
                    background: '#f0f9ff', 
                    border: '1px solid #bae6fd', 
                    borderRadius: '10px', 
                    padding: '16px',
                    color: '#0369a1',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.1, transform: 'rotate(-15deg)' }}>
                      <Building2 size={80} />
                    </div>
                    {invoice.notes}
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: '#64748b', whiteSpace: 'pre-wrap' }}>
                    {invoice.notes || 'Professional services as discussed.'}
                  </div>
                )}
              </td>
              <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: '22px' }}>{invoice.total_amount} EGP</td>
            </tr>
            <tr className="total-row">
              <td style={{ textAlign: 'right' }}>Total Amount Due:</td>
              <td style={{ textAlign: 'right' }}>{invoice.total_amount} EGP</td>
            </tr>
          </tbody>
        </table>

        {/* Footer */}
        <div className="invoice-footer">
          {settings?.invoice_terms && (
            <div className="notes-section">
              <h4>Terms & Conditions</h4>
              <p>{settings.invoice_terms}</p>
            </div>
          )}
          
          <div className="notes-section">
            <h4>Additional Notes</h4>
            <p>{settings?.invoice_footer || 'Thank you for your business!'}</p>
          </div>

          <div className="branding-footer">
             © {new Date().getFullYear()} {settings?.company_name || 'Tashgheel CRM'} • Generated via Tashgheel CRM by itqan
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoicePreview;
