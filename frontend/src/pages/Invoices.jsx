import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { FileText, DollarSign, Calendar, Filter, Eye, Plus } from 'lucide-react';
import DataTable from '../components/Common/DataTable';
import Modal from '../components/Common/Modal';

const Invoices = () => {
  const { customers, fetchCustomers } = useData();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
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
  }, []);

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
      `}</style>

      <div className="page-header">
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '800' }}>Invoices & Billing</h2>
          <p style={{ color: 'var(--text-muted)' }}>Monitor payments and financial documents.</p>
        </div>
        <button label="create invoice control" className="btn-add" onClick={() => toast.error('Invoices should be generated from Deals/Quotations')}>
          <Plus size={20} />
          Create Invoice
        </button>
      </div>

      <DataTable 
        title="Recent Invoices"
        columns={columns}
        data={invoices}
        loading={loading}
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

      <Modal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)}
          title={`Invoice ${activeInvoice?.invoice_number}`}
          footer={<button label="close modal" className="btn-cancel" onClick={() => setIsModalOpen(false)}>Close</button>}
      >
          {activeInvoice && (
              <div className="invoice-details">
                  <div className="detail-row"><label>Customer</label><span>{activeInvoice.client_name}</span></div>
                  <div className="detail-row"><label>Amount</label><span>{activeInvoice.total_amount} EGP</span></div>
                  <div className="detail-row"><label>Status</label><span className="status-badge">{activeInvoice.status}</span></div>
                  <div className="detail-row"><label>Due Date</label><span>{new Date(activeInvoice.due_date).toLocaleDateString()}</span></div>
                  <div className="detail-row"><label>Notes</label><span>{activeInvoice.notes || 'None'}</span></div>
              </div>
          )}
      </Modal>
    </div>
  );
};

export default Invoices;
