import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CheckCircle2, DollarSign, Sliders, Wallet, Clock, Cpu } from 'lucide-react';

const HRSubNav = () => {
  const links = [
    { path: '/hr/dashboard', label: 'Attendance', icon: <LayoutDashboard size={16} /> },
    { path: '/hr/approvals', label: 'Approvals', icon: <CheckCircle2 size={16} /> },
    { path: '/hr/payroll', label: 'Payroll Engine', icon: <DollarSign size={16} /> },
    { path: '/hr/activity-definition', label: 'Activity Definition', icon: <Sliders size={16} /> },
    { path: '/hr/activity-balance', label: 'Activity Balance', icon: <Wallet size={16} /> },
    { path: '/hr/shifts', label: 'Shifts & Rules', icon: <Clock size={16} /> },
    { path: '/hr/devices', label: 'ZkTeco Devices', icon: <Cpu size={16} /> },
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
            background: isActive ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : '#f8fafc',
            color: isActive ? 'white' : '#64748b',
            boxShadow: isActive ? '0 4px 12px rgba(79,70,229,0.25)' : 'none',
          })}
        >
          {link.icon} {link.label}
        </NavLink>
      ))}
    </div>
  );
};

export default HRSubNav;
