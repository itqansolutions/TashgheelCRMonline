import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Users, ShoppingBag, Handshake, CheckSquare, Wallet, 
  Users2, FileText, BarChart3, ChevronLeft, ChevronRight, History, 
  Settings as AdminSettingsIcon, ShieldAlert, Package, Zap, Lock, ArrowRight, DollarSign, CreditCard
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModule } from '../../hooks/useModule';

// Module key mapping: path → module name
const MODULE_MAP = {
  '/hr':        'hr',
  '/inventory': 'inventory',
  '/automation': 'automation',
  '/automation/rules': 'automation',
};

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const { user } = useAuth();
  const { can, planName, trialDaysLeft } = useModule();
  const navigate = useNavigate();

  const navItems = [
    { name: 'Dashboard',       icon: <LayoutDashboard />, path: '/dashboard' },
    { name: 'Customers',       icon: <Users />,           path: '/customers' },
    { name: 'Products',        icon: <ShoppingBag />,     path: '/products' },
    { name: 'Deals',           icon: <Handshake />,       path: '/deals' },
    { name: 'Tasks',           icon: <CheckSquare />,     path: '/tasks' },
    { name: 'Accounting',      icon: <Wallet />,          path: '/accounting' },
    { name: 'Employees',       icon: <Users2 />,          path: '/employees' },
    // Module-gated items
    { name: 'HR & Attendance', icon: <Users2 />,          path: '/hr',        module: 'hr' },
    { name: 'Inventory',       icon: <Package />,         path: '/inventory', module: 'inventory' },
    { name: 'Automation',      icon: <Zap />,             path: '/automation',module: 'automation' },
    // Always visible
    { name: 'Files',           icon: <FileText />,        path: '/files' },
    { name: 'Reports',         icon: <BarChart3 />,       path: '/reports' },
    { name: 'System Logs',     icon: <History />,         path: '/logs' },
    { name: 'Admin Settings',  icon: <AdminSettingsIcon />, path: '/settings' },
    { name: 'Billing',         icon: <CreditCard />,        path: '/billing' },
  ];

  const filteredItems = navItems.filter(item => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    const checkPath = item.path;
    return user.allowedPages && user.allowedPages.includes(checkPath);
  });

  const SYSTEM_DEFAULT_TENANT = '00000000-0000-0000-0000-000000000000';
  if (user && user.tenant_id === SYSTEM_DEFAULT_TENANT && user.role === 'admin') {
     filteredItems.push({ 
       name: 'Platform Hub', 
       icon: <ShieldAlert className="text-amber-500" />, 
       path: '/super-admin' 
     });
     filteredItems.push({ 
       name: 'Pricing Engine', 
       icon: <DollarSign style={{ color: '#10b981' }}/>, 
       path: '/admin/plans' 
     });
     filteredItems.push({ 
       name: 'Upgrade Requests', 
       icon: <Zap style={{ color: '#f59e0b' }}/>, 
       path: '/admin/upgrade-requests' 
     });
  }

  // Trial urgency color
  const trialColor = trialDaysLeft !== null
    ? trialDaysLeft <= 3 ? '#ef4444' : trialDaysLeft <= 7 ? '#f59e0b' : '#10b981'
    : null;

  return (
    <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
      <style>{`
        .sidebar {
          height: 100vh; background: var(--glass-bg); backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px); color: var(--text-main);
          width: var(--sidebar-w); position: fixed; left: 0; top: 0;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); z-index: 1001;
          display: flex; flex-direction: column;
          border-right: 1px solid var(--glass-border);
          box-shadow: 10px 0 30px rgba(0,0,0,0.03);
        }
        .sidebar.closed { width: 90px; }
        .sidebar-header {
          height: var(--header-h); display: flex; align-items: center;
          padding: 0 24px; border-bottom: 1px solid var(--glass-border);
          justify-content: space-between;
        }
        .sidebar-header h2 {
          font-size: 20px; font-weight: 800; letter-spacing: -0.02em;
          white-space: nowrap; overflow: hidden; transition: opacity 0.2s; color: var(--primary);
        }
        .sidebar.closed .sidebar-header h2 { opacity: 0; pointer-events: none; }
        .toggle-btn {
          background: rgba(79,70,229,0.05); color: var(--primary); border-radius: 8px;
          display: flex; align-items: center; justify-content: center; padding: 6px; transition: all 0.2s;
        }
        .toggle-btn:hover { background: rgba(79,70,229,0.1); transform: scale(1.05); }
        .sidebar-nav { flex: 1; padding: 16px 12px; overflow-y: auto; overflow-x: hidden; }

        /* Normal nav items */
        .sidebar-nav a {
          display: flex; align-items: center; padding: 12px 16px; color: var(--text-muted);
          transition: all 0.3s cubic-bezier(0.4,0,0.2,1); gap: 16px; border-radius: 12px;
          margin-bottom: 4px; position: relative; text-decoration: none;
        }
        .sidebar-nav a:hover { background: rgba(79,70,229,0.05); color: var(--primary); transform: translateX(4px); }
        .sidebar-nav a.active {
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          color: white; box-shadow: 0 10px 15px -3px rgba(79,70,229,0.3);
        }
        .sidebar-nav a svg { min-width: 20px; width: 20px; height: 20px; transition: transform 0.3s; }
        .sidebar-nav a.active svg { transform: scale(1.1); }
        .sidebar-nav a span { white-space: nowrap; font-weight: 600; font-size: 15px; transition: opacity 0.2s; }
        .sidebar.closed .sidebar-nav a span { opacity: 0; pointer-events: none; }

        /* LOCKED nav items */
        .nav-locked {
          display: flex; align-items: center; padding: 12px 16px; gap: 16px;
          border-radius: 12px; margin-bottom: 4px; cursor: pointer;
          color: var(--text-muted); position: relative; transition: all 0.25s; opacity: 0.55;
        }
        .nav-locked:hover { background: rgba(239,68,68,0.06); opacity: 0.85; transform: translateX(2px); }
        .nav-locked svg { min-width: 20px; width: 20px; height: 20px; }
        .nav-locked .nav-label { flex: 1; white-space: nowrap; font-weight: 600; font-size: 15px; transition: opacity 0.2s; }
        .sidebar.closed .nav-locked .nav-label { opacity: 0; }
        .lock-badge {
          background: rgba(239,68,68,0.12); color: #ef4444; border-radius: 6px;
          padding: 2px 6px; font-size: 10px; font-weight: 800; display: flex; align-items: center; gap: 3px;
          transition: opacity 0.2s;
        }
        .sidebar.closed .lock-badge { opacity: 0; }

        /* Hover unlock tooltip */
        .nav-locked .lock-tooltip {
          position: absolute; left: calc(100% + 12px); top: 50%; transform: translateY(-50%);
          background: #1e1b4b; color: white; padding: 8px 14px; border-radius: 10px;
          font-size: 12px; font-weight: 700; white-space: nowrap; opacity: 0; pointer-events: none;
          transition: opacity 0.2s; z-index: 100; box-shadow: 0 8px 20px rgba(0,0,0,0.2);
        }
        .nav-locked:hover .lock-tooltip { opacity: 1; }

        /* Section label */
        .nav-section { font-size: 10px; font-weight: 800; letter-spacing: 0.08em; color: var(--text-muted);
          text-transform: uppercase; padding: 12px 16px 4px; transition: opacity 0.2s; }
        .sidebar.closed .nav-section { opacity: 0; }

        /* Trial banner */
        .trial-banner {
          margin: 0 12px 12px; border-radius: 12px; padding: 12px 14px;
          cursor: pointer; transition: all 0.2s;
        }
        .trial-banner:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.1); }
        .trial-banner .tb-row { display: flex; align-items: center; gap: 8px; }
        .trial-banner .tb-title { font-size: 12px; font-weight: 800; flex: 1; transition: opacity 0.2s; }
        .trial-banner .tb-sub { font-size: 11px; margin-top: 4px; transition: opacity 0.2s; }
        .sidebar.closed .trial-banner .tb-title,
        .sidebar.closed .trial-banner .tb-sub { opacity: 0; }
        .trial-banner .tb-icon { font-size: 16px; flex-shrink: 0; }

        .sidebar-footer {
          padding: 16px 24px; font-size: 11px; font-weight: 600; color: var(--text-muted);
          text-align: center; border-top: 1px solid var(--glass-border);
          letter-spacing: 0.05em; text-transform: uppercase;
        }
        .sidebar.closed .sidebar-footer { display: none; }
      `}</style>

      {/* Header */}
      <div className="sidebar-header">
        <h2>Tashgheel</h2>
        <button label="toggle" className="toggle-btn" onClick={toggleSidebar}>
          {isOpen ? <ChevronLeft size={20}/> : <ChevronRight size={20}/>}
        </button>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {filteredItems.map((item) => {
          const isModuleLocked = item.module && !can(item.module);

          if (isModuleLocked) {
            return (
              <div
                key={item.name}
                className="nav-locked"
                onClick={() => navigate('/pricing')}
                title={`Upgrade to access ${item.name}`}
              >
                {item.icon}
                <span className="nav-label">{item.name}</span>
                <span className="lock-badge"><Lock size={9}/> PRO</span>
                <div className="lock-tooltip">
                  🔒 Upgrade to unlock {item.name} <ArrowRight size={11}/>
                </div>
              </div>
            );
          }

          return (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              {item.icon}
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Trial Banner */}
      {trialDaysLeft !== null && (
        <div
          className="trial-banner"
          style={{ background: `${trialColor}18`, border: `1px solid ${trialColor}40` }}
          onClick={() => navigate('/pricing')}
        >
          <div className="tb-row">
            <span className="tb-icon">⏳</span>
            <span className="tb-title" style={{ color: trialColor }}>
              {trialDaysLeft <= 0 ? 'Trial Expired' : `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left`}
            </span>
            <ArrowRight size={13} style={{ color: trialColor, flexShrink: 0 }}/>
          </div>
          <div className="tb-sub" style={{ color: trialColor, opacity: 0.75 }}>
            {trialDaysLeft <= 0 ? 'Upgrade to restore access' : 'Free trial active · Upgrade now'}
          </div>
        </div>
      )}

      {/* Plan badge footer */}
      <div className="sidebar-footer">
        {planName ? `${planName.toUpperCase()} PLAN` : '© 2025 Tashgheel by itqan'}
      </div>
    </div>
  );
};

export default Sidebar;
