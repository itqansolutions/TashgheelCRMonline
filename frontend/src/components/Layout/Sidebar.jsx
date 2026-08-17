import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Users, ShoppingBag, Handshake, CheckSquare, Wallet, 
  Users2, FileText, BarChart3, ChevronLeft, ChevronRight, History, 
  Settings as AdminSettingsIcon, ShieldAlert, Package, Zap, Lock, ArrowRight, DollarSign, CreditCard,
  Building2, UserCircle, Phone, ChevronDown, ChevronUp, Truck, Briefcase, Sliders, Clock, Cpu,
  Building, ShieldCheck, TrendingUp, ArrowLeftRight, Scale, FileSpreadsheet, BookOpen,
  Target as TargetIcon, Layers, TrendingUp as SalesIcon, Share2, FileCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModule } from '../../hooks/useModule';
import { safeArray } from '../../utils/dataUtils';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const { user } = useAuth();
  const { can, planName, trialDaysLeft } = useModule();
  const navigate = useNavigate();

  // Collapsible Group States
  const [contactsOpen, setContactsOpen] = useState(true);
  const [salesOpen, setSalesOpen] = useState(true);
  const [hrOpen, setHrOpen] = useState(true);
  const [warehouseOpen, setWarehouseOpen] = useState(true);
  const [financeOpen, setFinanceOpen] = useState(true);
  const [integrationsOpen, setIntegrationsOpen] = useState(true);

  const isRealEstate = user?.template_name === 'real_estate';

  const navItems = [
    { name: 'Dashboard',       icon: <LayoutDashboard />, path: '/dashboard' },
    { name: 'My Profile',      icon: <UserCircle />,      path: '/my-profile' },
    // Contacts group handled separately
    // Sales group handled separately
    // HR group handled separately
    // Warehouse group handled separately
    // Finance group handled separately
    // Integrations group handled separately
    ...(isRealEstate ? [{ name: 'Units Registry', icon: <Building2 />, path: '/units-registry' }] : []),
    { name: 'Deals',           icon: <Handshake />,       path: '/deals' },
    { name: 'Tasks',           icon: <CheckSquare />,     path: '/tasks' },
    { name: 'Purchasing (AP)', icon: <Package />,         path: '/erp/purchasing' },
    { name: 'Automation',      icon: <Zap />,             path: '/automation', module: 'automation' },
    { name: 'Files',           icon: <FileText />,        path: '/files' },
    { name: 'System Logs',     icon: <History />,         path: '/logs' },
    { name: 'Admin Settings',  icon: <AdminSettingsIcon />, path: '/settings' },
    { name: 'Billing',         icon: <CreditCard />,        path: '/billing' },
  ];

  // Contacts sub-items
  const contactItems = isRealEstate ? [
    { name: 'Customers',  icon: <Users size={18} />,    path: '/customers' },
  ] : [
    { name: 'Customers',  icon: <Users size={18} />,    path: '/contacts/customers' },
    { name: 'Vendors',    icon: <Truck size={18} />,    path: '/contacts/vendors' },
    { name: 'Employees',  icon: <Briefcase size={18} />, path: '/contacts/employees' },
  ];

  // Sales sub-items
  const salesItems = [
    { name: 'Salesmen',         icon: <Users size={18} />,       path: '/sales/salesmen' },
    { name: 'Target & Goals',   icon: <TargetIcon size={18} />,  path: '/sales/target' },
    { name: 'Sales Orders',     icon: <ShoppingBag size={18} />, path: '/sales/orders' },
    { name: 'Documents',        icon: <FileText size={18} />,    path: '/sales/documents' },
    { name: 'Price Tiers',      icon: <Layers size={18} />,      path: '/sales/price-tiers' },
  ];

  // HR sub-items
  const hrItems = [
    { name: 'Attendance',         icon: <Users2 size={18} />,     path: '/hr/dashboard' },
    { name: 'Approvals',          icon: <CheckSquare size={18} />,path: '/hr/approvals' },
    { name: 'Payroll',            icon: <DollarSign size={18} />, path: '/hr/payroll' },
    { name: 'Activity Definition',icon: <Sliders size={18} />,   path: '/hr/activity-definition' },
    { name: 'Activity Balance',   icon: <Wallet size={18} />,    path: '/hr/activity-balance' },
    { name: 'Shifts',             icon: <Clock size={18} />,     path: '/hr/shifts' },
    { name: 'ZkTeco Devices',     icon: <Cpu size={18} />,       path: '/hr/devices' },
  ];

  // Warehouse sub-items
  const warehouseItems = [
    { name: 'Products',           icon: <ShoppingBag size={18} />,   path: '/products' },
    { name: 'Warehouses',         icon: <Building size={18} />,      path: '/inventory/warehouses' },
    { name: 'Keepers',            icon: <ShieldCheck size={18} />,   path: '/inventory/keepers' },
    { name: 'Transaction Impact', icon: <TrendingUp size={18} />,    path: '/inventory/transaction-impact' },
    { name: 'Transactions',       icon: <ArrowLeftRight size={18} />,path: '/inventory/movements' },
    { name: 'Balances',           icon: <Scale size={18} />,         path: '/inventory/balances' },
    { name: 'Item Card',          icon: <CreditCard size={18} />,    path: '/inventory/item-card' },
  ];

  // Finance sub-items
  const financeItems = [
    { name: 'Chart of Accounts',  icon: <Wallet size={18} />,        path: '/erp/accounts' },
    { name: 'General Ledger',     icon: <BookOpen size={18} />,      path: '/erp/journals' },
    { name: 'Financial Reports',  icon: <BarChart3 size={18} />,     path: '/erp/reports' },
    { name: 'Bank Reconciliation',icon: <CreditCard size={18} />,    path: '/erp/banking' },
    { name: 'Period Closing',     icon: <Lock size={18} />,          path: '/erp/closing' },
    { name: 'Entries',            icon: <FileSpreadsheet size={18} />,path: '/erp/entries' },
  ];

  // Integrations sub-items
  const integrationsItems = [
    { name: 'EInvoice',           icon: <FileCheck size={18} />,     path: '/integrations/einvoice' },
  ];

  const filteredItems = (navItems || []).filter(item => {
    if (!user) return false;
    if (item.hidden) return false;
    if (user.role === 'admin') return true;
    const checkPath = item.path;
    const allowed = safeArray(user?.allowedPages);
    return allowed.includes(checkPath);
  });

  const isHrLocked = !can('hr');
  const isInventoryLocked = !can('inventory') && !isRealEstate;

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
        .nav-locked .lock-tooltip {
          position: absolute; left: calc(100% + 12px); top: 50%; transform: translateY(-50%);
          background: #1e1b4b; color: white; padding: 8px 14px; border-radius: 10px;
          font-size: 12px; font-weight: 700; white-space: nowrap; opacity: 0; pointer-events: none;
          transition: opacity 0.2s; z-index: 100; box-shadow: 0 8px 20px rgba(0,0,0,0.2);
        }
        .nav-locked:hover .lock-tooltip { opacity: 1; }

        .nav-section { font-size: 10px; font-weight: 800; letter-spacing: 0.08em; color: var(--text-muted);
          text-transform: uppercase; padding: 12px 16px 4px; transition: opacity 0.2s; }
        .sidebar.closed .nav-section { opacity: 0; }

        /* Group Headers */
        .group-header {
          display: flex; align-items: center; padding: 10px 16px; gap: 14px;
          border-radius: 12px; margin-bottom: 2px; cursor: pointer;
          color: var(--text-muted); transition: all 0.25s;
          border: 1px solid transparent;
        }
        .group-header:hover {
          background: rgba(79,70,229,0.04); color: var(--primary);
          border-color: rgba(79,70,229,0.1);
        }
        .group-header svg.main-icon { min-width: 20px; width: 20px; height: 20px; }
        .group-label { flex: 1; font-weight: 700; font-size: 14px; white-space: nowrap; transition: opacity 0.2s; letter-spacing: 0.01em; }
        .sidebar.closed .group-label { opacity: 0; }
        .group-chevron { transition: all 0.25s; flex-shrink: 0; }
        .sidebar.closed .group-chevron { opacity: 0; }
        .group-sub-items {
          overflow: hidden; transition: max-height 0.3s ease, opacity 0.3s ease;
          padding-left: 12px;
        }
        .group-sub-items.collapsed { max-height: 0; opacity: 0; }
        .group-sub-items.expanded { max-height: 500px; opacity: 1; }
        .group-sub-items a {
          padding: 9px 14px;
          font-size: 13px !important;
        }
        .sidebar.closed .group-sub-items { padding-left: 0; }

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
        {/* Dashboard & Profile */}
        {filteredItems.slice(0, 2).map((item) => (
          <NavLink key={item.name} to={item.path} className={({ isActive }) => (isActive ? 'active' : '')}>
            {item.icon}
            <span>{item.name}</span>
          </NavLink>
        ))}

        {/* Contacts Group */}
        <div
          className="group-header"
          onClick={() => isOpen && setContactsOpen(prev => !prev)}
          title={!isOpen ? 'Contacts' : undefined}
        >
          <Phone size={20} className="main-icon" />
          <span className="group-label">Contacts</span>
          {isOpen && (
            contactsOpen 
              ? <ChevronDown size={14} className="group-chevron" />
              : <ChevronUp size={14} className="group-chevron" />
          )}
        </div>
        <div className={`group-sub-items ${isOpen && contactsOpen ? 'expanded' : 'collapsed'}`}>
          {contactItems.map(item => (
            <NavLink key={item.name} to={item.path} className={({ isActive }) => isActive ? 'active' : ''}>
              {item.icon}
              <span>{item.name}</span>
            </NavLink>
          ))}
        </div>

        {/* Sales Group */}
        <div
          className="group-header"
          onClick={() => isOpen && setSalesOpen(prev => !prev)}
          title={!isOpen ? 'Sales' : undefined}
        >
          <ShoppingBag size={20} className="main-icon" />
          <span className="group-label">Sales</span>
          {isOpen && (
            salesOpen 
              ? <ChevronDown size={14} className="group-chevron" />
              : <ChevronUp size={14} className="group-chevron" />
          )}
        </div>
        <div className={`group-sub-items ${isOpen && salesOpen ? 'expanded' : 'collapsed'}`}>
          {salesItems.map(item => (
            <NavLink key={item.name} to={item.path} className={({ isActive }) => isActive ? 'active' : ''}>
              {item.icon}
              <span>{item.name}</span>
            </NavLink>
          ))}
        </div>

        {/* HR Group */}
        {isHrLocked ? (
          <div className="nav-locked" onClick={() => navigate('/pricing')} title="Upgrade to access HR Module">
            <Users2 size={20} />
            <span className="nav-label">HR & Attendance</span>
            <span className="lock-badge"><Lock size={9}/> PRO</span>
            <div className="lock-tooltip">🔒 Upgrade to unlock HR Module <ArrowRight size={11}/></div>
          </div>
        ) : (
          <>
            <div
              className="group-header"
              onClick={() => isOpen && setHrOpen(prev => !prev)}
              title={!isOpen ? 'HR & Attendance' : undefined}
            >
              <Users2 size={20} className="main-icon" />
              <span className="group-label">HR & Attendance</span>
              {isOpen && (
                hrOpen 
                  ? <ChevronDown size={14} className="group-chevron" />
                  : <ChevronUp size={14} className="group-chevron" />
              )}
            </div>
            <div className={`group-sub-items ${isOpen && hrOpen ? 'expanded' : 'collapsed'}`}>
              {hrItems.map(item => (
                <NavLink key={item.name} to={item.path} className={({ isActive }) => isActive ? 'active' : ''}>
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* Warehouse Group */}
        {isInventoryLocked ? (
          <div className="nav-locked" onClick={() => navigate('/pricing')} title="Upgrade to access Warehouse Module">
            <Package size={20} />
            <span className="nav-label">Warehouse</span>
            <span className="lock-badge"><Lock size={9}/> PRO</span>
            <div className="lock-tooltip">🔒 Upgrade to unlock Warehouse <ArrowRight size={11}/></div>
          </div>
        ) : (
          <>
            <div
              className="group-header"
              onClick={() => isOpen && setWarehouseOpen(prev => !prev)}
              title={!isOpen ? 'Warehouse' : undefined}
            >
              <Package size={20} className="main-icon" />
              <span className="group-label">Warehouse</span>
              {isOpen && (
                warehouseOpen 
                  ? <ChevronDown size={14} className="group-chevron" />
                  : <ChevronUp size={14} className="group-chevron" />
              )}
            </div>
            <div className={`group-sub-items ${isOpen && warehouseOpen ? 'expanded' : 'collapsed'}`}>
              {warehouseItems.map(item => (
                <NavLink key={item.name} to={item.path} className={({ isActive }) => isActive ? 'active' : ''}>
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* Finance Group */}
        <div
          className="group-header"
          onClick={() => isOpen && setFinanceOpen(prev => !prev)}
          title={!isOpen ? 'Finance' : undefined}
        >
          <Wallet size={20} className="main-icon" />
          <span className="group-label">Finance</span>
          {isOpen && (
            financeOpen 
              ? <ChevronDown size={14} className="group-chevron" />
              : <ChevronUp size={14} className="group-chevron" />
          )}
        </div>
        <div className={`group-sub-items ${isOpen && financeOpen ? 'expanded' : 'collapsed'}`}>
          {financeItems.map(item => (
            <NavLink key={item.name} to={item.path} className={({ isActive }) => isActive ? 'active' : ''}>
              {item.icon}
              <span>{item.name}</span>
            </NavLink>
          ))}
        </div>

        {/* Integrations Group */}
        <div
          className="group-header"
          onClick={() => isOpen && setIntegrationsOpen(prev => !prev)}
          title={!isOpen ? 'Integrations' : undefined}
        >
          <Share2 size={20} className="main-icon" />
          <span className="group-label">Integrations</span>
          {isOpen && (
            integrationsOpen 
              ? <ChevronDown size={14} className="group-chevron" />
              : <ChevronUp size={14} className="group-chevron" />
          )}
        </div>
        <div className={`group-sub-items ${isOpen && integrationsOpen ? 'expanded' : 'collapsed'}`}>
          {integrationsItems.map(item => (
            <NavLink key={item.name} to={item.path} className={({ isActive }) => isActive ? 'active' : ''}>
              {item.icon}
              <span>{item.name}</span>
            </NavLink>
          ))}
        </div>

        {/* Remaining items */}
        {filteredItems.slice(2).map((item) => {
          const isModuleLocked = item.module && !can(item.module);

          if (isModuleLocked) {
            return (
              <div key={item.name} className="nav-locked" onClick={() => navigate('/pricing')} title={`Upgrade to access ${item.name}`}>
                {item.icon}
                <span className="nav-label">{item.name}</span>
                <span className="lock-badge"><Lock size={9}/> PRO</span>
                <div className="lock-tooltip">🔒 Upgrade to unlock {item.name} <ArrowRight size={11}/></div>
              </div>
            );
          }

          return (
            <NavLink key={item.name} to={item.path} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.icon}
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Trial Banner */}
      {trialDaysLeft !== null && (
        <div className="trial-banner" style={{ background: `${trialColor}18`, border: `1px solid ${trialColor}40` }} onClick={() => navigate('/pricing')}>
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
