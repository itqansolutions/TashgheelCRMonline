import React from 'react';
import { NavLink } from 'react-router-dom';
import { ShoppingBag, Building, ArrowLeftRight, Scale, ShieldCheck, CreditCard, TrendingUp } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const WarehouseSubNav = () => {
  const { t, isRTL } = useLanguage();

  const links = [
    { path: '/products', label: t('inventory.subNav.products'), icon: <ShoppingBag size={16} /> },
    { path: '/inventory/warehouses', label: t('inventory.subNav.warehouses'), icon: <Building size={16} /> },
    { path: '/inventory/balances', label: t('inventory.subNav.balances'), icon: <Scale size={16} /> },
    { path: '/inventory/movements', label: t('inventory.subNav.movements'), icon: <ArrowLeftRight size={16} /> },
    { path: '/inventory/keepers', label: t('inventory.subNav.keepers'), icon: <ShieldCheck size={16} /> },
    { path: '/inventory/item-card', label: t('inventory.subNav.itemCard'), icon: <CreditCard size={16} /> },
    { path: '/inventory/transaction-impact', label: t('inventory.subNav.transactionImpact'), icon: <TrendingUp size={16} /> },
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
            background: isActive ? 'linear-gradient(135deg, #0ea5e9, #0284c7)' : '#f8fafc',
            color: isActive ? 'white' : '#64748b',
            boxShadow: isActive ? '0 4px 12px rgba(14,165,233,0.25)' : 'none',
          })}
        >
          {link.icon} {link.label}
        </NavLink>
      ))}
    </div>
  );
};

export default WarehouseSubNav;
