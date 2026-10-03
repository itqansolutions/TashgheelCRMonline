import React from 'react';
import { NavLink } from 'react-router-dom';
import { ClipboardList, FileText, ShoppingCart, Building2, FileCheck } from 'lucide-react';

const PurchasesSubNav = () => {
  const coreLinks = [
    { path: '/purchases/requests', label: 'Purchase Requests', icon: <ClipboardList size={16} /> },
    { path: '/purchases/orders', label: 'Purchase Orders', icon: <FileText size={16} /> },
    { path: '/purchases', label: 'Invoices', icon: <ShoppingCart size={16} /> },
    { path: '/finance?tab=Vendors', label: 'Vendors', icon: <Building2 size={16} /> },
  ];

  const advancedLinks = [
    { path: '/purchases/rfqs', label: 'RFQs & Bids', icon: <FileCheck size={16} /> },
  ];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
      overflowX: 'auto', padding: '12px 24px',
      background: 'white', borderBottom: '1px solid #e2e8f0', marginBottom: '16px'
    }}>
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

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Advanced:
        </span>
        {advancedLinks.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
              borderRadius: '8px', fontSize: '12px', fontWeight: 700, textDecoration: 'none',
              whiteSpace: 'nowrap', transition: 'all 0.2s',
              background: isActive ? '#f3e8ff' : '#f8fafc',
              color: isActive ? '#7e22ce' : '#64748b',
              border: isActive ? '1px solid #d8b4fe' : '1px solid #e2e8f0',
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
