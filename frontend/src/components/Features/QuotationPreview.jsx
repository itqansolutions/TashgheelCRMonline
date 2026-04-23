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
        .quotation-title-block {
          text-align: right;
        }
        .quotation-title-block h1 {
          font-size: 32px;
          margin: 0;
          color: #f59e0b;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .quot-meta {
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
          color: #d97706;
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
          color: #d97706;
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
              <img src={`/${settings.company_logo}`} alt="Company Logo" />
            ) : null}
            <span className="comp-name">{settings?.company_name || 'Tashgheel CRM'}</span>
          </div>
          <div className="quotation-title-block">
            <h1>Price Quotation</h1>
            <div className="quot-meta">
              <div>Ref: QUO-{quotation.id}</div>
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
            </div>
          </div>
          <div className="info-block" style={{ textAlign: 'right' }}>
            <h4>Validity</h4>
            <p>Valid Until: {new Date(quotation.valid_until).toLocaleDateString()}</p>
            <p style={{ color: '#f59e0b' }}>
              Status: {quotation.status?.toUpperCase() || 'DRAFT'}
            </p>
          </div>
        </div>

        {/* Line Items Table */}
        <table className="quotation-table">
          <thead>
            <tr>
              <th>Description</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div style={{ fontWeight: '700', marginBottom: '8px' }}>Estimated Services / Proposal</div>
                <div style={{ fontSize: '13px', color: '#64748b', whiteSpace: 'pre-wrap' }}>
                    {quotation.notes || 'Professional quotation based on requested requirements.'}
                </div>
              </td>
              <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: '22px' }}>{quotation.total_amount} EGP</td>
            </tr>
            <tr className="total-row">
              <td style={{ textAlign: 'right' }}>Estimated Total:</td>
              <td style={{ textAlign: 'right' }}>{quotation.total_amount} EGP</td>
            </tr>
          </tbody>
        </table>

        {/* Footer */}
        <div className="quotation-footer">
          {settings?.quotation_terms && (
            <div className="notes-section">
              <h4>Terms & Conditions</h4>
              <p>{settings.quotation_terms}</p>
            </div>
          )}
          
          <div className="notes-section">
            <h4>Notes</h4>
            <p>This quotation is valid for 30 days from the date of issue. Prices are subject to change after the validity period.</p>
          </div>

          <div className="branding-footer">
             © {new Date().getFullYear()} {settings?.company_name || 'Tashgheel CRM'} • Generated via Tashgheel CRM by itqan
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuotationPreview;
