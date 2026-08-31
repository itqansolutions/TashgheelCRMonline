import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, ShoppingBag, FileText } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
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

  const handleConvertToSalesOrder = async () => {
    try {
      await api.post(`/erp/sales/orders/from-quotation/${id}`);
      toast.success('Quotation converted to Sales Order successfully!');
      navigate('/sales/orders');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to convert to sales order');
    }
  };

  const handleConvertToInvoice = async () => {
    try {
      const res = await api.post(`/invoices/from-quotation/${id}`);
      toast.success('Invoice created from Quotation!');
      if (res.data?.data?.id) {
        navigate(`/finance/invoice-preview/${res.data.data.id}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to convert to invoice');
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading Quotation...</div>;
  if (!quotation) return <div style={{ padding: '40px', textAlign: 'center' }}>Quotation not found.</div>;

  return (
    <div style={{ padding: '40px' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '800px', margin: '0 auto 24px auto', flexWrap: 'wrap', gap: '12px' }}>
        <button 
          onClick={() => navigate(-1)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 600 }}
        >
          <ArrowLeft size={18} /> Back
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            onClick={handleConvertToSalesOrder}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '9px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}
          >
            <ShoppingBag size={16} /> Create Sales Order
          </button>
          <button 
            onClick={handleConvertToInvoice}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f3e8ff', color: '#7e22ce', border: '1px solid #ddd6fe', padding: '9px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}
          >
            <FileText size={16} /> Create Invoice
          </button>
          <button 
            onClick={handlePrint}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--primary)', color: 'white', border: 'none', padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}
          >
            <Printer size={16} /> Print Quotation
          </button>
        </div>
      </div>

      <QuotationPreviewComponent quotation={quotation} />
    </div>
  );
};

export default QuotationPreview;
