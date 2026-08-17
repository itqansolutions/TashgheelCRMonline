import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CheckCircle2, DollarSign, Sliders, Wallet, Clock, Cpu } from 'lucide-react';

const HRSubNav = () => {
  const links = [
    { path: '/hr/dashboard', label: 'حضور وانصراف', icon: <LayoutDashboard size={16} /> },
    { path: '/hr/approvals', label: 'مركز الموافقات', icon: <CheckCircle2 size={16} /> },
    { path: '/hr/payroll', label: 'مسيرات الراتب', icon: <DollarSign size={16} /> },
    { path: '/hr/activity-definition', label: 'تعريف الأنشطة', icon: <Sliders size={16} /> },
    { path: '/hr/activity-balance', label: 'أرصدة الأنشطة', icon: <Wallet size={16} /> },
    { path: '/hr/shifts', label: 'الشيفتات وقواعد الخصم', icon: <Clock size={16} /> },
    { path: '/hr/devices', label: 'ماكينات البصمة (ZKTeco)', icon: <Cpu size={16} /> },
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
