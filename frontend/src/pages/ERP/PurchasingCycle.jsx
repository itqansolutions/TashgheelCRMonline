import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Package, Truck, CheckCircle2, UserCheck, Plus, FileText } from 'lucide-react';

const PurchasingCycle = () => {
  const [activeTab, setActiveTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
    fetchSuppliers();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await api.get('/erp/purchasing/orders');
      setOrders(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load Purchase Orders');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await api.get('/erp/purchasing/suppliers');
      setSuppliers(res.data.data || []);
    } catch (err) {}
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Package size={28} /> Purchasing & Procurement Cycle
          </h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
            Suppliers, Purchase Orders (PO), Goods Receipt Notes (GRN) with WAC update & 3-Way Match AP Invoices
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('orders')}
          style={{
            padding: '10px 18px', borderRadius: '8px', border: '1px solid #e2e8f0',
            backgroundColor: activeTab === 'orders' ? '#4f46e5' : 'white',
            color: activeTab === 'orders' ? 'white' : '#475569', fontWeight: '600', cursor: 'pointer'
          }}
        >
          Purchase Orders ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab('suppliers')}
          style={{
            padding: '10px 18px', borderRadius: '8px', border: '1px solid #e2e8f0',
            backgroundColor: activeTab === 'suppliers' ? '#4f46e5' : 'white',
            color: activeTab === 'suppliers' ? 'white' : '#475569', fontWeight: '600', cursor: 'pointer'
          }}
        >
          Suppliers ({suppliers.length})
        </button>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading...</div>
        ) : activeTab === 'orders' ? (
          orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px' }}>
              <Package size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
              <h3>No Purchase Orders Found</h3>
              <p style={{ color: '#64748b' }}>Purchase orders committed with suppliers will appear here.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '12px 16px' }}>PO Number</th>
                  <th style={{ padding: '12px 16px' }}>Supplier ID</th>
                  <th style={{ padding: '12px 16px' }}>PO Date</th>
                  <th style={{ padding: '12px 16px' }}>Total Amount</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(po => (
                  <tr key={po.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: '700', color: '#4f46e5' }}>{po.po_number}</td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>{po.supplier_id}</td>
                    <td style={{ padding: '12px 16px', color: '#64748b' }}>{new Date(po.po_date).toLocaleDateString()}</td>
                    <td style={{ padding: '12px 16px', fontWeight: '700' }}>
                      {Number(po.total_amount || 0).toLocaleString()} {po.currency || 'EGP'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', backgroundColor: '#e0e7ff', color: '#3730a3' }}>
                        {po.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          suppliers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px' }}>
              <UserCheck size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
              <h3>No Suppliers Registered</h3>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '12px 16px' }}>Supplier Code</th>
                  <th style={{ padding: '12px 16px' }}>Name</th>
                  <th style={{ padding: '12px 16px' }}>Company</th>
                  <th style={{ padding: '12px 16px' }}>Tax Number</th>
                  <th style={{ padding: '12px 16px' }}>Phone</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: '700', color: '#4f46e5' }}>{s.code}</td>
                    <td style={{ padding: '12px 16px', fontWeight: '600' }}>{s.name}</td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>{s.company_name || '-'}</td>
                    <td style={{ padding: '12px 16px', color: '#64748b' }}>{s.tax_number || '-'}</td>
                    <td style={{ padding: '12px 16px', color: '#64748b' }}>{s.phone || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
};

export default PurchasingCycle;
