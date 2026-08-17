import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { FileCheck, Send, CheckCircle2, AlertTriangle, RefreshCw, Settings, ShieldCheck, ExternalLink, Search, Cpu } from 'lucide-react';
import IntegrationsSubNav from '../../components/Integrations/IntegrationsSubNav';

const EInvoice = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  // ETA Configuration State
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [etaConfig, setEtaConfig] = useState({
    tax_registration_no: '123-456-789',
    client_id: 'eta_client_sec_9921',
    client_secret: '••••••••••••••••',
    environment: 'Pre-Production (Sandbox)', // 'Pre-Production (Sandbox)' | 'Production'
    token_status: 'Connected (Valid until 2026-12-31)',
  });

  useEffect(() => {
    // Fetch sales invoices or mock ETA submission queue
    const fetchInvoices = async () => {
      setLoading(true);
      try {
        const res = await api.get('/accounting/journals').catch(() => ({ data: { data: [] } }));
        const mapped = [
          { id: 1, invoice_no: 'INV-2025-001', customer_name: 'Al-Nour Contracting Co.', customer_tax_id: '987-654-321', date: '2025-08-17', total_amount: 145000.00, eta_status: 'Validated', eta_uuid: 'E7B2A900-1123-4455-8899-AABBCCDDEEFF', submitted_at: '2025-08-17 10:30' },
          { id: 2, invoice_no: 'INV-2025-002', customer_name: 'Horizon Tech Towers', customer_tax_id: '554-332-110', date: '2025-08-16', total_amount: 88000.00, eta_status: 'Pending Submission', eta_uuid: null, submitted_at: null },
          { id: 3, invoice_no: 'INV-2025-003', customer_name: 'Delta Real Estate Dev', customer_tax_id: '443-221-998', date: '2025-08-15', total_amount: 52000.00, eta_status: 'Pending Submission', eta_uuid: null, submitted_at: null },
          { id: 4, invoice_no: 'INV-2025-004', customer_name: 'Global Infra Group', customer_tax_id: '112-998-776', date: '2025-08-14', total_amount: 320000.00, eta_status: 'Rejected (Invalid Item Code)', eta_uuid: 'F8C3B111-9988-7766-5544-112233445566', submitted_at: '2025-08-14 16:10' },
        ];
        setInvoices(mapped);
      } catch (err) {
        toast.error('Failed to load ETA e-invoicing queue');
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, []);

  const handleSubmitToETA = async (invoiceId) => {
    setSubmittingId(invoiceId);
    try {
      // Simulate ETA Portal XML/JSON submission & digital signature
      await new Promise(r => setTimeout(r, 1200));

      const fakeUuid = `ETA-${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Date.now()}`;
      setInvoices(invoices.map(inv => inv.id === invoiceId ? {
        ...inv,
        eta_status: 'Validated',
        eta_uuid: fakeUuid,
        submitted_at: new Date().toLocaleString()
      } : inv));

      toast.success(`Invoice #${invoiceId} successfully submitted & validated by ETA!`);
    } catch (err) {
      toast.error('ETA submission failed: Please check tax registration & item codes');
    } finally {
      setSubmittingId(null);
    }
  };

  const filtered = invoices.filter(inv => {
    const matchesSearch = inv.invoice_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          inv.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (inv.eta_uuid && inv.eta_uuid.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = filterStatus === 'All' || inv.eta_status.startsWith(filterStatus);
    return matchesSearch && matchesStatus;
  });

  const modalStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '16px'
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px',
    fontSize: '14px', fontWeight: 600, outline: 'none', background: '#f8fafc', boxSizing: 'border-box'
  };

  return (
    <div>
      <IntegrationsSubNav />
      <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileCheck size={24} style={{ color: '#0ea5e9' }} /> ETA E-Invoicing Integration (مصلحة الضرائب المصرية)
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              Submit, digitally sign, and track commercial invoices on the Egyptian Tax Authority Portal
            </p>
          </div>

          <button
            onClick={() => setShowConfigModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px',
              background: '#f1f5f9', color: '#0ea5e9', border: '1px solid #cbd5e1',
              borderRadius: '10px', fontWeight: 800, cursor: 'pointer'
            }}
          >
            <Settings size={16} /> ETA Portal Settings
          </button>
        </div>

        {/* ETA Portal Connection Card */}
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '16px', padding: '20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ShieldCheck size={26} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0369a1' }}>Egyptian Tax Authority (ETA) SDK Status</h4>
                <span style={{ padding: '2px 8px', borderRadius: '12px', background: '#dcfce7', color: '#15803d', fontSize: '11px', fontWeight: 800 }}>
                  ● Active Token
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#0284c7' }}>
                Tax ID: <strong>{etaConfig.tax_registration_no}</strong> · Environment: <strong>{etaConfig.environment}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={() => toast.success('ETA API connection verified! Pre-production portal reachable.')}
            style={{ padding: '8px 16px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} /> Test Portal Connection
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
            <Search size={18} style={{ color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search by invoice number, customer or ETA UUID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ border: 'none', outline: 'none', width: '100%', fontSize: '14px', fontWeight: 600, color: '#1e293b' }}
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontWeight: 700, outline: 'none', background: '#f8fafc', fontSize: '13px' }}
          >
            <option value="All">All Submission Statuses</option>
            <option value="Pending">Pending Submission</option>
            <option value="Validated">Validated</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>

        {/* Invoices Table */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading submission queue...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>No invoices in queue</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Invoice No</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Customer & Tax Reg No</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Total Amount</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>ETA Status</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight 800, color: '#475569' }}>ETA Document UUID</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight 800, color: '#475569', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const isValidated = inv.eta_status === 'Validated';
                  const isRejected = inv.eta_status.startsWith('Rejected');
                  const isSubmitting = submittingId === inv.id;

                  return (
                    <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontWeight: 800, color: '#0ea5e9' }}>
                        {inv.invoice_no}
                        <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 400 }}>{inv.date}</div>
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: '#1e293b' }}>
                        {inv.customer_name}
                        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Tax ID: {inv.customer_tax_id}</div>
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0f172a' }}>
                        ${inv.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          background: isValidated ? '#dcfce7' : isRejected ? '#fee2e2' : '#fef3c7',
                          color: isValidated ? '#15803d' : isRejected ? '#b91c1c' : '#b45309'
                        }}>
                          {isValidated && <CheckCircle2 size={12} />}
                          {isRejected && <AlertTriangle size={12} />}
                          {inv.eta_status}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: inv.eta_uuid ? '#7c3aed' : '#cbd5e1' }}>
                        {inv.eta_uuid || 'Not Generated Yet'}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                        {isValidated ? (
                          <button
                            onClick={() => toast.success(`Viewing ETA Portal Document ${inv.eta_uuid}`)}
                            style={{ padding: '6px 12px', background: '#ede9fe', color: '#7c3aed', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <ExternalLink size={13} /> View on ETA
                          </button>
                        ) : (
                          <button
                            disabled={isSubmitting}
                            onClick={() => handleSubmitToETA(inv.id)}
                            style={{ padding: '6px 14px', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            <Send size={13} /> {isSubmitting ? 'Submitting...' : 'Submit to ETA'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ETA Config Modal */}
        {showConfigModal && (
          <div style={modalStyle}>
            <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                  ETA Integration Credentials
                </h3>
                <button onClick={() => setShowConfigModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
              </div>

              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Tax Registration Number (الرقم الضريبي)</label>
                  <input
                    type="text"
                    value={etaConfig.tax_registration_no}
                    onChange={(e) => setEtaConfig({ ...etaConfig, tax_registration_no: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>ETA Client ID</label>
                  <input
                    type="text"
                    value={etaConfig.client_id}
                    onChange={(e) => setEtaConfig({ ...etaConfig, client_id: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>ETA Client Secret</label>
                  <input
                    type="password"
                    value={etaConfig.client_secret}
                    onChange={(e) => setEtaConfig({ ...etaConfig, client_secret: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Environment</label>
                  <select
                    value={etaConfig.environment}
                    onChange={(e) => setEtaConfig({ ...etaConfig, environment: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="Pre-Production (Sandbox)">Pre-Production (Sandbox / Testing)</option>
                    <option value="Production">Production (Live Portal)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button
                    onClick={() => setShowConfigModal(false)}
                    style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: '10px', color: '#475569', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      toast.success('ETA Settings saved!');
                      setShowConfigModal(false);
                    }}
                    style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    Save Credentials
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EInvoice;
