import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, CheckCircle, Activity, CreditCard, Download, DollarSign, Receipt, Tag, User } from 'lucide-react';
import api from '../../services/api';
import { useData } from '../../context/DataContext';
import toast from 'react-hot-toast';

// Example UI for the unified Invoicing System
const FinanceDashboard = () => {
  const navigate = useNavigate();
  const { customers, fetchCustomers, products, fetchProducts, deals, fetchDeals, quotations, fetchQuotations, expenses, fetchExpenses, payments, fetchPayments } = useData();
  const [activeTab, setActiveTab] = useState('Invoices');
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  
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

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showQuickAction, setShowQuickAction] = useState(false);
  const [quickActionType, setQuickActionType] = useState('');
  const [formData, setFormData] = useState({
      title: '', amount: '', category: 'General', date: new Date().toISOString().split('T')[0],
      customer_id: '', items: [{ product_id: '', quantity: 1, unit_price: 0 }]
  });

  const handleQuickActionSubmit = async (e) => {
      e.preventDefault();
      setIsSubmitting(true);
      try {
          if (quickActionType === 'Expense') {
              await api.post('/expenses', {
                  title: formData.title,
                  amount: formData.amount,
                  category: formData.category,
                  expense_date: formData.date
              });
              toast.success('Expense recorded successfully');
              fetchExpenses();
          } else if (quickActionType === 'Invoice') {
              await api.post('/finance/invoices', {
                  customer_id: formData.customer_id,
                  due_date: formData.date,
                  items: formData.items
              });
              toast.success('Invoice created successfully');
              fetchInvoices();
          } else if (quickActionType === 'Quotation') {
              await api.post('/quotations', {
                  total_amount: formData.amount,
                  notes: formData.title,
                  valid_until: formData.date
              });
              toast.success('Quotation draft saved');
              fetchQuotations();
          }
          setShowQuickAction(false);
          setFormData({ title: '', amount: '', category: 'General', date: new Date().toISOString().split('T')[0], customer_id: '', items: [{ product_id: '', quantity: 1, unit_price: 0 }] });
      } catch (err) {
          toast.error(`Failed to create ${quickActionType}`);
      } finally {
          setIsSubmitting(false);
      }
  };

  const openPaymentModal = (invoice) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(invoice.remaining_balance);
    setShowPaymentModal(true);
  };

  const handlePaymentSubmit = async () => {
    if (!paymentAmount || isNaN(paymentAmount) || parseFloat(paymentAmount) <= 0) return alert('Invalid Amount');
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
      fetchInvoices();
      fetchPayments();
      toast.success('Payment registered');
    } catch (err) {
      toast.error('Failed to register payment.');
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

  useEffect(() => {
    fetchInvoices();
    fetchQuotations();
    fetchExpenses();
    fetchPayments();
    if (customers.length === 0) fetchCustomers();
    if (products.length === 0) fetchProducts();
    if (deals.length === 0) fetchDeals();
  }, []);

  const renderTabContent = () => {
      switch (activeTab) {
          case 'Quotations':
              return (
                <table className="data-table">
                    <thead>
                    <tr>
                        <th>Ref</th>
                        <th>Customer</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Valid Until</th>
                        <th>Actions</th>
                    </tr>
                    </thead>
                    <tbody>
                    {(quotations || []).length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No quotations found.</td></tr>
                    ) : (quotations || []).map(q => (
                        <tr key={q.id}>
                            <td style={{ fontWeight: 700 }}>QUO-{q.id}</td>
                            <td>{q.client_name || 'Generic Customer'}</td>
                            <td style={{ fontWeight: 700 }}>{parseFloat(q.total_amount).toLocaleString()} EGP</td>
                            <td><span className={`badge ${q.status === 'approved' ? 'badge-success' : 'badge-warning'}`}>{q.status}</span></td>
                            <td>{new Date(q.valid_until).toLocaleDateString()}</td>
                            <td>
                                <button className="action-btn" onClick={() => navigate(`/finance/quotation-preview/${q.id}`)}>
                                    <Download size={14} /> View / Print
                                </button>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
              );
          case 'Expenses':
              return (
                <table className="data-table">
                    <thead>
                    <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Category</th>
                        <th>Amount</th>
                    </tr>
                    </thead>
                    <tbody>
                    {(expenses || []).length === 0 ? (
                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No expenses recorded.</td></tr>
                    ) : (expenses || []).map(e => (
                        <tr key={e.id}>
                            <td>{new Date(e.expense_date).toLocaleDateString()}</td>
                            <td style={{ fontWeight: 600 }}>{e.title}</td>
                            <td><span className="badge" style={{ background: '#f1f5f9', color: '#475569' }}>{e.category}</span></td>
                            <td style={{ fontWeight: 700, color: '#ef4444' }}>{parseFloat(e.amount).toLocaleString()} EGP</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
              );
          case 'Income':
              return (
                <table className="data-table">
                    <thead>
                    <tr>
                        <th>Date</th>
                        <th>Source</th>
                        <th>Method</th>
                        <th>Amount</th>
                    </tr>
                    </thead>
                    <tbody>
                    {(payments || []).length === 0 ? (
                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No income records found.</td></tr>
                    ) : (payments || []).map(p => (
                        <tr key={p.id}>
                            <td>{new Date(p.payment_date || p.created_at).toLocaleDateString()}</td>
                            <td style={{ fontWeight: 600 }}>Invoice Payment</td>
                            <td><span className="badge" style={{ background: '#f0fdf4', color: '#16a34a' }}>{p.payment_method}</span></td>
                            <td style={{ fontWeight: 700, color: '#10b981' }}>{parseFloat(p.amount).toLocaleString()} EGP</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
              );
          default:
              return (
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
                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No invoices found.</td></tr>
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
              );
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
        .tabs-nav { display: flex; gap: 8px; margin-bottom: 24px; background: rgba(0,0,0,0.02); padding: 4px; border-radius: 10px; width: fit-content; }
        .tab-item { padding: 8px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; color: var(--text-muted); transition: 0.3s; }
        .tab-item.active { background: white; color: var(--primary); box-shadow: var(--shadow-sm); }
      `}</style>
      
      <div className="finance-header">
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800' }}>Financial Hub</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>Central engine for {activeTab.toLowerCase()} tracking.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
            <button className="action-btn" style={{ borderColor: '#10b981', color: '#10b981' }} onClick={() => { setQuickActionType('Income'); setShowQuickAction(true); }}>
                <Plus size={16} /> Income
            </button>
            <button className="action-btn" style={{ borderColor: '#ef4444', color: '#ef4444' }} onClick={() => { setQuickActionType('Expense'); setShowQuickAction(true); }}>
                <Plus size={16} /> Expense
            </button>
            <button className="action-btn" style={{ borderColor: '#f59e0b', color: '#f59e0b' }} onClick={() => { setQuickActionType('Quotation'); setShowQuickAction(true); }}>
                <Plus size={16} /> Quotation
            </button>
            <button className="btn-primary" onClick={() => { setQuickActionType('Invoice'); setShowQuickAction(true); }}>
                <Plus size={18} /> New Invoice
            </button>
        </div>
      </div>

      <div className="tabs-nav">
          {['Invoices', 'Quotations', 'Expenses', 'Income'].map(tab => (
              <div 
                key={tab} 
                className={`tab-item ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                  {tab}
              </div>
          ))}
      </div>

      {renderTabContent()}

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
      {showQuickAction && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)'}}>
              <div style={{ background: 'var(--bg-card)', padding: '32px', borderRadius: '16px', width: '480px', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--glass-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                      <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {quickActionType === 'Expense' ? <Receipt color="#ef4444" /> : quickActionType === 'Invoice' ? <FileText color="#4f46e5" /> : <Tag color="#f59e0b" />}
                          New {quickActionType}
                      </h3>
                      <button onClick={() => setShowQuickAction(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                  </div>
                  
                  <form onSubmit={handleQuickActionSubmit}>
                      <div style={{ marginBottom: '16px' }}>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                              {quickActionType === 'Invoice' ? 'Customer' : 'Description / Title'}
                          </label>
                          {quickActionType === 'Invoice' ? (
                              <select 
                                required
                                value={formData.customer_id} 
                                onChange={e => setFormData({...formData, customer_id: e.target.value})}
                                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                              >
                                  <option value="">-- Select Customer --</option>
                                  {customers.map(c => <option key={c.id} value={c.id} style={{color:'black'}}>{c.name}</option>)}
                              </select>
                          ) : (
                              <input 
                                  type="text" 
                                  required
                                  value={formData.title}
                                  onChange={e => setFormData({...formData, title: e.target.value})}
                                  placeholder={quickActionType === 'Expense' ? 'e.g. Office Rent' : 'e.g. Project Quotation'}
                                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                              />
                          )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                          <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>Amount (EGP)</label>
                              <input 
                                  type="number" 
                                  required
                                  value={formData.amount}
                                  onChange={e => {
                                      const val = e.target.value;
                                      setFormData({
                                          ...formData, 
                                          amount: val,
                                          items: [{ ...formData.items[0], unit_price: val }]
                                      });
                                  }}
                                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                              />
                          </div>
                          <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>Date</label>
                              <input 
                                  type="date" 
                                  required
                                  value={formData.date}
                                  onChange={e => setFormData({...formData, date: e.target.value})}
                                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                              />
                          </div>
                      </div>

                      {quickActionType === 'Expense' && (
                          <div style={{ marginBottom: '24px' }}>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>Category</label>
                              <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}>
                                  <option value="General" style={{color:'black'}}>General</option>
                                  <option value="Marketing" style={{color:'black'}}>Marketing</option>
                                  <option value="Rent" style={{color:'black'}}>Rent</option>
                                  <option value="Salaries" style={{color:'black'}}>Salaries</option>
                                  <option value="Utilities" style={{color:'black'}}>Utilities</option>
                              </select>
                          </div>
                      )}

                      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                          <button type="button" onClick={() => setShowQuickAction(false)} className="action-btn" style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
                          <button type="submit" className="btn-primary" style={{ flex: 2, justifyContent: 'center' }} disabled={isSubmitting}>
                              {isSubmitting ? 'Saving...' : `Create ${quickActionType}`}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};

export default FinanceDashboard;
