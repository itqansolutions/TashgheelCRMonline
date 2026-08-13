import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Wallet, Plus, CheckCircle, RotateCcw, AlertTriangle, FileText } from 'lucide-react';

const JournalEntries = () => {
  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJournal, setSelectedJournal] = useState(null);

  useEffect(() => {
    fetchJournals();
  }, []);

  const fetchJournals = async () => {
    setLoading(true);
    try {
      const res = await api.get('/erp/journals');
      setJournals(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load journal entries');
    } finally {
      setLoading(false);
    }
  };

  const handleReverse = async (journalId) => {
    if (!window.confirm('Are you sure you want to reverse this journal entry? This will post a mirror reversal entry.')) return;
    try {
      await api.post(`/erp/journals/${journalId}/reverse`, { reason: 'User requested reversal' });
      toast.success('Journal entry reversed successfully');
      fetchJournals();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reverse journal entry');
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Wallet size={28} /> General Ledger & Journal Entries
          </h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
            Double-entry balanced accounting ledger with strict Layer 1-3 balance enforcement
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading Journal Entries...</div>
      ) : journals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <FileText size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
          <h3>No Journal Entries Posted Yet</h3>
          <p style={{ color: '#64748b' }}>Journal entries are automatically generated when delivery notes, goods receipts, supplier invoices, or payments are processed.</p>
        </div>
      ) : (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '12px 16px' }}>Entry No</th>
                <th style={{ padding: '12px 16px' }}>Date</th>
                <th style={{ padding: '12px 16px' }}>Source Type</th>
                <th style={{ padding: '12px 16px' }}>Purpose</th>
                <th style={{ padding: '12px 16px' }}>Description</th>
                <th style={{ padding: '12px 16px' }}>Total Amount</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {journals.map(je => (
                <tr key={je.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: '700', color: '#4f46e5' }}>{je.entry_number}</td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>{new Date(je.date).toLocaleDateString()}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#e0e7ff', color: '#3730a3', fontSize: '12px', fontWeight: '600' }}>
                      {je.source_type.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>{je.entry_purpose}</td>
                  <td style={{ padding: '12px 16px', color: '#334155' }}>{je.description || '-'}</td>
                  <td style={{ padding: '12px 16px', fontWeight: '700' }}>
                    {Number(je.total_debit || 0).toLocaleString()} {je.currency || 'EGP'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                      backgroundColor: je.status === 'posted' ? '#dcfce7' : '#fee2e2',
                      color: je.status === 'posted' ? '#166534' : '#991b1b'
                    }}>
                      {je.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {je.status === 'posted' && (
                      <button
                        onClick={() => handleReverse(je.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px',
                          backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                          borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
                        }}
                      >
                        <RotateCcw size={12} /> Reverse
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default JournalEntries;
