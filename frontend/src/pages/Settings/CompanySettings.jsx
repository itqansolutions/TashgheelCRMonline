import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { 
  Building2, Image as ImageIcon, Globe, Receipt, 
  MapPin, Phone, Hash, FileText, Save, Eye
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const CompanySettings = () => {
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  
  const [tenant, setTenant] = useState({
    name: '', address: '', phone: '', logo_url: '',
    tax_no: '', reg_no: '', currency: 'EGP',
    tax_rate: 0, invoice_prefix: 'INV-',
    invoice_footer: '', terms: ''
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchTenantDetails();
  }, []);

  const fetchTenantDetails = async () => {
    try {
      const tenantRes = await api.get(`/tenants/${user.tenant_id}`);
      setTenant(tenantRes.data.data);
    } catch (err) {
      toast.error('Failed to load company details');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/tenants/${user.tenant_id}`, tenant);
      toast.success('Company settings updated successfully');
    } catch (err) {
      toast.error('Failed to update company settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('linked_type', 'Tenant');
    formData.append('linked_id', user.tenant_id);

    setUploading(true);
    try {
      const res = await api.post('/files/upload', formData);
      const filePath = res.data.data.file_path;
      setTenant({ ...tenant, logo_url: filePath });
      toast.success('Logo uploaded! Save settings to apply.');
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="loading-state">Loading Identity System...</div>;

  return (
    <div className="company-settings-page">
      <style>{`
        .company-settings-page { padding: 24px; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 32px; }
        .settings-header { grid-column: span 2; margin-bottom: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; }
        .settings-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .card-header { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; background: #fbfcfd; display: flex; align-items: center; gap: 10px; }
        .card-header h3 { font-size: 14px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.05em; }
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
      `}</style>

      <div className="settings-header">
        <h2 style={{ fontSize: '24px', fontWeight: '900', letterSpacing: '-0.02em', color: '#1e293b' }}>Brand Identity</h2>
        <p style={{ color: '#64748b', fontSize: '14px' }}>Customize your organization for professional invoicing and reports.</p>
      </div>

      <div className="settings-forms">
        <form onSubmit={handleUpdate}>
          <div className="settings-card">
            <div className="card-header">
              <Building2 size={16} color="#6366f1" />
              <h3>Business Profile</h3>
            </div>
            <div className="card-body">
              <div className="logo-upload-container">
                <div className="logo-preview">
                  {tenant.logo_url ? <img src={`/${tenant.logo_url}`} alt="Logo" /> : <ImageIcon size={32} color="#94a3b8" />}
                </div>
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px' }}>Company Logo</h4>
                  <input type="file" ref={fileInputRef} onChange={handleLogoUpload} style={{ display: 'none' }} accept="image/*" />
                  <button type="button" className="upload-btn" onClick={() => fileInputRef.current.click()} disabled={uploading}>
                    {uploading ? 'Uploading...' : 'Change Logo'}
                  </button>
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>Square or wide logo in PNG/JPG (Max 2MB).</p>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group full">
                  <label>Legal Company Name</label>
                  <input type="text" value={tenant.name || ''} onChange={(e) => setTenant({...tenant, name: e.target.value})} placeholder="Acme International" />
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input style={{ paddingLeft: '36px' }} type="text" value={tenant.phone || ''} onChange={(e) => setTenant({...tenant, phone: e.target.value})} placeholder="+20 123..." />
                  </div>
                </div>
                <div className="form-group">
                  <label>Tax ID (Optional)</label>
                  <input type="text" value={tenant.tax_no || ''} onChange={(e) => setTenant({...tenant, tax_no: e.target.value})} placeholder="123-456-789" />
                </div>
                <div className="form-group">
                  <label>Commercial Registry (Optional)</label>
                  <input type="text" value={tenant.reg_no || ''} onChange={(e) => setTenant({...tenant, reg_no: e.target.value})} placeholder="Reg No. 5566" />
                </div>
                <div className="form-group full">
                  <label>Business Address</label>
                  <div style={{ position: 'relative' }}>
                    <MapPin size={14} style={{ position: 'absolute', left: '12px', top: '13px', color: '#94a3b8' }} />
                    <textarea style={{ paddingLeft: '36px', height: '60px' }} value={tenant.address || ''} onChange={(e) => setTenant({...tenant, address: e.target.value})} placeholder="123 Business St, Smart Village, Egypt" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="settings-card">
            <div className="card-header">
              <Receipt size={16} color="#10b981" />
              <h3>Financial Defaults</h3>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Base Currency</label>
                  <select value={tenant.currency || 'EGP'} onChange={(e) => setTenant({...tenant, currency: e.target.value})}>
                    <option value="EGP">Egyptian Pound (EGP)</option>
                    <option value="USD">US Dollar (USD)</option>
                    <option value="SAR">Saudi Riyal (SAR)</option>
                    <option value="AED">UAE Dirham (AED)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Default Tax Rate (%)</label>
                  <input type="number" step="0.01" value={tenant.tax_rate || 0} onChange={(e) => setTenant({...tenant, tax_rate: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Invoice Prefix</label>
                  <input type="text" value={tenant.invoice_prefix || 'INV-'} onChange={(e) => setTenant({...tenant, invoice_prefix: e.target.value})} />
                </div>
              </div>
            </div>
          </div>

          <div className="settings-card">
            <div className="card-header">
              <FileText size={16} color="#f59e0b" />
              <h3>Invoice Branding</h3>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label>Terms & Conditions (Default)</label>
                <textarea style={{ height: '80px' }} value={tenant.terms || ''} onChange={(e) => setTenant({...tenant, terms: e.target.value})} placeholder="Payment is due within 30 days..." />
              </div>
              <div className="form-group">
                <label>Invoice Footer / Note</label>
                <textarea style={{ height: '60px' }} value={tenant.invoice_footer || ''} onChange={(e) => setTenant({...tenant, invoice_footer: e.target.value})} placeholder="Thank you for your business!" />
              </div>
            </div>
          </div>

          <button type="submit" className="btn-save" disabled={saving}>
            <Save size={18} /> {saving ? 'Saving Workspace...' : 'Update Organization Context'}
          </button>
        </form>
      </div>

      <div className="preview-pane">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#64748b' }}>
          <Eye size={16} /> <span style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' }}>Live A4 Preview</span>
        </div>
        <div className="preview-box">
          <div className="a4-preview">
            <div className="preview-header">
              <div>
                {tenant.logo_url ? <img src={`/${tenant.logo_url}`} className="preview-logo" alt="Logo" /> : <div className="preview-company-name">{tenant.name || 'TASHGHEEL CRM'}</div>}
                <div style={{ marginTop: '10px', fontSize: '8px', color: '#64748b', whiteSpace: 'pre-wrap' }}>
                  {tenant.address || 'Cairo, Egypt'}<br/>
                  Phone: {tenant.phone || '+20 --- --- ----'}
                </div>
              </div>
              <div className="preview-title">
                <h2 style={{ fontSize: '20px', margin: 0 }}>Invoice</h2>
                <div style={{ marginTop: '5px' }}>{tenant.invoice_prefix || 'INV-'}00234</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <div style={{ fontWeight: '800', marginBottom: '4px' }}>BILL TO:</div>
                <div>John Doe Ltd.<br/>john@example.com</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: '800', marginBottom: '4px' }}>DATE:</div>
                <div>{new Date().toLocaleDateString()}</div>
              </div>
            </div>

            <table className="preview-table">
              <thead>
                <tr>
                  <th>Item Description</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Sample Professional Service</td>
                  <td>1</td>
                  <td>1,000.00</td>
                  <td style={{ textAlign: 'right' }}>1,000.00</td>
                </tr>
              </tbody>
            </table>

            <div className="preview-totals">
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span>Subtotal:</span>
                <span>1,000.00</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>Tax ({tenant.tax_rate}%):</span>
                <span>{(1000 * (tenant.tax_rate / 100)).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: '900', fontSize: '12px' }}>
                <span>GRAND TOTAL:</span>
                <span>{(1000 * (1 + tenant.tax_rate / 100)).toFixed(2)} {tenant.currency}</span>
              </div>
            </div>

            <div className="preview-footer">
              <div style={{ fontWeight: '800', marginBottom: '4px' }}>TERMS:</div>
              <div style={{ marginBottom: '15px' }}>{tenant.terms || 'Payment within 15 days.'}</div>
              <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>{tenant.invoice_footer || 'Thank you for choosing us!'}</div>
              {tenant.tax_no && <div style={{ marginTop: '10px', fontSize: '7px' }}>TAX ID: {tenant.tax_no} | REG: {tenant.reg_no}</div>}
            </div>
          </div>
        </div>
        <p style={{ marginTop: '16px', fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
          This preview represents a standard professional A4 invoice. Actual layouts may vary slightly.
        </p>
      </div>
    </div>
  );
};

export default CompanySettings;
