import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { FileText, Download, Eye, Plus, Search, Filter, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';

const Documents = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('All Types');
  const navigate = useNavigate();

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await api.get('/sales/documents').catch(() => ({ data: { data: [] } }));
      setDocuments(res.data?.data || []);
    } catch (err) {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const filtered = documents.filter(d => {
    const matchesSearch = (d.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (d.doc_no || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (d.customer || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === 'All Types' || d.type === selectedType;
    return matchesSearch && matchesType;
  });

  const handleOpenDoc = (d) => {
    if (d.view_url) {
      navigate(d.view_url);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={24} style={{ color: '#10b981' }} /> Sales Documents Hub
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
            Central repository for quotations, commercial invoices, delivery notes, and sales orders
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
          <option value="Sales Order">Sales Orders</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading sales documents...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
            <FileText size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>No Sales Documents Found</h3>
            <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Created quotations, sales orders, and invoices will appear automatically in this ledger.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Doc No</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Document Title</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Type</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Customer</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Amount</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Status</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Date</th>
                <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>Action</th>
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
                    <span style={{
                      padding: '4px 10px',
                      background: d.type === 'Invoice' ? '#f3e8ff' : d.type === 'Quotation' ? '#e0f2fe' : '#ecfdf5',
                      color: d.type === 'Invoice' ? '#7e22ce' : d.type === 'Quotation' ? '#0369a1' : '#047857',
                      borderRadius: '20px', fontSize: '12px', fontWeight: 800
                    }}>
                      {d.type}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', color: '#475569', fontWeight: 600 }}>
                    🏢 {d.customer}
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0f172a' }}>
                    ${(parseFloat(d.total_amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                      background: d.status === 'paid' || d.status === 'confirmed' || d.status === 'delivered' ? '#dcfce7' : '#fef3c7',
                      color: d.status === 'paid' || d.status === 'confirmed' || d.status === 'delivered' ? '#15803d' : '#b45309'
                    }}>
                      {d.status?.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', fontSize: '12px', color: '#94a3b8' }}>
                    {d.date}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    {d.view_url && (
                      <button
                        onClick={() => handleOpenDoc(d)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', background: '#f1f5f9', border: 'none', borderRadius: '8px', color: '#475569', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                      >
                        <ExternalLink size={13} /> View
                      </button>
                    )}
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
