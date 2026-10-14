import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { 
  Plus, Download, Filter, Search, MoreVertical, 
  TrendingUp, FileText, DollarSign, Activity, BarChart3, Users,
  CreditCard, Calendar, User, ArrowUpRight, ArrowDownRight,
  Settings, CheckCircle, Clock, AlertCircle, ShoppingBag,
  Printer, ArrowDownLeft, Wallet, Receipt, Trash2, Building2
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import VoucherPreviewModal from './VoucherPreviewModal';
import CustomerAccounts from './CustomerAccounts';
import VendorAccounts from './VendorAccounts';
import Treasury from './Treasury';
import Reports from './Reports';
import { useLanguage } from '../../context/LanguageContext';

const FinanceDashboard = () => {
  const { t, isRTL } = useLanguage();
  const { user, hasFinancialPermission } = useAuth();
  const { customers, products, units, fetchUnits, fetchCustomers, fetchProducts } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  
  const ALL_TABS = ['Overview', 'Invoices', 'Quotations', 'Receipts', 'Expenses', 'Customers', 'Vendors', 'Treasury', 'Reports'];

  const queryParams = new URLSearchParams(location.search);
  const rawTab = queryParams.get('tab') || location.state?.tab || 'Overview';
  const initialTab = ALL_TABS.find(t => t.toLowerCase() === rawTab.toLowerCase()) || 'Overview';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [invoices, setInvoices] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [receiptVouchers, setReceiptVouchers] = useState([]);
  const [paymentVouchers, setPaymentVouchers] = useState([]);
  const [summaryStats, setSummaryStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Quick Action Modal
  const [showQuickAction, setShowQuickAction] = useState(Boolean(location.state?.create));
  const [quickActionType, setQuickActionType] = useState(location.state?.create || 'Invoice');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Voucher Print / Preview Modal State
  const [selectedVoucherForPreview, setSelectedVoucherForPreview] = useState(null);

  // Voucher Cancellation Modal State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [voucherToCancel, setVoucherToCancel] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('');

  const [formData, setFormData] = useState({
    customer_id: '',
    unit_id: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    category: 'General',
    title: '',
    party_name: '',
    party_type: 'customer',
    payment_method: 'cash',
    treasury_account: 'Main Treasury / Cash',
    reference_no: '',
    items: [{ product_id: '', description: '', quantity: 1, unit_price: 0 }]
  });

  const isRealEstate = user?.template_name === 'real_estate';

  useEffect(() => {
    const qTab = new URLSearchParams(location.search).get('tab');
    if (qTab) {
      const match = ALL_TABS.find(t => t.toLowerCase() === qTab.toLowerCase());
      if (match) setActiveTab(match);
    } else if (location.state?.tab) {
      setActiveTab(location.state.tab);
    }
    if (location.state?.create) {
      setQuickActionType(location.state.create);
      setShowQuickAction(true);
    }
  }, [location.state, location.search]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    navigate(`/finance?tab=${tabId}`, { replace: true });
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  useEffect(() => {
    fetchData();
    fetchCustomers();
    fetchProducts();
    if (isRealEstate) fetchUnits();
  }, [activeTab]);

  const fetchSummary = async () => {
    try {
      const res = await api.get('/finance/summary');
      if (res.data?.data) {
        setSummaryStats(res.data.data);
      }
    } catch (err) {
      console.warn('Failed to load summary stats', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'Invoices') {
        const res = await api.get('/finance/invoices');
        setInvoices(res.data.data || []);
      } else if (activeTab === 'Quotations') {
        const res = await api.get('/quotations');
        setQuotations(res.data.data || []);
      } else if (activeTab === 'Receipts') {
        const res = await api.get('/finance/vouchers?type=receipt');
        setReceiptVouchers(res.data.data || []);
      } else if (activeTab === 'Payments') {
        const res = await api.get('/finance/vouchers?type=payment');
        setPaymentVouchers(res.data.data || []);
      } else if (activeTab === 'Expenses') {
        const res = await api.get('/finance/expenses');
        setExpenses(res.data.data || []);
      }
    } catch (err) {
      console.error(`Failed to fetch ${activeTab}`, err);
      toast.error(`Failed to load ${activeTab} data`);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickActionSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (quickActionType === 'Invoice') {
        await api.post('/finance/invoices', {
          client_id: formData.customer_id,
          customer_id: formData.customer_id,
          unit_id: formData.unit_id || null,
          items: formData.items,
          due_date: formData.date,
          notes: formData.title || null
        });
        toast.success(t('finance.invoices.createdSuccess'));
      } else if (quickActionType === 'Quotation') {
        await api.post('/quotations', {
          client_id: formData.customer_id,
          unit_id: formData.unit_id,
          items: formData.items,
          valid_until: formData.date,
          notes: formData.title,
          total_amount: formData.amount
        });
        toast.success(t('finance.quotations.createdSuccess'));
      } else if (quickActionType === 'Receipt Voucher') {
        const res = await api.post('/finance/vouchers', {
          voucher_type: 'receipt',
          party_type: formData.party_type,
          party_name: formData.party_name,
          customer_id: formData.customer_id || null,
          amount: formData.amount,
          payment_method: formData.payment_method,
          treasury_account: formData.treasury_account,
          reference_no: formData.reference_no,
          notes: formData.title,
          voucher_date: formData.date
        });
        toast.success(t('finance.receipts.issuedSuccess'));
        if (res.data?.data) {
          setSelectedVoucherForPreview(res.data.data);
        }
      } else if (quickActionType === 'Payment Voucher') {
        const res = await api.post('/finance/vouchers', {
          voucher_type: 'payment',
          party_type: formData.party_type,
          party_name: formData.party_name,
          amount: formData.amount,
          payment_method: formData.payment_method,
          treasury_account: formData.treasury_account,
          reference_no: formData.reference_no,
          notes: formData.title,
          voucher_date: formData.date
        });
        toast.success(t('finance.payments.issuedSuccess'));
        if (res.data?.data) {
          setSelectedVoucherForPreview(res.data.data);
        }
      } else if (quickActionType === 'Expense') {
        await api.post('/finance/expenses', {
          title: formData.title,
          amount: formData.amount,
          category: formData.category,
          expense_date: formData.date
        });
        toast.success(t('finance.expenses.createdSuccess'));
      }

      setShowQuickAction(false);
      fetchData();
      fetchSummary();
      setFormData({
        customer_id: '',
        unit_id: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        category: 'General',
        title: '',
        party_name: '',
        party_type: 'customer',
        payment_method: 'cash',
        treasury_account: 'Main Treasury / Cash',
        reference_no: '',
        items: [{ product_id: '', description: '', quantity: 1, unit_price: 0 }]
      });
    } catch (err) {
      console.error('Action failed', err);
      toast.error(err.response?.data?.message || 'Operation failed');
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
      if (!paymentAmount || parseFloat(paymentAmount) <= 0) return;
      setIsSubmitting(true);
      try {
          const res = await api.post(`/finance/invoices/${selectedInvoice.id}/payments`, {
              amount: paymentAmount,
              payment_method: paymentMethod,
              notes: paymentNotes
          });
          toast.success(t('finance.paymentModal.paymentSuccess'));
          setShowPaymentModal(false);
          fetchData();
          fetchSummary();

          if (res.data?.voucher) {
              setSelectedVoucherForPreview(res.data.voucher);
          }
      } catch (err) {
          console.error('Payment failed', err);
          toast.error(err.response?.data?.message || t('finance.paymentModal.paymentFailed'));
      } finally {
          setIsSubmitting(false);
      }
  };

  const openCancelVoucherModal = (voucher) => {
      setVoucherToCancel(voucher);
      setCancellationReason('');
      setShowCancelModal(true);
  };

  const handleConfirmCancelVoucher = async (e) => {
      if (e) e.preventDefault();
      if (!cancellationReason.trim()) {
          toast.error(t('finance.cancelVoucherModal.reasonRequired'));
          return;
      }
      setIsSubmitting(true);
      try {
          await api.post(`/finance/vouchers/${voucherToCancel.id}/cancel`, {
              reason: cancellationReason.trim()
          });
          toast.success(t('finance.cancelVoucherModal.success'));
          setShowCancelModal(false);
          setVoucherToCancel(null);
          setCancellationReason('');
          fetchData();
          fetchSummary();
      } catch (err) {
          console.error('Cancel voucher failed', err);
          const msg = err.response?.data?.message || (err.response?.status === 403 ? t('finance.cancelVoucherModal.permissionDenied') : t('finance.cancelVoucherModal.failed'));
          toast.error(msg);
      } finally {
          setIsSubmitting(false);
      }
  };

  const getStatusBadge = (status) => {
    const styles = {
      paid: 'badge-success',
      partial: 'badge-warning',
      unpaid: 'badge-danger',
      pending: 'badge-danger',
      draft: 'badge-warning',
      approved: 'badge-success'
    };
    const s = (status || '').toLowerCase();
    const label = t(`finance.invoices.statuses.${s}`, status || 'Unpaid');
    return <span className={`badge ${styles[s] || 'badge-warning'}`}>{label}</span>;
  };

  const getQuotationStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    const isApproved = s === 'approved' || s === 'accepted';
    return (
      <span className={`badge ${isApproved ? 'badge-success' : 'badge-warning'}`}>
        {t(`finance.quotations.statuses.${s}`, status || 'Draft')}
      </span>
    );
  };

  const renderTabContent = () => {
      switch(activeTab) {
          case 'Invoices':
              const filteredInvoices = (invoices || []).filter(inv => 
                inv.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                inv.customer_name?.toLowerCase().includes(searchTerm.toLowerCase())
              );
              return (
                <table className="data-table">
                    <thead>
                    <tr>
                        <th>{t('finance.invoices.invoiceNumber', 'Invoice #')}</th>
                        <th>{t('finance.invoices.customer', 'Customer')}</th>
                        <th>{t('finance.invoices.date', 'Date')}</th>
                        <th>{t('finance.invoices.totalAmount', 'Total Amount')}</th>
                        <th>{t('finance.invoices.remaining', 'Remaining')}</th>
                        <th>{t('finance.invoices.status', 'Status')}</th>
                        <th>{t('finance.invoices.actions', 'Actions')}</th>
                    </tr>
                    </thead>
                    <tbody>
                    {loading ? (
                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '32px' }}>{t('finance.invoices.loading', 'Loading invoices...')}</td></tr>
                    ) : filteredInvoices.length === 0 ? (
                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>{t('finance.invoices.noInvoices', 'No matching invoices found.')}</td></tr>
                    ) : filteredInvoices.map(inv => (
                        <tr key={inv.id}>
                        <td style={{ fontWeight: 700 }}><span className="num-en">{inv.invoice_number}</span></td>
                        <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600 }}>{inv.customer_name || t('finance.invoices.cashCustomer', 'Cash Customer')}</span>
                                {inv.unit_number && <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 'bold' }}>{t('finance.invoices.unit', 'Unit:')} <span className="num-en">{inv.unit_number}</span></span>}
                            </div>
                        </td>
                        <td>{inv.created_at ? <span className="num-en">{new Date(inv.created_at).toLocaleDateString('en-GB')}</span> : '—'}</td>
                        <td style={{ fontWeight: 700 }}><span className="num-en">{parseFloat(inv.total_amount || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}</td>
                        <td style={{ fontWeight: 700, color: (inv.remaining_balance || 0) > 0 ? '#ef4444' : '#10b981' }}>
                            <span className="num-en">{parseFloat(inv.remaining_balance || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}
                        </td>
                        <td>{getStatusBadge(inv.status)}</td>
                        <td>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                {hasFinancialPermission?.('payment.create') && (
                                  <button className="action-btn pay-btn" onClick={() => openPaymentModal(inv)} disabled={inv.status === 'paid'}>
                                      <CreditCard size={14} /> {t('finance.invoices.pay', 'Pay')}
                                  </button>
                                )}
                                <button className="action-btn" onClick={() => navigate(`/finance/invoice-preview/${inv.id}`)}>
                                    <Download size={14} /> {t('finance.invoices.pdf', 'PDF')}
                                </button>
                            </div>
                        </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
              );

          case 'Quotations':
              const filteredQuotations = (quotations || []).filter(q =>
                q.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                `QUO-${q.id}`.toLowerCase().includes(searchTerm.toLowerCase())
              );
              return (
                <table className="data-table">
                    <thead>
                    <tr>
                        <th>{t('finance.quotations.refNumber', 'Reference #')}</th>
                        <th>{t('finance.quotations.customer', 'Customer')}</th>
                        <th>{t('finance.quotations.amount', 'Amount')}</th>
                        <th>{t('finance.quotations.status', 'Status')}</th>
                        <th>{t('finance.quotations.validUntil', 'Valid Until')}</th>
                        <th>{t('finance.quotations.actions', 'Actions')}</th>
                    </tr>
                    </thead>
                    <tbody>
                    {filteredQuotations.length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>{t('finance.quotations.noQuotations', 'No quotations found.')}</td></tr>
                    ) : filteredQuotations.map(q => (
                        <tr key={q.id}>
                            <td style={{ fontWeight: 700 }}><span className="num-en">{q.number || `QUO-${q.id}`}</span></td>
                            <td>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontWeight: 600 }}>{q.client_name || t('finance.quotations.customer', 'Customer')}</span>
                                    {q.unit_number && <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 'bold' }}>{t('finance.invoices.unit', 'Unit:')} <span className="num-en">{q.unit_number}</span></span>}
                                </div>
                            </td>
                            <td style={{ fontWeight: 700 }}><span className="num-en">{parseFloat(q.total_amount || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}</td>
                            <td>{getQuotationStatusBadge(q.status)}</td>
                            <td><span className="num-en">{q.valid_until ? new Date(q.valid_until).toLocaleDateString('en-GB') : '—'}</span></td>
                            <td>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button className="action-btn" onClick={() => navigate(`/finance/quotation-preview/${q.id}`)}>
                                        <Download size={14} /> {t('finance.quotations.print', 'Print')}
                                    </button>
                                    <button
                                        className="action-btn"
                                        style={{ background: '#f3e8ff', color: '#7e22ce', border: '1px solid #ddd6fe' }}
                                        title={t('finance.quotations.convertTooltip', 'Convert quotation directly into a sales invoice')}
                                        onClick={async () => {
                                            try {
                                                const res = await api.post(`/invoices/from-quotation/${q.id}`);
                                                toast.success(t('finance.quotations.convertedSuccess', 'Quotation converted to invoice successfully!'));
                                                fetchData();
                                                if (res.data?.data?.id) {
                                                    navigate(`/finance/invoice-preview/${res.data.data.id}`);
                                                }
                                            } catch (err) {
                                                toast.error(err.response?.data?.message || t('finance.quotations.failedConvert', 'Failed to convert quotation to invoice'));
                                            }
                                        }}
                                    >
                                        <FileText size={14} /> {t('finance.quotations.convertToInvoice', 'Convert to Invoice')}
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
              );

          case 'Receipts':
              const filteredReceipts = (receiptVouchers || []).filter(v =>
                v.voucher_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                v.party_name?.toLowerCase().includes(searchTerm.toLowerCase())
              );
              return (
                <table className="data-table">
                    <thead>
                    <tr>
                        <th>{t('finance.receipts.voucherNumber')}</th>
                        <th>{t('finance.receipts.receivedFrom')}</th>
                        <th>{t('finance.receipts.date')}</th>
                        <th>{t('finance.receipts.paymentMethod')}</th>
                        <th>{t('finance.receipts.amountReceived')}</th>
                        <th>{t('finance.receipts.description')}</th>
                        <th>{t('finance.receipts.actions')}</th>
                    </tr>
                    </thead>
                    <tbody>
                    {filteredReceipts.length === 0 ? (
                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>{t('finance.receipts.noReceipts')}</td></tr>
                    ) : filteredReceipts.map(v => (
                        <tr key={v.id}>
                            <td style={{ fontWeight: 800, color: '#059669' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <ArrowDownLeft size={14} />
                                    <span className="num-en">{v.voucher_number}</span>
                                </div>
                            </td>
                            <td style={{ fontWeight: 600 }}>{v.party_name}</td>
                            <td>{v.voucher_date ? <span className="num-en">{new Date(v.voucher_date).toLocaleDateString('en-GB')}</span> : 'N/A'}</td>
                            <td>
                                <span className="badge" style={{ background: '#ecfdf5', color: '#047857' }}>
                                    {t(`finance.paymentModal.methods.${v.payment_method}`, v.payment_method === 'cash' ? 'Cash' : v.payment_method === 'bank_transfer' ? 'Bank Transfer' : v.payment_method === 'check' ? 'Cheque' : 'Card')}
                                </span>
                            </td>
                            <td style={{ fontWeight: 800, color: '#059669', fontSize: '15px' }}>
                                <span className="num-en">{parseFloat(v.amount).toLocaleString('en-US')}</span> {t('common.currency')}
                            </td>
                            <td>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    {v.linked_invoice_number && <strong style={{ color: '#2563eb' }}>{t('finance.invoices.invoiceNumberPrefix', 'Invoice #')}<span className="num-en">{v.linked_invoice_number}</span>: </strong>}
                                    {v.notes || t('finance.receipts.paymentOnAccount')}
                                </div>
                            </td>
                            <td>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <button 
                                        className="action-btn"
                                        style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}
                                        onClick={() => setSelectedVoucherForPreview(v)}
                                    >
                                        <Printer size={14} /> {t('finance.receipts.printVoucher')}
                                    </button>
                                    {user?.role === 'admin' && (
                                        <button 
                                            className="action-btn"
                                            style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                                            onClick={() => openCancelVoucherModal(v)}
                                            title={t('finance.receipts.cancelVoucher')}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
              );

          case 'Payments':
              const filteredPayments = (paymentVouchers || []).filter(v =>
                v.voucher_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                v.party_name?.toLowerCase().includes(searchTerm.toLowerCase())
              );
              return (
                <table className="data-table">
                    <thead>
                    <tr>
                        <th>{t('finance.payments.voucherNumber')}</th>
                        <th>{t('finance.payments.paidTo')}</th>
                        <th>{t('finance.payments.date')}</th>
                        <th>{t('finance.payments.paymentMethod')}</th>
                        <th>{t('finance.payments.amountPaid')}</th>
                        <th>{t('finance.payments.description')}</th>
                        <th>{t('finance.payments.actions')}</th>
                    </tr>
                    </thead>
                    <tbody>
                    {filteredPayments.length === 0 ? (
                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>{t('finance.payments.noPayments')}</td></tr>
                    ) : filteredPayments.map(v => (
                        <tr key={v.id}>
                            <td style={{ fontWeight: 800, color: '#dc2626' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <ArrowUpRight size={14} />
                                    <span className="num-en">{v.voucher_number}</span>
                                </div>
                            </td>
                            <td style={{ fontWeight: 600 }}>{v.party_name}</td>
                            <td>{v.voucher_date ? <span className="num-en">{new Date(v.voucher_date).toLocaleDateString('en-GB')}</span> : 'N/A'}</td>
                            <td>
                                <span className="badge" style={{ background: '#fef2f2', color: '#b91c1c' }}>
                                    {t(`finance.paymentModal.methods.${v.payment_method}`, v.payment_method === 'cash' ? 'Cash' : v.payment_method === 'bank_transfer' ? 'Bank Transfer' : v.payment_method === 'check' ? 'Cheque' : 'Card')}
                                </span>
                            </td>
                            <td style={{ fontWeight: 800, color: '#dc2626', fontSize: '15px' }}>
                                <span className="num-en">{parseFloat(v.amount).toLocaleString('en-US')}</span> {t('common.currency')}
                            </td>
                            <td>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    {v.notes || t('finance.payments.operationalExpenses')}
                                </div>
                            </td>
                            <td>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <button 
                                        className="action-btn"
                                        style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
                                        onClick={() => setSelectedVoucherForPreview(v)}
                                    >
                                        <Printer size={14} /> {t('finance.payments.printVoucher')}
                                    </button>
                                    {user?.role === 'admin' && (
                                        <button 
                                            className="action-btn"
                                            style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                                            onClick={() => openCancelVoucherModal(v)}
                                            title={t('finance.payments.cancelVoucher')}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
              );

          case 'Expenses':
              const filteredExpenses = (expenses || []).filter(e =>
                e.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                e.category?.toLowerCase().includes(searchTerm.toLowerCase())
              );
              return (
                <table className="data-table">
                    <thead>
                    <tr>
                        <th>{t('finance.expenses.date')}</th>
                        <th>{t('finance.expenses.description')}</th>
                        <th>{t('finance.expenses.category')}</th>
                        <th>{t('finance.expenses.amount')}</th>
                    </tr>
                    </thead>
                    <tbody>
                    {filteredExpenses.length === 0 ? (
                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>{t('finance.expenses.noExpenses')}</td></tr>
                    ) : filteredExpenses.map(e => (
                        <tr key={e.id}>
                            <td><span className="num-en">{new Date(e.expense_date).toLocaleDateString('en-GB')}</span></td>
                            <td style={{ fontWeight: 600 }}>{e.title}</td>
                            <td><span className="badge" style={{ background: '#f1f5f9', color: '#475569' }}>{t(`finance.expenses.categories.${e.category}`, e.category)}</span></td>
                            <td style={{ fontWeight: 700, color: '#ef4444' }}><span className="num-en">{parseFloat(e.amount).toLocaleString('en-US')}</span> {t('common.currency')}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
              );

          case 'Overview':
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', padding: '8px 0' }}>
                  {[
                    { label: t('finance.kpi.totalSales', 'Total Sales'), value: summaryStats?.totalSales || summaryStats?.totalInvoiced || 0, color: '#6366f1', sub: t('finance.kpi.allIssuedInvoices', 'All issued invoices') },
                    { label: t('finance.kpi.totalCollected', 'Total Collected'), value: summaryStats?.totalIncome || 0, color: '#10b981', sub: t('finance.kpi.paymentsReceived', 'Payments received') },
                    { label: t('finance.kpi.outstanding', 'Outstanding'), value: summaryStats?.totalOutstanding || 0, color: '#f59e0b', sub: t('finance.kpi.unpaidPartial', 'Unpaid / partially paid') },
                    { label: t('finance.kpi.expenses', 'Expenses'), value: summaryStats?.totalExpenses || 0, color: '#ef4444', sub: t('finance.kpi.allExpenses', 'All recorded expenses') },
                    { label: t('finance.kpi.netCashflow', 'Net Cashflow'), value: summaryStats?.netCashflow || 0, color: (summaryStats?.netCashflow || 0) >= 0 ? '#3b82f6' : '#ef4444', sub: t('finance.kpi.collectedMinusExpenses', 'Collected minus expenses') },
                  ].map(item => (
                    <div key={item.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>{item.label}</div>
                      <div style={{ fontSize: '26px', fontWeight: 900, color: item.color }}><span className="num-en">{parseFloat(item.value || 0).toLocaleString('en-US')}</span> <span style={{ fontSize: '13px' }}>{t('common.currency', 'EGP')}</span></div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{item.sub}</div>
                    </div>
                  ))}
                </div>
              );

          case 'Customers':
              return <CustomerAccounts />;

          case 'Vendors':
              return <VendorAccounts />;

          case 'Treasury':
              return <Treasury />;

          case 'Reports':
              return (
                <Reports
                  onSelectCustomer={(custId) => {
                    navigate(`/finance?tab=Customers&customer_id=${custId}`);
                  }}
                />
              );

          default:
              return null;
      }
  };

  return (
    <div className="finance-dashboard" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <style>{`
        .finance-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px; }
        .btn-primary { background: var(--primary, #3b82f6); color: white; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .data-table { width: 100%; border-collapse: collapse; background: var(--bg-card); border-radius: 12px; overflow: hidden; box-shadow: var(--shadow-sm); border: 1px solid var(--glass-border); }
        .data-table th, .data-table td { padding: 16px; text-align: ${isRTL ? 'right' : 'left'}; border-bottom: 1px solid var(--glass-border); }
        .data-table th { background: rgba(0,0,0,0.02); font-weight: 700; color: var(--text-muted); font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
        .data-table tr:hover { background: rgba(255,255,255,0.02); }
        .badge { padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; }
        .badge-success { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .badge-warning { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        .badge-danger { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .action-btn { background: transparent; border: 1px solid var(--glass-border); padding: 6px 12px; border-radius: 6px; cursor: pointer; color: var(--text-main); font-weight: 600; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; margin-${isRTL ? 'left' : 'right'}: 8px; transition: 0.2s; }
        .action-btn:hover { background: rgba(0,0,0,0.05); }
        .pay-btn { background: rgba(79, 70, 229, 0.1); color: #4f46e5; border-color: rgba(79, 70, 229, 0.2); }
        .pay-btn:hover { background: rgba(79, 70, 229, 0.2); }
        .tabs-nav { display: flex; gap: 8px; margin-bottom: 24px; background: rgba(0,0,0,0.02); padding: 4px; border-radius: 10px; width: fit-content; flex-wrap: wrap; }
        .tab-item { padding: 8px 18px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 14px; color: var(--text-muted); transition: 0.3s; display: flex; align-items: center; gap: 6px; }
        .tab-item.active { background: white; color: var(--primary, #3b82f6); box-shadow: var(--shadow-sm); }
        
        /* KPI Cards Grid */
        .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .kpi-card { background: var(--bg-card); border: 1px solid var(--glass-border); border-radius: 14px; padding: 18px 20px; box-shadow: var(--shadow-sm); display: flex; align-items: center; justify-content: space-between; }
        .kpi-val { font-size: 22px; font-weight: 900; margin-top: 4px; }
        .kpi-title { font-size: 12px; color: var(--text-muted); font-weight: 600; }
        .kpi-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
      `}</style>
      
      {/* Header */}
      <div className="finance-header">
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800' }}>{t('finance.title')}</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>{t('finance.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {activeTab === 'Invoices' && (
              <button className="btn-primary" onClick={() => { setQuickActionType('Invoice'); setShowQuickAction(true); }}>
                <Plus size={18} /> {t('finance.invoices.newInvoice')}
              </button>
            )}
            {activeTab === 'Quotations' && (
              <button className="btn-primary" onClick={() => { setQuickActionType('Quotation'); setShowQuickAction(true); }}>
                <Plus size={18} /> {t('finance.quotations.newQuotation')}
              </button>
            )}
            {activeTab === 'Receipts' && hasFinancialPermission?.('payment.create') && (
              <button className="btn-primary" style={{ background: '#10b981', borderColor: '#10b981' }} onClick={() => { setQuickActionType('Receipt Voucher'); setShowQuickAction(true); }}>
                <Plus size={16} /> {t('finance.receipts.newReceipt')}
              </button>
            )}
            {activeTab === 'Payments' && hasFinancialPermission?.('payment.create') && (
              <button className="btn-primary" style={{ background: '#dc2626', borderColor: '#dc2626' }} onClick={() => { setQuickActionType('Payment Voucher'); setShowQuickAction(true); }}>
                <Plus size={16} /> {t('finance.payments.newPayment')}
              </button>
            )}
            {activeTab === 'Expenses' && hasFinancialPermission?.('payment.create') && (
              <button className="btn-primary" style={{ background: '#f59e0b', borderColor: '#f59e0b' }} onClick={() => { setQuickActionType('Expense'); setShowQuickAction(true); }}>
                <Plus size={16} /> {t('finance.expenses.newExpense')}
              </button>
            )}
        </div>
      </div>

      {/* KPI Summary Strip — hidden on Overview tab (Overview tab renders its own full grid) */}
      {activeTab !== 'Overview' && (
      <div className="kpi-grid">
        <div className="kpi-card">
            <div>
                <span className="kpi-title">{t('finance.kpi.totalCollected')}</span>
                <div className="kpi-val num-en" style={{ color: '#10b981' }}>
                    {parseFloat(summaryStats?.totalIncome || 0).toLocaleString('en-US')} <span style={{ fontSize: '12px' }}>{t('common.currency')}</span>
                </div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                <ArrowDownLeft size={22} />
            </div>
        </div>

        <div className="kpi-card">
            <div>
                <span className="kpi-title">{t('finance.kpi.expenses')}</span>
                <div className="kpi-val num-en" style={{ color: '#ef4444' }}>
                    {parseFloat(summaryStats?.totalExpenses || 0).toLocaleString('en-US')} <span style={{ fontSize: '12px' }}>{t('common.currency')}</span>
                </div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                <TrendingUp size={22} />
            </div>
        </div>

        <div className="kpi-card">
            <div>
                <span className="kpi-title">{t('finance.kpi.outstanding')}</span>
                <div className="kpi-val num-en" style={{ color: '#f59e0b' }}>
                    {parseFloat(summaryStats?.totalOutstanding || 0).toLocaleString('en-US')} <span style={{ fontSize: '12px' }}>{t('common.currency')}</span>
                </div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                <Clock size={22} />
            </div>
        </div>

        <div className="kpi-card">
            <div>
                <span className="kpi-title">{t('finance.kpi.netCashflow')}</span>
                <div className="kpi-val num-en" style={{ color: (summaryStats?.netCashflow || 0) >= 0 ? '#3b82f6' : '#ef4444' }}>
                    {parseFloat(summaryStats?.netCashflow || 0).toLocaleString('en-US')} <span style={{ fontSize: '12px' }}>{t('common.currency')}</span>
                </div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                <Wallet size={22} />
            </div>
        </div>
      </div>
      )}

      {/* Tabs & Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
        <div className="tabs-nav" style={{ marginBottom: 0 }}>
            {[
                { id: 'Overview',   label: t('finance.tabs.overview'),   icon: <TrendingUp size={16} /> },
                { id: 'Invoices',   label: t('finance.tabs.invoices'),   icon: <FileText size={16} /> },
                { id: 'Quotations', label: t('finance.tabs.quotations'), icon: <FileText size={16} /> },
                { id: 'Receipts',   label: t('finance.tabs.receipts'),   icon: <ArrowDownLeft size={16} /> },
                { id: 'Payments',   label: t('finance.tabs.payments'),   icon: <ArrowUpRight size={16} /> },
                { id: 'Expenses',   label: t('finance.tabs.expenses'),   icon: <DollarSign size={16} /> },
                { id: 'Customers',  label: t('finance.tabs.customers'),  icon: <Users size={16} /> },
                { id: 'Vendors',    label: t('finance.tabs.vendors'),    icon: <Building2 size={16} /> },
                { id: 'Treasury',   label: t('finance.tabs.treasury'),   icon: <Wallet size={16} /> },
                { id: 'Reports',    label: t('finance.tabs.reports'),    icon: <BarChart3 size={16} /> },
            ].map(tab => (
                <div 
                  key={tab.id} 
                  className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => handleTabChange(tab.id)}
                >
                    {tab.icon}
                    {tab.label}
                </div>
            ))}
        </div>

        {['Invoices', 'Quotations', 'Receipts', 'Payments', 'Expenses'].includes(activeTab) && (
        <div style={{ position: 'relative', minWidth: '260px' }}>
            <Search size={16} style={{ position: 'absolute', [isRTL ? 'right' : 'left']: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
                type="text"
                placeholder={
                  activeTab === 'Quotations' ? t('finance.quotations.searchPlaceholder') :
                  activeTab === 'Receipts' ? t('finance.receipts.searchPlaceholder') :
                  activeTab === 'Payments' ? t('finance.payments.searchPlaceholder') :
                  activeTab === 'Expenses' ? t('finance.expenses.searchPlaceholder') :
                  t('finance.invoices.searchPlaceholder')
                }
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                    width: '100%',
                    padding: isRTL ? '8px 36px 8px 12px' : '8px 12px 8px 36px',
                    borderRadius: '8px',
                    border: '1px solid var(--glass-border)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-main)',
                    fontSize: '13px'
                }}
            />
        </div>
        )}
      </div>

      {renderTabContent()}

      {/* Payment Registration Modal */}
      {showPaymentModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)', direction: isRTL ? 'rtl' : 'ltr' }}>
              <div style={{ background: 'var(--bg-card)', padding: '32px', borderRadius: '16px', width: '440px', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--glass-border)' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 800 }}>{t('finance.paymentModal.title')}</h3>
                  
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid var(--glass-border)' }}>
                     <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                         {t('finance.paymentModal.invoiceNo')} <strong className="num-en">{selectedInvoice?.invoice_number}</strong>
                     </p>
                     <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                         {t('finance.paymentModal.customer')} <strong>{selectedInvoice?.customer_name || t('finance.invoices.cashCustomer')}</strong>
                     </p>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed var(--glass-border)', paddingTop: '8px' }}>
                         <span style={{ fontWeight: 600 }}>{t('finance.paymentModal.remainingBalance')}</span>
                         <span className="num-en" style={{ fontSize: '18px', fontWeight: 900, color: '#ef4444' }}>{parseFloat(selectedInvoice?.remaining_balance || 0).toLocaleString('en-US')} {t('common.currency')}</span>
                     </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>{t('finance.paymentModal.paymentAmount', { currency: t('common.currency') })}</label>
                      <input 
                         type="number" 
                         value={paymentAmount}
                         onChange={(e) => setPaymentAmount(e.target.value)}
                         max={selectedInvoice?.remaining_balance}
                         className="num-en"
                         style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)', fontSize: '16px', fontWeight: 'bold' }}
                      />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>{t('finance.paymentModal.paymentMethod')}</label>
                      <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}>
                          <option value="cash" style={{color:'black'}}>{t('finance.paymentModal.methods.cash')}</option>
                          <option value="bank_transfer" style={{color:'black'}}>{t('finance.paymentModal.methods.bank_transfer')}</option>
                          <option value="card" style={{color:'black'}}>{t('finance.paymentModal.methods.card')}</option>
                          <option value="check" style={{color:'black'}}>{t('finance.paymentModal.methods.check')}</option>
                      </select>
                  </div>
                  
                  <div style={{ marginBottom: '24px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>{t('finance.paymentModal.notesReference')}</label>
                      <input 
                         type="text" 
                         value={paymentNotes}
                         onChange={(e) => setPaymentNotes(e.target.value)}
                         placeholder={t('finance.paymentModal.notesPlaceholder')}
                         style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                      />
                  </div>

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setShowPaymentModal(false)} className="action-btn" disabled={isSubmitting}>{t('finance.paymentModal.cancel')}</button>
                      <button onClick={handlePaymentSubmit} className="btn-primary" disabled={isSubmitting}>
                          {isSubmitting ? t('finance.paymentModal.processing') : t('finance.paymentModal.confirmPayment')}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Quick Action Modal (Invoice, Quotation, Voucher, Expense) */}
      {showQuickAction && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)', direction: isRTL ? 'rtl' : 'ltr' }}>
              <div style={{ background: 'var(--bg-card)', padding: '32px', borderRadius: '16px', width: '640px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--glass-border)' }}>
                  <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '800' }}>
                      {quickActionType === 'Receipt Voucher' ? t('finance.quickAction.titleReceiptVoucher') :
                       quickActionType === 'Payment Voucher' ? t('finance.quickAction.titlePaymentVoucher') :
                       quickActionType === 'Expense' ? t('finance.quickAction.titleExpense') :
                       quickActionType === 'Quotation' ? t('finance.quickAction.titleQuotation') : t('finance.quickAction.titleInvoice')}
                  </h3>

                  <form onSubmit={handleQuickActionSubmit}>
                      {/* Vouchers Specific Fields */}
                      {(quickActionType === 'Receipt Voucher' || quickActionType === 'Payment Voucher') ? (
                          <>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '12px', marginBottom: '16px' }}>
                                  <div>
                                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>{t('finance.quickAction.partyType')}</label>
                                      <select 
                                          value={formData.party_type} 
                                          onChange={e => setFormData({ ...formData, party_type: e.target.value })}
                                          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                      >
                                          <option value="customer" style={{color:'black'}}>{t('finance.quickAction.parties.customer')}</option>
                                          <option value="vendor" style={{color:'black'}}>{t('finance.quickAction.parties.vendor')}</option>
                                          <option value="employee" style={{color:'black'}}>{t('finance.quickAction.parties.employee')}</option>
                                          <option value="other" style={{color:'black'}}>{t('finance.quickAction.parties.other')}</option>
                                      </select>
                                  </div>
                                  <div>
                                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                                          {quickActionType === 'Receipt Voucher' ? t('finance.quickAction.receivedFrom') : t('finance.quickAction.paidTo')}
                                      </label>
                                      {formData.party_type === 'customer' ? (
                                          <select 
                                              value={formData.customer_id}
                                              onChange={e => {
                                                  const sel = customers.find(c => String(c.id) === e.target.value);
                                                  setFormData({ ...formData, customer_id: e.target.value, party_name: sel ? sel.name : '' });
                                              }}
                                              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                          >
                                              <option value="">{t('finance.quickAction.selectCustomer')}</option>
                                              {customers.map(c => <option key={c.id} value={c.id} style={{color:'black'}}>{c.name}</option>)}
                                          </select>
                                      ) : (
                                          <input 
                                              type="text" 
                                              required
                                              value={formData.party_name}
                                              onChange={e => setFormData({ ...formData, party_name: e.target.value })}
                                              placeholder={t('finance.quickAction.partyNamePlaceholder')}
                                              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                          />
                                      )}
                                  </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                  <div>
                                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>{t('finance.quickAction.amount', { currency: t('common.currency') })}</label>
                                      <input 
                                          type="number" 
                                          required
                                          value={formData.amount}
                                          onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                          placeholder="0.00"
                                          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)', fontWeight: 800 }}
                                      />
                                  </div>
                                  <div>
                                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>{t('finance.quickAction.voucherDate')}</label>
                                      <input 
                                          type="date" 
                                          required
                                          value={formData.date}
                                          onChange={e => setFormData({ ...formData, date: e.target.value })}
                                          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                      />
                                  </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                  <div>
                                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>{t('finance.paymentModal.paymentMethod')}</label>
                                      <select 
                                          value={formData.payment_method} 
                                          onChange={e => setFormData({ ...formData, payment_method: e.target.value })}
                                          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                      >
                                          <option value="cash" style={{color:'black'}}>{t('finance.paymentModal.methods.cash')}</option>
                                          <option value="bank_transfer" style={{color:'black'}}>{t('finance.paymentModal.methods.bank_transfer')}</option>
                                          <option value="check" style={{color:'black'}}>{t('finance.paymentModal.methods.check')}</option>
                                          <option value="card" style={{color:'black'}}>{t('finance.paymentModal.methods.card')}</option>
                                      </select>
                                  </div>
                                  <div>
                                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>{t('finance.quickAction.treasuryAccount')}</label>
                                      <input 
                                          type="text" 
                                          value={formData.treasury_account}
                                          onChange={e => setFormData({ ...formData, treasury_account: e.target.value })}
                                          placeholder={t('finance.quickAction.treasuryPlaceholder')}
                                          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                      />
                                  </div>
                              </div>

                              <div style={{ marginBottom: '16px' }}>
                                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>{t('finance.quickAction.refNoCheque')}</label>
                                  <input 
                                      type="text" 
                                      value={formData.reference_no}
                                      onChange={e => setFormData({ ...formData, reference_no: e.target.value })}
                                      placeholder={t('finance.quickAction.refNoPlaceholder')}
                                      style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                  />
                              </div>

                              <div style={{ marginBottom: '24px' }}>
                                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>{t('finance.quickAction.purposeDescription')}</label>
                                  <input 
                                      type="text" 
                                      value={formData.title}
                                      onChange={e => setFormData({ ...formData, title: e.target.value })}
                                      placeholder={quickActionType === 'Receipt Voucher' ? t('finance.quickAction.receiptPurposePlaceholder') : t('finance.quickAction.paymentPurposePlaceholder')}
                                      style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                  />
                              </div>
                          </>
                      ) : (
                          <>
                              <div style={{ marginBottom: '16px' }}>
                                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                                      {quickActionType === 'Expense' ? t('finance.quickAction.expenseTitle') : t('finance.quickAction.customer')}
                                  </label>
                                  {(quickActionType === 'Invoice' || quickActionType === 'Quotation') ? (
                                      <div style={{ display: 'flex', gap: '12px' }}>
                                        <select 
                                          required
                                          value={formData.customer_id} 
                                          onChange={e => setFormData({...formData, customer_id: e.target.value})}
                                          style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                        >
                                            <option value="">-- Select Customer --</option>
                                            {customers.map(c => <option key={c.id} value={c.id} style={{color:'black'}}>{c.name}</option>)}
                                        </select>
                                        {isRealEstate && (
                                            <select 
                                              value={formData.unit_id || ''} 
                                              onChange={e => setFormData({...formData, unit_id: e.target.value})}
                                              style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                            >
                                                <option value="">{t('finance.quickAction.selectUnit')}</option>
                                                {units.map(u => <option key={u.id} value={u.id} style={{color:'black'}}>{u.unit_number} - {u.project_name}</option>)}
                                            </select>
                                        )}
                                      </div>
                                  ) : (
                                      <input 
                                          type="text" 
                                          required
                                          value={formData.title}
                                          onChange={e => setFormData({...formData, title: e.target.value})}
                                          placeholder={t('finance.quickAction.expensePlaceholder')}
                                          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                      />
                                  )}
                              </div>

                              {(quickActionType === 'Invoice' || quickActionType === 'Quotation') ? (
                                  <div style={{ marginBottom: '16px' }}>
                                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>{t('finance.quickAction.itemsServices')}</label>
                                      {formData.items.map((item, index) => (
                                          <div key={index} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr 0.6fr 0.8fr auto', gap: '8px', marginBottom: '8px' }}>
                                              <select 
                                                value={item.product_id} 
                                                onChange={e => {
                                                    const newItems = [...formData.items];
                                                    const prod = products.find(p => p.id === parseInt(e.target.value));
                                                    newItems[index] = { ...newItems[index], product_id: e.target.value, unit_price: prod ? prod.price : (newItems[index].unit_price || 0), description: prod ? prod.name : newItems[index].description };
                                                    setFormData({ ...formData, items: newItems, amount: newItems.reduce((acc, curr) => acc + (curr.quantity * curr.unit_price), 0) });
                                                }}
                                                style={{ width: '100%', padding: '8px', border: '1px solid var(--glass-border)', borderRadius: '6px', background: 'transparent', color: 'var(--text-main)', fontSize: '12px' }}
                                              >
                                                  <option value="">{t('finance.quickAction.linkProduct')}</option>
                                                  {products.map(p => <option key={p.id} value={p.id} style={{color:'black'}}>{p.name}</option>)}
                                              </select>
                                              <input 
                                                type="text"
                                                placeholder={t('finance.quickAction.descriptionPlaceholder')}
                                                value={item.description || ''}
                                                onChange={e => {
                                                    const newItems = [...formData.items];
                                                    newItems[index].description = e.target.value;
                                                    setFormData({ ...formData, items: newItems });
                                                }}
                                                style={{ width: '100%', padding: '8px', border: '1px solid var(--glass-border)', borderRadius: '6px', background: 'transparent', color: 'var(--text-main)', fontSize: '12px' }}
                                              />
                                              <input 
                                                type="number" 
                                                placeholder={t('finance.quickAction.qty')} className="num-en"
                                                value={item.quantity}
                                                onChange={e => {
                                                    const newItems = [...formData.items];
                                                    newItems[index].quantity = parseInt(e.target.value) || 0;
                                                    setFormData({ ...formData, items: newItems, amount: newItems.reduce((acc, curr) => acc + (curr.quantity * curr.unit_price), 0) });
                                                }}
                                                style={{ width: '100%', padding: '8px', border: '1px solid var(--glass-border)', borderRadius: '6px', background: 'transparent', color: 'var(--text-main)', fontSize: '12px' }}
                                              />
                                              <input 
                                                type="number" 
                                                placeholder={t('finance.quickAction.price')} className="num-en"
                                                value={item.unit_price}
                                                onChange={e => {
                                                    const newItems = [...formData.items];
                                                    newItems[index].unit_price = parseFloat(e.target.value) || 0;
                                                    setFormData({ ...formData, items: newItems, amount: newItems.reduce((acc, curr) => acc + (curr.quantity * curr.unit_price), 0) });
                                                }}
                                                style={{ width: '100%', padding: '8px', border: '1px solid var(--glass-border)', borderRadius: '6px', background: 'transparent', color: 'var(--text-main)', fontSize: '12px' }}
                                              />
                                              <button type="button" onClick={() => {
                                                  const newItems = formData.items.filter((_, i) => i !== index);
                                                  setFormData({ ...formData, items: newItems, amount: newItems.reduce((acc, curr) => acc + (curr.quantity * curr.unit_price), 0) });
                                              }} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>✕</button>
                                          </div>
                                      ))}
                                      <button type="button" onClick={() => setFormData({ ...formData, items: [...formData.items, { product_id: '', quantity: 1, unit_price: 0 }] })} style={{ fontSize: '11px', color: 'var(--primary)', background: 'transparent', border: '1px dashed var(--primary)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>{t('finance.quickAction.addItem')}</button>
                                  </div>
                              ) : (
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                      <div>
                                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>{t('finance.quickAction.amount', { currency: t('common.currency') })}</label>
                                          <input 
                                              type="number" 
                                              required
                                              value={formData.amount}
                                              onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                          />
                                      </div>
                                      <div>
                                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>{t('finance.quickAction.date')}</label>
                                          <input 
                                              type="date" 
                                              required
                                              value={formData.date}
                                              onChange={e => setFormData({...formData, date: e.target.value})}
                                              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                          />
                                      </div>
                                  </div>
                              )}
                              
                              {(quickActionType === 'Invoice' || quickActionType === 'Quotation') && (
                                <div style={{ marginBottom: '16px' }}>
                                   <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>{t('finance.quickAction.dueDate')}</label>
                                    <input 
                                        type="date" 
                                        required
                                        value={formData.date}
                                        onChange={e => setFormData({...formData, date: e.target.value})}
                                        style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                    />
                                </div>
                              )}

                              {quickActionType === 'Expense' && (
                                  <div style={{ marginBottom: '24px' }}>
                                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>{t('finance.quickAction.expenseCategory')}</label>
                                      <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}>
                                          <option value="General" style={{color:'black'}}>{t('finance.expenses.categories.General')}</option>
                                          <option value="Marketing" style={{color:'black'}}>{t('finance.expenses.categories.Marketing')}</option>
                                          <option value="Rent" style={{color:'black'}}>{t('finance.expenses.categories.Rent')}</option>
                                          <option value="Salaries" style={{color:'black'}}>{t('finance.expenses.categories.Salaries')}</option>
                                          <option value="Utilities" style={{color:'black'}}>{t('finance.expenses.categories.Utilities')}</option>
                                          <option value="Maintenance" style={{color:'black'}}>{t('finance.expenses.categories.Maintenance')}</option>
                                      </select>
                                  </div>
                              )}
                          </>
                      )}

                      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                          <button type="button" onClick={() => setShowQuickAction(false)} className="action-btn" style={{ flex: 1, justifyContent: 'center' }}>{t('finance.quickAction.cancel')}</button>
                          <button type="submit" className="btn-primary" style={{ flex: 2, justifyContent: 'center' }} disabled={isSubmitting}>
                              {isSubmitting ? t('finance.quickAction.saving') : t('finance.quickAction.saveConfirm')}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* Voucher Print Preview Modal */}
      {selectedVoucherForPreview && (
          <VoucherPreviewModal 
              voucher={selectedVoucherForPreview} 
              onClose={() => setSelectedVoucherForPreview(null)} 
          />
      )}

      {/* Voucher Cancellation Modal */}
      {showCancelModal && voucherToCancel && (
          <div className="modal-overlay" style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}>
              <div className="modal-content" style={{
                  background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: '16px', padding: '28px', maxWidth: '480px', width: '90%',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
              }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <div style={{ padding: '10px', background: '#fee2e2', borderRadius: '10px', color: '#dc2626' }}>
                          <AlertCircle size={24} />
                      </div>
                      <div>
                          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#dc2626' }}>{t('finance.cancelVoucherModal.title')}</h3>
                          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>{t('finance.cancelVoucherModal.voucherInfo', { number: voucherToCancel.voucher_number, amount: parseFloat(voucherToCancel.amount).toLocaleString('en-US'), currency: t('common.currency') })}</p>
                      </div>
                  </div>

                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '20px' }}>
                      {t('finance.cancelVoucherModal.warning')}
                  </p>

                  <form onSubmit={handleConfirmCancelVoucher}>
                      <div style={{ marginBottom: '20px' }}>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
                              {t('finance.cancelVoucherModal.reasonLabel')} <span style={{ color: '#ef4444' }}>*</span>
                          </label>
                          <textarea
                              rows={3}
                              required
                              value={cancellationReason}
                              onChange={(e) => setCancellationReason(e.target.value)}
                              placeholder={t('finance.cancelVoucherModal.reasonPlaceholder')}
                              style={{
                                  width: '100%', padding: '10px 14px', border: '1px solid var(--border-color, #cbd5e1)',
                                  borderRadius: '8px', background: 'transparent', color: 'var(--text-main)',
                                  fontSize: '13px', resize: 'vertical'
                              }}
                          />
                      </div>

                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                          <button
                              type="button"
                              onClick={() => { setShowCancelModal(false); setVoucherToCancel(null); }}
                              className="action-btn"
                              style={{ padding: '8px 16px' }}
                              disabled={isSubmitting}
                          >
                              {t('finance.cancelVoucherModal.close')}
                          </button>
                          <button
                              type="submit"
                              className="action-btn"
                              style={{
                                  background: '#dc2626', color: '#ffffff', border: 'none',
                                  padding: '8px 20px', fontWeight: 600
                              }}
                              disabled={isSubmitting || !cancellationReason.trim()}
                          >
                              {isSubmitting ? t('finance.cancelVoucherModal.cancelling') : t('finance.cancelVoucherModal.confirmCancel')}
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
