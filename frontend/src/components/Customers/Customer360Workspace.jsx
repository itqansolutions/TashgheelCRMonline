import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import ActivityTimeline from '../Common/ActivityTimeline';
import { 
  Building, Mail, Phone, MapPin, User, FileText, ShoppingCart, 
  Truck, ArrowDownLeft, DollarSign, Calendar, Clock, CheckCircle, 
  AlertCircle, ChevronRight, RefreshCw, X, Eye, FileCheck, Layers
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const Customer360Workspace = ({ customerId, initialCustomer, onClose }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [data360, setData360] = useState(null);
  const [error, setError] = useState(null);

  const fetch360Data = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/customers/${customerId}/360`);
      if (res.data?.status === 'success') {
        setData360(res.data.data);
      } else {
        setError('Failed to load Customer 360 data');
      }
    } catch (err) {
      console.error('[Customer 360 Fetch Error]', err);
      setError(err.response?.data?.message || 'Error fetching Customer 360 profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (customerId) {
      fetch360Data();
    }
  }, [customerId]);

  const customer = data360?.customer || initialCustomer || {};
  const summary = data360?.summary || {};
  const deals = data360?.deals || [];
  const generalSales = data360?.general_sales || { quotations: [], sales_orders: [], delivery_notes: [], invoices: [], sales_returns: [] };
  const finance = data360?.finance || { invoices: [], linked_payments: [], on_account_vouchers: [] };
  const realEstate = data360?.real_estate || { contracts: [], installments: [], handovers: [] };
  const timeline = data360?.timeline || [];

  const showRealEstateTab = summary.has_real_estate === true || 
    (customer.budget_min > 0 || customer.preferred_location) ||
    realEstate.contracts.length > 0;

  return (
    <div className="c360-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '600px' }}>
      {/* ── Top Header Bar ────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1e38 0%, #2a2b4c 100%)',
        color: '#fff',
        padding: '20px 24px',
        borderRadius: '16px',
        marginBottom: '20px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {/* Row 1: Profile & Badges */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: '#fff',
              fontSize: '22px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)'
            }}>
              {(customer.name || 'C')[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#fff' }}>
                  {customer.name || 'Customer Profile'}
                </h2>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  background: 'rgba(255,255,255,0.15)',
                  color: '#e0e7ff',
                  border: '1px solid rgba(255,255,255,0.2)'
                }}>
                  {customer.entity_type || 'Customer'}
                </span>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: customer.status === 'customer' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                  color: customer.status === 'customer' ? '#86efac' : '#fde047',
                  border: `1px solid ${customer.status === 'customer' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`
                }}>
                  {customer.status?.toUpperCase() || 'LEAD'}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '8px', fontSize: '13px', color: '#cbd5e1' }}>
                {customer.phone && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Phone size={14} color="#94a3b8" /> {customer.phone}
                  </span>
                )}
                {customer.email && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Mail size={14} color="#94a3b8" /> {customer.email}
                  </span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building size={14} color="#94a3b8" /> {customer.branch_name || 'Main Branch'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={14} color="#94a3b8" /> {customer.assigned_to_name || 'Unassigned'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={fetch360Data}
              title="Refresh Customer 360"
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff',
                padding: '8px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* Row 2: Financial & Operational KPI Badges */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          paddingTop: '14px',
          borderTop: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div style={{ background: 'rgba(255,255,255,0.06)', padding: '12px 14px', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Current Balance</div>
            <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px', color: (summary.outstanding_balance || 0) > 0 ? '#f87171' : '#4ade80' }}>
              {Number(summary.outstanding_balance || 0).toLocaleString()} <span style={{ fontSize: '11px' }}>EGP</span>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.06)', padding: '12px 14px', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Total Invoiced</div>
            <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px', color: '#e0e7ff' }}>
              {Number(summary.total_invoiced || 0).toLocaleString()} <span style={{ fontSize: '11px' }}>EGP</span>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.06)', padding: '12px 14px', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Total Collected</div>
            <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px', color: '#86efac' }}>
              {Number(summary.total_collected || 0).toLocaleString()} <span style={{ fontSize: '11px' }}>EGP</span>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.06)', padding: '12px 14px', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Active Deals</div>
            <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px', color: '#67e8f9' }}>
              {summary.deals_count || 0}
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.06)', padding: '12px 14px', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Sales Orders</div>
            <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px', color: '#fbcfe8' }}>
              {summary.sales_orders_count || 0}
            </div>
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs ────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: '6px',
        borderBottom: '2px solid #e2e8f0',
        marginBottom: '20px',
        overflowX: 'auto',
        paddingBottom: '2px'
      }}>
        {[
          { id: 'overview', label: '📊 Overview' },
          { id: 'timeline', label: `⏱️ Unified Timeline (${timeline.length})` },
          { id: 'crm_activity', label: '📞 CRM Interactions' },
          { id: 'deals', label: `🤝 Deals (${deals.length})` },
          { id: 'general_sales', label: `🛒 General Sales (${generalSales.sales_orders.length + generalSales.delivery_notes.length})` },
          { id: 'finance', label: `💰 Finance & Invoices (${finance.invoices.length})` },
          ...(showRealEstateTab ? [{ id: 'real_estate', label: `🏢 Real Estate (${realEstate.contracts.length})` }] : [])
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 18px',
              border: 'none',
              borderBottom: activeTab === tab.id ? '3px solid #4f46e5' : '3px solid transparent',
              background: activeTab === tab.id ? 'rgba(79, 70, 229, 0.08)' : 'transparent',
              color: activeTab === tab.id ? '#4f46e5' : '#64748b',
              fontWeight: activeTab === tab.id ? 800 : 600,
              fontSize: '13px',
              cursor: 'pointer',
              borderRadius: '8px 8px 0 0',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content Views ──────────────────────────────────────── */}
      {loading && !data360 ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: '#94a3b8' }}>
          <RefreshCw size={24} className="spin" style={{ marginBottom: '12px' }} />
          <div>Assembling Customer 360 Workspace...</div>
        </div>
      ) : error ? (
        <div style={{ padding: '24px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '12px', color: '#b91c1c' }}>
          {error}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              {/* Identity Details Card */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <User size={16} color="#4f46e5" /> Client Identification
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '13px' }}>
                  <div>
                    <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Phone</label>
                    <div style={{ fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>{customer.phone || 'N/A'}</div>
                  </div>
                  <div>
                    <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Email</label>
                    <div style={{ fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>{customer.email || 'N/A'}</div>
                  </div>
                  <div>
                    <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Company</label>
                    <div style={{ fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>{customer.company_name || 'Individual'}</div>
                  </div>
                  <div>
                    <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Tax / Reg No</label>
                    <div style={{ fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>{customer.tax_no || customer.reg_no || 'N/A'}</div>
                  </div>
                  <div>
                    <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Source</label>
                    <div style={{ fontWeight: 700, color: '#4f46e5', marginTop: '2px' }}>{customer.source_name || 'Direct'}</div>
                  </div>
                  <div>
                    <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Classification</label>
                    <div style={{ fontWeight: 700, color: customer.classification_color || '#1e293b', marginTop: '2px' }}>
                      {customer.classification_name || 'Standard'}
                    </div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Address / Location</label>
                    <div style={{ fontWeight: 600, color: '#334155', marginTop: '2px' }}>{customer.address || customer.area_name || 'N/A'}</div>
                  </div>
                </div>

                {customer.notes && (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                    <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Notes & Form Data</label>
                    <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', fontSize: '12px', color: '#475569', marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                      {customer.notes}
                    </div>
                  </div>
                )}
              </div>

              {/* Financial Snapshot Card */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <DollarSign size={16} color="#16a34a" /> Financial Standing
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px' }}>
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Total Billed (Invoices)</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{Number(summary.total_invoiced || 0).toLocaleString()} EGP</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: '#f0fdf4', borderRadius: '8px' }}>
                    <span style={{ fontSize: '13px', color: '#16a34a', fontWeight: 600 }}>Total Collections & Receipts</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#16a34a' }}>{Number(summary.total_collected || 0).toLocaleString()} EGP</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: (summary.outstanding_balance || 0) > 0 ? '#fef2f2' : '#f8fafc', borderRadius: '8px' }}>
                    <span style={{ fontSize: '13px', color: (summary.outstanding_balance || 0) > 0 ? '#b91c1c' : '#64748b', fontWeight: 700 }}>Outstanding Receivable</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: (summary.outstanding_balance || 0) > 0 ? '#dc2626' : '#10b981' }}>
                      {Number(summary.outstanding_balance || 0).toLocaleString()} EGP
                    </span>
                  </div>
                  {summary.overdue_amount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#fff1f2', borderRadius: '8px', border: '1px solid #ffe4e6' }}>
                      <span style={{ fontSize: '12px', color: '#e11d48', fontWeight: 700 }}>⚠️ Overdue Invoices</span>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#e11d48' }}>{Number(summary.overdue_amount).toLocaleString()} EGP</span>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setActiveTab('finance')}
                    style={{ flex: 1, padding: '8px 12px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    View Invoices & Vouchers
                  </button>
                  <button
                    onClick={() => setActiveTab('timeline')}
                    style={{ flex: 1, padding: '8px 12px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    View Audit Trail
                  </button>
                </div>
              </div>

              {/* Recent Activity Mini-Feed */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px', gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={16} color="#0284c7" /> Latest Customer Engagements
                  </h4>
                  <button
                    onClick={() => setActiveTab('timeline')}
                    style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    Full Timeline →
                  </button>
                </div>

                {timeline.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                    No recorded activities or documents yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {timeline.slice(0, 5).map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', fontSize: '13px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontWeight: 800, color: '#1e293b' }}>{item.title}</span>
                          <span style={{ color: '#64748b' }}>{item.description}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '11px' }}>
                          <span style={{ fontWeight: 600, color: '#475569' }}>{item.actor_name}</span>
                          <span>•</span>
                          <span>{formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: UNIFIED TIMELINE */}
          {activeTab === 'timeline' && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px' }}>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                  Unified Timeline: Who did what and when?
                </h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                  Chronological synthesis of sales interactions, phone calls, quotations, orders, deliveries, invoices, and payments.
                </p>
              </div>

              {timeline.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  No historical entries found for this client.
                </div>
              ) : (
                <div style={{ position: 'relative', paddingLeft: '32px' }}>
                  <div style={{ position: 'absolute', left: '13px', top: '10px', bottom: '10px', width: '2px', background: '#e2e8f0' }} />
                  {timeline.map((item, idx) => (
                    <div key={item.id} style={{ position: 'relative', paddingBottom: idx === timeline.length - 1 ? 0 : '22px' }}>
                      <div style={{
                        position: 'absolute',
                        left: '-32px',
                        top: '2px',
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: item.source === 'payment' ? '#dcfce7' : item.source === 'crm' ? '#f5f3ff' : item.source === 'invoice' ? '#fee2e2' : '#eff6ff',
                        color: item.source === 'payment' ? '#16a34a' : item.source === 'crm' ? '#7c3aed' : item.source === 'invoice' ? '#dc2626' : '#2563eb',
                        border: '2px solid currentColor',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px'
                      }}>
                        {item.source === 'payment' ? '💵' : item.source === 'crm' ? '📞' : item.source === 'deal' ? '🤝' : item.source === 'invoice' ? '🧾' : '📄'}
                      </div>
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>{item.title}</span>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {new Date(item.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.5' }}>
                          {item.description}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', fontWeight: 600 }}>
                          Executed by: <span style={{ color: '#4f46e5' }}>{item.actor_name}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CRM DIRECT INTERACTIONS */}
          {activeTab === 'crm_activity' && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px' }}>
              <ActivityTimeline entityType="customer" entityId={customerId} />
            </div>
          )}

          {/* TAB 4: DEALS */}
          {activeTab === 'deals' && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>
                Client Deals ({deals.length})
              </h4>
              {deals.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>No deals registered for this customer.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {deals.map(d => (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                      <div>
                        <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '14px' }}>{d.title}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                          Pipeline Stage: <span style={{ fontWeight: 700, color: '#4f46e5' }}>{d.pipeline_stage}</span>
                          {d.product_name && ` • Product: ${d.product_name}`}
                          {` • Assigned: ${d.assigned_to_name || 'Unassigned'}`}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{Number(d.value || 0).toLocaleString()} EGP</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Created {new Date(d.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: GENERAL SALES */}
          {activeTab === 'general_sales' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Sales Orders */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 14px 0', fontSize: '14px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShoppingCart size={16} color="#4f46e5" /> Sales Orders ({generalSales.sales_orders.length})
                </h4>
                {generalSales.sales_orders.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No sales orders recorded.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {generalSales.sales_orders.map(so => (
                      <div key={so.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div>
                          <span style={{ fontWeight: 800, color: '#4f46e5', marginRight: '8px' }}>{so.number || `#${so.id}`}</span>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>Status: {so.status} • Delivery: {so.expected_delivery ? new Date(so.expected_delivery).toLocaleDateString() : 'N/A'}</span>
                        </div>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>{Number(so.total_amount || 0).toLocaleString()} EGP</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Delivery Notes */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 14px 0', fontSize: '14px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Truck size={16} color="#059669" /> Delivery Notes ({generalSales.delivery_notes.length})
                </h4>
                {generalSales.delivery_notes.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No deliveries recorded.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {generalSales.delivery_notes.map(dn => (
                      <div key={dn.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div>
                          <span style={{ fontWeight: 800, color: '#059669', marginRight: '8px' }}>{dn.number || `#${dn.id}`}</span>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>From {dn.warehouse_name || 'Warehouse'} • Status: {dn.status}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{new Date(dn.delivery_date || dn.created_at).toLocaleDateString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quotations & Returns */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                    📄 Quotations ({generalSales.quotations.length})
                  </h4>
                  {generalSales.quotations.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>No quotations found.</div>
                  ) : (
                    generalSales.quotations.map(q => (
                      <div key={q.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>QT-{q.id} ({q.status})</span>
                        <span style={{ fontWeight: 700 }}>{Number(q.total_amount).toLocaleString()} EGP</span>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                    🔄 Returns ({generalSales.sales_returns.length})
                  </h4>
                  {generalSales.sales_returns.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>No sales returns.</div>
                  ) : (
                    generalSales.sales_returns.map(sr => (
                      <div key={sr.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>{sr.number || `#${sr.id}`} ({sr.status})</span>
                        <span style={{ fontWeight: 700 }}>{Number(sr.total_amount || 0).toLocaleString()} EGP</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: FINANCE & INVOICES */}
          {activeTab === 'finance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Invoices List */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={16} color="#dc2626" /> Customer Invoices ({finance.invoices.length})
                </h4>
                {finance.invoices.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No invoices issued yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {finance.invoices.map(inv => (
                      <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div>
                          <span style={{ fontWeight: 800, color: '#dc2626', marginRight: '8px' }}>{inv.invoice_number || `INV-${inv.id}`}</span>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>Due: {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : 'Immediate'} • Status: {inv.status}</span>
                        </div>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>{Number(inv.total_amount || 0).toLocaleString()} EGP</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Collections: Linked Payments & On-Account Receipts */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, color: '#16a34a' }}>
                    💵 Invoice-Linked Receipts ({finance.linked_payments.length})
                  </h4>
                  {finance.linked_payments.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>No linked payments recorded.</div>
                  ) : (
                    finance.linked_payments.map(p => (
                      <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>{p.voucher_number} (Inv: {p.invoice_number})</span>
                        <span style={{ fontWeight: 700, color: '#16a34a' }}>+{Number(p.amount).toLocaleString()} EGP</span>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, color: '#0284c7' }}>
                    💼 On-Account Receipts ({finance.on_account_vouchers.length})
                  </h4>
                  {finance.on_account_vouchers.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>No on-account receipts.</div>
                  ) : (
                    finance.on_account_vouchers.map(v => (
                      <div key={v.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>{v.voucher_number} (Advance / Credit)</span>
                        <span style={{ fontWeight: 700, color: '#0284c7' }}>+{Number(v.amount).toLocaleString()} EGP</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: REAL ESTATE (CONDITIONAL) */}
          {activeTab === 'real_estate' && showRealEstateTab && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Reservations */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={16} color="#d97706" /> Property Reservations ({realEstate.reservations?.length || 0})
                </h4>
                {(!realEstate.reservations || realEstate.reservations.length === 0) ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No active unit reservations found.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {realEstate.reservations.map(res => (
                      <div key={res.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fef3c7' }}>
                        <div>
                          <span style={{ fontWeight: 800, color: '#b45309', marginRight: '8px' }}>{res.title}</span>
                          <span style={{ fontSize: '12px', color: '#78350f' }}>
                            Unit {res.unit_number || 'N/A'} • {res.unit_project_name || 'Project'} • Stage: {res.pipeline_stage}
                            {res.unit_reservation_expires_at && ` • Expires: ${new Date(res.unit_reservation_expires_at).toLocaleDateString()}`}
                          </span>
                        </div>
                        <div style={{ fontWeight: 800, color: '#92400e' }}>{Number(res.value || 0).toLocaleString()} EGP</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Contracts */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Building size={16} color="#4f46e5" /> Property Contracts ({realEstate.contracts?.length || 0})
                </h4>
                {(!realEstate.contracts || realEstate.contracts.length === 0) ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No contracts signed yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {realEstate.contracts.map(c => (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div>
                          <span style={{ fontWeight: 800, color: '#4f46e5', marginRight: '8px' }}>{c.contract_number}</span>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>Unit: {c.unit_number || 'N/A'} • {c.project_name || 'Project'} • Status: {c.status}</span>
                        </div>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>{Number(c.contract_value || 0).toLocaleString()} EGP</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Collections & Payments */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <DollarSign size={16} color="#16a34a" /> Property Collections & Receipts ({realEstate.collections?.length || 0})
                </h4>
                {(!realEstate.collections || realEstate.collections.length === 0) ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No property collections recorded.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {realEstate.collections.map(col => (
                      <div key={col.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #dcfce7' }}>
                        <div>
                          <span style={{ fontWeight: 800, color: '#16a34a', marginRight: '8px' }}>{col.voucher_number}</span>
                          <span style={{ fontSize: '12px', color: '#15803d' }}>
                            {col.contract_number ? `Contract ${col.contract_number}` : 'Property Receipt'} 
                            {col.unit_number ? ` • Unit ${col.unit_number}` : ''} • Date: {new Date(col.voucher_date).toLocaleDateString()}
                          </span>
                        </div>
                        <div style={{ fontWeight: 800, color: '#15803d' }}>+{Number(col.amount || 0).toLocaleString()} EGP</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Installments & Handovers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                    📅 Installments Schedule ({realEstate.installments?.length || 0})
                  </h4>
                  {(!realEstate.installments || realEstate.installments.length === 0) ? (
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>No active installment schedule.</div>
                  ) : (
                    realEstate.installments.slice(0, 10).map(inst => (
                      <div key={inst.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>#{inst.installment_number} ({new Date(inst.due_date).toLocaleDateString()}) - {inst.status}</span>
                        <span style={{ fontWeight: 700 }}>{Number(inst.amount).toLocaleString()} EGP</span>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                    🔑 Unit Handovers ({realEstate.handovers?.length || 0})
                  </h4>
                  {(!realEstate.handovers || realEstate.handovers.length === 0) ? (
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>No handover events recorded.</div>
                  ) : (
                    realEstate.handovers.map(h => (
                      <div key={h.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>Unit {h.unit_number} - Status: {h.status}</span>
                        <span style={{ color: '#64748b' }}>{h.actual_handover_date ? new Date(h.actual_handover_date).toLocaleDateString() : 'Scheduled'}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Customer360Workspace;
