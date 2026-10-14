import React, { useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  UserCircle, Mail, Shield, Building, Briefcase, Calendar,
  Clock, FileText, ShieldCheck, DollarSign, Wallet,
  Handshake, CheckSquare, Users, Key, ArrowRight, CheckCircle2
} from 'lucide-react';

const MyProfile = () => {
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');

  const isRealEstate = user?.template_name === 'real_estate';
  const isManager = user?.role === 'admin' || user?.role === 'manager';

  // Backwards compatibility: redirect any legacy /my-profile?tab=... access to the canonical standalone page
  useEffect(() => {
    if (!tabParam) return;
    const tabRedirectMap = {
      tasks: '/tasks',
      deals: '/deals',
      customers: '/customers',
      units: '/units-registry',
      activity: '/my-attendance',
      balance: '/activity-balance',
      requests: '/my-requests',
      approvals: '/approvals',
      payroll: '/my-payroll',
    };
    const targetRoute = tabRedirectMap[tabParam];
    if (targetRoute) {
      navigate(targetRoute, { replace: true });
    }
  }, [tabParam, navigate]);

  const quickNavItems = [
    { name: t('profile.navAttendance'), desc: t('profile.descAttendance'), path: '/my-attendance', icon: <Clock size={20} color="#059669" />, bg: '#ecfdf5' },
    { name: t('profile.navRequests'), desc: t('profile.descRequests'), path: '/my-requests', icon: <FileText size={20} color="#2563eb" />, bg: '#eff6ff' },
    ...(isManager ? [{ name: t('profile.navApprovals'), desc: t('profile.descApprovals'), path: '/approvals', icon: <ShieldCheck size={20} color="#7c3aed" />, bg: '#f5f3ff' }] : []),
    { name: t('profile.navPayroll'), desc: t('profile.descPayroll'), path: '/my-payroll', icon: <DollarSign size={20} color="#d97706" />, bg: '#fffbeb' },
    { name: t('profile.navActivityBalance'), desc: t('profile.descActivityBalance'), path: '/activity-balance', icon: <Wallet size={20} color="#0891b2" />, bg: '#ecfeff' },
    { name: t('profile.navDeals'), desc: t('profile.descDeals'), path: '/deals', icon: <Handshake size={20} color="#4f46e5" />, bg: '#eef2ff' },
    { name: t('profile.navTasks'), desc: t('profile.descTasks'), path: '/tasks', icon: <CheckSquare size={20} color="#ea580c" />, bg: '#fff7ed' },
    { name: t('profile.navCustomers'), desc: t('profile.descCustomers'), path: '/customers', icon: <Users size={20} color="#0284c7" />, bg: '#f0f9ff' },
    ...(isRealEstate ? [{ name: t('profile.navUnits'), desc: t('profile.descUnits'), path: '/units-registry', icon: <Key size={20} color="#0d9488" />, bg: '#f0fdfa' }] : [])
  ];

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} style={{ padding: '32px 24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Profile Hero Header Card */}
      <div style={{
        background: 'white',
        borderRadius: '20px',
        border: '1px solid #e2e8f0',
        padding: '32px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
        marginBottom: '32px',
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        flexWrap: 'wrap'
      }}>
        <div style={{
          width: '90px',
          height: '90px',
          borderRadius: '24px',
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '36px',
          fontWeight: 900,
          boxShadow: '0 10px 25px rgba(79, 70, 229, 0.25)',
          flexShrink: 0
        }}>
          {user?.name?.charAt(0).toUpperCase() || <UserCircle size={48} />}
        </div>

        <div style={{ flex: 1, minWidth: '260px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
              {user?.name || t('profile.title')}
            </h1>
            <span style={{
              background: user?.role === 'admin' ? '#fef2f2' : user?.role === 'manager' ? '#eff6ff' : '#f0fdf4',
              color: user?.role === 'admin' ? '#dc2626' : user?.role === 'manager' ? '#2563eb' : '#16a34a',
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <Shield size={12} />
              {user?.role === 'admin' ? t('profile.adminRole') : user?.role === 'manager' ? t('profile.managerRole') : t('profile.employeeRole')}
            </span>
          </div>

          <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Mail size={15} color="#94a3b8" /> <span className="num-en">{user?.email || '—'}</span>
          </p>
        </div>
      </div>

      {/* Profile Details Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '24px',
        marginBottom: '40px'
      }}>
        {/* Account & Organizational Information */}
        <div style={{
          background: 'white',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
        }}>
          <h3 style={{ margin: '0 0 18px', fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building size={18} color="#4f46e5" />
            {t('profile.sectionAccount')}
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>{t('profile.lblAccountId')}</span>
              <span className="num-en" style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>#{user?.id}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>{t('profile.lblJobTitle')}</span>
              <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{user?.job_title_name || t('profile.generalStaff')}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>{t('profile.lblTemplate')}</span>
              <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700, textTransform: 'capitalize' }}>
                {user?.template_name === 'real_estate' ? t('profile.templateRealEstate') : t('profile.templateGeneral')}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>{t('profile.lblMemberSince')}</span>
              <span className="num-en" style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>
                {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-CA') : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Assigned Branches */}
        <div style={{
          background: 'white',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
        }}>
          <h3 style={{ margin: '0 0 18px', fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Briefcase size={18} color="#059669" />
            {t('profile.sectionBranches')}
          </h3>

          {user?.branches && user.branches.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {user.branches.map(b => (
                <div key={b.id} style={{
                  padding: '12px 14px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#1e293b' }}>{b.name}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{t('profile.branchCode', { code: b.code || 'MAIN' })}</div>
                  </div>
                  <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                    {t('profile.badgeActive')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>
              {t('profile.noBranches')}
            </p>
          )}
        </div>
      </div>

      {/* Independent Workspaces Quick Navigation */}
      <div>
        <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
          {t('profile.sectionWorkspaces')}
        </h3>
        <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '13px' }}>
          {t('profile.workspacesSubtitle')}
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '16px'
        }}>
          {quickNavItems.map(item => (
            <Link
              key={item.name}
              to={item.path}
              style={{
                textDecoration: 'none',
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '20px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.06)';
                e.currentTarget.style.borderColor = '#c7d2fe';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.02)';
                e.currentTarget.style.borderColor = '#e2e8f0';
              }}
            >
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: item.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {item.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {item.name}
                  <ArrowRight size={14} color="#94a3b8" style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: 1.4 }}>
                  {item.desc}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MyProfile;
