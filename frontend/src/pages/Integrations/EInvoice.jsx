import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { FileCheck, CheckCircle2, AlertTriangle, Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import IntegrationsSubNav from '../../components/Integrations/IntegrationsSubNav';

const EInvoice = () => {
  const { isRTL } = useLanguage();
  const [loadError, setLoadError] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  useEffect(() => {
    // Fetch real sales invoices for ETA submission queue
    const fetchInvoices = async () => {
      setLoading(true);
      try {
        const res = await api.get('/invoices');
        const list = res.data.data || res.data || [];
        const mapped = list.map((inv) => ({
          id: inv.id,
          invoice_no: inv.invoice_number || `INV-${inv.id}`,
          customer_name: inv.customer_name || 'Client',
          customer_tax_id: inv.tax_number || 'N/A',
          date: inv.created_at ? new Date(inv.created_at).toLocaleDateString() : 'N/A',
          total_amount: parseFloat(inv.total_amount || 0),
          eta_status: inv.eta_status || 'Pending Submission',
          eta_uuid: inv.eta_uuid || null,
          submitted_at: inv.eta_submitted_at || null
        }));
        setInvoices(mapped);
      } catch (err) {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, []);

  const filtered = invoices.filter(inv => {
    const matchesSearch = inv.invoice_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          inv.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (inv.eta_uuid && inv.eta_uuid.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = filterStatus === 'All' || inv.eta_status.startsWith(filterStatus);
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="einvoice-read-page" dir={isRTL ? 'rtl' : 'ltr'}>
      <IntegrationsSubNav />
      <div className="einvoice-content" style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
        {/* Header */}
        <div className="einvoice-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileCheck size={24} style={{ color: '#0ea5e9' }} /> ETA E-Invoicing Integration
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              Read-only invoice records. ETA submission and digital signing are unavailable.
            </p>
          </div>

        </div>
        <div role="alert" style={{ padding: '20px', marginBottom: '24px', border: '1px solid #fcd34d', borderRadius: '12px', background: '#fffbeb', color: '#92400e' }}>
          {isRTL ? 'تكامل الفاتورة الإلكترونية غير متصل وغير معتمد. هذه قائمة قراءة فقط؛ لم يتم التحقق من الاتصال أو التوقيع أو إرسال أي فاتورة للضرائب. لا توجد بيانات اعتماد محفوظة من هذه الشاشة.' : 'E-invoicing is not connected or certified. This is a read-only invoice list. No connection, signature or tax submission has been verified, and this page does not save credentials.'}
        </div>

        {/* Search & Filter Bar */}
        <div className="einvoice-filters" style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
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
        <div className="einvoice-queue" style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading submission queue...</div>
          ) : loadError ? (
            <div role="alert" style={{ padding: '24px', color: '#991b1b' }}>{isRTL ? 'تعذر تحميل الفواتير. لا يمكن تأكيد محتوى القائمة.' : 'Invoice records could not be loaded. The queue is unknown.'}</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>No invoices in queue</div>
          ) : (
            <div className="responsive-table-region" role="region" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Invoice No</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Customer & Tax Reg No</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Total Amount</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>ETA Status</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>ETA Document UUID</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const isValidated = inv.eta_status === 'Validated';
                  const isRejected = inv.eta_status.startsWith('Rejected');


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
                        <button disabled type="button" style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#64748b', cursor: 'not-allowed' }}>
                          {isRTL ? 'الإرسال والبوابة غير متاحين' : 'ETA actions unavailable'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </div>


      </div>
    </div>
  );
};

export default EInvoice;
