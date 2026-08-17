import React from 'react';
import { NavLink } from 'react-router-dom';
import { Cpu, FileCheck } from 'lucide-react';

const IntegrationsSubNav = () => {
  const links = [
    { path: '/integrations/einvoice', label: 'ETA E-Invoicing', icon: <FileCheck size={16} /> },
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

export default IntegrationsSubNav;
