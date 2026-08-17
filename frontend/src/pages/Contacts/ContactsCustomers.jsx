import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Plus, Users, Phone, MapPin, Hash, FileText, Search, CheckCircle, XCircle, AlertTriangle, Printer, X, ChevronDown } from 'lucide-react';
import { useData } from '../../context/DataContext';

const fmt = (n) => Number(n || 0).toLocaleString('en-EG', { minimumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('ar-EG') : '—';

// ─── Statement Modal ──────────────────────────────────────────────────────────
const StatementModal = ({ customer, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/customers/${customer.id}/statement`)
      .then(res => setData(res.data.data))
      .catch(() => toast.error('Failed to load statement'))
      .finally(() => setLoading(false));
  }, [customer.id]);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const html = document.getElementById('statement-content').innerHTML;
    printWindow.document.write(`
      <html><head><title>كشف حساب - ${customer.name}</title>
      <style>
        body { font-family: Arial, sans-serif; direction: rtl; padding: 24px; color: #1e293b; }
        h1 { color: #4f46e5; border-bottom: 2px solid #4f46e5; padding-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th { background: #f1f5f9; padding: 10px; text-align: right; font-size: 13px; border: 1px solid #e2e8f0; }
        td { padding: 10px; border: 1px solid #e2e8f0; font-size: 13px; }
        .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; }
        .summary-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0; }
        .balance { color: #ef4444; font-weight: 800; font-size: 18px; }
        @media print { .no-print { display: none; } }
      </style></head><body>${html}</body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '780px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
          <div>
            <h2 style={{ margin: 0, color: 'white', fontSize: '18px', fontWeight: 800 }}>كشف حساب العميل</h2>
            <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.8)', fontSize: '13px' }}>{customer.name}</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handlePrint} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '10px', padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '13px' }}>
              <Printer size={15} /> طباعة
            </button>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>جاري التحميل...</div>
          ) : !data ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>فشل تحميل البيانات</div>
          ) : (
            <div id="statement-content">
              <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#1e293b', marginBottom: '4px' }}>كشف حساب</h1>
              <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '14px' }}>
                العميل: <strong>{data.customer.name}</strong> &nbsp;|&nbsp; 
                الهاتف: <strong>{data.customer.phone || '—'}</strong> &nbsp;|&nbsp;
                تاريخ الطباعة: <strong>{new Date().toLocaleDateString('ar-EG')}</strong>
              </p>

              {/* Summary Box */}
              <div className="summary-box" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px' }}>
                  {[
                    { label: 'إجمالي الفواتير', value: fmt(data.summary.total_invoiced), color: '#4f46e5' },
                    { label: 'إجمالي المدفوع', value: fmt(data.summary.total_paid), color: '#10b981' },
                    { label: 'الرصيد المستحق', value: fmt(data.summary.balance), color: data.summary.balance > 0 ? '#ef4444' : '#10b981' },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: 'center', padding: '12px', background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Invoices */}
              {data.invoices.length > 0 && (
                <>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #e2e8f0' }}>📄 الفواتير</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
                    <thead><tr style={{ background: '#f1f5f9' }}>
                      {['رقم الفاتورة', 'الصفقة', 'الإجمالي', 'الحالة', 'تاريخ الاستحقاق'].map(h => (
                        <th key={h} style={{ padding: '10px', textAlign: 'right', fontSize: '12px', border: '1px solid #e2e8f0', fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {data.invoices.map(inv => (
                        <tr key={inv.id}>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', fontWeight: 700 }}>{inv.invoice_number}</td>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', color: '#64748b' }}>{inv.deal_title || '—'}</td>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', fontWeight: 700, color: '#4f46e5' }}>{fmt(inv.total_amount)}</td>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0' }}>
                            <span style={{ background: inv.status === 'paid' ? '#dcfce7' : '#fef2f2', color: inv.status === 'paid' ? '#16a34a' : '#dc2626', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                              {inv.status === 'paid' ? 'مدفوع' : inv.status === 'partial' ? 'جزئي' : 'غير مدفوع'}
                            </span>
                          </td>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', color: '#64748b' }}>{fmtDate(inv.due_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {/* Payments */}
              {data.payments.length > 0 && (
                <>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #e2e8f0' }}>💳 المدفوعات</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
                    <thead><tr style={{ background: '#f1f5f9' }}>
                      {['رقم الفاتورة', 'المبلغ', 'طريقة الدفع', 'التاريخ', 'ملاحظات'].map(h => (
                        <th key={h} style={{ padding: '10px', textAlign: 'right', fontSize: '12px', border: '1px solid #e2e8f0', fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {data.payments.map(p => (
                        <tr key={p.id}>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', color: '#64748b' }}>{p.invoice_number}</td>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', fontWeight: 700, color: '#10b981' }}>{fmt(p.amount)}</td>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', color: '#64748b' }}>{p.payment_method || '—'}</td>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', color: '#64748b' }}>{fmtDate(p.payment_date)}</td>
                          <td style={{ padding: '10px', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '12px' }}>{p.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {data.invoices.length === 0 && data.payments.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', background: '#f8fafc', borderRadius: '12px' }}>
                  لا توجد معاملات مسجلة لهذا العميل
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
  const { customers, fetchCustomers, leadSources, fetchLeadSources, loading } = useData();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all | active | blacklisted
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [statementCustomer, setStatementCustomer] = useState(null);
  const [saving, setSaving] = useState(false);

  const emptyForm = { name: '', phone: '', address: '', tax_no: '', reg_no: '', source_id: '', is_active: true, is_blacklisted: false };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetchCustomers();
    if (leadSources.length === 0) fetchLeadSources();
  }, []);

  // Only show general customers (not RE vendors/brokers)
  const allCustomers = customers.filter(c => c.entity_type === 'customer' || !c.entity_type);

  const filtered = allCustomers.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.phone?.includes(q);
    const matchStatus = filterStatus === 'all' || (filterStatus === 'active' && c.is_active && !c.is_blacklisted) || (filterStatus === 'blacklisted' && c.is_blacklisted);
    return matchSearch && matchStatus;
  });

  const openAdd = () => { setEditingCustomer(null); setForm(emptyForm); setIsModalOpen(true); };
  const openEdit = (c) => {
    setEditingCustomer(c);
    setForm({ name: c.name || '', phone: c.phone || '', address: c.address || '', tax_no: c.tax_no || '', reg_no: c.reg_no || '', source_id: c.source_id || '', is_active: c.is_active !== false, is_blacklisted: c.is_blacklisted === true });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('الاسم مطلوب');
    setSaving(true);
    try {
      const payload = { ...form, entity_type: 'customer', status: 'customer' };
      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer.id}`, payload);
        toast.success('تم تحديث العميل');
      } else {
        await api.post('/customers', payload);
        toast.success('تم إضافة العميل');
      }
      setIsModalOpen(false);
      fetchCustomers(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من الحذف؟')) return;
    try {
      await api.delete(`/customers/${id}`);
      toast.success('تم الحذف');
      fetchCustomers(false);
    } catch { toast.error('فشل الحذف'); }
  };

  const inputStyle = { width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', fontWeight: 600, outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box', background: '#fafafa' };

  return (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#1e293b', margin: 0, letterSpacing: '-0.02em' }}>العملاء</h1>
          <p style={{ color: '#64748b', margin: '6px 0 0', fontSize: '14px', fontWeight: 600 }}>
            {filtered.length} عميل {filterStatus !== 'all' ? `(${filterStatus === 'active' ? 'نشط' : 'قائمة سوداء'})` : ''}
          </p>
        </div>
        <button onClick={openAdd} style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white', border: 'none', borderRadius: '12px', padding: '12px 22px', cursor: 'pointer', fontWeight: 800, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(79,70,229,0.35)' }}>
          <Plus size={18} /> إضافة عميل
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف..."
            style={{ ...inputStyle, paddingRight: '38px' }}
          />
        </div>
        {['all', 'active', 'blacklisted'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '10px 18px', borderRadius: '10px', border: '1.5px solid', borderColor: filterStatus === s ? '#4f46e5' : '#e2e8f0', background: filterStatus === s ? '#4f46e5' : 'white', color: filterStatus === s ? 'white' : '#64748b', fontWeight: 700, fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s' }}>
            {s === 'all' ? 'الكل' : s === 'active' ? '✅ النشطين' : '⛔ القائمة السوداء'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.04)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
            <Users size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
            <p style={{ fontWeight: 700, margin: 0 }}>لا يوجد عملاء</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {['الاسم', 'الهاتف', 'العنوان', 'رقم ض.القيمة', 'السجل التجاري', 'المصدر', 'الحالة', 'إجراءات'].map(h => (
                  <th key={h} style={{ padding: '14px 16px', textAlign: 'right', fontSize: '11px', fontWeight: 800, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
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
                      {c.name}
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', color: '#475569', fontSize: '13px' }}>{c.phone || '—'}</td>
                  <td style={{ padding: '14px 16px', color: '#475569', fontSize: '13px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.address || '—'}</td>
                  <td style={{ padding: '14px 16px', color: '#475569', fontSize: '13px' }}>{c.tax_no || '—'}</td>
                  <td style={{ padding: '14px 16px', color: '#475569', fontSize: '13px' }}>{c.reg_no || '—'}</td>
                  <td style={{ padding: '14px 16px', color: '#475569', fontSize: '13px' }}>{c.source_name || '—'}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {c.is_blacklisted ? (
                        <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>⛔ محظور</span>
                      ) : c.is_active !== false ? (
                        <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>✅ نشط</span>
                      ) : (
                        <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>غير نشط</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => setStatementCustomer(c)} title="كشف حساب" style={{ background: '#f0f4ff', color: '#4f46e5', border: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                        📊 كشف
                      </button>
                      <button onClick={() => openEdit(c)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>تعديل</button>
                      <button onClick={() => handleDelete(c.id)} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>حذف</button>
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
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', borderRadius: '20px 20px 0 0' }}>
              <h3 style={{ margin: 0, color: 'white', fontWeight: 800 }}>{editingCustomer ? 'تعديل العميل' : 'إضافة عميل جديد'}</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Name */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>الاسم *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم العميل" style={inputStyle} required />
              </div>
              {/* Phone */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>رقم الموبايل</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="01xxxxxxxxx" style={inputStyle} />
              </div>
              {/* Address */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>العنوان</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="العنوان الكامل" style={inputStyle} />
              </div>
              {/* Tax & Reg */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>رقم البطاقة الضريبية</label>
                  <input value={form.tax_no} onChange={e => setForm(f => ({ ...f, tax_no: e.target.value }))} placeholder="123456789" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>رقم السجل التجاري</label>
                  <input value={form.reg_no} onChange={e => setForm(f => ({ ...f, reg_no: e.target.value }))} placeholder="987654321" style={inputStyle} />
                </div>
              </div>
              {/* Lead Source */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>جاء منين (المصدر)</label>
                <select value={form.source_id} onChange={e => setForm(f => ({ ...f, source_id: e.target.value }))} style={inputStyle}>
                  <option value="">-- اختر المصدر --</option>
                  {leadSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {/* Checkboxes */}
              <div style={{ display: 'flex', gap: '24px', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '14px', color: '#374151' }}>
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} style={{ width: '18px', height: '18px', accentColor: '#10b981' }} />
                  <span style={{ color: '#10b981' }}>✅ نشط</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '14px', color: '#374151' }}>
                  <input type="checkbox" checked={form.is_blacklisted} onChange={e => setForm(f => ({ ...f, is_blacklisted: e.target.checked }))} style={{ width: '18px', height: '18px', accentColor: '#ef4444' }} />
                  <span style={{ color: '#ef4444' }}>⛔ قائمة سوداء</span>
                </label>
              </div>
              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '8px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>إلغاء</button>
                <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'جاري الحفظ...' : editingCustomer ? 'حفظ التعديلات' : 'إضافة العميل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Statement Modal */}
      {statementCustomer && <StatementModal customer={statementCustomer} onClose={() => setStatementCustomer(null)} />}
    </div>
  );
};

export default ContactsCustomers;
