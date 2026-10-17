import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Plus, Users, Phone, MapPin, Hash, FileText, Search, CheckCircle, XCircle, AlertTriangle, Printer, X, ChevronDown, Eye, Download, Building2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useLanguage } from '../../context/LanguageContext';
import { exportCustomersToExcel } from '../../utils/excelExport';
import ActivityTimeline from '../../components/Common/ActivityTimeline';

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

// ─── Statement Modal ──────────────────────────────────────────────────────────
const StatementModal = ({ customer, onClose }) => {
  const { t, isRTL } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/customers/${customer.id}/statement`)
      .then(res => setData(res.data.data))
      .catch(() => toast.error(t('customers.failedLoadStatement', 'Failed to load statement')))
      .finally(() => setLoading(false));
  }, [customer.id, t]);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const html = document.getElementById('statement-content').innerHTML;
    printWindow.document.write(`
      <html><head><title>${t('customers.accountStatement', 'Statement')} - ${customer.name}</title>
      <style>
        body { font-family: Cairo, Arial, sans-serif; direction: ${isRTL ? 'rtl' : 'ltr'}; padding: 24px; color: #1e293b; }
        h1 { color: #4f46e5; border-bottom: 2px solid #4f46e5; padding-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th { background: #f1f5f9; padding: 10px; text-align: ${isRTL ? 'right' : 'left'}; font-size: 13px; border: 1px solid #e2e8f0; }
        td { padding: 10px; border: 1px solid #e2e8f0; font-size: 13px; text-align: ${isRTL ? 'right' : 'left'}; }
        .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; }
        .summary-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0; }
        .balance { color: #ef4444; font-weight: 800; font-size: 18px; }
        .num-en { font-variant-numeric: tabular-nums; direction: ltr; display: inline-block; }
        @media print { .no-print { display: none; } }
      </style></head><body>${html}</body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '780px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', direction: isRTL ? 'rtl' : 'ltr' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
          <div>
            <h2 style={{ margin: 0, color: 'white', fontSize: '18px', fontWeight: 800 }}>{t('customers.accountStatement', 'Customer Account Statement')}</h2>
            <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.8)', fontSize: '13px' }}>{customer.name}</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handlePrint} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '10px', padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '13px' }}>
              <Printer size={15} /> {t('customers.print', 'Print')}
            </button>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>{t('common.loading', 'Loading...')}</div>
          ) : !data ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>{t('customers.failedLoadStatement', 'Failed to load statement data')}</div>
          ) : (
            <div id="statement-content">
              <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#1e293b', marginBottom: '4px' }}>{t('customers.accountStatement', 'Account Statement')}</h1>
              <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '14px' }}>
                {t('customers.customerLabel', 'Customer')}: <strong>{data.customer.name}</strong> &nbsp;|&nbsp; 
                {t('customers.phoneLabel', 'Phone')}: <strong className="num-en" style={{ direction: 'ltr', display: 'inline-block' }}>{data.customer.phone || '—'}</strong> &nbsp;|&nbsp;
                {t('customers.printDate', 'Print Date:')} <strong className="num-en">{new Date().toLocaleDateString('en-GB')}</strong>
              </p>

              {/* Summary Box */}
              <div className="summary-box" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px' }}>
                  {[
                    { label: t('customers.totalInvoiced', 'Total Invoiced'), value: data.summary.total_invoiced, color: '#4f46e5' },
                    { label: t('customers.totalPaid', 'Total Paid'), value: data.summary.total_paid, color: '#10b981' },
                    { label: t('customers.outstandingBalance', 'Outstanding Balance'), value: data.summary.balance, color: data.summary.balance > 0 ? '#ef4444' : '#10b981' },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: 'center', padding: '12px', background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: s.color }}>
                        <span className="num-en">{fmt(s.value)}</span> <span style={{ fontSize: '12px', fontWeight: 700 }}>{t('common.currency', 'EGP')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Invoices */}
              {data.invoices.length > 0 && (
                <>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #e2e8f0' }}>📄 {t('customers.invoicesTitle', 'Invoices')}</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
                    <thead><tr style={{ background: '#f1f5f9' }}>
                      {[t('customers.invoiceNumber', 'Invoice #'), t('customers.deal', 'Deal'), t('customers.total', 'Total'), t('common.status', 'Status'), t('customers.dueDate', 'Due Date')].map(h => (
                        <th key={h} style={{ padding: '10px', textAlign: isRTL ? 'right' : 'left', fontSize: '12px', border: '1px solid #e2e8f0', fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {data.invoices.map(inv => (
                        <tr key={inv.id}>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', fontWeight: 700, textAlign: isRTL ? 'right' : 'left' }}>
                            <span className="num-en">{inv.invoice_number}</span>
                          </td>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', color: '#64748b', textAlign: isRTL ? 'right' : 'left' }}>{inv.deal_title || '—'}</td>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', fontWeight: 700, color: '#4f46e5', textAlign: isRTL ? 'right' : 'left' }}>
                            <span className="num-en">{fmt(inv.total_amount)}</span> <span style={{ fontSize: '11px' }}>{t('common.currency', 'EGP')}</span>
                          </td>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', textAlign: isRTL ? 'right' : 'left' }}>
                            <span style={{ background: inv.status === 'paid' ? '#dcfce7' : '#fef2f2', color: inv.status === 'paid' ? '#16a34a' : '#dc2626', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                              {inv.status === 'paid' ? t('customers.paid', 'Paid') : inv.status === 'partial' ? t('customers.partial', 'Partial') : t('customers.unpaid', 'Unpaid')}
                            </span>
                          </td>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', color: '#64748b', textAlign: isRTL ? 'right' : 'left' }}>
                            <span className="num-en">{fmtDate(inv.due_date)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {/* Payments */}
              {data.payments.length > 0 && (
                <>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #e2e8f0' }}>💳 {t('customers.paymentsTitle', 'Payments')}</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
                    <thead><tr style={{ background: '#f1f5f9' }}>
                      {[t('customers.invoiceNumber', 'Invoice #'), t('customers.amount', 'Amount'), t('customers.method', 'Method'), t('common.date', 'Date'), t('customers.notes', 'Notes')].map(h => (
                        <th key={h} style={{ padding: '10px', textAlign: isRTL ? 'right' : 'left', fontSize: '12px', border: '1px solid #e2e8f0', fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {data.payments.map(p => (
                        <tr key={p.id}>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', color: '#64748b', textAlign: isRTL ? 'right' : 'left' }}>
                            <span className="num-en">{p.invoice_number}</span>
                          </td>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', fontWeight: 700, color: '#10b981', textAlign: isRTL ? 'right' : 'left' }}>
                            <span className="num-en">{fmt(p.amount)}</span> <span style={{ fontSize: '11px' }}>{t('common.currency', 'EGP')}</span>
                          </td>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', color: '#64748b', textAlign: isRTL ? 'right' : 'left' }}>{p.payment_method || '—'}</td>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', color: '#64748b', textAlign: isRTL ? 'right' : 'left' }}>
                            <span className="num-en">{fmtDate(p.payment_date)}</span>
                          </td>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '12px', textAlign: isRTL ? 'right' : 'left' }}>{p.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {data.invoices.length === 0 && data.payments.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', background: '#f8fafc', borderRadius: '12px' }}>
                  {t('customers.noTransactions', 'No transactions recorded for this customer')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ─────────────────────────────────────────────────────────────────
const ContactsCustomers = () => {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const { 
    customers, fetchCustomers, 
    leadSources, fetchLeadSources, 
    customerClassifications, fetchCustomerClassifications, 
    customerAreas, fetchCustomerAreas,
    users, fetchUsers,
    loading 
  } = useData();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all | active | blacklisted
  const [sourceFilter, setSourceFilter] = useState('all');
  const [classificationFilter, setClassificationFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const [statementCustomer, setStatementCustomer] = useState(null);
  const [saving, setSaving] = useState(false);

  // Quick Classification Modal
  const [showQuickClassificationModal, setShowQuickClassificationModal] = useState(false);
  const [newClassificationName, setNewClassificationName] = useState('');
  const [newClassificationColor, setNewClassificationColor] = useState('#6366f1');
  const [savingClassification, setSavingClassification] = useState(false);

  // Quick Area Modal
  const [showQuickAreaModal, setShowQuickAreaModal] = useState(false);
  const [newAreaName, setNewAreaName] = useState('');
  const [newAreaColor, setNewAreaColor] = useState('#0ea5e9');
  const [savingArea, setSavingArea] = useState(false);

  const emptyForm = { name: '', phone: '', address: '', tax_no: '', reg_no: '', source_id: '', classification_id: '', area_id: '', assigned_to: '', is_active: true, is_blacklisted: false };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetchCustomers();
    if (leadSources.length === 0) fetchLeadSources();
    if (!customerClassifications || customerClassifications.length === 0) fetchCustomerClassifications();
    if (!customerAreas || customerAreas.length === 0) fetchCustomerAreas();
    if (!users || users.length === 0) fetchUsers();
  }, []);

  // Only show general customers (not RE vendors/brokers)
  const allCustomers = customers.filter(c => c.entity_type === 'customer' || !c.entity_type);

  const filtered = allCustomers.filter(c => {
    const q = search.toLowerCase().trim();
    const matchSearch = !q || 
      c.name?.toLowerCase().includes(q) || 
      c.phone?.includes(q) ||
      c.meta_form_name?.toLowerCase().includes(q) ||
      c.company_name?.toLowerCase().includes(q) ||
      c.notes?.toLowerCase().includes(q) ||
      c.address?.toLowerCase().includes(q) ||
      c.linked_unit_number?.toLowerCase().includes(q) ||
      c.linked_unit_name?.toLowerCase().includes(q) ||
      c.pf_listing_reference?.toLowerCase().includes(q);

    const matchStatus = filterStatus === 'all' || 
      (filterStatus === 'active' && c.is_active && !c.is_blacklisted) || 
      (filterStatus === 'blacklisted' && c.is_blacklisted);

    const matchSource = sourceFilter === 'all' || 
      (sourceFilter === 'direct' && (!c.source_id || c.source_name === 'Direct')) ||
      String(c.source_id) === String(sourceFilter) ||
      c.source_name?.toLowerCase() === sourceFilter.toLowerCase();

    const matchClassification = classificationFilter === 'all' ||
      (classificationFilter === 'unclassified' ? !c.classification_id : String(c.classification_id) === String(classificationFilter));

    const matchArea = areaFilter === 'all' ||
      (areaFilter === 'no_area' ? !c.area_id : String(c.area_id) === String(areaFilter));

    const matchAssignee = assigneeFilter === 'all' ||
      (assigneeFilter === 'unassigned' ? !c.assigned_to : String(c.assigned_to) === String(assigneeFilter));

    return matchSearch && matchStatus && matchSource && matchClassification && matchArea && matchAssignee;
  });

  const openAdd = () => { setEditingCustomer(null); setForm(emptyForm); setIsModalOpen(true); };
  const openEdit = (c) => {
    setEditingCustomer(c);
    setForm({ 
      name: c.name || '', 
      phone: c.phone || '', 
      address: c.address || '', 
      tax_no: c.tax_no || '', 
      reg_no: c.reg_no || '', 
      source_id: c.source_id || '', 
      classification_id: c.classification_id || '',
      area_id: c.area_id || '',
      assigned_to: c.assigned_to || '',
      is_active: c.is_active !== false, 
      is_blacklisted: c.is_blacklisted === true 
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error(t('customers.customerNameRequired', 'Customer name is required'));
    setSaving(true);
    try {
      const payload = { 
        ...form, 
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        classification_id: form.classification_id ? Number(form.classification_id) : null,
        area_id: form.area_id ? Number(form.area_id) : null,
        entity_type: 'customer', 
        status: 'customer' 
      };
      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer.id}`, payload);
        toast.success(t('customers.customerUpdated', 'Customer updated successfully'));
      } else {
        await api.post('/customers', payload);
        toast.success(t('customers.customerAdded', 'Customer added successfully'));
      }
      setIsModalOpen(false);
      fetchCustomers(false);
    } catch (err) {
      toast.error(err.response?.data?.message || t('common.errorOccurred', 'An error occurred'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('customers.confirmDeleteCustomer', 'Are you sure you want to delete this customer?'))) return;
    try {
      await api.delete(`/customers/${id}`);
      toast.success(t('customers.customerDeleted', 'Customer deleted successfully'));
      fetchCustomers(false);
    } catch { toast.error(t('customers.failedToDelete', 'Failed to delete customer')); }
  };

  const inputStyle = { width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', fontWeight: 600, outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box', background: '#fafafa' };

  return (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto', direction: isRTL ? 'rtl' : 'ltr' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#1e293b', margin: 0, letterSpacing: '-0.02em' }}>{t('customers.title', 'Customers')}</h1>
          <p style={{ color: '#64748b', margin: '6px 0 0', fontSize: '14px', fontWeight: 600 }}>
            <span className="num-en">{filtered.length}</span> {t('customers.customerCount', 'customers').replace('{count}', '').trim()} {filterStatus !== 'all' ? `(${filterStatus === 'active' ? t('customers.filterActive', 'Active') : t('customers.filterBlacklisted', 'Blacklisted')})` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button 
            onClick={() => exportCustomersToExcel(filtered, `customers_${new Date().toISOString().slice(0,10)}`)}
            style={{ 
              background: '#ecfdf5', color: '#059669', border: '1.5px solid #a7f3d0', 
              borderRadius: '12px', padding: '12px 20px', cursor: 'pointer', 
              fontWeight: 800, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' 
            }}
            title={t('customers.exportExcelTitle', 'Export filtered customers to Excel')}
          >
            <Download size={18} /> {t('customers.exportExcel', 'Export Excel')}
          </button>
          <button onClick={openAdd} style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white', border: 'none', borderRadius: '12px', padding: '12px 22px', cursor: 'pointer', fontWeight: 800, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(79,70,229,0.35)' }}>
            <Plus size={18} /> {t('customers.addCustomer', 'Add Customer')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', [isRTL ? 'left' : 'right']: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('customers.searchPlaceholderContacts', 'Search by name, phone, form name, or notes...')}
            style={{ ...inputStyle, [isRTL ? 'paddingLeft' : 'paddingRight']: '38px' }}
          />
        </div>

        <select 
          value={sourceFilter} 
          onChange={e => setSourceFilter(e.target.value)} 
          style={{ ...inputStyle, width: 'auto', minWidth: '180px' }}
        >
          <option value="all">{t('customers.allSources', 'All Sources')}</option>
          {leadSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          <option value="direct">{t('customers.directOther', 'Direct / Other')}</option>
        </select>

        <select 
          value={classificationFilter} 
          onChange={e => setClassificationFilter(e.target.value)} 
          style={{ ...inputStyle, width: 'auto', minWidth: '180px' }}
        >
          <option value="all">{t('customers.allClassifications', 'All Classifications')}</option>
          <option value="unclassified">{t('customers.unclassified', 'Unclassified')}</option>
          {customerClassifications.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
        </select>

        <select 
          value={areaFilter} 
          onChange={e => setAreaFilter(e.target.value)} 
          style={{ ...inputStyle, width: 'auto', minWidth: '180px' }}
        >
          <option value="all">{t('customers.allAreas', 'All Areas')}</option>
          <option value="no_area">{t('customers.noArea', 'No Area')}</option>
          {(customerAreas || []).map(a => <option key={a.id} value={a.id}>📍 {a.name}</option>)}
        </select>

        <select 
          value={assigneeFilter} 
          onChange={e => setAssigneeFilter(e.target.value)} 
          style={{ ...inputStyle, width: 'auto', minWidth: '180px' }}
        >
          <option value="all">{t('customers.allEmployees', 'All Employees')}</option>
          <option value="unassigned">{t('customers.unassigned', 'Unassigned')}</option>
          {(users || []).map(u => <option key={u.id} value={u.id}>👤 {u.name}</option>)}
        </select>

        {['all', 'active', 'blacklisted'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '10px 18px', borderRadius: '10px', border: '1.5px solid', borderColor: filterStatus === s ? '#4f46e5' : '#e2e8f0', background: filterStatus === s ? '#4f46e5' : 'white', color: filterStatus === s ? 'white' : '#64748b', fontWeight: 700, fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s' }}>
            {s === 'all' ? t('customers.filterAll', 'All') : s === 'active' ? `✅ ${t('customers.filterActive', 'Active')}` : `⛔ ${t('customers.filterBlacklisted', 'Blacklisted')}`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.04)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>{t('common.loading', 'Loading...')}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
            <Users size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
            <p style={{ fontWeight: 700, margin: 0 }}>{t('customers.noCustomersFound', 'No customers found')}</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {[t('customers.customerName', 'Name'), t('customers.classification', 'Classification'), t('customers.area', 'Area'), t('customers.phone', 'Phone'), t('customers.address', 'Address'), t('customers.taxNo', 'Tax ID'), t('customers.regNo', 'Commercial Reg'), t('customers.source', 'Source'), t('common.status', 'Status'), t('common.actions', 'Actions')].map(h => (
                  <th key={h} style={{ padding: '14px 16px', textAlign: isRTL ? 'right' : 'left', fontSize: '11px', fontWeight: 800, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafbfc', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'white' : '#fafbfc'}
                >
                  <td style={{ padding: '14px 16px', fontWeight: 800, color: '#1e293b', fontSize: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', fontWeight: 900, flexShrink: 0 }}>
                        {c.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div>{c.name}</div>
                        {c.company_name && <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{c.company_name}</div>}
                        {c.assigned_to_name && c.assigned_to_name !== 'Unassigned' ? (
                          <div style={{ fontSize: '11px', color: '#4f46e5', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                            👤 {c.assigned_to_name}
                          </div>
                        ) : (
                          <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', marginTop: '2px' }}>
                            {t('customers.unassigned', 'Unassigned')}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {c.classification_name ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '3px 10px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: `${c.classification_color || '#6366f1'}15`,
                        color: c.classification_color || '#6366f1',
                        border: `1px solid ${c.classification_color || '#6366f1'}35`
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: c.classification_color || '#6366f1' }}></span>
                        {c.classification_name}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {c.area_name ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 10px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: `${c.area_color || '#0ea5e9'}15`,
                        color: c.area_color || '#0ea5e9',
                        border: `1px solid ${c.area_color || '#0ea5e9'}35`
                      }}>
                        <MapPin size={11} />
                        {c.area_name}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', color: '#1e293b', fontWeight: 700, fontSize: '13px' }}>
                    <span className="num-en" style={{ direction: 'ltr', display: 'inline-block' }}>{c.phone || '—'}</span>
                  </td>
                  <td style={{ padding: '14px 16px', color: '#475569', fontSize: '13px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.address || '—'}</td>
                  <td style={{ padding: '14px 16px', color: '#475569', fontSize: '13px' }}>
                    <span className="num-en">{c.tax_no || '—'}</span>
                  </td>
                  <td style={{ padding: '14px 16px', color: '#475569', fontSize: '13px' }}>
                    <span className="num-en">{c.reg_no || '—'}</span>
                  </td>
                  <td style={{ padding: '14px 16px', color: '#475569', fontSize: '13px' }}>
                    <div style={{ fontWeight: 700 }}>{c.source_name || '—'}</div>
                    {c.meta_form_name && (
                      <div style={{ fontSize: '11px', color: '#4f46e5', fontWeight: 700, marginTop: '2px', background: '#eef2ff', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}>
                        📋 {c.meta_form_name}
                      </div>
                    )}
                    {c.linked_unit_id && (c.linked_unit_number || c.linked_unit_name) && (
                      <div
                        onClick={() => c.linked_deal_id && navigate(`/deals?deal_id=${c.linked_deal_id}`)}
                        style={{ fontSize: '11px', color: '#0369a1', fontWeight: 800, marginTop: '4px', background: '#f0f9ff', border: '1px solid #bae6fd', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: c.linked_deal_id ? 'pointer' : 'default' }}
                        title={c.linked_unit_name || c.linked_unit_number}
                      >
                        <Building2 size={11} />
                        <span className="num-en">{c.linked_unit_number || c.linked_unit_name}</span>
                        {c.linked_deal_stage && <span style={{ color: '#4f46e5' }}>({c.linked_deal_stage})</span>}
                      </div>
                    )}
                    {!c.linked_unit_id && c.pf_listing_reference && (
                      <div
                        onClick={() => c.linked_deal_id && navigate(`/deals?deal_id=${c.linked_deal_id}`)}
                        style={{ fontSize: '11px', color: '#b45309', fontWeight: 700, marginTop: '4px', background: '#fffbeb', border: '1px solid #fde68a', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: c.linked_deal_id ? 'pointer' : 'default' }}
                      >
                        <Building2 size={11} />
                        <span>PF: <span className="num-en">{c.pf_listing_reference}</span></span>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {c.is_blacklisted ? (
                        <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>⛔ {t('customers.filterBlacklisted', 'Blacklisted')}</span>
                      ) : c.is_active !== false ? (
                        <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>✅ {t('customers.filterActive', 'Active')}</span>
                      ) : (
                        <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>{t('customers.statusInactive', 'Inactive')}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {c.linked_deal_id && (
                        <button
                          onClick={() => navigate(`/deals?deal_id=${c.linked_deal_id}`)}
                          title={isRTL ? 'فتح الصفقة / ربط الوحدة' : 'Open Deal / Link Unit'}
                          style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Building2 size={14} /> {isRTL ? 'الصفقة / الوحدة' : 'Deal'}
                        </button>
                      )}
                      <button onClick={() => setViewingCustomer(c)} title={t('customers.viewDetails', 'View Details')} style={{ background: 'rgba(79, 70, 229, 0.1)', color: '#4f46e5', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Eye size={14} /> {t('customers.view', 'View')}
                      </button>
                      <button onClick={() => setStatementCustomer(c)} title={t('customers.statement', 'Statement')} style={{ background: '#f0f4ff', color: '#4f46e5', border: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                        📊 {t('customers.statementBtn', 'Statement')}
                      </button>
                      <button onClick={() => openEdit(c)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>{t('common.edit', 'Edit')}</button>
                      <button onClick={() => handleDelete(c.id)} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>{t('common.delete', 'Delete')}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.2)', direction: isRTL ? 'rtl' : 'ltr' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', borderRadius: '20px 20px 0 0' }}>
              <h3 style={{ margin: 0, color: 'white', fontWeight: 800 }}>{editingCustomer ? t('customers.editCustomer', 'Edit Customer') : t('customers.addCustomer', 'Add New Customer')}</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Name */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>{t('customers.fullName', 'Full Name')} *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('customers.customerName', 'Customer name')} style={inputStyle} required />
              </div>
              {/* Phone */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>{t('customers.phone', 'Phone Number')}</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="01xxxxxxxxx" style={inputStyle} />
              </div>
              {/* Address */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>{t('customers.address', 'Address')}</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder={t('customers.address', 'Full address')} style={inputStyle} />
              </div>
              {/* Tax & Reg */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>{t('customers.taxNo', 'Tax Registration No.')}</label>
                  <input value={form.tax_no} onChange={e => setForm(f => ({ ...f, tax_no: e.target.value }))} placeholder="123456789" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>{t('customers.regNo', 'Commercial Reg. No.')}</label>
                  <input value={form.reg_no} onChange={e => setForm(f => ({ ...f, reg_no: e.target.value }))} placeholder="987654321" style={inputStyle} />
                </div>
              </div>
              {/* Lead Source & Classification */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>{t('customers.source', 'Lead Source')}</label>
                  <select value={form.source_id} onChange={e => setForm(f => ({ ...f, source_id: e.target.value }))} style={inputStyle}>
                    <option value="">{t('customers.noSource', '-- Select Source --')}</option>
                    {leadSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: '#374151' }}>{t('customers.classification', 'Classification')}</label>
                    <button 
                      type="button" 
                      onClick={() => setShowQuickClassificationModal(true)}
                      style={{ 
                        background: 'none', border: 'none', color: '#4f46e5', 
                        fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: 0,
                        display: 'flex', alignItems: 'center', gap: '2px'
                      }}
                    >
                      <Plus size={13} /> {t('customers.addNew', 'Add New')}
                    </button>
                  </div>
                  <select value={form.classification_id} onChange={e => setForm(f => ({ ...f, classification_id: e.target.value }))} style={inputStyle}>
                    <option value="">{t('customers.noClassification', '-- No Classification (Optional) --')}</option>
                    {customerClassifications.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Area / المنطقة */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={14} color="#0ea5e9" /> {t('customers.area', 'Area')}
                  </label>
                  <button 
                    type="button" 
                    onClick={() => setShowQuickAreaModal(true)}
                    style={{ 
                      background: 'none', border: 'none', color: '#0ea5e9', 
                      fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: 0,
                      display: 'flex', alignItems: 'center', gap: '2px'
                    }}
                  >
                    <Plus size={13} /> {t('customers.addArea', 'Add Area')}
                  </button>
                </div>
                <select value={form.area_id} onChange={e => setForm(f => ({ ...f, area_id: e.target.value }))} style={inputStyle}>
                  <option value="">{t('customers.noAreaOpt', '-- No Area (Optional) --')}</option>
                  {(customerAreas || []).map(a => <option key={a.id} value={a.id}>📍 {a.name}</option>)}
                </select>
              </div>

              {/* Assigned Employee / الموظف المسؤول */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>
                  {t('customers.assignedEmployee', 'Assigned Employee')}
                </label>
                <select 
                  value={form.assigned_to} 
                  onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} 
                  style={inputStyle}
                >
                  <option value="">{t('customers.letSystemDecide', '-- Let System Decide / Me (Unassigned) --')}</option>
                  {(users || []).map(u => (
                    <option key={u.id} value={u.id}>👤 {u.name} ({u.role || 'Staff'})</option>
                  ))}
                </select>
              </div>
              {/* Checkboxes */}
              <div style={{ display: 'flex', gap: '24px', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '14px', color: '#374151' }}>
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} style={{ width: '18px', height: '18px', accentColor: '#10b981' }} />
                  <span style={{ color: '#10b981' }}>✅ {t('customers.filterActive', 'Active')}</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '14px', color: '#374151' }}>
                  <input type="checkbox" checked={form.is_blacklisted} onChange={e => setForm(f => ({ ...f, is_blacklisted: e.target.checked }))} style={{ width: '18px', height: '18px', accentColor: '#ef4444' }} />
                  <span style={{ color: '#ef4444' }}>⛔ {t('customers.filterBlacklisted', 'Blacklisted')}</span>
                </label>
              </div>
              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '8px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>{t('common.cancel', 'Cancel')}</button>
                <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? t('customers.saving', 'Saving...') : editingCustomer ? t('customers.saveChanges', 'Save Changes') : t('customers.addCustomer', 'Add Customer')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Statement Modal */}
      {statementCustomer && <StatementModal customer={statementCustomer} onClose={() => setStatementCustomer(null)} />}

      {/* Customer Details Modal */}
      {viewingCustomer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '720px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', direction: isRTL ? 'rtl' : 'ltr' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 900, fontSize: '18px' }}>
                  {viewingCustomer.name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 style={{ margin: 0, color: 'white', fontSize: '18px', fontWeight: 800 }}>{viewingCustomer.name}</h2>
                  <p style={{ margin: '2px 0 0', color: 'rgba(255,255,255,0.85)', fontSize: '12px' }}>
                    {viewingCustomer.company_name || t('customers.customerDetails', 'Customer Details')}
                  </p>
                </div>
              </div>
              <button onClick={() => setViewingCustomer(null)} style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {/* Primary Details Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginBottom: '4px' }}>📱 {t('customers.phone', 'Phone')}</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>
                    <span className="num-en" style={{ direction: 'ltr', display: 'inline-block' }}>{viewingCustomer.phone || '—'}</span>
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginBottom: '4px' }}>✉️ {t('customers.email', 'Email')}</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                    <span className="num-en">{viewingCustomer.email || '—'}</span>
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginBottom: '4px' }}>🌐 {t('customers.source', 'Source')}</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#4f46e5' }}>
                    {viewingCustomer.source_name || t('customers.directOther', 'Direct')}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginBottom: '4px' }}>📋 {t('customers.metaForm', 'Meta Form')}</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0284c7' }}>
                    {viewingCustomer.meta_form_name || '—'}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginBottom: '4px' }}>👤 {t('customers.assignedEmployee', 'Assigned Employee')}</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: viewingCustomer.assigned_to_name && viewingCustomer.assigned_to_name !== 'Unassigned' ? '#4f46e5' : '#94a3b8' }}>
                    {viewingCustomer.assigned_to_name || t('customers.unassigned', 'Unassigned')}
                  </div>
                </div>

                {viewingCustomer.classification_name && (
                  <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginBottom: '4px' }}>🏷️ {t('customers.classification', 'Classification')}</div>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 12px',
                      borderRadius: '9999px',
                      fontSize: '12px',
                      fontWeight: 800,
                      backgroundColor: `${viewingCustomer.classification_color || '#4f46e5'}18`,
                      color: viewingCustomer.classification_color || '#4f46e5',
                      border: `1px solid ${viewingCustomer.classification_color || '#4f46e5'}40`
                    }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: viewingCustomer.classification_color || '#4f46e5' }}></span>
                      {viewingCustomer.classification_name}
                    </div>
                  </div>
                )}

                {viewingCustomer.area_name && (
                  <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginBottom: '4px' }}>📍 {t('customers.area', 'Area')}</div>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 12px',
                      borderRadius: '9999px',
                      fontSize: '12px',
                      fontWeight: 800,
                      backgroundColor: `${viewingCustomer.area_color || '#0ea5e9'}18`,
                      color: viewingCustomer.area_color || '#0ea5e9',
                      border: `1px solid ${viewingCustomer.area_color || '#0ea5e9'}40`
                    }}>
                      <MapPin size={13} />
                      {viewingCustomer.area_name}
                    </div>
                  </div>
                )}

                <div style={{ 
                  background: '#f8fafc', 
                  padding: '14px', 
                  borderRadius: '12px', 
                  border: '1px solid #e2e8f0', 
                  gridColumn: (viewingCustomer.classification_name && viewingCustomer.area_name) ? 'span 2' : 'span 1' 
                }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginBottom: '4px' }}>📍 {t('customers.addressLocation', 'Address / Location')}</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                    {viewingCustomer.address || '—'}
                  </div>
                </div>
              </div>

              {/* Linked Deal & Property Unit Card */}
              {viewingCustomer.linked_deal_id && (
                <div style={{ marginBottom: '20px', background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: '12px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#0369a1', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Building2 size={14} /> {isRTL ? 'الصفقة والوحدة العقارية المرتبطة' : 'Linked Deal & Property Unit'}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                      {viewingCustomer.linked_unit_id
                        ? `${viewingCustomer.linked_unit_project ? `${viewingCustomer.linked_unit_project} • ` : ''}${viewingCustomer.linked_unit_number || viewingCustomer.linked_unit_name}`
                        : (viewingCustomer.pf_listing_reference
                            ? `Property Finder Ref: ${viewingCustomer.pf_listing_reference} (${isRTL ? 'غير مربوطة بوحدة بعد' : 'Not linked to unit yet'})`
                            : viewingCustomer.linked_deal_title)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px', fontWeight: 700 }}>
                      {isRTL ? 'المرحلة:' : 'Stage:'} <span style={{ color: '#4f46e5' }}>{viewingCustomer.linked_deal_stage || 'Lead'}</span>
                      {' • '}
                      {isRTL ? 'القيمة:' : 'Value:'} <span className="num-en">{Number(viewingCustomer.linked_deal_value || 0).toLocaleString('en-US')}</span> EGP
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const dId = viewingCustomer.linked_deal_id;
                      setViewingCustomer(null);
                      navigate(`/deals?deal_id=${dId}`);
                    }}
                    style={{ background: '#0284c7', color: 'white', border: 'none', borderRadius: '10px', padding: '8px 14px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Building2 size={14} /> {isRTL ? 'فتح الصفقة / ربط أو تغيير الوحدة' : 'Open Deal / Link Unit'}
                  </button>
                </div>
              )}

              {/* Form Responses / Notes Section */}
              {viewingCustomer.notes && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#4f46e5', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📝 {t('customers.formAnswersNotes', 'Form Answers & Notes')}
                  </div>
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', whiteSpace: 'pre-wrap', fontSize: '13px', color: '#1e293b', lineHeight: 1.6 }}>
                    {viewingCustomer.notes}
                  </div>
                </div>
              )}

              {/* Meta Lead ID if present */}
              {viewingCustomer.meta_lead_id && (
                <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', marginTop: '12px' }}>
                  {t('customers.metaLeadId', 'Meta Lead ID')}: <span className="num-en">{viewingCustomer.meta_lead_id}</span> &nbsp;|&nbsp; {t('customers.addedOn', 'Added')}: <span className="num-en">{new Date(viewingCustomer.created_at).toLocaleString('en-GB')}</span>
                </div>
              )}

              {/* Activity & Interaction Log / Timeline */}
              <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '2px dashed #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🗺️ {t('customers.activityLog', 'Activity & Communication Log')}</span>
                    <span style={{ fontSize: '11px', background: '#eff6ff', color: '#3b82f6', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                      {t('customers.timelineMap', 'Timeline Map')}
                    </span>
                  </div>
                </div>
                <ActivityTimeline
                  entityType="customer"
                  entityId={viewingCustomer.id}
                  onActivityCreated={(act) => {
                    fetchCustomers(false);
                    if (act?.updated_deal_stage) {
                      setViewingCustomer(prev => prev ? ({ ...prev, linked_deal_stage: act.updated_deal_stage }) : prev);
                      toast.success(
                        isRTL
                          ? `تم نقل صفقة العميل تلقائياً إلى مرحلة "${act.updated_deal_stage}"`
                          : `Customer's deal moved to "${act.updated_deal_stage}"`
                      );
                    }
                  }}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button 
                onClick={() => {
                  const toEdit = viewingCustomer;
                  setViewingCustomer(null);
                  openEdit(toEdit);
                }} 
                style={{ padding: '8px 18px', background: '#e0e7ff', color: '#4338ca', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}
              >
                ✏️ {t('customers.editCustomer', 'Edit Customer')}
              </button>
              <button 
                onClick={() => setViewingCustomer(null)} 
                style={{ padding: '8px 20px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}
              >
                {t('common.close', 'Close')}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Quick Classification Modal */}
      {showQuickClassificationModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
          zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', width: '100%', maxWidth: '420px',
            padding: '24px', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', direction: isRTL ? 'rtl' : 'ltr'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                🏷️ {t('customers.addNewClassification', 'Add New Customer Classification')}
              </h3>
              <button 
                type="button"
                onClick={() => setShowQuickClassificationModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px' }}
              >
                ✕
              </button>
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: '#334155' }}>
                {t('customers.classificationNameLabel', 'Classification Name (e.g. VIP, Corporate, Retail...) *')}
              </label>
              <input 
                type="text"
                placeholder={t('customers.classificationNamePlaceholder', 'e.g. VIP Client')}
                value={newClassificationName}
                onChange={e => setNewClassificationName(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: '#334155' }}>
                {t('customers.badgeColor', 'Badge Color')}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input 
                  type="color"
                  value={newClassificationColor}
                  onChange={e => setNewClassificationColor(e.target.value)}
                  style={{ width: '40px', height: '38px', padding: 0, border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                />
                <span className="num-en" style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>{newClassificationColor}</span>
                <div style={{
                  marginInlineStart: 'auto', padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontWeight: 700,
                  backgroundColor: `${newClassificationColor}18`, color: newClassificationColor, border: `1px solid ${newClassificationColor}40`
                }}>
                  {newClassificationName || t('customers.preview', 'Preview')}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                type="button" 
                onClick={() => setShowQuickClassificationModal(false)}
                style={{ padding: '8px 16px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button 
                type="button"
                disabled={savingClassification}
                onClick={async () => {
                  if (!newClassificationName.trim()) return toast.error(t('customers.enterClassificationName', 'Please enter a classification name'));
                  setSavingClassification(true);
                  try {
                    const res = await api.post('/customer-classifications', {
                      name: newClassificationName.trim(),
                      color: newClassificationColor
                    });
                    toast.success(t('customers.classificationCreated', 'Classification created successfully'));
                    await fetchCustomerClassifications();
                    if (res.data?.data?.id) {
                      setForm(prev => ({ ...prev, classification_id: res.data.data.id }));
                    }
                    setNewClassificationName('');
                    setShowQuickClassificationModal(false);
                  } catch (err) {
                    toast.error(err.response?.data?.message || t('common.errorOccurred', 'Failed to save classification'));
                  } finally {
                    setSavingClassification(false);
                  }
                }}
                style={{ padding: '8px 20px', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: savingClassification ? 'not-allowed' : 'pointer', opacity: savingClassification ? 0.7 : 1 }}
              >
                {savingClassification ? t('customers.saving', 'Saving...') : t('customers.saveClassification', 'Save Classification')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Area Modal */}
      {showQuickAreaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '420px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', direction: isRTL ? 'rtl' : 'ltr' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin size={18} color="#0ea5e9" /> {t('customers.newCustomerArea', 'New Customer Area')}
              </h3>
              <button onClick={() => setShowQuickAreaModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#475569', marginBottom: '6px' }}>
                {t('customers.areaNameLabel', 'Area Name (e.g. New Cairo, Zayed, Maadi...) *')}
              </label>
              <input 
                type="text" 
                value={newAreaName}
                onChange={e => setNewAreaName(e.target.value)}
                placeholder={t('customers.areaNamePlaceholder', 'e.g. New Cairo')}
                style={inputStyle}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#475569', marginBottom: '6px' }}>
                {t('customers.badgeColor', 'Badge Color')}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input 
                  type="color" 
                  value={newAreaColor}
                  onChange={e => setNewAreaColor(e.target.value)}
                  style={{ width: '40px', height: '38px', padding: 0, border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                />
                <span className="num-en" style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>{newAreaColor}</span>
                <div style={{
                  marginInlineStart: 'auto', padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontWeight: 700,
                  backgroundColor: `${newAreaColor}18`, color: newAreaColor, border: `1px solid ${newAreaColor}40`,
                  display: 'flex', alignItems: 'center', gap: '4px'
                }}>
                  <MapPin size={11} />
                  {newAreaName || t('customers.preview', 'Preview')}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                type="button" 
                onClick={() => setShowQuickAreaModal(false)}
                style={{ padding: '8px 16px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button 
                type="button"
                disabled={savingArea}
                onClick={async () => {
                  if (!newAreaName.trim()) return toast.error(t('customers.enterAreaName', 'Please enter an area name'));
                  setSavingArea(true);
                  try {
                    const res = await api.post('/customer-areas', {
                      name: newAreaName.trim(),
                      color: newAreaColor
                    });
                    toast.success(t('customers.areaCreated', 'Area created successfully'));
                    await fetchCustomerAreas();
                    if (res.data?.data?.id) {
                      setForm(prev => ({ ...prev, area_id: res.data.data.id }));
                    }
                    setNewAreaName('');
                    setShowQuickAreaModal(false);
                  } catch (err) {
                    toast.error(err.response?.data?.message || t('common.errorOccurred', 'Failed to save area'));
                  } finally {
                    setSavingArea(false);
                  }
                }}
                style={{ padding: '8px 20px', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: savingArea ? 'not-allowed' : 'pointer', opacity: savingArea ? 0.7 : 1 }}
              >
                {savingArea ? t('customers.saving', 'Saving...') : t('customers.saveArea', 'Save Area')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactsCustomers;
