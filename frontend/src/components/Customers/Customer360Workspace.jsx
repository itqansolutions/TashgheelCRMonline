import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import ActivityTimeline from '../Common/ActivityTimeline';
import { 
  Building, Mail, Phone, MapPin, User, FileText, ShoppingCart, 
  Truck, ArrowDownLeft, DollarSign, Calendar, Clock, CheckCircle, 
  AlertCircle, ChevronRight, RefreshCw, X, Eye, FileCheck, Layers, Sparkles
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useLanguage } from '../../context/LanguageContext';

const Customer360Workspace = ({ customerId, initialCustomer, onClose }) => {
  const navigate = useNavigate();
  const { t, isRTL } = useLanguage();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [data360, setData360] = useState(null);
  const [error, setError] = useState(null);
  const [matchedUnits, setMatchedUnits] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [expandedMatchId, setExpandedMatchId] = useState(null);

  const fetch360Data = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/customers/${customerId}/360`);
      if (res.data?.status === 'success') {
        setData360(res.data.data);
      } else {
        setError(t('customers.failedLoad360', 'Failed to load Customer 360 data'));
      }
    } catch (err) {
      console.error('[Customer 360 Fetch Error]', err);
      setError(err.response?.data?.message || t('customers.failedLoad360', 'Error fetching Customer 360 profile'));
    } finally {
      setLoading(false);
    }
  };

  const fetchMatchedUnits = async () => {
    if (!customerId) return;
    setLoadingMatches(true);
    try {
      const res = await api.get(`/re-units/match-customer/${customerId}`);
      setMatchedUnits(res.data?.data?.matches || []);
    } catch (err) {
      console.warn('[Customer 360 Match Units Fetch Notice]:', err.message);
      setMatchedUnits([]);
    } finally {
      setLoadingMatches(false);
    }
  };

  useEffect(() => {
    if (customerId) {
      fetch360Data();
      fetchMatchedUnits();
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
    realEstate.contracts.length > 0 ||
    matchedUnits.length > 0;

  const getEntityLabel = (type) => {
    switch (type) {
      case 'customer': return t('customers.entityCustomer', 'Customer');
      case 'vendor': return t('customers.entityVendor', 'Vendor');
      case 'broker': return t('customers.entityBroker', 'Broker');
      case 'partner': return t('customers.entityPartner', 'Partner');
      default: return type || t('customers.entityCustomer', 'Customer');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'customer':
      case 'active':
        return t('customers.statusActive', 'ACTIVE');
      case 'lead':
        return t('customers.statusLead', 'LEAD');
      case 'inactive':
        return t('customers.statusInactive', 'INACTIVE');
      default:
        return status?.toUpperCase() || t('customers.statusLead', 'LEAD');
    }
  };

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
                  {customer.name || t('customers.customerProfile', 'Customer Profile')}
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
                  {getEntityLabel(customer.entity_type)}
                </span>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: customer.status === 'customer' || customer.status === 'active' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                  color: customer.status === 'customer' || customer.status === 'active' ? '#86efac' : '#fde047',
                  border: `1px solid ${customer.status === 'customer' || customer.status === 'active' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`
                }}>
                  {getStatusBadge(customer.status)}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '8px', fontSize: '13px', color: '#cbd5e1' }}>
                {customer.phone && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Phone size={14} color="#94a3b8" /> 
                    <span className="num-en" dir="ltr">{customer.phone}</span>
                  </span>
                )}
                {customer.email && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Mail size={14} color="#94a3b8" /> {customer.email}
                  </span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building size={14} color="#94a3b8" /> {customer.branch_name || t('customers.mainBranch', 'Main Branch')}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={14} color="#94a3b8" /> {customer.assigned_to_name || t('customers.unassigned', 'Unassigned')}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={fetch360Data}
              title={t('common.refresh', 'Refresh')}
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
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> {t('common.refresh', 'Refresh')}
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
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
              {t('customers.currentBalance', 'Current Balance')}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px', color: (summary.outstanding_balance || 0) > 0 ? '#f87171' : '#4ade80' }}>
              <span className="num-en">{Number(summary.outstanding_balance || 0).toLocaleString('en-US')}</span> <span style={{ fontSize: '11px' }}>{t('common.currency', 'EGP')}</span>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.06)', padding: '12px 14px', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
              {t('customers.totalInvoiced', 'Total Invoiced')}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px', color: '#e0e7ff' }}>
              <span className="num-en">{Number(summary.total_invoiced || 0).toLocaleString('en-US')}</span> <span style={{ fontSize: '11px' }}>{t('common.currency', 'EGP')}</span>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.06)', padding: '12px 14px', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
              {t('customers.totalCollected', 'Total Collected')}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px', color: '#86efac' }}>
              <span className="num-en">{Number(summary.total_collected || 0).toLocaleString('en-US')}</span> <span style={{ fontSize: '11px' }}>{t('common.currency', 'EGP')}</span>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.06)', padding: '12px 14px', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
              {t('customers.activeDeals', 'Active Deals')}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px', color: '#67e8f9' }}>
              <span className="num-en">{summary.deals_count || 0}</span>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.06)', padding: '12px 14px', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
              {t('customers.salesOrders', 'Sales Orders')}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px', color: '#fbcfe8' }}>
              <span className="num-en">{summary.sales_orders_count || 0}</span>
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
          { id: 'overview', label: `📊 ${t('customers.tabs.overview', 'Overview')}` },
          { id: 'timeline', label: `⏱️ ${t('customers.tabs.timeline', 'Unified Timeline ({count})', { count: timeline.length })}` },
          { id: 'crm_activity', label: `📞 ${t('customers.tabs.crmInteractions', 'CRM Interactions')}` },
          { id: 'deals', label: `🤝 ${t('customers.tabs.deals', 'Deals ({count})', { count: deals.length })}` },
          { id: 'general_sales', label: `🛒 ${t('customers.tabs.generalSales', 'General Sales ({count})', { count: generalSales.sales_orders.length + generalSales.delivery_notes.length })}` },
          { id: 'finance', label: `💰 ${t('customers.tabs.finance', 'Finance & Invoices ({count})', { count: finance.invoices.length })}` },
          ...(showRealEstateTab ? [{ id: 'real_estate', label: `🏢 ${t('customers.tabs.realEstate', 'Real Estate ({count})', { count: realEstate.contracts.length })}` }] : [])
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
          <div>{t('customers.assemblingWorkspace', 'Assembling Customer 360 Workspace...')}</div>
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
                  <User size={16} color="#4f46e5" /> {t('customers.clientIdentification', 'Client Identification')}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '13px' }}>
                  <div>
                    <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>{t('customers.phone', 'Phone')}</label>
                    <div style={{ fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>
                      {customer.phone ? <span className="num-en" dir="ltr">{customer.phone}</span> : '—'}
                    </div>
                  </div>
                  <div>
                    <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>{t('customers.email', 'Email')}</label>
                    <div style={{ fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>{customer.email || '—'}</div>
                  </div>
                  <div>
                    <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>{t('customers.company', 'Company')}</label>
                    <div style={{ fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>{customer.company_name || t('customers.individual', 'Individual')}</div>
                  </div>
                  <div>
                    <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>{t('customers.taxReg', 'Tax / Reg No')}</label>
                    <div className="num-en" style={{ fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>{customer.tax_no || customer.reg_no || '—'}</div>
                  </div>
                  <div>
                    <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>{t('customers.source', 'Source')}</label>
                    <div style={{ fontWeight: 700, color: '#4f46e5', marginTop: '2px' }}>{customer.source_name || t('customers.directOther', 'Direct')}</div>
                  </div>
                  <div>
                    <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>{t('customers.classification', 'Classification')}</label>
                    <div style={{ fontWeight: 700, color: customer.classification_color || '#1e293b', marginTop: '2px' }}>
                      {customer.classification_name || '—'}
                    </div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>{t('customers.addressLocation', 'Address / Location')}</label>
                    <div style={{ fontWeight: 600, color: '#334155', marginTop: '2px' }}>{customer.address || customer.area_name || '—'}</div>
                  </div>
                </div>

                {customer.notes && (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                    <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>{t('customers.notesFormData', 'Notes & Form Data')}</label>
                    <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', fontSize: '12px', color: '#475569', marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                      {customer.notes}
                    </div>
                  </div>
                )}
              </div>

              {/* Financial Snapshot Card */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <DollarSign size={16} color="#16a34a" /> {t('customers.financialStanding', 'Financial Standing')}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px' }}>
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>{t('customers.totalBilled', 'Total Billed (Invoices)')}</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                      <span className="num-en">{Number(summary.total_invoiced || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: '#f0fdf4', borderRadius: '8px' }}>
                    <span style={{ fontSize: '13px', color: '#16a34a', fontWeight: 600 }}>{t('customers.totalCollections', 'Total Collections & Receipts')}</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#16a34a' }}>
                      <span className="num-en">{Number(summary.total_collected || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: (summary.outstanding_balance || 0) > 0 ? '#fef2f2' : '#f8fafc', borderRadius: '8px' }}>
                    <span style={{ fontSize: '13px', color: (summary.outstanding_balance || 0) > 0 ? '#b91c1c' : '#64748b', fontWeight: 700 }}>{t('customers.outstandingReceivable', 'Outstanding Receivable')}</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: (summary.outstanding_balance || 0) > 0 ? '#dc2626' : '#10b981' }}>
                      <span className="num-en">{Number(summary.outstanding_balance || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}
                    </span>
                  </div>
                  {summary.overdue_amount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#fff1f2', borderRadius: '8px', border: '1px solid #ffe4e6' }}>
                      <span style={{ fontSize: '12px', color: '#e11d48', fontWeight: 700 }}>⚠️ {t('customers.overdueInvoices', 'Overdue Invoices')}</span>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#e11d48' }}>
                        <span className="num-en">{Number(summary.overdue_amount).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setActiveTab('finance')}
                    style={{ flex: 1, padding: '8px 12px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {t('customers.viewInvoicesVouchers', 'View Invoices & Vouchers')}
                  </button>
                  <button
                    onClick={() => setActiveTab('timeline')}
                    style={{ flex: 1, padding: '8px 12px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {t('customers.viewAuditTrail', 'View Audit Trail')}
                  </button>
                </div>
              </div>

              {/* Recent Activity Mini-Feed */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px', gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={16} color="#0284c7" /> {t('customers.latestEngagements', 'Latest Customer Engagements')}
                  </h4>
                  <button
                    onClick={() => setActiveTab('timeline')}
                    style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    {t('customers.fullTimeline', 'Full Timeline')} →
                  </button>
                </div>

                {timeline.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                    {t('customers.noRecordedActivities', 'No recorded activities or documents yet.')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {timeline.slice(0, 5).map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', fontSize: '13px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontWeight: 800, color: '#1e293b' }}>{typeof item.title === 'string' ? item.title : String(item.type || 'Activity')}</span>
                          <span style={{ color: '#64748b' }}>{typeof item.description === 'string' ? item.description : (item.description && typeof item.description === 'object' ? (item.description.note || '') : String(item.description || ''))}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '11px' }}>
                          <span style={{ fontWeight: 600, color: '#475569' }}>{typeof item.actor_name === 'string' ? item.actor_name : 'System'}</span>
                          <span>•</span>
                          <span className="num-en">{item.timestamp ? formatDistanceToNow(new Date(item.timestamp), { addSuffix: true }) : ''}</span>
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
                  {t('customers.timelineTitle', 'Unified Timeline: Who did what and when?')}
                </h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                  {t('customers.timelineSubtitle', 'Chronological synthesis of sales interactions, phone calls, quotations, orders, deliveries, invoices, and payments.')}
                </p>
              </div>

              {timeline.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  {t('customers.noHistoricalEntries', 'No historical entries found for this client.')}
                </div>
              ) : (
                <div style={{ position: 'relative', paddingInlineStart: '32px' }}>
                  <div style={{ position: 'absolute', insetInlineStart: '13px', top: '10px', bottom: '10px', width: '2px', background: '#e2e8f0' }} />
                  {timeline.map((item, idx) => (
                    <div key={item.id} style={{ position: 'relative', paddingBottom: idx === timeline.length - 1 ? 0 : '22px' }}>
                      <div style={{
                        position: 'absolute',
                        insetInlineStart: '-32px',
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
                          <span style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>{typeof item.title === 'string' ? item.title : String(item.type || 'Activity')}</span>
                          <span className="num-en" style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {item.timestamp ? new Date(item.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.5' }}>
                          {typeof item.description === 'string' ? item.description : (item.description && typeof item.description === 'object' ? (item.description.note || '') : String(item.description || ''))}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', fontWeight: 600 }}>
                          {t('customers.executedBy', 'Executed by:')} <span style={{ color: '#4f46e5' }}>{typeof item.actor_name === 'string' ? item.actor_name : 'System'}</span>
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
              <ActivityTimeline entityType="customer" entityId={customerId} onActivityCreated={() => fetch360Data()} />
            </div>
          )}

          {/* TAB 4: DEALS */}
          {activeTab === 'deals' && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>
                {t('customers.clientDeals', 'Client Deals ({count})', { count: deals.length })}
              </h4>
              {deals.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>{t('customers.noDeals', 'No deals registered for this customer.')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {deals.map(d => (
                    <div 
                      key={d.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (onClose) onClose();
                        navigate(`/deals?deal_id=${d.id}`);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (onClose) onClose();
                          navigate(`/deals?deal_id=${d.id}`);
                        }
                      }}
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '14px 16px', 
                        background: '#f8fafc', 
                        border: '1px solid #e2e8f0', 
                        borderRadius: '10px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f1f5f9';
                        e.currentTarget.style.borderColor = '#cbd5e1';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#f8fafc';
                        e.currentTarget.style.borderColor = '#e2e8f0';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                      title={t('customers.clickToOpenDeal', 'Click to view deal details')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          background: 'rgba(79, 70, 229, 0.08)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#4f46e5',
                          fontWeight: 800,
                          fontSize: '11px',
                          flexShrink: 0
                        }}>
                          <span className="num-en">#{d.id}</span>
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '14px' }}>{d.title}</div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                            {t('customers.pipelineStage', 'Pipeline Stage:')} <span style={{ fontWeight: 700, color: '#4f46e5' }}>{d.pipeline_stage}</span>
                            {d.unit_number && (
                              <span> • {t('customers.unit', 'Unit:')} <strong className="num-en" style={{ color: '#0369a1' }}>{d.unit_number}</strong>{d.unit_name && d.unit_name !== d.unit_number ? ` - ${d.unit_name}` : ''}{d.unit_project_name ? ` (${d.unit_project_name})` : ''}</span>
                            )}
                            {!d.unit_id && (d.pf_listing_reference || d.pf_listing_id || d.pf_project_id) && (
                              <span> • <strong className="num-en" style={{ color: '#d97706' }}>{d.pf_listing_reference ? `PF Ref: ${d.pf_listing_reference}` : d.pf_listing_id ? `PF ID: ${d.pf_listing_id}` : `PF Project: ${d.pf_project_id}`}</strong> ({isRTL ? 'غير مربوط بوحدة' : 'Unlinked'})</span>
                            )}
                            {d.product_name && ` • ${t('customers.product', 'Product:')} ${d.product_name}`}
                            {` • ${t('customers.assigned', 'Assigned:')} ${d.assigned_to_name || t('customers.unassigned', 'Unassigned')}`}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ textAlign: isRTL ? 'left' : 'right' }}>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                            <span className="num-en">{Number(d.value || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                            {t('customers.created', 'Created')} <span className="num-en">{new Date(d.created_at).toLocaleDateString('en-GB')}</span>
                          </div>
                        </div>
                        <ChevronRight 
                          size={18} 
                          color="#64748b" 
                          style={{ transform: isRTL ? 'rotate(180deg)' : 'none', flexShrink: 0 }} 
                        />
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
                  <ShoppingCart size={16} color="#4f46e5" /> {t('customers.salesOrdersCount', 'Sales Orders ({count})', { count: generalSales.sales_orders.length })}
                </h4>
                {generalSales.sales_orders.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>{t('customers.noSalesOrders', 'No sales orders recorded.')}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {generalSales.sales_orders.map(so => (
                      <div key={so.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div>
                          <span className="num-en" style={{ fontWeight: 800, color: '#4f46e5', marginInlineEnd: '8px' }}>{so.number || `#${so.id}`}</span>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                            {t('common.status', 'Status')}: {so.status} • {t('customers.expectedDelivery', 'Delivery:')} {so.expected_delivery ? <span className="num-en">{new Date(so.expected_delivery).toLocaleDateString('en-GB')}</span> : '—'}
                          </span>
                        </div>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>
                          <span className="num-en">{Number(so.total_amount || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Delivery Notes */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 14px 0', fontSize: '14px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Truck size={16} color="#059669" /> {t('customers.deliveryNotesCount', 'Delivery Notes ({count})', { count: generalSales.delivery_notes.length })}
                </h4>
                {generalSales.delivery_notes.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>{t('customers.noDeliveryNotes', 'No deliveries recorded.')}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {generalSales.delivery_notes.map(dn => (
                      <div key={dn.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div>
                          <span className="num-en" style={{ fontWeight: 800, color: '#059669', marginInlineEnd: '8px' }}>{dn.number || `#${dn.id}`}</span>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                            {t('customers.fromWarehouse', 'From {warehouse}', { warehouse: dn.warehouse_name || 'Warehouse' })} • {t('common.status', 'Status')}: {dn.status}
                          </span>
                        </div>
                        <div className="num-en" style={{ fontSize: '12px', color: '#64748b' }}>{new Date(dn.delivery_date || dn.created_at).toLocaleDateString('en-GB')}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quotations & Returns */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                    📄 {t('customers.quotationsCount', 'Quotations ({count})', { count: generalSales.quotations.length })}
                  </h4>
                  {generalSales.quotations.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>{t('customers.noQuotations', 'No quotations found.')}</div>
                  ) : (
                    generalSales.quotations.map(q => (
                      <div key={q.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span><span className="num-en">QT-{q.id}</span> ({q.status})</span>
                        <span style={{ fontWeight: 700 }}><span className="num-en">{Number(q.total_amount).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}</span>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                    🔄 {t('customers.returnsCount', 'Returns ({count})', { count: generalSales.sales_returns.length })}
                  </h4>
                  {generalSales.sales_returns.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>{t('customers.noReturns', 'No sales returns.')}</div>
                  ) : (
                    generalSales.sales_returns.map(sr => (
                      <div key={sr.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span><span className="num-en">{sr.number || `#${sr.id}`}</span> ({sr.status})</span>
                        <span style={{ fontWeight: 700 }}><span className="num-en">{Number(sr.total_amount || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}</span>
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
                  <FileText size={16} color="#dc2626" /> {t('customers.customerInvoices', 'Customer Invoices ({count})', { count: finance.invoices.length })}
                </h4>
                {finance.invoices.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>{t('customers.noInvoices', 'No invoices issued yet.')}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {finance.invoices.map(inv => (
                      <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div>
                          <span className="num-en" style={{ fontWeight: 800, color: '#dc2626', marginInlineEnd: '8px' }}>{inv.invoice_number || `INV-${inv.id}`}</span>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                            {t('customers.due', 'Due:')} {inv.due_date ? <span className="num-en">{new Date(inv.due_date).toLocaleDateString('en-GB')}</span> : t('customers.immediate', 'Immediate')} • {t('common.status', 'Status')}: {inv.status}
                          </span>
                        </div>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>
                          <span className="num-en">{Number(inv.total_amount || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Collections: Linked Payments & On-Account Receipts */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, color: '#16a34a' }}>
                    💵 {t('customers.linkedPayments', 'Invoice-Linked Receipts ({count})', { count: finance.linked_payments.length })}
                  </h4>
                  {finance.linked_payments.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>{t('customers.noLinkedPayments', 'No linked payments recorded.')}</div>
                  ) : (
                    finance.linked_payments.map(p => (
                      <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span><span className="num-en">{p.voucher_number}</span> (Inv: <span className="num-en">{p.invoice_number}</span>)</span>
                        <span style={{ fontWeight: 700, color: '#16a34a' }}>+<span className="num-en">{Number(p.amount).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}</span>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, color: '#0284c7' }}>
                    💼 {t('customers.onAccountReceipts', 'On-Account Receipts ({count})', { count: finance.on_account_vouchers.length })}
                  </h4>
                  {finance.on_account_vouchers.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>{t('customers.noOnAccountReceipts', 'No on-account receipts.')}</div>
                  ) : (
                    finance.on_account_vouchers.map(v => (
                      <div key={v.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span><span className="num-en">{v.voucher_number}</span> ({t('customers.advanceCredit', 'Advance / Credit')})</span>
                        <span style={{ fontWeight: 700, color: '#0284c7' }}>+<span className="num-en">{Number(v.amount).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}</span>
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
              {/* Matched Inventory Units */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={16} color="#eab308" /> {t('customers.matchedUnitsTitle', 'Matched Property Units ({count})', { count: matchedUnits.length })}
                  </h4>
                  <button 
                    type="button" 
                    onClick={fetchMatchedUnits} 
                    style={{ padding: '4px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: '#475569' }}
                  >
                    <RefreshCw size={11} className={loadingMatches ? 'spin' : ''} /> {t('common.refresh', 'Refresh')}
                  </button>
                </div>

                {loadingMatches ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                    {t('customers.analyzingMatches', 'Matching property inventory against buyer budget, area, and rooms...')}
                  </div>
                ) : matchedUnits.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', background: '#f8fafc', borderRadius: '8px' }}>
                    {t('customers.noMatchedUnits', 'No matching inventory units found based on current buyer preferences.')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {matchedUnits.map(({ unit, match_score, match_grade, breakdown }) => {
                      const isExpanded = expandedMatchId === unit.id;
                      const gradeColor = match_score >= 85 ? '#16a34a' : match_score >= 65 ? '#2563eb' : match_score >= 45 ? '#d97706' : '#64748b';
                      const gradeBg = match_score >= 85 ? '#dcfce7' : match_score >= 65 ? '#dbeafe' : match_score >= 45 ? '#fef3c7' : '#f1f5f9';
                      const isAvailable = unit.status?.toLowerCase() === 'available';

                      return (
                        <div key={unit.id} style={{ border: `1px solid ${isExpanded ? gradeColor : '#e2e8f0'}`, borderRadius: '10px', background: 'white', overflow: 'hidden' }}>
                          <div 
                            onClick={() => setExpandedMatchId(isExpanded ? null : unit.id)}
                            style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: isExpanded ? `${gradeBg}25` : 'white' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ textAlign: 'center', minWidth: '50px', padding: '4px 6px', borderRadius: '8px', background: gradeBg, color: gradeColor, fontWeight: 900 }}>
                                <div style={{ fontSize: '15px', lineHeight: '1' }}>{match_score}%</div>
                                <div style={{ fontSize: '9px', textTransform: 'uppercase' }}>{match_grade}</div>
                              </div>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: '14px', color: '#1e293b' }}>
                                  {unit.project_name || 'Individual'} • Unit <span className="num-en">{unit.unit_number}</span>
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 700, color: 'var(--primary)' }}><span className="num-en">{Number(unit.price || 0).toLocaleString('en-US')}</span> EGP</span>
                                  {unit.area_sqm && <span>📐 <span className="num-en">{unit.area_sqm}</span> m²</span>}
                                  {unit.rooms && <span>🚪 <span className="num-en">{unit.rooms}</span> rooms</span>}
                                  {unit.location && <span>📍 {unit.location}</span>}
                                  <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800, background: isAvailable ? '#dcfce7' : '#fee2e2', color: isAvailable ? '#15803d' : '#b91c1c' }}>
                                    {unit.status}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {isAvailable ? (
                                <a 
                                  href={`/deals?new=1&client_id=${customerId}&unit_id=${unit.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--primary)', color: 'white', textDecoration: 'none', fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                  {t('customers.btnCreateDeal', 'Create Deal')} <ChevronRight size={12} />
                                </a>
                              ) : (
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>{unit.status}</span>
                              )}
                              <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>
                                {isExpanded ? '▲' : '▼'}
                              </span>
                            </div>
                          </div>

                          {isExpanded && breakdown && (
                            <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', background: '#fafafa', fontSize: '12px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                                <div style={{ background: 'white', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                  <div style={{ fontWeight: 700, color: '#0f172a' }}>Budget ({breakdown.budget?.score}/{breakdown.budget?.max} pts)</div>
                                  <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>{breakdown.budget?.reason}</div>
                                </div>
                                <div style={{ background: 'white', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                  <div style={{ fontWeight: 700, color: '#0f172a' }}>Area ({breakdown.area?.score}/{breakdown.area?.max} pts)</div>
                                  <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>{breakdown.area?.reason}</div>
                                </div>
                                <div style={{ background: 'white', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                  <div style={{ fontWeight: 700, color: '#0f172a' }}>Location ({breakdown.location?.score}/{breakdown.location?.max} pts)</div>
                                  <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>{breakdown.location?.reason}</div>
                                </div>
                                <div style={{ background: 'white', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                  <div style={{ fontWeight: 700, color: '#0f172a' }}>Rooms ({breakdown.rooms?.score}/{breakdown.rooms?.max} pts)</div>
                                  <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>{breakdown.rooms?.reason}</div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Reservations */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={16} color="#d97706" /> {t('customers.propertyReservations', 'Property Reservations ({count})', { count: realEstate.reservations?.length || 0 })}
                </h4>
                {(!realEstate.reservations || realEstate.reservations.length === 0) ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>{t('customers.noReservations', 'No active unit reservations found.')}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {realEstate.reservations.map(res => (
                      <div key={res.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fef3c7' }}>
                        <div>
                          <span style={{ fontWeight: 800, color: '#b45309', marginInlineEnd: '8px' }}>{res.title}</span>
                          <span style={{ fontSize: '12px', color: '#78350f' }}>
                            {t('dashboard.unit', 'Unit')} <span className="num-en">{res.unit_number || 'N/A'}</span> • {res.unit_project_name || t('dashboard.project', 'Project')} • {t('customers.pipelineStage', 'Stage:')} {res.pipeline_stage}
                            {res.unit_reservation_expires_at && ` • ${t('customers.expires', 'Expires:')} `}<span className="num-en">{res.unit_reservation_expires_at ? new Date(res.unit_reservation_expires_at).toLocaleDateString('en-GB') : ''}</span>
                          </span>
                        </div>
                        <div style={{ fontWeight: 800, color: '#92400e' }}>
                          <span className="num-en">{Number(res.value || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Contracts */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Building size={16} color="#4f46e5" /> {t('customers.propertyContracts', 'Property Contracts ({count})', { count: realEstate.contracts?.length || 0 })}
                </h4>
                {(!realEstate.contracts || realEstate.contracts.length === 0) ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>{t('customers.noContracts', 'No contracts signed yet.')}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {realEstate.contracts.map(c => (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div>
                          <span className="num-en" style={{ fontWeight: 800, color: '#4f46e5', marginInlineEnd: '8px' }}>{c.contract_number}</span>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                            {t('dashboard.unit', 'Unit')}: <span className="num-en">{c.unit_number || 'N/A'}</span> • {c.project_name || t('dashboard.project', 'Project')} • {t('common.status', 'Status')}: {c.status}
                          </span>
                        </div>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>
                          <span className="num-en">{Number(c.contract_value || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Collections & Payments */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <DollarSign size={16} color="#16a34a" /> {t('customers.propertyCollections', 'Property Collections & Receipts ({count})', { count: realEstate.collections?.length || 0 })}
                </h4>
                {(!realEstate.collections || realEstate.collections.length === 0) ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>{t('customers.noPropertyCollections', 'No property collections recorded.')}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {realEstate.collections.map(col => (
                      <div key={col.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #dcfce7' }}>
                        <div>
                          <span className="num-en" style={{ fontWeight: 800, color: '#16a34a', marginInlineEnd: '8px' }}>{col.voucher_number}</span>
                          <span style={{ fontSize: '12px', color: '#15803d' }}>
                            {col.contract_number ? `${t('sidebar.contracts', 'Contract')} ${col.contract_number}` : t('dashboard.financeVouchers', 'Property Receipt')} 
                            {col.unit_number ? ` • ${t('dashboard.unit', 'Unit')} ${col.unit_number}` : ''} • {t('common.date', 'Date')}: <span className="num-en">{new Date(col.voucher_date).toLocaleDateString('en-GB')}</span>
                          </span>
                        </div>
                        <div style={{ fontWeight: 800, color: '#15803d' }}>
                          +<span className="num-en">{Number(col.amount || 0).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Installments & Handovers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                    📅 {t('customers.installmentsSchedule', 'Installments Schedule ({count})', { count: realEstate.installments?.length || 0 })}
                  </h4>
                  {(!realEstate.installments || realEstate.installments.length === 0) ? (
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>{t('customers.noInstallments', 'No active installment schedule.')}</div>
                  ) : (
                    realEstate.installments.slice(0, 10).map(inst => (
                      <div key={inst.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>#<span className="num-en">{inst.installment_number}</span> (<span className="num-en">{new Date(inst.due_date).toLocaleDateString('en-GB')}</span>) - {inst.status}</span>
                        <span style={{ fontWeight: 700 }}><span className="num-en">{Number(inst.amount).toLocaleString('en-US')}</span> {t('common.currency', 'EGP')}</span>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                    🔑 {t('customers.unitHandovers', 'Unit Handovers ({count})', { count: realEstate.handovers?.length || 0 })}
                  </h4>
                  {(!realEstate.handovers || realEstate.handovers.length === 0) ? (
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>{t('customers.noHandovers', 'No handover events recorded.')}</div>
                  ) : (
                    realEstate.handovers.map(h => (
                      <div key={h.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>{t('dashboard.unit', 'Unit')} <span className="num-en">{h.unit_number}</span> - {t('common.status', 'Status')}: {h.status}</span>
                        <span style={{ color: '#64748b' }}>{h.actual_handover_date ? <span className="num-en">{new Date(h.actual_handover_date).toLocaleDateString('en-GB')}</span> : t('customers.scheduled', 'Scheduled')}</span>
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
