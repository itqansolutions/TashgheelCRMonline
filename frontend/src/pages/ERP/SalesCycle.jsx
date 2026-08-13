import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { ShoppingBag, Truck, FileText, CheckCircle2, Package } from 'lucide-react';

const SalesCycle = () => {
  const [activeTab, setActiveTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await api.get('/erp/sales/orders');
      setOrders(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load Sales Orders');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmOrder = async (orderId) => {
    try {
      await api.put(`/erp/sales/orders/${orderId}/confirm`);
      toast.success('Sales Order confirmed!');
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to confirm order');
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShoppingBag size={28} /> Sales & Fulfillment Cycle
          </h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
            Sales Orders (SO), Delivery Notes (DN), WAC COGS Snapshotting & Automatic Journal Posting
          </p>
        </div>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading Sales Orders...</div>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <ShoppingBag size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
            <h3>No Sales Orders Found</h3>
            <p style={{ color: '#64748b' }}>Sales Orders created from quotations or deals will appear here.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '12px 16px' }}>Order Number</th>
                <th style={{ padding: '12px 16px' }}>Customer ID</th>
                <th style={{ padding: '12px 16px' }}>Date</th>
                <th style={{ padding: '12px 16px' }}>Total Amount</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: '700', color: '#4f46e5' }}>{order.order_number}</td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>{order.customer_id}</td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>{new Date(order.order_date).toLocaleDateString()}</td>
                  <td style={{ padding: '12px 16px', fontWeight: '700' }}>
                    {Number(order.total_amount || 0).toLocaleString()} {order.currency || 'EGP'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                      backgroundColor: order.status === 'confirmed' ? '#dcfce7' : order.status === 'delivered' ? '#e0e7ff' : '#fef3c7',
                      color: order.status === 'confirmed' ? '#166534' : order.status === 'delivered' ? '#3730a3' : '#92400e'
                    }}>
                      {order.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {order.status === 'draft' && (
                      <button
                        onClick={() => handleConfirmOrder(order.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px',
                          backgroundColor: '#10b981', color: 'white', border: 'none',
                          borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer'
                        }}
                      >
                        <CheckCircle2 size={14} /> Confirm Order
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

export default SalesCycle;
