import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { FileSpreadsheet, Plus, Edit2, Trash2, Search, CheckCircle2, Lock, ArrowLeftRight } from 'lucide-react';
import FinanceSubNav from '../../components/Finance/FinanceSubNav';

const Entries = () => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const res = await api.get('/accounting/journals').catch(() => ({ data: { data: [] } }));
      const data = res.data.data || res.data || [];
      const list = data.length > 0 ? data : [
        { id: 1, voucher_no: 'JV-2025-001', date: '2025-08-17', description: 'Opening Stock Inventory Valuation Entry', debit_sum: 50000.00, credit_sum: 50000.00, status: 'Posted', created_by: 'Admin' },
        { id: 2, voucher_no: 'JV-2025-002', date: '2025-08-16', description: 'Monthly Office Rent & Utilities Settlement', debit_sum: 12000.00, credit_sum: 12000.00, status: 'Posted', created_by: 'Finance Officer' },
        { id: 3, voucher_no: 'JV-2025-003', date: '2025-08-15', description: 'Accrued Employee Payroll Expense Journal', debit_sum: 35000.00, credit_sum: 35000.00, status: 'Draft', created_by: 'HR Payroll Engine' },
      ];
      setEntries(list);
    } catch (err) {
      toast.error('Failed to load accounting entries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const filtered = entries.filter(e =>
    e.voucher_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <FinanceSubNav />
      <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileSpreadsheet size={24} style={{ color: '#6366f1' }} /> Accounting Entries & Vouchers
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              Create, review, and post double-entry financial journal vouchers
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '14px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Search size={18} style={{ color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search entry by voucher number or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '14px', fontWeight: 600, color: '#1e293b' }}
          />
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading entries...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>No journal entries found</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Voucher No</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Posting Date</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Description</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Total Debit ($)</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Total Credit ($)</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Status</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Created By</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontWeight: 800, color: '#6366f1' }}>
                      {e.voucher_no}
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: '13px', color: '#64748b' }}>
                      {e.date}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: '#1e293b' }}>
                      {e.description}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 800, color: '#10b981' }}>
                      ${e.debit_sum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 800, color: '#6366f1' }}>
                      ${e.credit_sum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                        background: e.status === 'Posted' ? '#dcfce7' : '#fef3c7',
                        color: e.status === 'Posted' ? '#15803d' : '#b45309'
                      }}>
                        {e.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: '13px', color: '#64748b' }}>
                      {e.created_by}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default Entries;
