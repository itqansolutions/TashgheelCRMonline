import React from 'react';
import { NavLink } from 'react-router-dom';
import { ShoppingBag, Building, ArrowLeftRight, Scale, ShoppingCart } from 'lucide-react';

const WarehouseSubNav = () => {
  const links = [
    { path: '/products', label: 'Products', icon: <ShoppingBag size={16} /> },
    { path: '/inventory/warehouses', label: 'Warehouses', icon: <Building size={16} /> },
    { path: '/inventory/balances', label: 'Stock Balances', icon: <Scale size={16} /> },
    { path: '/purchases', label: 'Purchases', icon: <ShoppingCart size={16} /> },
    { path: '/inventory/movements', label: 'Movements Ledger', icon: <ArrowLeftRight size={16} /> },
  ];

  return (
    <div style={{
      display: 'flex', gap: '6px', overflowX: 'auto', padding: '12px 24px',
      background: 'white', borderBottom: '1px solid #e2e8f0', marginBottom: '16px'
    }}>
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
