import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, CheckCircle, Activity, CreditCard, Download } from 'lucide-react';
import api from '../../services/api';

// Example UI for the unified Invoicing System
const FinanceDashboard = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchInvoices = async () => {
    try {
      const res = await api.get('/finance/invoices');
      setInvoices(res.data.data);
    } catch (err) {
      console.error('Failed to fetch invoices', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const openPaymentModal = (invoice) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(invoice.remaining_balance); // Default to full remaining balance
    setShowPaymentModal(true);
  };

  const handlePaymentSubmit = async () => {
    if (!paymentAmount || isNaN(paymentAmount) || parseFloat(paymentAmount) <= 0) return alert('Invalid Amount');
    if (parseFloat(paymentAmount) > selectedInvoice.remaining_balance) return alert('Cannot exceed remaining balance.');

    setIsSubmitting(true);
    try {
      await api.post('/finance/payments', {
         invoice_id: selectedInvoice.id,
         amount: parseFloat(paymentAmount),
         payment_method: paymentMethod,
         notes: paymentNotes
      });
      setShowPaymentModal(false);
      setPaymentAmount('');
      setPaymentNotes('');
      fetchInvoices(); // Refresh smart status
    } catch (err) {
      console.error(err);
      alert('Failed to register payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'paid': return <span className="badge badge-success"><CheckCircle size={12}/> Paid</span>;
      case 'partial': return <span className="badge badge-warning"><Activity size={12}/> Partial</span>;
      case 'unpaid': return <span className="badge badge-danger">Unpaid</span>;
      case 'overdue': return <span className="badge badge-danger">Overdue</span>;
      default: return <span className="badge badge-gray">{status}</span>;
    }
  };

  return (
    <div className="finance-dashboard">
      <style>{`
        .finance-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .btn-primary { background: var(--primary); color: white; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .data-table { width: 100%; border-collapse: collapse; background: var(--bg-card); border-radius: 12px; overflow: hidden; box-shadow: var(--shadow-sm); border: 1px solid var(--glass-border); }
        .data-table th, .data-table td { padding: 16px; text-align: left; border-bottom: 1px solid var(--glass-border); }
        .data-table th { background: rgba(0,0,0,0.02); font-weight: 600; color: var(--text-muted); font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
        .data-table tr:hover { background: rgba(255,255,255,0.02); }
        .badge { padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; }
        .badge-success { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .badge-warning { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        .badge-danger { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .action-btn { background: transparent; border: 1px solid var(--glass-border); padding: 6px 12px; border-radius: 6px; cursor: pointer; color: var(--text-main); font-weight: 600; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; margin-right: 8px; transition: 0.2s; }
        .action-btn:hover { background: rgba(0,0,0,0.05); }
        .pay-btn { background: rgba(79, 70, 229, 0.1); color: #4f46e5; border-color: rgba(79, 70, 229, 0.2); }
        .pay-btn:hover { background: rgba(79, 70, 229, 0.2); }
      `}</style>
      
      <div className="finance-header">
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800' }}>Invoices Ledger</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>Financial engine tracking all billings.</p>
        </div>
        <button className="btn-primary"><Plus size={18} /> New Invoice</button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Invoice No.</th>
            <th>Customer</th>
            <th>Date</th>
            <th>Total Amount</th>
            <th>Remaining</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '32px' }}>Loading Financial Data...</td></tr>
          ) : (invoices || []).length === 0 ? (
            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No invoices found in this branch.</td></tr>
          ) : (invoices || []).map(inv => (
            <tr key={inv.id}>
              <td style={{ fontWeight: 700 }}>{inv.invoice_number}</td>
              <td>{inv.customer_name || 'N/A'}</td>
              <td>{inv.created_at ? new Date(inv.created_at).toLocaleDateString() : 'N/A'}</td>
              <td style={{ fontWeight: 700 }}>{parseFloat(inv.total_amount || 0).toLocaleString()}</td>
              <td style={{ fontWeight: 700, color: (inv.remaining_balance || 0) > 0 ? '#ef4444' : '#10b981' }}>
                {parseFloat(inv.remaining_balance || 0).toLocaleString()}
              </td>
              <td>{getStatusBadge(inv.status)}</td>
              <td>
                <button className="action-btn pay-btn" onClick={() => openPaymentModal(inv)} disabled={inv.status === 'paid'}>
                  <CreditCard size={14} /> Pay
                </button>
                <button className="action-btn" onClick={() => navigate(`/finance/invoice-preview/${inv.id}`)}>
                  <Download size={14} /> PDF
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showPaymentModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
              <div style={{ background: 'var(--bg-card)', padding: '32px', borderRadius: '16px', width: '420px', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--glass-border)' }}>
                  <h3 style={{ margin: '0 0 16px 0' }}>Register Payment</h3>
                  
                  <div style={{ background: 'rgba(0,0,0,0.02)', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
                     <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-muted)' }}>Invoice <strong>{selectedInvoice.invoice_number}</strong></p>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <span style={{ fontWeight: 600 }}>Remaining Balance:</span>
                         <span style={{ fontSize: '18px', fontWeight: 800, color: '#ef4444' }}>{parseFloat(selectedInvoice.remaining_balance).toLocaleString()} EGP</span>
                     </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>Payment Amount (EGP)</label>
                      <input 
                         type="number" 
                         value={paymentAmount}
                         onChange={(e) => setPaymentAmount(e.target.value)}
                         max={selectedInvoice.remaining_balance}
                         style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)', fontSize: '16px', fontWeight: 'bold' }}
                      />
                      {parseFloat(paymentAmount) < selectedInvoice.remaining_balance && parseFloat(paymentAmount) > 0 && (
                          <div style={{ fontSize: '12px', color: '#f59e0b', marginTop: '6px' }}>★ This will trigger a Partial Payment status.</div>
                      )}
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>Payment Method</label>
                      <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}>
                          <option value="cash" style={{color:'black'}}>Cash</option>
                          <option value="card" style={{color:'black'}}>Card</option>
                          <option value="transfer" style={{color:'black'}}>Bank Transfer</option>
                      </select>
                  </div>
                  
                  <div style={{ marginBottom: '24px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>Notes</label>
                      <input 
                         type="text" 
                         value={paymentNotes}
                         onChange={(e) => setPaymentNotes(e.target.value)}
                         placeholder="Optional notes"
                         style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                      />
                  </div>

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setShowPaymentModal(false)} className="action-btn" disabled={isSubmitting}>Cancel</button>
                      <button onClick={handlePaymentSubmit} className="btn-primary" disabled={isSubmitting}>
                          {isSubmitting ? 'Processing...' : 'Confirm Payment'}
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default FinanceDashboard;
