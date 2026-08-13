import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { CreditCard, Plus, CheckCircle, Upload } from 'lucide-react';

const BankReconciliation = () => {
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBankAccounts();
  }, []);

  const fetchBankAccounts = async () => {
    setLoading(true);
    try {
      const res = await api.get('/erp/banking/accounts');
      setBankAccounts(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load bank accounts');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CreditCard size={28} /> Banking & Statement Reconciliation
          </h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
            Bank Account Master Data & Statement to GL Journal Entry Matching Engine
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading Bank Accounts...</div>
      ) : bankAccounts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <CreditCard size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
          <h3>No Bank Accounts Registered</h3>
          <p style={{ color: '#64748b' }}>Create a bank account linked to your Chart of Accounts to enable bank statement reconciliation.</p>
        </div>
      ) : (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '12px 16px' }}>Account Name</th>
                <th style={{ padding: '12px 16px' }}>Bank Name</th>
                <th style={{ padding: '12px 16px' }}>Account Number</th>
                <th style={{ padding: '12px 16px' }}>GL Account</th>
                <th style={{ padding: '12px 16px' }}>Opening Balance</th>
                <th style={{ padding: '12px 16px' }}>Currency</th>
              </tr>
            </thead>
            <tbody>
              {bankAccounts.map(ba => (
                <tr key={ba.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontWeight: '700', color: '#1e293b' }}>{ba.name}</td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>{ba.bank_name || '-'}</td>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#64748b' }}>{ba.account_number || '-'}</td>
                  <td style={{ padding: '12px 16px', color: '#4f46e5' }}>{ba.gl_account_code} - {ba.gl_account_name}</td>
                  <td style={{ padding: '12px 16px', fontWeight: '600' }}>{Number(ba.opening_balance || 0).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>{ba.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default BankReconciliation;
