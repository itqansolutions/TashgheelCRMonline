import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { BookOpen, Plus, RefreshCw, Folder, FileText, CheckCircle2 } from 'lucide-react';

const ChartOfAccounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    code: '', name: '', type: 'asset', sub_type: 'expense', parent_id: '', is_group: false, currency: 'EGP'
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await api.get('/erp/accounts');
      setAccounts(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load Chart of Accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleSeed = async () => {
    try {
      await api.post('/erp/accounts/seed');
      toast.success('Default Chart of Accounts seeded!');
      fetchAccounts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to seed COA');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/erp/accounts', formData);
      toast.success('Account created successfully');
      setShowModal(false);
      fetchAccounts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create account');
    }
  };

  const typeColors = {
    asset: '#10b981',
    liability: '#ef4444',
    equity: '#3b82f6',
    revenue: '#8b5cf6',
    expense: '#f59e0b'
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BookOpen size={28} /> Chart of Accounts (COA)
          </h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
            Enterprise General Ledger account hierarchy & category classifications
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleSeed}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
              backgroundColor: 'rgba(79,70,229,0.08)', color: '#4f46e5', border: '1px solid rgba(79,70,229,0.2)',
              borderRadius: '8px', fontWeight: '600', cursor: 'pointer'
            }}
          >
            <RefreshCw size={16} /> Seed Default COA
          </button>
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
              backgroundColor: '#4f46e5', color: 'white', border: 'none',
              borderRadius: '8px', fontWeight: '600', cursor: 'pointer'
            }}
          >
            <Plus size={16} /> Add Account
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading Chart of Accounts...</div>
      ) : accounts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <BookOpen size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
          <h3>No Accounts Found</h3>
          <p style={{ color: '#64748b', marginBottom: '20px' }}>Click "Seed Default COA" to generate the standard enterprise Chart of Accounts tree.</p>
          <button onClick={handleSeed} style={{ padding: '10px 20px', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
            Seed Default COA Now
          </button>
        </div>
      ) : (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '12px 16px' }}>Code</th>
                <th style={{ padding: '12px 16px' }}>Account Name</th>
                <th style={{ padding: '12px 16px' }}>Type</th>
                <th style={{ padding: '12px 16px' }}>Sub-Type</th>
                <th style={{ padding: '12px 16px' }}>Classification</th>
                <th style={{ padding: '12px 16px' }}>Currency</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(acc => (
                <tr key={acc.id} style={{ borderBottom: '1px solid #f1f5f9', fontWeight: acc.is_group ? '700' : '400', backgroundColor: acc.is_group ? '#f8fafc' : 'white' }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#1e293b' }}>{acc.code}</td>
                  <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {acc.is_group ? <Folder size={18} style={{ color: '#4f46e5' }} /> : <FileText size={18} style={{ color: '#94a3b8' }} />}
                    <span>{acc.name}</span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                      backgroundColor: `${typeColors[acc.type] || '#64748b'}15`,
                      color: typeColors[acc.type] || '#64748b'
                    }}>
                      {acc.type.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>{acc.sub_type || '-'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {acc.is_group ? (
                      <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#e2e8f0', color: '#475569', fontSize: '11px' }}>Group Account</span>
                    ) : (
                      <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#dcfce7', color: '#166534', fontSize: '11px' }}>Posting Account</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>{acc.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ChartOfAccounts;
