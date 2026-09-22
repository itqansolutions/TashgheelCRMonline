import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Plus, Truck, Search, X, Printer, CreditCard, FileText } from 'lucide-react';

// ─── Vendor Statement Modal (Simple & Printable) ─────────────────
const VendorStatementModal = ({ vendor, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/purchases/vendors/${vendor.id}/statement`)
      .then(res => setData(res.data?.data))
      .catch(() => toast.error('Failed to load supplier statement'))
      .finally(() => setLoading(false));
  }, [vendor.id]);

  const fmt = (num) => (parseFloat(num) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const html = document.getElementById('vendor-statement-content').innerHTML;
    printWindow.document.write(`
      <html><head><title>Supplier Statement - ${vendor.name}</title>
      <style>
        body { font-family: Arial, sans-serif; direction: ltr; padding: 24px; color: #1e293b; }
        h1 { color: #0284c7; border-bottom: 2px solid #0284c7; padding-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
        th { background: #f1f5f9; padding: 10px; text-align: left; border: 1px solid #e2e8f0; font-weight: bold; }
        td { padding: 10px; border: 1px solid #e2e8f0; }
        .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; }
        .summary-grid { display: flex; justify-content: space-between; }
        .summary-item { text-align: center; }
        .summary-val { font-size: 18px; font-weight: bold; margin-top: 4px; }
        .debit { color: #0284c7; font-weight: bold; }
        .credit { color: #16a34a; font-weight: bold; }
        .balance { color: #dc2626; font-weight: bold; }
        @media print { .no-print { display: none; } }
      </style></head><body>${html}</body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '820px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
        {/* Modal Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
          <div>
            <h2 style={{ margin: 0, color: 'white', fontSize: '18px', fontWeight: 800 }}>Supplier Account Statement / كشف حساب مورد</h2>
            <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.85)', fontSize: '13px' }}>{vendor.name}</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handlePrint} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '10px', padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '13px' }}>
              <Printer size={15} /> Print Statement
            </button>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading statement ledger...</div>
          ) : !data ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>Failed to load statement data</div>
          ) : (
            <div id="vendor-statement-content">
              <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#1e293b', marginBottom: '4px' }}>Supplier Statement of Account</h1>
              <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '14px' }}>
                Supplier: <strong>{data.vendor?.name}</strong> &nbsp;|&nbsp; 
                Phone: <strong>{data.vendor?.phone || '—'}</strong> &nbsp;|&nbsp;
                Print Date: <strong>{new Date().toLocaleDateString()}</strong>
              </p>

              {/* Summary Box */}
              <div className="summary-box" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
                <div className="summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', textAlign: 'center' }}>
                  <div className="summary-item">
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>Total Purchases</span>
                    <div className="summary-val" style={{ fontSize: '20px', fontWeight: 800, color: '#0ea5e9' }}>
                      {fmt(data.summary.total_purchases)} EGP
                    </div>
                  </div>

                  <div className="summary-item">
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>Total Paid</span>
                    <div className="summary-val" style={{ fontSize: '20px', fontWeight: 800, color: '#16a34a' }}>
                      {fmt(data.summary.total_paid)} EGP
                    </div>
                  </div>

                  <div className="summary-item">
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>Outstanding Balance (Due)</span>
                    <div className="summary-val" style={{ fontSize: '20px', fontWeight: 800, color: data.summary.outstanding_balance > 0 ? '#dc2626' : '#16a34a' }}>
                      {fmt(data.summary.outstanding_balance)} EGP
                    </div>
                  </div>
                </div>
              </div>

              {/* Ledger Table */}
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', marginBottom: '12px' }}>Transaction History</h3>
              {data.transactions.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', background: '#fafafa', borderRadius: '10px' }}>
                  No transactions found for this vendor.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Transaction Type</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Reference</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Debit (Purchases)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Credit (Payments)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Running Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((tx, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px 12px', color: '#64748b' }}>{new Date(tx.date).toLocaleDateString()}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{tx.type}</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#0ea5e9' }}>{tx.reference}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: tx.debit > 0 ? '#0ea5e9' : '#94a3b8' }}>
                          {tx.debit > 0 ? `${fmt(tx.debit)}` : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: tx.credit > 0 ? '#16a34a' : '#94a3b8' }}>
                          {tx.credit > 0 ? `${fmt(tx.credit)}` : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: tx.running_balance > 0 ? '#dc2626' : '#16a34a' }}>
                          {fmt(tx.running_balance)} EGP
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Record Payment Modal (Reusing finance_vouchers) ──────────────
const RecordPaymentModal = ({ vendor, onClose, onSuccess }) => {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payVal = parseFloat(amount);
    if (!payVal || payVal <= 0) return toast.error('Please enter a valid amount');

    setSaving(true);
    try {
      await api.post(`/purchases/vendors/${vendor.id}/payments`, {
        amount: payVal,
        payment_method: paymentMethod,
        voucher_date: voucherDate,
        notes: notes || `Payment to supplier ${vendor.name}`
      });
      toast.success('Payment recorded successfully');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payment recording failed');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', fontWeight: 600, outline: 'none', boxSizing: 'border-box', background: '#fafafa' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #10b981, #059669)' }}>
          <h3 style={{ margin: 0, color: 'white', fontWeight: 800, fontSize: '18px' }}>Record Payment to {vendor.name}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>Amount (EGP) *</label>
            <input
              type="number"
              step="any"
              min="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Enter payment amount"
              style={inputStyle}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>Payment Method</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={inputStyle}>
                <option value="cash">Cash / نقدي</option>
                <option value="bank_transfer">Bank Transfer / تحويل بنكي</option>
                <option value="check">Check / شيك</option>
                <option value="card">Card / بطاقة</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>Payment Date</label>
              <input type="date" value={voucherDate} onChange={e => setVoucherDate(e.target.value)} style={inputStyle} required />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>Notes (Optional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Settlement receipt #123" style={inputStyle} />
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Confirm Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Main Vendors Component ───────────────────────────────────────
const ContactsVendors = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  // Statement & Payment Modals
  const [statementVendor, setStatementVendor] = useState(null);
  const [paymentVendor, setPaymentVendor] = useState(null);

  const emptyForm = { name: '', phone: '', address: '', tax_no: '', reg_no: '' };
  const [form, setForm] = useState(emptyForm);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const res = await api.get('/vendors');
      setVendors(res.data.data || []);
    } catch { toast.error('Failed to load vendors'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchVendors(); }, []);

  const filtered = vendors.filter(v => {
    const q = search.toLowerCase();
    return !q || v.name?.toLowerCase().includes(q) || v.phone?.includes(q);
  });

  const openAdd = () => { setEditing(null); setForm(emptyForm); setIsModalOpen(true); };
  const openEdit = (v) => { setEditing(v); setForm({ name: v.name || '', phone: v.phone || '', address: v.address || '', tax_no: v.tax_no || '', reg_no: v.reg_no || '' }); setIsModalOpen(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Vendor name is required');
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/vendors/${editing.id}`, form);
        toast.success('Vendor updated successfully');
      } else {
        await api.post('/vendors', form);
        toast.success('Vendor added successfully');
      }
      setIsModalOpen(false);
      fetchVendors();
    } catch (err) {
      toast.error(err.response?.data?.message || 'An error occurred');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this vendor?')) return;
    try { await api.delete(`/vendors/${id}`); toast.success('Vendor deleted successfully'); fetchVendors(); }
    catch { toast.error('Failed to delete vendor'); }
  };

  const inputStyle = { width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', fontWeight: 600, outline: 'none', boxSizing: 'border-box', background: '#fafafa' };

  return (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#1e293b', margin: 0, letterSpacing: '-0.02em' }}>Vendors & Suppliers (الموردين)</h1>
          <p style={{ color: '#64748b', margin: '6px 0 0', fontSize: '14px', fontWeight: 600 }}>{filtered.length} suppliers registered</p>
        </div>
        <button onClick={openAdd} style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: 'white', border: 'none', borderRadius: '12px', padding: '12px 22px', cursor: 'pointer', fontWeight: 800, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(14,165,233,0.35)' }}>
          <Plus size={18} /> Add Supplier
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: '380px', marginBottom: '20px' }}>
        <Search size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..." style={{ ...inputStyle, paddingRight: '38px' }} />
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.04)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
            <Truck size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
            <p style={{ fontWeight: 700, margin: 0 }}>No suppliers found</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {['Name', 'Phone', 'Address', 'Tax ID', 'Commercial Reg', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 800, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((v, i) => (
                <tr key={v.id}
                  style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafbfc', transition: 'background 0.15s' }}
                >
                  <td style={{ padding: '14px 16px', fontWeight: 800, color: '#1e293b', fontSize: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', fontWeight: 900, flexShrink: 0 }}>
                        {v.name?.charAt(0).toUpperCase()}
                      </div>
                      {v.name}
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', color: '#475569', fontSize: '13px' }}>{v.phone || '—'}</td>
                  <td style={{ padding: '14px 16px', color: '#475569', fontSize: '13px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.address || '—'}</td>
                  <td style={{ padding: '14px 16px', color: '#475569', fontSize: '13px' }}>{v.tax_no || '—'}</td>
                  <td style={{ padding: '14px 16px', color: '#475569', fontSize: '13px' }}>{v.reg_no || '—'}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {/* Statement Button */}
                      <button
                        onClick={() => setStatementVendor(v)}
                        title="Account Statement"
                        style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <FileText size={13} /> Statement
                      </button>

                      {/* Pay Button */}
                      <button
                        onClick={() => setPaymentVendor(v)}
                        title="Record Payment"
                        style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <CreditCard size={13} /> Pay
                      </button>

                      {/* Edit */}
                      <button onClick={() => openEdit(v)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                        Edit
                      </button>

                      {/* Delete */}
                      <button onClick={() => handleDelete(v.id)} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: Add / Edit Vendor */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', borderRadius: '20px 20px 0 0' }}>
              <h3 style={{ margin: 0, color: 'white', fontWeight: 800 }}>{editing ? 'Edit Supplier' : 'Add New Supplier'}</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>Supplier Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Supplier name" style={inputStyle} required />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>Phone Number</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="01xxxxxxxxx" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>Address</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Full address" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>Tax ID</label>
                  <input value={form.tax_no} onChange={e => setForm(f => ({ ...f, tax_no: e.target.value }))} placeholder="123456789" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#374151', marginBottom: '6px' }}>Commercial Reg. No.</label>
                  <input value={form.reg_no} onChange={e => setForm(f => ({ ...f, reg_no: e.target.value }))} placeholder="987654321" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '8px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Supplier Account Statement */}
      {statementVendor && (
        <VendorStatementModal
          vendor={statementVendor}
          onClose={() => setStatementVendor(null)}
        />
      )}

      {/* Modal: Record Supplier Payment */}
      {paymentVendor && (
        <RecordPaymentModal
          vendor={paymentVendor}
          onClose={() => setPaymentVendor(null)}
          onSuccess={() => {
            fetchVendors();
            if (statementVendor?.id === paymentVendor.id) {
              setStatementVendor(null);
            }
          }}
        />
      )}
    </div>
  );
};

export default ContactsVendors;
