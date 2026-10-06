import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Users, ShoppingBag, Handshake, CheckSquare, Wallet, 
  FileText, BarChart3, ChevronLeft, ChevronRight, History, 
  Settings as AdminSettingsIcon, Package, Zap, Lock, ArrowRight, DollarSign, CreditCard,
  Building2, UserCircle, Phone, ChevronDown, ChevronUp, Truck, Briefcase,
  Building, ShieldCheck, ArrowLeftRight, Scale,
  Share2, FileCheck, Send, MessageCircle,
  ShoppingCart, ArrowDownLeft, Calendar, Award, Key, Layers, Activity, UserCheck, Clock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModule } from '../../hooks/useModule';
import { safeArray } from '../../utils/dataUtils';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const { user } = useAuth();
  const { can, planName, trialDaysLeft } = useModule();
  const navigate = useNavigate();
  const location = useLocation();

  const isRealEstate = user?.template_name === 'real_estate';

  // Collapsible Group States
  const [crmOpen, setCrmOpen] = useState(true);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [salesOpen, setSalesOpen] = useState(true);
  const [inventoryOpen, setInventoryOpen] = useState(true);
  const [purchasingOpen, setPurchasingOpen] = useState(true);
  const [financeOpen, setFinanceOpen] = useState(true);
  const [marketingOpen, setMarketingOpen] = useState(true);
  const [hrOpen, setHrOpen] = useState(true);

  // -------------------------------------------------------------
  // SHARED CRM NAVIGATION ITEMS (Both Templates)
  // -------------------------------------------------------------
  const sharedCrmItems = [
    { name: 'Leads',       icon: <Users size={18} />,     path: '/customers?type=lead' },
    { name: 'Customers',   icon: <Users size={18} />,     path: '/customers' },
    { name: 'Deals',       icon: <Handshake size={18} />, path: '/deals' },
    { name: 'Activities',  icon: <Activity size={18} />,  path: '/activities' },
  ];

  // -------------------------------------------------------------
  // REAL ESTATE TEMPLATE CORE ITEMS
  // -------------------------------------------------------------
  const rePropertiesItems = [
    { name: 'Developers',  icon: <Building2 size={18} />, path: '/units-registry?tab=developers' },
    { name: 'Projects',    icon: <Building size={18} />,  path: '/units-registry?tab=projects' },
    { name: 'Phases',      icon: <Layers size={18} />,    path: '/units-registry?tab=phases' },
    { name: 'Buildings',   icon: <Building2 size={18} />, path: '/units-registry?tab=buildings' },
    { name: 'Units',       icon: <Key size={18} />,        path: '/units-registry' },
  ];

  const reSalesItems = [
    { name: 'Site Visits',  icon: <Calendar size={18} />,  path: '/activities?type=site_visit' },
    { name: 'Reservations', icon: <CheckSquare size={18} />, path: '/deals?tab=reservations' },
    { name: 'Contracts',    icon: <FileText size={18} />,   path: '/deals?tab=contracts' },
    { name: 'Installments', icon: <CreditCard size={18} />, path: '/deals?tab=installments' },
    { name: 'Commissions',  icon: <Award size={18} />,      path: '/deals?tab=commissions' },
    { name: 'Handover',     icon: <Key size={18} />,        path: '/deals?tab=handover' },
  ];

  // -------------------------------------------------------------
  // GENERAL TEMPLATE CORE SALES ITEMS
  // -------------------------------------------------------------
  const genSalesItems = [
    { name: 'Quotations',    icon: <FileText size={18} />,    path: '/quotations' },
    { name: 'Sales Orders',  icon: <ShoppingBag size={18} />, path: '/sales/orders' },
    { name: 'Delivery Notes',icon: <FileCheck size={18} />,   path: '/sales/documents' },
    { name: 'Invoices',      icon: <FileText size={18} />,    path: '/finance?tab=Invoices' },
  ];

  // -------------------------------------------------------------
  // OPTIONAL: INVENTORY & WAREHOUSES (Governed by can('inventory'))
  // -------------------------------------------------------------
  const inventoryItemsList = [
    { name: 'Products',         icon: <ShoppingBag size={18} />,    path: '/products' },
    { name: 'Warehouses',       icon: <Building size={18} />,       path: '/inventory/warehouses' },
    { name: 'Stock Balances',   icon: <Scale size={18} />,          path: '/inventory/balances' },
    { name: 'Stock Movements',  icon: <ArrowLeftRight size={18} />, path: '/inventory/movements' },
    { name: 'Item Cards',       icon: <CreditCard size={18} />,     path: '/inventory/item-card' },
  ];

  // -------------------------------------------------------------
  // OPTIONAL: PURCHASING & PROCUREMENT (Governed by can('purchasing') || can('inventory'))
  // -------------------------------------------------------------
  const purchasingItemsList = [
    { name: 'Suppliers',        icon: <Truck size={18} />,        path: '/contacts/vendors' },
    { name: 'Requests',         icon: <FileText size={18} />,     path: '/purchases/requests' },
    { name: 'RFQs & Bids',      icon: <FileCheck size={18} />,    path: '/purchases/rfqs' },
    { name: 'Purchase Orders',  icon: <FileText size={18} />,     path: '/purchases/orders' },
    { name: 'Goods Receipts',   icon: <FileCheck size={18} />,    path: '/purchases/receipts' },
    { name: 'Supplier Invoices',icon: <ShoppingCart size={18} />, path: '/purchases' },
  ];

  // -------------------------------------------------------------
  // SHARED FINANCE OPERATIONS (Both Templates — Real Existing Tabs)
  // -------------------------------------------------------------
  const sharedFinanceItems = [
    { name: 'Overview',    icon: <LayoutDashboard size={18} />, path: '/finance?tab=Overview' },
    { name: 'Invoices',    icon: <FileText size={18} />,        path: '/finance?tab=Invoices' },
    { name: 'Receipts',    icon: <ArrowDownLeft size={18} />,   path: '/finance?tab=Receipts' },
    { name: 'Expenses',    icon: <DollarSign size={18} />,      path: '/finance?tab=Expenses' },
    { name: 'Customers',   icon: <Users size={18} />,           path: '/finance?tab=Customers' },
    { name: 'Vendors',     icon: <Building2 size={18} />,       path: '/finance?tab=Vendors' },
    { name: 'Treasury',    icon: <Wallet size={18} />,          path: '/finance?tab=Treasury' },
    { name: 'Reports',     icon: <BarChart3 size={18} />,       path: '/finance?tab=Reports' },
  ];

  // -------------------------------------------------------------
  // SHARED HR & WORKFORCE (Governed by can('hr'))
  // -------------------------------------------------------------
  const hrItemsList = [
    { name: 'My Attendance',   icon: <Clock size={18} />,     path: '/hr/my-attendance' },
    { name: 'My Requests',     icon: <FileText size={18} />,  path: '/hr/my-requests' },
    { name: 'Admin Dashboard', icon: <UserCheck size={18} />, path: '/hr/dashboard' },
    { name: 'Approvals',       icon: <ShieldCheck size={18} />, path: '/hr/approvals' },
    { name: 'Payroll Engine',  icon: <DollarSign size={18} />, path: '/hr/payroll' },
    { name: 'Shifts & Hours',  icon: <Calendar size={18} />,  path: '/hr/shifts' },
  ];

  // -------------------------------------------------------------
  // SHARED MARKETING & INTEGRATIONS (Both Templates)
  // -------------------------------------------------------------
  const sharedMarketingItems = [
    { name: 'Meta Lead Ads', icon: <Share2 size={18} />,        path: '/integrations/meta-forms' },
    { name: 'Campaigns',     icon: <Send size={18} />,          path: '/marketing/whatsapp-campaigns' },
    { name: 'Lead Sources',  icon: <Users size={18} />,         path: '/lead-sources' },
    { name: 'WhatsApp',      icon: <MessageCircle size={18} />, path: '/whatsapp-chat' },
  ];

  // -------------------------------------------------------------
  // SHARED OPERATIONAL UTILITIES (Bottom items)
  // -------------------------------------------------------------
  const bottomNavItems = [
    { name: 'Tasks',           icon: <CheckSquare size={18} />,   path: '/tasks' },
    { name: 'Files',           icon: <FileText size={18} />,      path: '/files' },
    { name: 'Automation',      icon: <Zap size={18} />,           path: '/automation', module: 'automation' },
    { name: 'Reports',         icon: <BarChart3 size={18} />,     path: '/reports' },
    { name: 'System Logs',     icon: <History size={18} />,       path: '/logs' },
    { name: 'Admin Settings',  icon: <AdminSettingsIcon size={18} />, path: '/settings' },
    { name: 'Billing',         icon: <CreditCard size={18} />,    path: '/billing' },
  ];

  const allowed = safeArray(user?.allowedPages);
  const filterByAllowed = (items) => {
    if (!user) return [];
    if (user.role === 'admin') return items;
    return (items || []).filter(item => {
      const basePath = item.path.split('?')[0];
      return allowed.includes(item.path) || allowed.includes(basePath);
    });
  };

  const isItemActive = (itemPath) => {
    if (!itemPath) return false;
    const [itemBase, itemQuery] = itemPath.split('?');
    if (location.pathname !== itemBase) return false;
    if (!itemQuery) return true;
    const itemParams = new URLSearchParams(itemQuery);
    const currentParams = new URLSearchParams(location.search);
    const itemTab = itemParams.get('tab');
    if (itemTab !== null) {
      const currentTab = currentParams.get('tab');
      return itemTab.toLowerCase() === (currentTab || '').toLowerCase();
    }
    const itemType = itemParams.get('type');
    if (itemType !== null) {
      const currentType = currentParams.get('type');
      return itemType.toLowerCase() === (currentType || '').toLowerCase();
    }
    return true;
  };

  const hasInventory = can('inventory');
  const hasPurchasing = can('purchasing') || can('inventory');
  const hasHr = can('hr');

  const trialColor = trialDaysLeft !== null
    ? trialDaysLeft <= 3 ? '#ef4444' : trialDaysLeft <= 7 ? '#f59e0b' : '#10b981'
    : null;

  // Active items by template and module entitlement
  const crmItems = filterByAllowed(sharedCrmItems);
  const propertiesItems = filterByAllowed(rePropertiesItems);
  const salesItems = filterByAllowed(isRealEstate ? reSalesItems : genSalesItems);
  const inventoryItems = hasInventory ? filterByAllowed(inventoryItemsList) : [];
  const purchasingItems = hasPurchasing ? filterByAllowed(purchasingItemsList) : [];
  const financeItems = filterByAllowed(sharedFinanceItems);
  const hrItems = hasHr ? filterByAllowed(hrItemsList) : [];
  const marketingItems = filterByAllowed(sharedMarketingItems);
  const visibleBottomItems = filterByAllowed(bottomNavItems);

  return (
    <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
      <style>{`
        .sidebar {
          height: 100vh; background: var(--glass-bg, rgba(255, 255, 255, 0.85)); backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px); color: var(--text-main, #0f172a);
          width: var(--sidebar-w, 240px); position: fixed; left: 0; top: 0;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); z-index: 1001;
          display: flex; flex-direction: column;
          border-right: 1px solid var(--glass-border, #e2e8f0);
          box-shadow: 10px 0 30px rgba(0,0,0,0.03);
          font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }
        .sidebar.closed { width: 68px; }
        @media (max-width: 768px) {
          .sidebar.closed { transform: translateX(-100%); width: var(--sidebar-w, 240px); }
          .sidebar.open { transform: translateX(0); width: var(--sidebar-w, 240px); }
        }
        .sidebar-header {
          height: var(--header-h, 56px); display: flex; align-items: center;
          padding: 0 16px; border-bottom: 1px solid var(--glass-border, #e2e8f0);
          justify-content: space-between;
        }
        .sidebar-header h2 {
          font-size: 17px; font-weight: 800; letter-spacing: -0.02em;
          white-space: nowrap; overflow: hidden; transition: opacity 0.2s; color: var(--primary);
        }
        .sidebar.closed .sidebar-header h2 { opacity: 0; pointer-events: none; }
        .toggle-btn {
          background: rgba(79,70,229,0.05); color: var(--primary); border-radius: 6px;
          display: flex; align-items: center; justify-content: center; padding: 5px; transition: all 0.2s;
        }
        .toggle-btn:hover { background: rgba(79,70,229,0.1); transform: scale(1.05); }
        .sidebar-nav { flex: 1; padding: 10px 8px; overflow-y: auto; overflow-x: hidden; }

        .sidebar-nav a {
          display: flex; align-items: center; padding: 7px 10px; color: var(--text-muted);
          transition: all 0.3s cubic-bezier(0.4,0,0.2,1); gap: 10px; border-radius: 8px;
          margin-bottom: 2px; position: relative; text-decoration: none;
        }
        .sidebar-nav a:hover { background: rgba(79,70,229,0.05); color: var(--primary); transform: translateX(2px); }
        .sidebar-nav a.active {
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          color: white; box-shadow: 0 6px 12px -2px rgba(79,70,229,0.25);
        }
        .sidebar-nav a svg { min-width: 17px; width: 17px; height: 17px; transition: transform 0.3s; }
        .sidebar-nav a.active svg { transform: scale(1.08); }
        .sidebar-nav a span { white-space: nowrap; font-weight: 600; font-size: 13px; transition: opacity 0.2s; }
        .sidebar.closed .sidebar-nav a span { opacity: 0; pointer-events: none; }

        /* Group Headers */
        .group-header {
          display: flex; align-items: center; padding: 7px 10px; gap: 10px;
          border-radius: 8px; margin-bottom: 2px; cursor: pointer;
          color: var(--text-muted); transition: all 0.25s;
          border: 1px solid transparent;
        }
        .group-header:hover {
          background: rgba(79,70,229,0.04); color: var(--primary);
          border-color: rgba(79,70,229,0.1);
        }
        .group-header svg.main-icon { min-width: 17px; width: 17px; height: 17px; }
        .group-label { flex: 1; font-weight: 600; font-size: 13px; white-space: nowrap; transition: opacity 0.2s; letter-spacing: 0.01em; }
        .sidebar.closed .group-label { opacity: 0; }
        .group-chevron { transition: all 0.25s; flex-shrink: 0; }
        .sidebar.closed .group-chevron { opacity: 0; }
        .group-sub-items {
          overflow: hidden; transition: max-height 0.3s ease, opacity 0.3s ease;
          padding-left: 8px;
        }
        .group-sub-items.collapsed { max-height: 0; opacity: 0; }
        .group-sub-items.expanded { max-height: 500px; opacity: 1; }
        .group-sub-items a {
          padding: 6px 10px;
          font-size: 12.5px !important;
        }
        .sidebar.closed .group-sub-items { padding-left: 0; }

        .trial-banner {
          margin: 0 8px 8px; border-radius: 8px; padding: 8px 10px;
          cursor: pointer; transition: all 0.2s;
        }
        .trial-banner:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.1); }
        .trial-banner .tb-row { display: flex; align-items: center; gap: 6px; }
        .trial-banner .tb-title { font-size: 11px; font-weight: 800; flex: 1; transition: opacity 0.2s; }
        .trial-banner .tb-sub { font-size: 10px; margin-top: 2px; transition: opacity 0.2s; }
        .sidebar.closed .trial-banner .tb-title,
        .sidebar.closed .trial-banner .tb-sub { opacity: 0; }
        .trial-banner .tb-icon { font-size: 14px; flex-shrink: 0; }

        .sidebar-footer {
          padding: 10px 14px; font-size: 10px; font-weight: 600; color: var(--text-muted);
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
        {/* Dashboard */}
        <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </NavLink>

        {/* 1. CRM Group (Both templates) */}
        {crmItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setCrmOpen(prev => !prev)} title={!isOpen ? 'CRM' : undefined}>
              <Users size={18} className="main-icon" />
              <span className="group-label">CRM</span>
              {isOpen && (crmOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && crmOpen ? 'expanded' : 'collapsed'}`}>
              {crmItems.map(item => (
                <NavLink key={item.name} to={item.path} className={({ isActive }) => item.path.includes('?') ? (isItemActive(item.path) ? 'active' : '') : (isActive ? 'active' : '')}>
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 2. Properties Group (Real Estate ONLY) */}
        {isRealEstate && propertiesItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setPropertiesOpen(prev => !prev)} title={!isOpen ? 'Properties' : undefined}>
              <Building2 size={18} className="main-icon" />
              <span className="group-label">Properties</span>
              {isOpen && (propertiesOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && propertiesOpen ? 'expanded' : 'collapsed'}`}>
              {propertiesItems.map(item => (
                <NavLink key={item.name} to={item.path} className={({ isActive }) => item.path.includes('?') ? (isItemActive(item.path) ? 'active' : '') : (isActive ? 'active' : '')}>
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 3. Sales Group (Template Specialized) */}
        {salesItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setSalesOpen(prev => !prev)} title={!isOpen ? 'Sales' : undefined}>
              <ShoppingBag size={18} className="main-icon" />
              <span className="group-label">{isRealEstate ? 'Contracts & Sales' : 'Sales'}</span>
              {isOpen && (salesOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && salesOpen ? 'expanded' : 'collapsed'}`}>
              {salesItems.map(item => (
                <NavLink key={item.name} to={item.path} className={({ isActive }) => item.path.includes('?') ? (isItemActive(item.path) ? 'active' : '') : (isActive ? 'active' : '')}>
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 4. Inventory Group (Governed by can('inventory')) */}
        {hasInventory && inventoryItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setInventoryOpen(prev => !prev)} title={!isOpen ? 'Inventory' : undefined}>
              <Package size={18} className="main-icon" />
              <span className="group-label">Inventory</span>
              {isOpen && (inventoryOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && inventoryOpen ? 'expanded' : 'collapsed'}`}>
              {inventoryItems.map(item => (
                <NavLink key={item.name} to={item.path} className={({ isActive }) => isActive ? 'active' : ''}>
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 5. Purchasing Group (Governed by can('purchasing') || can('inventory')) */}
        {hasPurchasing && purchasingItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setPurchasingOpen(prev => !prev)} title={!isOpen ? 'Purchasing' : undefined}>
              <ShoppingCart size={18} className="main-icon" />
              <span className="group-label">Purchasing</span>
              {isOpen && (purchasingOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && purchasingOpen ? 'expanded' : 'collapsed'}`}>
              {purchasingItems.map(item => (
                <NavLink key={item.name} to={item.path} className={({ isActive }) => isActive ? 'active' : ''}>
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 6. Finance Group (Specialized operational money tracking) */}
        {financeItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setFinanceOpen(prev => !prev)} title={!isOpen ? 'Finance' : undefined}>
              <Wallet size={18} className="main-icon" />
              <span className="group-label">Finance</span>
              {isOpen && (financeOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && financeOpen ? 'expanded' : 'collapsed'}`}>
              {financeItems.map(item => (
                <NavLink 
                  key={item.name} 
                  to={item.path} 
                  className={({ isActive }) => (item.path.includes('?') ? (isItemActive(item.path) ? 'active' : '') : (isActive ? 'active' : ''))}
                >
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 7. Marketing & Integrations Group */}
        {marketingItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setMarketingOpen(prev => !prev)} title={!isOpen ? 'Marketing & Integrations' : undefined}>
              <Share2 size={18} className="main-icon" />
              <span className="group-label">Marketing & Integrations</span>
              {isOpen && (marketingOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && marketingOpen ? 'expanded' : 'collapsed'}`}>
              {marketingItems.map(item => (
                <NavLink key={item.name} to={item.path} className={({ isActive }) => isActive ? 'active' : ''}>
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 8. HR & Workforce Group (Governed by can('hr')) */}
        {hasHr && hrItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setHrOpen(prev => !prev)} title={!isOpen ? 'HR & Workforce' : undefined}>
              <UserCheck size={18} className="main-icon" />
              <span className="group-label">HR & Workforce</span>
              {isOpen && (hrOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && hrOpen ? 'expanded' : 'collapsed'}`}>
              {hrItems.map(item => (
                <NavLink key={item.name} to={item.path} className={({ isActive }) => item.path.includes('?') ? (isItemActive(item.path) ? 'active' : '') : (isActive ? 'active' : '')}>
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* Bottom standard items: Tasks, Files, Automation, Reports, Logs, Settings, Billing */}
        {visibleBottomItems.map((item) => {
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
