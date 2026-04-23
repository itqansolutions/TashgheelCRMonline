import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import api from '../../services/api';
import QuotationPreviewComponent from '../../components/Features/QuotationPreview';

const QuotationPreview = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quotation, setQuotation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQuotation = async () => {
      try {
        const res = await api.get(`/quotations/${id}`);
        setQuotation(res.data.data);
      } catch (err) {
        console.error('Failed to fetch quotation', err);
      } finally {
        setLoading(false);
      }
    };
    fetchQuotation();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading Quotation...</div>;
  if (!quotation) return <div style={{ padding: '40px', textAlign: 'center' }}>Quotation not found.</div>;

  return (
    <div style={{ padding: '40px' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '800px', margin: '0 auto 24px auto' }}>
        <button 
          onClick={() => navigate(-1)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 600 }}
        >
          <ArrowLeft size={18} /> Back
        </button>
        <button 
          onClick={handlePrint}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--primary)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
        >
          <Printer size={18} /> Print Quotation
        </button>
      </div>

      <QuotationPreviewComponent quotation={quotation} />
    </div>
  );
};

export default QuotationPreview;
