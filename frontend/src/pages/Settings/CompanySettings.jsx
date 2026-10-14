import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { 
  Building2, Image as ImageIcon, Globe, Receipt, 
  MapPin, Phone, Hash, FileText, Save, Eye
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useLanguage } from '../../context/LanguageContext';

const CompanySettings = () => {
  const { user } = useAuth();
  const { fetchTenant } = useData();
  const { t, isRTL } = useLanguage();
  const fileInputRef = useRef(null);
  
  const [tenant, setTenant] = useState({
    name: '', address: '', phone: '', logo_url: '',
    tax_no: '', reg_no: '', currency: 'EGP',
    tax_rate: 0, invoice_prefix: 'INV-',
    invoice_header_title: 'فاتورة ضريبية',
    invoice_header_subtitle: '',
    invoice_footer: '', terms: '',
    quotation_prefix: 'QUO-',
    quotation_header_title: 'عرض أسعار',
    quotation_header_subtitle: '',
    quotation_footer: '', quotation_terms: '',
    primary_color: '#6366f1'
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewMode, setPreviewMode] = useState('Invoice');

  useEffect(() => {
    fetchTenantDetails();
  }, []);

  const fetchTenantDetails = async () => {
    try {
      const tenantRes = await api.get('/tenants/my');
      if (tenantRes.data?.data) {
        setTenant(prev => ({ ...prev, ...tenantRes.data.data }));
      }
    } catch (err) {
      toast.error(t('companySettings.toastLoadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    const tenantId = user?.tenant_id || tenant?.id;
    try {
      await api.put('/tenants/my', tenant);
      toast.success(t('companySettings.toastUpdated'));
      if (typeof fetchTenant === 'function') {
        fetchTenant();
      }
    } catch (err) {
      toast.error(t('companySettings.toastLoadError'));
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const tenantId = user?.tenant_id || tenant?.id;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('linked_type', 'Tenant');
    if (tenantId) {
      formData.append('linked_id', String(tenantId));
    }

    setUploading(true);
    try {
      const res = await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const filePath = res.data?.data?.file_path;
      if (filePath) {
        setTenant(prev => ({ ...prev, logo_url: filePath }));
        if (typeof fetchTenant === 'function') {
          fetchTenant();
        }
        toast.success(t('companySettings.toastLogoSuccess'));
      }
    } catch (err) {
      console.error('Logo upload error:', err);
      toast.error(err.response?.data?.message || t('companySettings.toastLogoError'));
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="loading-state">{t('common.loading', 'Loading...')}</div>;

  return (
    <div className="company-settings-page" dir={isRTL ? 'rtl' : 'ltr'}>
      <style>{`
        .company-settings-page { padding: 24px; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 32px; }
        .settings-header { grid-column: span 2; margin-bottom: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; }
        .settings-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .card-header { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; background: #fbfcfd; display: flex; align-items: center; gap: 10px; }
        .card-header h3 { font-size: 14px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
        .card-body { padding: 20px; }
        
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .form-group { margin-bottom: 16px; }
        .form-group.full { grid-column: span 2; }
        .form-group label { display: block; font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 6px; }
        .form-group input, .form-group select, .form-group textarea { 
          width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 14px; outline: none; transition: 0.2s; 
          background: #f8fafc;
        }
        .form-group input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); background: white; }
        
        .logo-upload-container { display: flex; align-items: center; gap: 20px; padding: 16px; background: #f8fafc; border: 2px dashed #e2e8f0; border-radius: 12px; margin-bottom: 20px; }
        .logo-preview { width: 100px; height: 100px; border-radius: 8px; background: white; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid #e2e8f0; }
        .logo-preview img { width: 100%; height: 100%; object-fit: contain; }
        .upload-btn { padding: 8px 16px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s; }
        .upload-btn:hover { background: #f1f5f9; }

        /* Invoice Preview Styles */
        .preview-pane { position: sticky; top: 24px; }
        .preview-box { background: white; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
        .preview-tabs { display: flex; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
        .preview-tab { flex: 1; text-align: center; padding: 10px 12px; font-size: 11px; font-weight: 800; cursor: pointer; color: #64748b; border-bottom: 2px solid transparent; transition: all 0.2s; }
        .preview-tab.active { background: white; color: #6366f1; border-bottom-color: #6366f1; }
        .a4-preview { width: 100%; aspect-ratio: 1 / 1.414; background: white; padding: 30px; font-size: 10px; color: #1e293b; overflow-y: auto; }
        .preview-header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 1px solid #f1f5f9; padding-bottom: 15px; }
        .preview-logo { max-height: 40px; max-width: 120px; object-fit: contain; }
        .preview-company-name { font-size: 16px; font-weight: 800; color: #6366f1; }
        .preview-title { text-align: right; color: #94a3b8; text-transform: uppercase; font-weight: 900; }
        .preview-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .preview-table th { background: #fbfcfd; text-align: left; padding: 8px; border-bottom: 2px solid #f1f5f9; font-weight: 800; }
        .preview-table td { padding: 12px 8px; border-bottom: 1px solid #f8fafc; }
        .preview-totals { margin-left: auto; width: 50%; border-top: 2px solid #1e293b; padding-top: 10px; }
        .preview-footer { margin-top: 40px; border-top: 1px solid #f1f5f9; padding-top: 15px; font-size: 9px; color: #64748b; }

        .btn-save { width: 100%; padding: 12px; background: #6366f1; color: white; border-radius: 10px; font-weight: 700; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: 0.2s; }
        .btn-save:hover { background: #4f46e5; transform: translateY(-1px); box-shadow: 0 4px 6px rgba(99, 102, 241, 0.2); }
        @media (max-width: 900px) {
          .company-settings-page { grid-template-columns: 1fr; }
          .settings-header { grid-column: span 1; }
        }
      `}</style>

      <div className="settings-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
             <div style={{ 
                 fontSize: '10px', fontWeight: 900, padding: '2px 8px', borderRadius: '4px',
                 background: user?.template_name === 'real_estate' ? '#4f46e5' : '#64748b',
                 color: 'white', textTransform: 'uppercase'
             }}>
                 {user?.template_name === 'real_estate' ? t('companySettings.badgeRealEstate') : t('companySettings.badgeGeneral')}
             </div>
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: '900', letterSpacing: '-0.02em', color: '#1e293b' }}>
            {user?.template_name === 'real_estate' ? t('companySettings.titleRealEstate') : t('companySettings.titleGeneral')}
        </h2>
        <p style={{ color: '#64748b', fontSize: '14px' }}>{t('companySettings.subtitle')}</p>
      </div>

      <div className="settings-forms">
        <form onSubmit={handleUpdate}>
          <div className="settings-card">
            <div className="card-header">
              <Building2 size={16} color="#6366f1" />
              <h3>{t('companySettings.sectionProfile')}</h3>
            </div>
            <div className="card-body">
              <div className="logo-upload-container">
                <div className="logo-preview">
                  {tenant.logo_url ? <img src={`/${tenant.logo_url}`} alt="Logo" /> : <ImageIcon size={32} color="#94a3b8" />}
                </div>
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px' }}>{t('companySettings.companyLogo')}</h4>
                  <input type="file" ref={fileInputRef} onChange={handleLogoUpload} style={{ display: 'none' }} accept="image/*" />
                  <button type="button" className="upload-btn" onClick={() => fileInputRef.current.click()} disabled={uploading}>
                    {uploading ? t('companySettings.uploading') : t('companySettings.btnChangeLogo')}
                  </button>
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>{t('companySettings.logoHint')}</p>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group full">
                  <label>{t('companySettings.lblLegalName')}</label>
                  <input type="text" value={tenant.name || ''} onChange={(e) => setTenant({...tenant, name: e.target.value})} placeholder={t('companySettings.placeholderLegalName')} />
                </div>
                <div className="form-group">
                  <label>{t('companySettings.lblPhone')}</label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={14} style={{ position: 'absolute', [isRTL ? 'right' : 'left']: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input style={{ [isRTL ? 'paddingRight' : 'paddingLeft']: '36px' }} className="num-en" type="text" value={tenant.phone || ''} onChange={(e) => setTenant({...tenant, phone: e.target.value})} placeholder="+20 123..." />
                  </div>
                </div>
                <div className="form-group">
                  <label>{t('companySettings.lblTaxId')}</label>
                  <input className="num-en" type="text" value={tenant.tax_no || ''} onChange={(e) => setTenant({...tenant, tax_no: e.target.value})} placeholder="123-456-789" />
                </div>
                <div className="form-group">
                  <label>{t('companySettings.lblRegNo')}</label>
                  <input className="num-en" type="text" value={tenant.reg_no || ''} onChange={(e) => setTenant({...tenant, reg_no: e.target.value})} placeholder="Reg No. 5566" />
                </div>
                <div className="form-group full">
                  <label>{t('companySettings.lblAddress')}</label>
                  <div style={{ position: 'relative' }}>
                    <MapPin size={14} style={{ position: 'absolute', [isRTL ? 'right' : 'left']: '12px', top: '13px', color: '#94a3b8' }} />
                    <textarea style={{ [isRTL ? 'paddingRight' : 'paddingLeft']: '36px', height: '60px' }} value={tenant.address || ''} onChange={(e) => setTenant({...tenant, address: e.target.value})} placeholder="123 Business St, Cairo, Egypt" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="settings-card">
            <div className="card-header">
              <Receipt size={16} color="#10b981" />
              <h3>{t('companySettings.sectionFinancial')}</h3>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>{t('companySettings.lblBaseCurrency')}</label>
                  <select value={tenant.currency || 'EGP'} onChange={(e) => setTenant({...tenant, currency: e.target.value})}>
                    <option value="EGP">Egyptian Pound (EGP)</option>
                    <option value="USD">US Dollar (USD)</option>
                    <option value="SAR">Saudi Riyal (SAR)</option>
                    <option value="AED">UAE Dirham (AED)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('companySettings.lblDefaultTaxRate')}</label>
                  <input className="num-en" type="number" step="0.01" value={tenant.tax_rate || 0} onChange={(e) => setTenant({...tenant, tax_rate: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>{t('companySettings.lblInvoicePrefix')}</label>
                  <input className="num-en" type="text" value={tenant.invoice_prefix || 'INV-'} onChange={(e) => setTenant({...tenant, invoice_prefix: e.target.value})} />
                </div>
              </div>
            </div>
          </div>

          <div className="settings-card">
            <div className="card-header">
              <FileText size={16} color="#6366f1" />
              <h3>{t('companySettings.sectionInvoiceBranding')}</h3>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>{t('companySettings.lblInvoiceTitle')}</label>
                  <input 
                    type="text" 
                    value={tenant.invoice_header_title || ''} 
                    onChange={(e) => setTenant({...tenant, invoice_header_title: e.target.value})} 
                    placeholder="فاتورة ضريبية / TAX INVOICE" 
                  />
                </div>
                <div className="form-group">
                  <label>{t('companySettings.lblInvoiceSubtitle')}</label>
                  <input 
                    type="text" 
                    value={tenant.invoice_header_subtitle || ''} 
                    onChange={(e) => setTenant({...tenant, invoice_header_subtitle: e.target.value})} 
                    placeholder="مثال: لحلول الأعمال والتجارة الذكية" 
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: '12px' }}>
                <label>{t('companySettings.lblInvoiceTerms')}</label>
                <textarea style={{ height: '70px' }} value={tenant.terms || ''} onChange={(e) => setTenant({...tenant, terms: e.target.value})} placeholder="شروط السداد والدفع، مواعيد الاستحقاق، بيانات الحساب البنكي..." />
              </div>
              <div className="form-group">
                <label>{t('companySettings.lblInvoiceFooter')}</label>
                <textarea style={{ height: '50px' }} value={tenant.invoice_footer || ''} onChange={(e) => setTenant({...tenant, invoice_footer: e.target.value})} placeholder="شكراً لتعاملكم معنا / Thank you for choosing us!" />
              </div>
            </div>
          </div>

          <div className="settings-card">
            <div className="card-header">
              <FileText size={16} color="#f59e0b" />
              <h3>{t('companySettings.sectionQuotationBranding')}</h3>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>{t('companySettings.lblQuotationTitle')}</label>
                  <input 
                    type="text" 
                    value={tenant.quotation_header_title || ''} 
                    onChange={(e) => setTenant({...tenant, quotation_header_title: e.target.value})} 
                    placeholder="عرض أسعار / PRICE QUOTATION" 
                  />
                </div>
                <div className="form-group">
                  <label>{t('companySettings.lblQuotationSubtitle')}</label>
                  <input 
                    type="text" 
                    value={tenant.quotation_header_subtitle || ''} 
                    onChange={(e) => setTenant({...tenant, quotation_header_subtitle: e.target.value})} 
                    placeholder="مثال: عروض أسعار هندسية معتمدة" 
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: '12px' }}>
                <label>{t('companySettings.lblQuotationTerms')}</label>
                <textarea style={{ height: '70px' }} value={tenant.quotation_terms || ''} onChange={(e) => setTenant({...tenant, quotation_terms: e.target.value})} placeholder="الأسعار سارية لمدة 15 يوماً من تاريخ الإصدار..." />
              </div>
              <div className="form-group">
                <label>{t('companySettings.lblQuotationFooter')}</label>
                <textarea style={{ height: '50px' }} value={tenant.quotation_footer || ''} onChange={(e) => setTenant({...tenant, quotation_footer: e.target.value})} placeholder="نتطلع للتعاون المثمر معكم..." />
              </div>
            </div>
          </div>

          <button type="submit" className="btn-save" disabled={saving}>
            <Save size={18} /> {saving ? t('companySettings.saving') : t('companySettings.btnSaveSettings')}
          </button>
        </form>
      </div>

      <div className="preview-pane">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#64748b' }}>
          <Eye size={16} /> <span style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' }}>Live A4 Preview</span>
        </div>
        <div className="preview-box">
          <div className="preview-tabs">
            <div className={`preview-tab ${previewMode === 'Invoice' ? 'active' : ''}`} onClick={() => setPreviewMode('Invoice')}>
              {t('companySettings.tabInvoicePreview')}
            </div>
            <div className={`preview-tab ${previewMode === 'Quotation' ? 'active' : ''}`} onClick={() => setPreviewMode('Quotation')}>
              {t('companySettings.tabQuotationPreview')}
            </div>
          </div>

          <div className="a4-preview">
            <div className="preview-header">
              <div>
                {tenant.logo_url ? (
                  <img src={`/${tenant.logo_url.replace(/\\/g, '/')}`} className="preview-logo" alt="Logo" />
                ) : (
                  <div className="preview-company-name">{tenant.name || 'TASHGHEEL CRM'}</div>
                )}
                {previewMode === 'Invoice' ? (
                  tenant.invoice_header_subtitle && (
                    <div style={{ fontSize: '8px', fontWeight: '700', color: '#4b5563', marginTop: '3px' }}>
                      {tenant.invoice_header_subtitle}
                    </div>
                  )
                ) : (
                  tenant.quotation_header_subtitle && (
                    <div style={{ fontSize: '8px', fontWeight: '700', color: '#4b5563', marginTop: '3px' }}>
                      {tenant.quotation_header_subtitle}
                    </div>
                  )
                )}
                <div style={{ marginTop: '6px', fontSize: '8px', color: '#64748b', whiteSpace: 'pre-wrap' }}>
                  {tenant.address || 'Cairo, Egypt'}<br/>
                  <span className="num-en">Phone: {tenant.phone || '+20 --- --- ----'}</span>
                </div>
              </div>
              <div className="preview-title" style={{ textAlign: isRTL ? 'left' : 'right' }}>
                <h2 style={{ fontSize: '18px', margin: 0, color: previewMode === 'Quotation' ? '#d97706' : '#6366f1' }}>
                  {previewMode === 'Invoice' ? (tenant.invoice_header_title || 'INVOICE') : (tenant.quotation_header_title || 'QUOTATION')}
                </h2>
                <div style={{ marginTop: '5px' }} className="num-en">
                  {previewMode === 'Invoice' ? (tenant.invoice_prefix || 'INV-') : (tenant.quotation_prefix || 'QUO-')}00234
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <div style={{ fontWeight: '800', marginBottom: '4px' }}>
                  {previewMode === 'Invoice' ? t('companySettings.previewBilledTo') : 'PREPARED FOR:'}
                </div>
                <div>John Doe Ltd.<br/><span className="num-en">john@example.com</span></div>
              </div>
              <div style={{ textAlign: isRTL ? 'left' : 'right' }}>
                <div style={{ fontWeight: '800', marginBottom: '4px' }}>{t('companySettings.previewDue')}</div>
                <div className="num-en">{new Date().toLocaleDateString('en-CA')}</div>
              </div>
            </div>

            <table className="preview-table">
              <thead>
                <tr>
                  <th style={{ textAlign: isRTL ? 'right' : 'left' }}>{t('companySettings.previewItem')}</th>
                  <th>{t('companySettings.previewQty')}</th>
                  <th>{t('companySettings.previewRate')}</th>
                  <th style={{ textAlign: isRTL ? 'left' : 'right' }}>{t('companySettings.previewAmount')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Sample Professional Service</td>
                  <td className="num-en">1</td>
                  <td className="num-en">1,000.00</td>
                  <td className="num-en" style={{ textAlign: isRTL ? 'left' : 'right' }}>1,000.00</td>
                </tr>
              </tbody>
            </table>

            <div className="preview-totals" style={{ [isRTL ? 'marginRight' : 'marginLeft']: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span>{t('companySettings.previewSubtotal')}</span>
                <span className="num-en">1,000.00</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>{t('companySettings.previewTax')} ({tenant.tax_rate}%):</span>
                <span className="num-en">{(1000 * (tenant.tax_rate / 100)).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: '900', fontSize: '12px' }}>
                <span>{t('companySettings.previewTotal')}</span>
                <span className="num-en">{(1000 * (1 + tenant.tax_rate / 100)).toFixed(2)} {tenant.currency}</span>
              </div>
            </div>

            <div className="preview-footer">
              <div style={{ fontWeight: '800', marginBottom: '4px' }}>{t('companySettings.previewTerms')}</div>
              <div style={{ marginBottom: '15px' }}>
                {previewMode === 'Invoice' ? (tenant.terms || 'Payment within 15 days.') : (tenant.quotation_terms || 'Prices valid for 15 days.')}
              </div>
              <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                {previewMode === 'Invoice' ? (tenant.invoice_footer || 'Thank you for choosing us!') : (tenant.quotation_footer || 'Thank you for the opportunity!')}
              </div>
              {tenant.tax_no && (
                <div style={{ marginTop: '10px', fontSize: '7px' }}>
                  <span className="num-en">{t('companySettings.previewTaxId')} {tenant.tax_no} {tenant.reg_no ? `| REG: ${tenant.reg_no}` : ''}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanySettings;
