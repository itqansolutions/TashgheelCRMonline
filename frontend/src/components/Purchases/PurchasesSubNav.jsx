import React from 'react';
import { NavLink } from 'react-router-dom';
import { ClipboardList, FileText, ShoppingCart, Building2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const PurchasesSubNav = () => {
  const { t, isRTL } = useLanguage();
  const coreLinks = [
    { path: '/purchases/requests', label: t('subNav.purchases.requests'), icon: <ClipboardList size={16} /> },
    { path: '/purchases/orders', label: t('subNav.purchases.orders'), icon: <FileText size={16} /> },
    { path: '/purchases', label: t('subNav.purchases.invoices'), icon: <ShoppingCart size={16} /> },
    { path: '/contacts/vendors', label: t('subNav.purchases.vendors'), icon: <Building2 size={16} /> },
  ];

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '8px',
        overflowX: 'auto', padding: '12px 24px',
        background: 'white', borderBottom: '1px solid #e2e8f0', marginBottom: '16px'
      }}
    >
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        {coreLinks.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
              borderRadius: '10px', fontSize: '13px', fontWeight: 800, textDecoration: 'none',
              whiteSpace: 'nowrap', transition: 'all 0.2s',
              background: isActive ? 'linear-gradient(135deg, #0ea5e9, #0284c7)' : '#f8fafc',
              color: isActive ? 'white' : '#64748b',
              boxShadow: isActive ? '0 4px 12px rgba(14,165,233,0.25)' : 'none',
            })}
          >
            {link.icon} {link.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
};

export default PurchasesSubNav;
