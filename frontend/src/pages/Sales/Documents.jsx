import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { FileText, Download, Eye, Plus, Search, Filter, CheckCircle2, AlertCircle } from 'lucide-react';

const Documents = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('All Types');

  useEffect(() => {
    // Initial / mock documents repository data
    setDocuments([
      { id: 1, title: 'Official Quotation - Al-Nour Contracting', doc_no: 'QT-2025-098', type: 'Quotation', customer: 'Al-Nour Contracting Co.', date: '2025-08-17', total_amount: 145000.00, status: 'Sent' },
      { id: 2, title: 'Tax Invoice - Horizon Tech Towers', doc_no: 'INV-2025-402', type: 'Invoice', customer: 'Horizon Tech Towers', date: '2025-08-16', total_amount: 88000.00, status: 'Paid' },
      { id: 3, title: 'Delivery Note - City Center Mall Site', doc_no: 'DN-2025-112', type: 'Delivery Note', customer: 'Delta Real Estate Dev', date: '2025-08-15', total_amount: 52000.00, status: 'Delivered' },
      { id: 4, title: 'Annual Supply Agreement Contract', doc_no: 'CNT-2025-005', type: 'Contract', customer: 'Global Infra Group', date: '2025-08-10', total_amount: 500000.00, status: 'Active' },
    ]);
    setLoading(false);
  }, []);

  const filtered = documents.filter(d => {
    const matchesSearch = d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          d.doc_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          d.customer.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === 'All Types' || d.type === selectedType;
    return matchesSearch && matchesType;
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={24} style={{ color: '#10b981' }} /> Sales Documents Hub
          </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              Central repository for quotations, commercial invoices, delivery notes, and sales contracts
            </p>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
            <Search size={18} style={{ color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search document title, number or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ border: 'none', outline: 'none', width: '100%', fontSize: '14px', fontWeight: 600, color: '#1e293b' }}
            />
          </div>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontWeight: 700, outline: 'none', background: '#f8fafc', fontSize: '13px' }}
          >
            <option value="All Types">All Document Types</option>
            <option value="Quotation">Quotations</option>
            <option value="Invoice">Invoices</option>
            <option value="Delivery Note">Delivery Notes</option>
            <option value="Contract">Contracts</option>
          </select>
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading documents...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>No matching sales documents</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Doc No</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Document Title</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Type</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Customer</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Amount ($)</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Status</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontWeight: 800, color: '#10b981' }}>
                      {d.doc_no}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 800, color: '#1e293b' }}>
                      {d.title}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ padding: '4px 10px', background: '#f3e8ff', color: '#7e22ce', borderRadius: '20px', fontSize: '12px', fontWeight: 800 }}>
                        {d.type}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', color: '#475569', fontWeight: 600 }}>
                      🏢 {d.customer}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0f172a' }}>
                      ${d.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                        background: d.status === 'Paid' || d.status === 'Delivered' || d.status === 'Active' ? '#dcfce7' : '#e0f2fe',
                        color: d.status === 'Paid' || d.status === 'Delivered' || d.status === 'Active' ? '#15803d' : '#0369a1'
                      }}>
                        {d.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: '12px', color: '#94a3b8' }}>
                      {d.date}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
  );
};

export default Documents;
