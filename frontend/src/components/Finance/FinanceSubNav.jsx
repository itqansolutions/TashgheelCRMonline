import React from 'react';
import { NavLink } from 'react-router-dom';
import { Wallet, BookOpen, BarChart3, CreditCard, Lock, FileSpreadsheet } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const FinanceSubNav = () => {
  const { t, isRTL } = useLanguage();
  const links = [
    { path: '/erp/accounts', label: t('subNav.finance.accounts'), icon: <Wallet size={16} /> },
    { path: '/erp/journals', label: t('subNav.finance.journals'), icon: <BookOpen size={16} /> },
    { path: '/erp/reports', label: t('subNav.finance.reports'), icon: <BarChart3 size={16} /> },
    { path: '/erp/banking', label: t('subNav.finance.banking'), icon: <CreditCard size={16} /> },
    { path: '/erp/closing', label: t('subNav.finance.closing'), icon: <Lock size={16} /> },
    { path: '/erp/entries', label: t('subNav.finance.entries'), icon: <FileSpreadsheet size={16} /> },
  ];

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{
        display: 'flex', gap: '6px', overflowX: 'auto', padding: '12px 24px',
        background: 'white', borderBottom: '1px solid #e2e8f0', marginBottom: '16px'
      }}
    >
      {links.map((link) => (
        <NavLink
          key={link.path}
          to={link.path}
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
            borderRadius: '10px', fontSize: '13px', fontWeight: 800, textDecoration: 'none',
            whiteSpace: 'nowrap', transition: 'all 0.2s',
            background: isActive ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : '#f8fafc',
            color: isActive ? 'white' : '#64748b',
            boxShadow: isActive ? '0 4px 12px rgba(99,102,241,0.25)' : 'none',
          })}
        >
          {link.icon} {link.label}
        </NavLink>
      ))}
    </div>
  );
};

export default FinanceSubNav;
