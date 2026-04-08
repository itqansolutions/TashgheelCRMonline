import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { FileText, DollarSign, Calendar, Filter, Eye, Plus, Receipt, Handshake, Printer } from 'lucide-react';
import DataTable from '../components/Common/DataTable';
import Modal from '../components/Common/Modal';
import InvoicePreview from '../components/Features/InvoicePreview';

const Invoices = () => {
  const { customers, fetchCustomers, deals, fetchDeals, quotations, fetchQuotations, settings, fetchSettings } = useData();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState(null);

  const fetchInvoices = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/invoices');
      setInvoices(res.data.data);
    } catch (err) {
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
    fetchCustomers(false);
    fetchDeals(false);
    fetchQuotations(false);
    fetchSettings();
  }, []);

  const handlePrint = () => {
    const printContent = document.getElementById('printable-invoice');
    const originalContent = document.body.innerHTML;
    
    // Simple window.print works well with @media print CSS we added
    window.print();
  };

  const handleGenerateInvoice = async (type, id) => {
    try {
      const endpoint = type === 'deal' ? `/invoices/from-deal/${id}` : `/invoices/from-quotation/${id}`;
      await api.post(endpoint);
      toast.success('Invoice generated successfully');
      setIsGeneratorOpen(false);
      fetchInvoices(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate invoice');
    }
  };

  const columns = [
    { 
      key: 'invoice_number', 
      label: 'Invoice #',
      render: (val) => <span style={{ fontWeight: '700', color: 'var(--primary)' }}>{val}</span>
    },
    { 
      key: 'client_name', 
      label: 'Customer',
      render: (val, item) => val || 'Walk-in'
    },
    { 
      key: 'total_amount', 
      label: 'Amount',
      render: (val) => <span style={{ fontWeight: '600' }}>{val} EGP</span>
    },
    { 
      key: 'status', 
      label: 'Status',
      render: (val) => {
        const styles = {
          unpaid: { bg: '#fef2f2', text: '#dc2626' },
          paid: { bg: '#f0fdf4', text: '#16a34a' },
          partial: { bg: '#fff7ed', text: '#d97706' },
          cancelled: { bg: '#f8fafc', text: '#64748b' }
        };
        const style = styles[val] || styles.unpaid;
        return <span className="status-badge" style={{ background: style.bg, color: style.text }}>{val}</span>
      }
    },
    { 
      key: 'due_date', 
      label: 'Due Date',
      render: (val) => val ? new Date(val).toLocaleDateString() : 'N/A'
    }
  ];

  return (
    <div className="invoices-page">
      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .btn-add { background: var(--primary); color: white; padding: 10px 20px; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-weight: 600; }
        .invoice-details { display: grid; gap: 20px; }
        .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); }
        .detail-row label { font-weight: 600; color: var(--text-muted); }
        
        .gen-list { display: grid; gap: 12px; max-height: 400px; overflow-y: auto; padding: 10px; }
        .gen-item { display: flex; justify-content: space-between; align-items: center; padding: 15px; background: #f8fafc; border: 1px solid var(--border); border-radius: 12px; }
        .gen-info h4 { margin: 0; font-size: 14px; font-weight: 700; }
        .gen-info p { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); }
        .btn-gen { background: var(--primary); color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; }

        .btn-print { background: #1e293b; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 700; display: flex; align-items: center; gap: 10px; cursor: pointer; transition: 0.2s; }
        .btn-print:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }

        @media print {
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="page-header no-print">
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '800' }}>Invoices & Billing</h2>
          <p style={{ color: 'var(--text-muted)' }}>Monitor payments and financial documents.</p>
        </div>
        <button label="create invoice control" className="btn-add" onClick={() => setIsGeneratorOpen(true)}>
          <Plus size={20} />
          Create Invoice
        </button>
      </div>

      <div className="no-print">
        <DataTable 
          title="Recent Invoices"
          columns={columns}
          data={invoices}
          loading={loading}
          actions={(inv) => (
            <button 
              label="view print preview"
              className="btn-icon" 
              onClick={() => {
                setActiveInvoice(inv);
                setIsModalOpen(true);
              }}
              title="Print / View Preview"
            >
              <Printer size={16} />
            </button>
          )}
          onEdit={(inv) => {
            setActiveInvoice(inv);
            setIsModalOpen(true);
          }}
          onDelete={async (id) => {
            if (window.confirm('Cancel this invoice?')) {
              await api.delete(`/invoices/${id}`);
              fetchInvoices(false);
              toast.success('Invoice cancelled');
            }
          }}
        />
      </div>

      {/* Invoice Generator Modal */}
      <Modal
        isOpen={isGeneratorOpen}
        onClose={() => setIsGeneratorOpen(false)}
        title="Generate Invoice from Source"
        className="no-print"
        footer={<button className="btn-cancel" onClick={() => setIsGeneratorOpen(false)}>Cancel</button>}
      >
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '15px' }}>
            Select a successful deal or an approved quotation to generate a formal invoice.
          </p>
          
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Handshake size={18} /> Active Deals
          </h3>
          <div className="gen-list">
            {deals.filter(d => d.pipeline_stage !== 'lost').map(deal => (
              <div key={`deal-${deal.id}`} className="gen-item">
                <div className="gen-info">
                  <h4>{deal.title}</h4>
                  <p>{deal.client_name || 'Generic Customer'} • {deal.value} EGP</p>
                </div>
                <button className="btn-gen" onClick={() => handleGenerateInvoice('deal', deal.id)}>Generate</button>
              </div>
            ))}
            {deals.length === 0 && <p style={{ textAlign: 'center', py: 20 }}>No active deals found.</p>}
          </div>

          <h3 style={{ fontSize: '16px', fontWeight: '700', margin: '20px 0 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} /> Approved Quotations
          </h3>
          <div className="gen-list">
            {quotations.filter(q => q.status === 'approved').map(quote => (
              <div key={`quote-${quote.id}`} className="gen-item">
                <div className="gen-info">
                  <h4>Quotation #{quote.id}</h4>
                  <p>{quote.total_amount} EGP • Valid until: {new Date(quote.valid_until).toLocaleDateString()}</p>
                </div>
                <button className="btn-gen" onClick={() => handleGenerateInvoice('quote', quote.id)}>Generate</button>
              </div>
            ))}
            {quotations.filter(q => q.status === 'approved').length === 0 && <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>No approved quotations pending.</p>}
          </div>
        </div>
      </Modal>

      {/* Invoice Details & Print Preview Modal */}
      <Modal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)}
          title={`Invoice Preview: ${activeInvoice?.invoice_number}`}
          width="900px"
          footer={
            <div style={{ display: 'flex', gap: '12px' }} className="no-print">
              <button className="btn-print" onClick={handlePrint}>
                <Printer size={20} />
                Print Invoice
              </button>
              <button label="close modal" className="btn-cancel" onClick={() => setIsModalOpen(false)}>Close Preview</button>
            </div>
          }
      >
          {activeInvoice && (
              <div id="printable-invoice">
                  <InvoicePreview invoice={activeInvoice} />
              </div>
          )}
      </Modal>
    </div>
  );
};

export default Invoices;
