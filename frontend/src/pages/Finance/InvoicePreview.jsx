import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Printer, ArrowLeft, Send } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';

const InvoicePreview = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { currentBranch } = useBranch();
    
    const [invoiceData, setInvoiceData] = useState(null);
    const [loading, setLoading] = useState(true);
    
    const componentRef = useRef();

    const handlePrint = useReactToPrint({
        content: () => componentRef.current,
        documentTitle: `Invoice_${invoiceData?.invoice?.invoice_number}`,
    });

    useEffect(() => {
        const fetchDeepInvoice = async () => {
            try {
                const res = await api.get(`/finance/invoices/${id}`);
                setInvoiceData(res.data.data);
            } catch (err) {
                console.error(err);
                alert('Invoice not found or unauthorized');
                navigate('/finance');
            } finally {
                setLoading(false);
            }
        };
        fetchDeepInvoice();
    }, [id, navigate]);

    if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', color: 'var(--primary)' }}>Loading Invoice Engine...</div>;
    if (!invoiceData) return null;

    const { invoice, items, payments } = invoiceData;

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <style>{`
                .preview-action-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; background: var(--bg-card); padding: 16px 24px; border-radius: 12px; border: 1px solid var(--glass-border); }
                .print-container { background: white; padding: 40px; border-radius: 12px; box-shadow: var(--shadow-xl); color: #000; min-height: 297mm; max-width: 210mm; margin: 0 auto; }
                
                /* A4 PDF Styling */
                .invoice-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e5e7eb; padding-bottom: 24px; margin-bottom: 32px; }
                .org-brand { font-size: 28px; font-weight: 900; color: #111827; letter-spacing: -0.5px; }
                .org-sub { font-size: 13px; color: #6b7280; font-weight: 500; }
                .inv-title { font-size: 36px; font-weight: 800; color: #4f46e5; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0; line-height: 1; }
                
                .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
                .meta-box { background: #f9fafb; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb;}
                .meta-label { font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; margin-bottom: 4px; display: block; }
                .meta-value { font-size: 14px; font-weight: 700; color: #111827; }
                
                .inv-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
                .inv-table th { background: #4f46e5; color: white; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
                .inv-table td { padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #374151; font-weight: 500; }
                .inv-table tr:nth-child(even) td { background: #f9fafb; }
                
                .totals-box { width: 300px; float: right; background: #f9fafb; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; }
                .total-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; color: #4b5563; font-weight: 500; }
                .total-row.grand { border-top: 2px solid #e5e7eb; padding-top: 12px; font-size: 20px; font-weight: 800; color: #111827; }
                .total-row.remaining { color: #ef4444; font-weight: 700; margin-top: 8px;}
                .total-row.paid { color: #10b981; font-weight: 700; }
                
                .clearfix::after { content: ""; clear: both; display: table; }

                .signature-area { margin-top: 80px; display: flex; justify-content: space-between; }
                .sig-box { width: 250px; text-align: center; border-top: 1px dashed #9ca3af; padding-top: 8px; font-size: 13px; color: #6b7280; font-weight: 600; }

                /* Print Media Query Enforcement */
                @media print {
                    body * { visibility: hidden; }
                    .print-container, .print-container * { visibility: visible; }
                    .print-container { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; box-shadow: none; border-radius: 0; }
                    .totals-box { border: none !important; background: transparent !important; }
                    .inv-table th { background: #000 !important; -webkit-print-color-adjust: exact; }
                }
            `}</style>
            
            <div className="preview-action-bar">
                <button onClick={() => navigate('/finance')} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                    <ArrowLeft size={18} /> Back to Ledger
                </button>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'white', padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                        <Send size={16} /> Email PDF
                    </button>
                    <button onClick={handlePrint} style={{ background: 'var(--primary)', border: 'none', color: 'white', padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                        <Printer size={16} /> Print A4 Invoice
                    </button>
                </div>
            </div>

            <div className="print-container" ref={componentRef}>
                <div className="invoice-header">
                    <div>
                        <div className="org-brand">ITQAN SOLUTIONS</div>
                        <div className="org-sub">Advanced System Providers</div>
                        <div className="org-sub">{currentBranch?.address || 'Corporate HQ'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <h1 className="inv-title">INVOICE</h1>
                        <div className="org-sub">No. <strong style={{ color: '#111827' }}>{invoice.invoice_number}</strong></div>
                        <div className="org-sub">Date: {new Date(invoice.created_at).toLocaleDateString()}</div>
                    </div>
                </div>

                <div className="meta-grid">
                    <div className="meta-box">
                        <span className="meta-label">Billed To</span>
                        {/* If we joined customer data, we display it here. Assuming we did or will. */}
                        <div className="meta-value">Customer / Deal Reference</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Deal ID: #{invoice.deal_id || 'N/A'}</div>
                    </div>
                    <div className="meta-box">
                        <span className="meta-label">Payment Terms</span>
                        <div className="meta-value">Due on Receipt</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Status: <span style={{textTransform: 'uppercase'}}>{invoice.status}</span></div>
                    </div>
                </div>

                <table className="inv-table">
                    <thead>
                        <tr>
                            <th>Item Description</th>
                            <th style={{ textAlign: 'center' }}>Qty</th>
                            <th style={{ textAlign: 'right' }}>Unit Price</th>
                            <th style={{ textAlign: 'right' }}>Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items && items.length > 0 ? items.map((item, idx) => (
                            <tr key={idx}>
                                <td>{item.product_name || `Product / Service ID #${item.product_id || 'Custom'}`}</td>
                                <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                                <td style={{ textAlign: 'right' }}>{parseFloat(item.unit_price).toLocaleString()}</td>
                                <td style={{ textAlign: 'right', fontWeight: 700 }}>{parseFloat(item.subtotal).toLocaleString()}</td>
                            </tr>
                        )) : (
                            <tr><td colSpan="4" style={{ textAlign: 'center', color: '#9ca3af' }}>No line items defined</td></tr>
                        )}
                    </tbody>
                </table>

                <div className="clearfix">
                    <div className="totals-box">
                        <div className="total-row">
                            <span>Subtotal</span>
                            <span>{parseFloat(invoice.total_amount).toLocaleString()} EGP</span>
                        </div>
                        <div className="total-row">
                            <span>Tax (0%)</span>
                            <span>0.00 EGP</span>
                        </div>
                        <div className="total-row grand">
                            <span>Total</span>
                            <span>{parseFloat(invoice.total_amount).toLocaleString()} EGP</span>
                        </div>
                        <div className="total-row paid">
                            <span>Amount Paid</span>
                            <span>- {parseFloat(invoice.total_paid).toLocaleString()} EGP</span>
                        </div>
                        <div className="total-row remaining">
                            <span>Balance Due</span>
                            <span>{parseFloat(invoice.remaining_balance).toLocaleString()} EGP</span>
                        </div>
                    </div>
                </div>

                {payments && payments.length > 0 && (
                    <div style={{ marginTop: '40px', fontSize: '12px', color: '#6b7280' }}>
                        <strong style={{ display: 'block', marginBottom: '8px', color: '#374151', textTransform: 'uppercase' }}>Payment History</strong>
                        {payments.map((p, i) => (
                            <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #e5e7eb' }}>
                                {new Date(p.payment_date).toLocaleDateString()} — {parseFloat(p.amount).toLocaleString()} EGP via {p.payment_method.toUpperCase()}
                            </div>
                        ))}
                    </div>
                )}

                <div className="signature-area">
                    <div className="sig-box">
                        Authorized Signature
                    </div>
                    <div className="sig-box">
                        Customer Acceptance
                    </div>
                </div>

                <div style={{ marginTop: '60px', textAlign: 'center', fontSize: '11px', color: '#9ca3af', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                    Thank you for your business. Please make checks payable to Itqan Solutions. 
                    <br/>Powered by Tashgheel Enterprise CRM.
                </div>
            </div>
        </div>
    );
};

export default InvoicePreview;
