import React from 'react';
import { NavLink } from 'react-router-dom';
import { Handshake, Users, Target as TargetIcon, ShoppingBag, FileText, Layers } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const SalesSubNav = () => {
  const { t, isRTL } = useLanguage();

  const links = [
    { path: '/deals', label: t('sales.subNav.deals'), icon: <Handshake size={16} /> },
    { path: '/sales/orders', label: t('sales.subNav.orders'), icon: <ShoppingBag size={16} /> },
    { path: '/sales/documents', label: t('sales.subNav.documents'), icon: <FileText size={16} /> },
    { path: '/sales/price-tiers', label: t('sales.subNav.priceTiers'), icon: <Layers size={16} /> },
    { path: '/sales/salesmen', label: t('sales.subNav.salesmen'), icon: <Users size={16} /> },
    { path: '/sales/target', label: t('sales.subNav.targets'), icon: <TargetIcon size={16} /> },
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
            background: isActive ? 'linear-gradient(135deg, #10b981, #059669)' : '#f8fafc',
            color: isActive ? 'white' : '#64748b',
            boxShadow: isActive ? '0 4px 12px rgba(16,185,129,0.25)' : 'none',
          })}
        >
          {link.icon} {link.label}
        </NavLink>
      ))}
    </div>
  );
};

export default SalesSubNav;
