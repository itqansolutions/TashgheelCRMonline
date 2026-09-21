import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { 
  Plus, Download, Filter, Search, MoreVertical, 
  TrendingUp, FileText, DollarSign, Activity,
  CreditCard, Calendar, User, ArrowUpRight, ArrowDownRight,
  Settings, CheckCircle, Clock, AlertCircle, ShoppingBag,
  Printer, ArrowDownLeft, Wallet, Receipt, Trash2
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import VoucherPreviewModal from './VoucherPreviewModal';

const FinanceDashboard = () => {
  const { user } = useAuth();
  const { customers, products, units, fetchUnits, fetchCustomers, fetchProducts } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  
  const queryParams = new URLSearchParams(location.search);
  const initialTab = location.state?.tab || 
    (queryParams.get('tab')?.toLowerCase() === 'quotations' ? 'Quotations' : 
     queryParams.get('tab')?.toLowerCase() === 'receipts' ? 'Receipts' :
     queryParams.get('tab')?.toLowerCase() === 'payments' ? 'Payments' :
     queryParams.get('tab')?.toLowerCase() === 'expenses' ? 'Expenses' : 'Invoices');

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
    treasury_account: 'الخزينة الرئيسية (Main Cash)',
    reference_no: '',
    items: [{ product_id: '', description: '', quantity: 1, unit_price: 0 }]
  });

  const isRealEstate = user?.template_name === 'real_estate';

  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab);
    }
    if (location.state?.create) {
      setQuickActionType(location.state.create);
      setShowQuickAction(true);
    }
  }, [location.state]);

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
      toast.error(`فشل تحميل بيانات ${activeTab}`);
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
          unit_id: formData.unit_id,
          items: formData.items,
          due_date: formData.date
        });
        toast.success('تم إنشاء الفاتورة بنجاح');
      } else if (quickActionType === 'Quotation') {
        await api.post('/quotations', {
          client_id: formData.customer_id,
          unit_id: formData.unit_id,
          items: formData.items,
          valid_until: formData.date,
          notes: formData.title,
          total_amount: formData.amount
        });
        toast.success('تم إنشاء عرض السعر بنجاح');
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
        toast.success('تم إصدار سند القبض بنجاح');
        if (res.data?.data) {
          // Open voucher for preview/print
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
        toast.success('تم إصدار سند الصرف بنجاح');
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
        toast.success('تم تسجيل المصروف بنجاح');
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
        treasury_account: 'الخزينة الرئيسية (Main Cash)',
        reference_no: '',
        items: [{ product_id: '', description: '', quantity: 1, unit_price: 0 }]
      });
    } catch (err) {
      console.error('Action failed', err);
      toast.error(err.response?.data?.message || 'فشلت العملية');
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
          toast.success('تم تسجيل الدفعة بنجاح');
          setShowPaymentModal(false);
          fetchData();
          fetchSummary();

          // Auto open the newly generated receipt voucher for immediate print
          if (res.data?.voucher) {
              setSelectedVoucherForPreview(res.data.voucher);
          }
      } catch (err) {
          console.error('Payment failed', err);
          toast.error(err.response?.data?.message || 'فشل تسجيل الدفعة');
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleDeleteVoucher = async (voucherId) => {
      if (!window.confirm('هل أنت متأكد من رغبتك في إلغاء هذا السند المالي؟')) return;
      try {
          await api.delete(`/finance/vouchers/${voucherId}`);
          toast.success('تم إلغاء السند بنجاح');
          fetchData();
          fetchSummary();
      } catch (err) {
          console.error('Delete voucher failed', err);
          toast.error(err.response?.data?.message || 'فشل إلغاء السند');
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
    const labels = {
      paid: 'مسددة بالكامل',
      partial: 'سداد جزئي',
      unpaid: 'غير مسددة',
      pending: 'معلقة',
      draft: 'مسودة',
      approved: 'معتمد'
    };
    return <span className={`badge ${styles[status] || 'badge-warning'}`}>{labels[status] || status}</span>;
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
                        <th>رقم الفاتورة</th>
                        <th>العميل</th>
                        <th>التاريخ</th>
                        <th>القيمة الإجمالية</th>
                        <th>المتبقي</th>
                        <th>الحالة</th>
                        <th>الإجراءات</th>
                    </tr>
                    </thead>
                    <tbody>
                    {loading ? (
                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '32px' }}>جاري تحميل الفواتير...</td></tr>
                    ) : filteredInvoices.length === 0 ? (
                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>لا توجد فواتير مطابقة.</td></tr>
                    ) : filteredInvoices.map(inv => (
                        <tr key={inv.id}>
                        <td style={{ fontWeight: 700 }}>{inv.invoice_number}</td>
                        <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600 }}>{inv.customer_name || 'عميل نقدي'}</span>
                                {inv.unit_number && <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 'bold' }}>الوحدة: {inv.unit_number}</span>}
                            </div>
                        </td>
                        <td>{inv.created_at ? new Date(inv.created_at).toLocaleDateString('ar-EG') : 'N/A'}</td>
                        <td style={{ fontWeight: 700 }}>{parseFloat(inv.total_amount || 0).toLocaleString()} EGP</td>
                        <td style={{ fontWeight: 700, color: (inv.remaining_balance || 0) > 0 ? '#ef4444' : '#10b981' }}>
                            {parseFloat(inv.remaining_balance || 0).toLocaleString()} EGP
                        </td>
                        <td>{getStatusBadge(inv.status)}</td>
                        <td>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <button className="action-btn pay-btn" onClick={() => openPaymentModal(inv)} disabled={inv.status === 'paid'}>
                                    <CreditCard size={14} /> سداد
                                </button>
                                <button className="action-btn" onClick={() => navigate(`/finance/invoice-preview/${inv.id}`)}>
                                    <Download size={14} /> PDF
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
                        <th>الرقم المرجعي</th>
                        <th>العميل</th>
                        <th>المبلغ</th>
                        <th>الحالة</th>
                        <th>صالح حتى</th>
                        <th>الإجراءات</th>
                    </tr>
                    </thead>
                    <tbody>
                    {filteredQuotations.length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>لا توجد عروض أسعار.</td></tr>
                    ) : filteredQuotations.map(q => (
                        <tr key={q.id}>
                            <td style={{ fontWeight: 700 }}>QUO-{q.id}</td>
                            <td>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontWeight: 600 }}>{q.client_name || 'عميل'}</span>
                                    {q.unit_number && <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 'bold' }}>الوحدة: {q.unit_number}</span>}
                                </div>
                            </td>
                            <td style={{ fontWeight: 700 }}>{parseFloat(q.total_amount).toLocaleString()} EGP</td>
                            <td><span className={`badge ${q.status === 'approved' ? 'badge-success' : 'badge-warning'}`}>{q.status}</span></td>
                            <td>{new Date(q.valid_until).toLocaleDateString('ar-EG')}</td>
                            <td>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button className="action-btn" onClick={() => navigate(`/finance/quotation-preview/${q.id}`)}>
                                        <Download size={14} /> طباعة
                                    </button>
                                    <button
                                        className="action-btn"
                                        style={{ background: '#f3e8ff', color: '#7e22ce', border: '1px solid #ddd6fe' }}
                                        title="تحويل العرض مباشرة إلى فاتورة مبيعات"
                                        onClick={async () => {
                                            try {
                                                const res = await api.post(`/invoices/from-quotation/${q.id}`);
                                                toast.success('تم تحويل العرض إلى فاتورة بنجاح!');
                                                fetchData();
                                                if (res.data?.data?.id) {
                                                    navigate(`/finance/invoice-preview/${res.data.data.id}`);
                                                }
                                            } catch (err) {
                                                toast.error(err.response?.data?.message || 'فشل التحويل إلى فاتورة');
                                            }
                                        }}
                                    >
                                        <FileText size={14} /> إصدار فاتورة
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
                        <th>رقم السند</th>
                        <th>المستلم منه (العميل)</th>
                        <th>التاريخ</th>
                        <th>طريقة الدفع</th>
                        <th>المبلغ المقبوض</th>
                        <th>البيان / الفاتورة</th>
                        <th>الإجراءات</th>
                    </tr>
                    </thead>
                    <tbody>
                    {filteredReceipts.length === 0 ? (
                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>لا توجد سندات قبض مسجلة. اضغط على "+ سند قبض" لإصدار سند جديد.</td></tr>
                    ) : filteredReceipts.map(v => (
                        <tr key={v.id}>
                            <td style={{ fontWeight: 800, color: '#059669' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <ArrowDownLeft size={14} />
                                    <span>{v.voucher_number}</span>
                                </div>
                            </td>
                            <td style={{ fontWeight: 600 }}>{v.party_name}</td>
                            <td>{v.voucher_date ? new Date(v.voucher_date).toLocaleDateString('ar-EG') : 'N/A'}</td>
                            <td>
                                <span className="badge" style={{ background: '#ecfdf5', color: '#047857' }}>
                                    {v.payment_method === 'cash' ? 'نقدي' : v.payment_method === 'bank_transfer' ? 'تحويل بنكي' : v.payment_method === 'check' ? 'شيك' : 'بطاقة'}
                                </span>
                            </td>
                            <td style={{ fontWeight: 800, color: '#059669', fontSize: '15px' }}>
                                {parseFloat(v.amount).toLocaleString()} EGP
                            </td>
                            <td>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    {v.linked_invoice_number && <strong style={{ color: '#2563eb' }}>فاتورة {v.linked_invoice_number}: </strong>}
                                    {v.notes || 'سداد دفعة'}
                                </div>
                            </td>
                            <td>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <button 
                                        className="action-btn"
                                        style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}
                                        onClick={() => setSelectedVoucherForPreview(v)}
                                    >
                                        <Printer size={14} /> طباعة السند
                                    </button>
                                    <button 
                                        className="action-btn"
                                        style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                                        onClick={() => handleDeleteVoucher(v.id)}
                                        title="إلغاء السند"
                                    >
                                        <Trash2 size={14} />
                                    </button>
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
                        <th>رقم السند</th>
                        <th>جهة الصرف (المورد / المستفيد)</th>
                        <th>التاريخ</th>
                        <th>طريقة الدفع</th>
                        <th>المبلغ المنصرف</th>
                        <th>البيان / السبب</th>
                        <th>الإجراءات</th>
                    </tr>
                    </thead>
                    <tbody>
                    {filteredPayments.length === 0 ? (
                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>لا توجد سندات صرف مسجلة. اضغط على "+ سند صرف" لإصدار سند جديد.</td></tr>
                    ) : filteredPayments.map(v => (
                        <tr key={v.id}>
                            <td style={{ fontWeight: 800, color: '#dc2626' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <ArrowUpRight size={14} />
                                    <span>{v.voucher_number}</span>
                                </div>
                            </td>
                            <td style={{ fontWeight: 600 }}>{v.party_name}</td>
                            <td>{v.voucher_date ? new Date(v.voucher_date).toLocaleDateString('ar-EG') : 'N/A'}</td>
                            <td>
                                <span className="badge" style={{ background: '#fef2f2', color: '#b91c1c' }}>
                                    {v.payment_method === 'cash' ? 'نقدي' : v.payment_method === 'bank_transfer' ? 'تحويل بنكي' : v.payment_method === 'check' ? 'شيك' : 'بطاقة'}
                                </span>
                            </td>
                            <td style={{ fontWeight: 800, color: '#dc2626', fontSize: '15px' }}>
                                {parseFloat(v.amount).toLocaleString()} EGP
                            </td>
                            <td>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    {v.notes || 'مصروفات تشغيلية'}
                                </div>
                            </td>
                            <td>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <button 
                                        className="action-btn"
                                        style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
                                        onClick={() => setSelectedVoucherForPreview(v)}
                                    >
                                        <Printer size={14} /> طباعة السند
                                    </button>
                                    <button 
                                        className="action-btn"
                                        style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                                        onClick={() => handleDeleteVoucher(v.id)}
                                        title="إلغاء السند"
                                    >
                                        <Trash2 size={14} />
                                    </button>
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
                        <th>التاريخ</th>
                        <th>البيان / الوصف</th>
                        <th>التصنيف</th>
                        <th>المبلغ</th>
                    </tr>
                    </thead>
                    <tbody>
                    {filteredExpenses.length === 0 ? (
                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>لا توجد مصروفات مسجلة.</td></tr>
                    ) : filteredExpenses.map(e => (
                        <tr key={e.id}>
                            <td>{new Date(e.expense_date).toLocaleDateString('ar-EG')}</td>
                            <td style={{ fontWeight: 600 }}>{e.title}</td>
                            <td><span className="badge" style={{ background: '#f1f5f9', color: '#475569' }}>{e.category}</span></td>
                            <td style={{ fontWeight: 700, color: '#ef4444' }}>{parseFloat(e.amount).toLocaleString()} EGP</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
              );

          default:
              return null;
      }
  };

  return (
    <div className="finance-dashboard">
      <style>{`
        .finance-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px; }
        .btn-primary { background: var(--primary, #3b82f6); color: white; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .data-table { width: 100%; border-collapse: collapse; background: var(--bg-card); border-radius: 12px; overflow: hidden; box-shadow: var(--shadow-sm); border: 1px solid var(--glass-border); }
        .data-table th, .data-table td { padding: 16px; text-align: right; border-bottom: 1px solid var(--glass-border); }
        .data-table th { background: rgba(0,0,0,0.02); font-weight: 700; color: var(--text-muted); font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
        .data-table tr:hover { background: rgba(255,255,255,0.02); }
        .badge { padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; }
        .badge-success { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .badge-warning { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        .badge-danger { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .action-btn { background: transparent; border: 1px solid var(--glass-border); padding: 6px 12px; border-radius: 6px; cursor: pointer; color: var(--text-main); font-weight: 600; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; margin-left: 8px; transition: 0.2s; }
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
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800' }}>المركز المالي (Financial Hub)</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>إدارة شاملة للفواتير، سندات القبض والصرف، والمصروفات التشغيلية.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="action-btn" style={{ borderColor: '#10b981', color: '#10b981' }} onClick={() => { setQuickActionType('Receipt Voucher'); setShowQuickAction(true); }}>
                <Plus size={16} /> سند قبض
            </button>
            <button className="action-btn" style={{ borderColor: '#ef4444', color: '#ef4444' }} onClick={() => { setQuickActionType('Payment Voucher'); setShowQuickAction(true); }}>
                <Plus size={16} /> سند صرف
            </button>
            <button className="action-btn" style={{ borderColor: '#f59e0b', color: '#f59e0b' }} onClick={() => { setQuickActionType('Expense'); setShowQuickAction(true); }}>
                <Plus size={16} /> مصروف جديد
            </button>
            <button className="action-btn" style={{ borderColor: '#6366f1', color: '#6366f1' }} onClick={() => { setQuickActionType('Quotation'); setShowQuickAction(true); }}>
                <Plus size={16} /> عرض سعر
            </button>
            <button className="btn-primary" onClick={() => { setQuickActionType('Invoice'); setShowQuickAction(true); }}>
                <Plus size={18} /> فاتورة جديدة
            </button>
        </div>
      </div>

      {/* KPI Cards Summary */}
      <div className="kpi-grid">
        <div className="kpi-card">
            <div>
                <span className="kpi-title">إجمالي المقبوضات المحصلة</span>
                <div className="kpi-val" style={{ color: '#10b981' }}>
                    {parseFloat(summaryStats?.totalIncome || 0).toLocaleString()} <span style={{ fontSize: '12px' }}>EGP</span>
                </div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                <ArrowDownLeft size={22} />
            </div>
        </div>

        <div className="kpi-card">
            <div>
                <span className="kpi-title">إجمالي المصروفات المدفوعة</span>
                <div className="kpi-val" style={{ color: '#ef4444' }}>
                    {parseFloat(summaryStats?.totalExpenses || 0).toLocaleString()} <span style={{ fontSize: '12px' }}>EGP</span>
                </div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                <ArrowUpRight size={22} />
            </div>
        </div>

        <div className="kpi-card">
            <div>
                <span className="kpi-title">المبالغ المستحقة (ديون السوق)</span>
                <div className="kpi-val" style={{ color: '#f59e0b' }}>
                    {parseFloat(summaryStats?.totalOutstanding || 0).toLocaleString()} <span style={{ fontSize: '12px' }}>EGP</span>
                </div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                <Clock size={22} />
            </div>
        </div>

        <div className="kpi-card">
            <div>
                <span className="kpi-title">صافي التدفق النقدي (Net Cashflow)</span>
                <div className="kpi-val" style={{ color: (summaryStats?.netCashflow || 0) >= 0 ? '#3b82f6' : '#ef4444' }}>
                    {parseFloat(summaryStats?.netCashflow || 0).toLocaleString()} <span style={{ fontSize: '12px' }}>EGP</span>
                </div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                <Wallet size={22} />
            </div>
        </div>
      </div>

      {/* Tabs & Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
        <div className="tabs-nav" style={{ marginBottom: 0 }}>
            {[
                { id: 'Invoices', label: 'الفواتير (Invoices)', icon: <FileText size={16} /> },
                { id: 'Receipts', label: 'سندات القبض (Receipt Vouchers)', icon: <ArrowDownLeft size={16} /> },
                { id: 'Payments', label: 'سندات الصرف (Payment Vouchers)', icon: <ArrowUpRight size={16} /> },
                { id: 'Expenses', label: 'المصروفات (Expenses)', icon: <DollarSign size={16} /> },
                { id: 'Quotations', label: 'عروض الأسعار (Quotations)', icon: <Receipt size={16} /> }
            ].map(tab => (
                <div 
                  key={tab.id} 
                  className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                    {tab.icon}
                    {tab.label}
                </div>
            ))}
        </div>

        <div style={{ position: 'relative', minWidth: '260px' }}>
            <Search size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
                type="text"
                placeholder="بحث برقم السند، العميل، الفاتورة..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                    width: '100%',
                    padding: '8px 36px 8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--glass-border)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-main)',
                    fontSize: '13px'
                }}
            />
        </div>
      </div>

      {renderTabContent()}

      {/* Payment Registration Modal */}
      {showPaymentModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)'}}>
              <div style={{ background: 'var(--bg-card)', padding: '32px', borderRadius: '16px', width: '440px', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--glass-border)', direction: 'rtl' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 800 }}>تسجيل دفعة على فاتورة وإصدار سند قبض</h3>
                  
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid var(--glass-border)' }}>
                     <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                         فاتورة رقم: <strong>{selectedInvoice?.invoice_number}</strong>
                     </p>
                     <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                         العميل: <strong>{selectedInvoice?.customer_name || 'عميل نقدي'}</strong>
                     </p>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed var(--glass-border)', paddingTop: '8px' }}>
                         <span style={{ fontWeight: 600 }}>المبلغ المتبقي:</span>
                         <span style={{ fontSize: '18px', fontWeight: 900, color: '#ef4444' }}>{parseFloat(selectedInvoice?.remaining_balance || 0).toLocaleString()} EGP</span>
                     </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>المبلغ المدفوع (EGP)</label>
                      <input 
                         type="number" 
                         value={paymentAmount}
                         onChange={(e) => setPaymentAmount(e.target.value)}
                         max={selectedInvoice?.remaining_balance}
                         style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)', fontSize: '16px', fontWeight: 'bold' }}
                      />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>طريقة الدفع</label>
                      <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}>
                          <option value="cash" style={{color:'black'}}>نقداً (Cash)</option>
                          <option value="bank_transfer" style={{color:'black'}}>تحويل بنكي (Bank Transfer)</option>
                          <option value="card" style={{color:'black'}}>بطاقة دفع إلكتروني (Card)</option>
                          <option value="check" style={{color:'black'}}>شيك بنكي (Cheque)</option>
                      </select>
                  </div>
                  
                  <div style={{ marginBottom: '24px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>ملاحظات / البيان</label>
                      <input 
                         type="text" 
                         value={paymentNotes}
                         onChange={(e) => setPaymentNotes(e.target.value)}
                         placeholder="مثال: دفعة تحت الحساب بشيك رقم..."
                         style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                      />
                  </div>

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setShowPaymentModal(false)} className="action-btn" disabled={isSubmitting}>إلغاء</button>
                      <button onClick={handlePaymentSubmit} className="btn-primary" disabled={isSubmitting}>
                          {isSubmitting ? 'جاري السداد...' : 'تأكيد السداد وطباعة السند'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Quick Action Modal (Invoice, Quotation, Voucher, Expense) */}
      {showQuickAction && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)'}}>
              <div style={{ background: 'var(--bg-card)', padding: '32px', borderRadius: '16px', width: '640px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--glass-border)', direction: 'rtl' }}>
                  <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '800' }}>
                      {quickActionType === 'Receipt Voucher' ? 'إصدار سند قبض جديد (Receipt Voucher)' :
                       quickActionType === 'Payment Voucher' ? 'إصدار سند صرف جديد (Payment Voucher)' :
                       quickActionType === 'Expense' ? 'تسجيل مصروف جديد' :
                       quickActionType === 'Quotation' ? 'إصدار عرض سعر' : 'إصدار فاتورة جديدة'}
                  </h3>

                  <form onSubmit={handleQuickActionSubmit}>
                      {/* Vouchers Specific Fields */}
                      {(quickActionType === 'Receipt Voucher' || quickActionType === 'Payment Voucher') ? (
                          <>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '12px', marginBottom: '16px' }}>
                                  <div>
                                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>نوع الطرف</label>
                                      <select 
                                          value={formData.party_type} 
                                          onChange={e => setFormData({ ...formData, party_type: e.target.value })}
                                          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                      >
                                          <option value="customer" style={{color:'black'}}>عميل (Customer)</option>
                                          <option value="vendor" style={{color:'black'}}>مورد (Vendor)</option>
                                          <option value="employee" style={{color:'black'}}>موظف (Employee)</option>
                                          <option value="other" style={{color:'black'}}>طرف آخر (Other)</option>
                                      </select>
                                  </div>
                                  <div>
                                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                                          {quickActionType === 'Receipt Voucher' ? 'استلمنا من السيد/السادة' : 'يُصرف للسيد/السادة'}
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
                                              <option value="">-- اختر العميل --</option>
                                              {customers.map(c => <option key={c.id} value={c.id} style={{color:'black'}}>{c.name}</option>)}
                                          </select>
                                      ) : (
                                          <input 
                                              type="text" 
                                              required
                                              value={formData.party_name}
                                              onChange={e => setFormData({ ...formData, party_name: e.target.value })}
                                              placeholder="اسم الشخص أو الشركة..."
                                              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                          />
                                      )}
                                  </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                  <div>
                                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>المبلغ (EGP)</label>
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
                                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>تاريخ السند</label>
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
                                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>طريقة الدفع</label>
                                      <select 
                                          value={formData.payment_method} 
                                          onChange={e => setFormData({ ...formData, payment_method: e.target.value })}
                                          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                      >
                                          <option value="cash" style={{color:'black'}}>نقداً (Cash)</option>
                                          <option value="bank_transfer" style={{color:'black'}}>تحويل بنكي (Bank Transfer)</option>
                                          <option value="check" style={{color:'black'}}>شيك بنكي (Cheque)</option>
                                          <option value="card" style={{color:'black'}}>بطاقة دفع إلكتروني (Card)</option>
                                      </select>
                                  </div>
                                  <div>
                                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>الخزينة / الحساب البنكي</label>
                                      <input 
                                          type="text" 
                                          value={formData.treasury_account}
                                          onChange={e => setFormData({ ...formData, treasury_account: e.target.value })}
                                          placeholder="الخزينة الرئيسية أو اسم البنك"
                                          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                      />
                                  </div>
                              </div>

                              <div style={{ marginBottom: '16px' }}>
                                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>رقم المرجع / رقم الشيك (اختياري)</label>
                                  <input 
                                      type="text" 
                                      value={formData.reference_no}
                                      onChange={e => setFormData({ ...formData, reference_no: e.target.value })}
                                      placeholder="رقم التحويل أو الشيك..."
                                      style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                  />
                              </div>

                              <div style={{ marginBottom: '24px' }}>
                                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>البيان / مقابل ماذا؟</label>
                                  <input 
                                      type="text" 
                                      value={formData.title}
                                      onChange={e => setFormData({ ...formData, title: e.target.value })}
                                      placeholder={quickActionType === 'Receipt Voucher' ? 'مثال: دفعة تحت حساب تعاقد رقم...' : 'مثال: سداد مستحقات توريد بضاعة...'}
                                      style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                  />
                              </div>
                          </>
                      ) : (
                          <>
                              <div style={{ marginBottom: '16px' }}>
                                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                                      {quickActionType === 'Expense' ? 'عنوان المصروف' : 'العميل'}
                                  </label>
                                  {(quickActionType === 'Invoice' || quickActionType === 'Quotation') ? (
                                      <div style={{ display: 'flex', gap: '12px' }}>
                                        <select 
                                          required
                                          value={formData.customer_id} 
                                          onChange={e => setFormData({...formData, customer_id: e.target.value})}
                                          style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                        >
                                            <option value="">-- اختر العميل --</option>
                                            {customers.map(c => <option key={c.id} value={c.id} style={{color:'black'}}>{c.name}</option>)}
                                        </select>
                                        {isRealEstate && (
                                            <select 
                                              value={formData.unit_id || ''} 
                                              onChange={e => setFormData({...formData, unit_id: e.target.value})}
                                              style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                            >
                                                <option value="">-- اختر الوحدة --</option>
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
                                          placeholder="مثال: فاتورة كهرباء، صيانة خوادم، إيجار المكتب..."
                                          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                      />
                                  )}
                              </div>

                              {(quickActionType === 'Invoice' || quickActionType === 'Quotation') ? (
                                  <div style={{ marginBottom: '16px' }}>
                                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>بنود الفاتورة / العرض</label>
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
                                                  <option value="">-- ربط بمنتج --</option>
                                                  {products.map(p => <option key={p.id} value={p.id} style={{color:'black'}}>{p.name}</option>)}
                                              </select>
                                              <input 
                                                type="text"
                                                placeholder="الخدمة أو البند"
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
                                                placeholder="الكمية"
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
                                                placeholder="السعر"
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
                                      <button type="button" onClick={() => setFormData({ ...formData, items: [...formData.items, { product_id: '', quantity: 1, unit_price: 0 }] })} style={{ fontSize: '11px', color: 'var(--primary)', background: 'transparent', border: '1px dashed var(--primary)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>+ إضافة بند</button>
                                  </div>
                              ) : (
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                      <div>
                                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>المبلغ (EGP)</label>
                                          <input 
                                              type="number" 
                                              required
                                              value={formData.amount}
                                              onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}
                                          />
                                      </div>
                                      <div>
                                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>التاريخ</label>
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
                                   <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>تاريخ الاستحقاق / الصلاحية</label>
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
                                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>تصنيف المصروف</label>
                                      <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)' }}>
                                          <option value="General" style={{color:'black'}}>مصروفات عامة (General)</option>
                                          <option value="Marketing" style={{color:'black'}}>تسويق ودعاية (Marketing)</option>
                                          <option value="Rent" style={{color:'black'}}>إيجارات ومقرات (Rent)</option>
                                          <option value="Salaries" style={{color:'black'}}>رواتب ومكافآت (Salaries)</option>
                                          <option value="Utilities" style={{color:'black'}}>مرافق وكهرباء واتصالات (Utilities)</option>
                                          <option value="Maintenance" style={{color:'black'}}>صيانة وتشغيل (Maintenance)</option>
                                      </select>
                                  </div>
                              )}
                          </>
                      )}

                      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                          <button type="button" onClick={() => setShowQuickAction(false)} className="action-btn" style={{ flex: 1, justifyContent: 'center' }}>إلغاء</button>
                          <button type="submit" className="btn-primary" style={{ flex: 2, justifyContent: 'center' }} disabled={isSubmitting}>
                              {isSubmitting ? 'جاري الحفظ...' : `حفظ وتأكيد`}
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
    </div>
  );
};

export default FinanceDashboard;

