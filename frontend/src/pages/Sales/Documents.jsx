import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { FileText, Download, Eye, Plus, Search, Filter, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import SalesSubNav from '../../components/Sales/SalesSubNav';
import { useLanguage } from '../../context/LanguageContext';

const Documents = () => {
  const { t, isRTL } = useLanguage();
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
      toast.error(t('sales.documents.loadError'));
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

  const currencyLabel = t('common.currency', 'EGP');

  const formatDocType = (type) => {
    if (type === 'Quotation') return t('sales.documents.quotations');
    if (type === 'Sales Order') return t('sales.documents.salesOrders');
    if (type === 'Delivery Note') return t('sales.documents.deliveryNotes');
    if (type === 'Sales Return') return t('sales.documents.salesReturns');
    if (type === 'Invoice') return t('sales.documents.invoices');
    return type;
  };

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <SalesSubNav />
      <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileText size={24} style={{ color: '#10b981' }} /> {t('sales.documents.title')}
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              {t('sales.documents.subtitle')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/finance', { state: { tab: 'Quotations', create: 'Quotation' } })}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px',
                background: '#f8fafc', color: '#0369a1', border: '1.5px solid #bae6fd',
                borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              <Plus size={16} /> {t('sales.documents.newQuotation')}
            </button>
            <button
              onClick={() => navigate('/finance', { state: { tab: 'Invoices', create: 'Invoice' } })}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px',
                background: '#f8fafc', color: '#7e22ce', border: '1.5px solid #e9d5ff',
                borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              <Plus size={16} /> {t('sales.documents.newInvoice')}
            </button>
            <button
              onClick={() => navigate('/sales/orders')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px',
                background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none',
                borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
              }}
            >
              <Plus size={16} /> {t('sales.documents.newSalesOrder')}
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
            <Search size={18} style={{ color: '#94a3b8' }} />
            <input
              type="text"
              placeholder={t('sales.documents.searchPlaceholder')}
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
            <option value="All Types">{t('sales.documents.allTypes')}</option>
            <option value="Quotation">{t('sales.documents.quotations')}</option>
            <option value="Sales Order">{t('sales.documents.salesOrders')}</option>
            <option value="Delivery Note">{t('sales.documents.deliveryNotes')}</option>
            <option value="Sales Return">{t('sales.documents.salesReturns')}</option>
            <option value="Invoice">{t('sales.documents.invoices')}</option>
          </select>
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>{t('sales.documents.loading')}</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
              <FileText size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{t('sales.documents.noDocsTitle')}</h3>
              <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>{t('sales.documents.noDocsDesc')}</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: isRTL ? 'right' : 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('sales.documents.columns.docNo')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('sales.documents.columns.title')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('sales.documents.columns.type')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('sales.documents.columns.customer')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('sales.documents.columns.amount')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('sales.documents.columns.status')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569' }}>{t('sales.documents.columns.date')}</th>
                  <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>{t('sales.documents.columns.action')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontWeight: 800, color: '#10b981' }}>
                      <span className="num-en">{d.doc_no}</span>
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 800, color: '#1e293b' }}>
                      {d.title}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        padding: '4px 10px',
                        background: d.type === 'Invoice' ? '#f3e8ff' : d.type === 'Quotation' ? '#e0f2fe' : d.type === 'Delivery Note' ? '#fef3c7' : d.type === 'Sales Return' ? '#fee2e2' : '#ecfdf5',
                        color: d.type === 'Invoice' ? '#7e22ce' : d.type === 'Quotation' ? '#0369a1' : d.type === 'Delivery Note' ? '#b45309' : d.type === 'Sales Return' ? '#b91c1c' : '#047857',
                        borderRadius: '20px', fontSize: '12px', fontWeight: 800
                      }}>
                        {formatDocType(d.type)}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', color: '#475569', fontWeight: 600 }}>
                      🏢 {d.customer}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0f172a' }}>
                      <span className="num-en">{(parseFloat(d.total_amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> {currencyLabel}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                        background: d.status === 'paid' || d.status === 'confirmed' || d.status === 'delivered' || d.status === 'completed' ? '#dcfce7' : '#fef3c7',
                        color: d.status === 'paid' || d.status === 'confirmed' || d.status === 'delivered' || d.status === 'completed' ? '#15803d' : '#b45309'
                      }}>
                        {d.status?.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: '12px', color: '#94a3b8' }}>
                      <span className="num-en">{d.date}</span>
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                      {d.view_url && (
                        <button
                          onClick={() => handleOpenDoc(d)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', background: '#f1f5f9', border: 'none', borderRadius: '8px', color: '#475569', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                        >
                          <ExternalLink size={13} /> {t('sales.documents.view')}
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
    </div>
  );
};

export default Documents;
