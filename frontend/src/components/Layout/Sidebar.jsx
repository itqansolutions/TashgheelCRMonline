import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Users, ShoppingBag, Handshake, CheckSquare, Wallet, 
  FileText, BarChart3, ChevronLeft, ChevronRight, History, 
  Settings as AdminSettingsIcon, Package, Zap, Lock, ArrowRight, DollarSign, CreditCard,
  Building2, UserCircle, Phone, ChevronDown, ChevronUp, Truck, Briefcase,
  Building, ShieldCheck, ArrowLeftRight, Scale,
  Share2, FileCheck, Send, MessageCircle,
  ShoppingCart, ArrowDownLeft, Calendar, Award, Key, Layers, Activity, UserCheck, Clock,
  Folder, HelpCircle, Bot, Sparkles, CheckCircle2, ListTree
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

  // -------------------------------------------------------------
  // Collapsible Group States (Accordion / Open-Close)
  // -------------------------------------------------------------
  const [profileOpen, setProfileOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(true);
  const [contactsEmployeesOpen, setContactsEmployeesOpen] = useState(false);
  const [realEstateOpen, setRealEstateOpen] = useState(true);
  const [reDefinitionsOpen, setReDefinitionsOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(true);
  const [financeOpen, setFinanceOpen] = useState(true);
  const [marketingOpen, setMarketingOpen] = useState(true);
  const [marketingWhatsappOpen, setMarketingWhatsappOpen] = useState(false);
  const [hrOpen, setHrOpen] = useState(true);
  const [purchasesOpen, setPurchasesOpen] = useState(true);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  // -------------------------------------------------------------
  // Allowed Pages Access Filter
  // -------------------------------------------------------------
  const ROUTE_ALIASES = {
    '/my-attendance': '/hr/my-attendance',
    '/my-requests': '/hr/my-requests',
    '/approvals': '/hr/approvals',
    '/my-payroll': '/hr/payroll',
    '/activity-balance': '/hr/activity-balance',
    '/my-deals': '/deals',
    '/my-tasks': '/tasks',
    '/my-customers': '/customers',
    '/my-units': '/units-registry',
  };

  const allowed = safeArray(user?.allowedPages);
  const isPathAllowed = (path) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    const basePath = path.split('?')[0];
    const canonicalPath = ROUTE_ALIASES[basePath] || basePath;
    return allowed.includes(path) || allowed.includes(basePath) || allowed.includes(canonicalPath);
  };

  const filterByAllowed = (items) => {
    return (items || []).filter(item => isPathAllowed(item.path));
  };

  // -------------------------------------------------------------
  // Active State Resolution for Direct and Query-Tab Routes
  // -------------------------------------------------------------
  const isItemActive = (itemPath) => {
    if (!itemPath) return false;
    const [itemBase, itemQuery] = itemPath.split('?');
    if (location.pathname !== itemBase) return false;
    if (!itemQuery) {
      // If item has no query, but current location has query that represents a specific tab, don't mark as active if another sibling tab matches
      return !location.search || location.search === '';
    }
    const itemParams = new URLSearchParams(itemQuery);
    const currentParams = new URLSearchParams(location.search);
    
    // Check 'tab' param
    const itemTab = itemParams.get('tab');
    if (itemTab !== null) {
      const currentTab = currentParams.get('tab');
      return itemTab.toLowerCase() === (currentTab || '').toLowerCase();
    }

    // Check 'type' param
    const itemType = itemParams.get('type');
    if (itemType !== null) {
      const currentType = currentParams.get('type');
      return itemType.toLowerCase() === (currentType || '').toLowerCase();
    }

    return true;
  };

  // Helper to test if any child in a subgroup is active
  const isAnyActive = (paths) => {
    return (paths || []).some(p => isItemActive(p));
  };

  // -------------------------------------------------------------
  // 1. MY PROFILE ITEMS (All direct siblings)
  // -------------------------------------------------------------
  const rawProfileItems = [
    { name: 'My Attendance',    icon: <Clock size={16} />,        path: '/my-attendance' },
    { name: 'My Requests',      icon: <FileText size={16} />,     path: '/my-requests' },
    { name: 'Approvals',        icon: <ShieldCheck size={16} />,  path: '/approvals', roleGuard: ['admin', 'manager'] },
    { name: 'My Payroll',       icon: <DollarSign size={16} />,   path: '/my-payroll' },
    { name: 'Activity Balance', icon: <Wallet size={16} />,       path: '/activity-balance' },
    { name: 'Deals',            icon: <Handshake size={16} />,    path: '/deals' },
    { name: 'Tasks',            icon: <CheckSquare size={16} />,  path: '/tasks' },
    { name: 'Customers',        icon: <Users size={16} />,        path: '/customers' },
    ...(isRealEstate ? [{ name: 'Units', icon: <Key size={16} />, path: '/units-registry' }] : [])
  ];

  const profileItems = rawProfileItems.filter(item => {
    if (item.roleGuard && !item.roleGuard.includes(user?.role)) return false;
    return isPathAllowed(item.path);
  });

  // -------------------------------------------------------------
  // 2. CONTACTS ITEMS
  // -------------------------------------------------------------
  const contactsDirectItems = [
    { name: 'Customers / Tenants', icon: <Users size={18} />, path: '/customers' },
    { name: 'Vendors',           icon: <Truck size={18} />, path: '/contacts/vendors' }
  ];

  const employeeSubItems = [
    { name: 'Departments', icon: <Building size={16} />,  path: '/contacts/employees?tab=departments' },
    { name: 'Job Titles',  icon: <Briefcase size={16} />, path: '/contacts/employees?tab=jobtitles' }
  ];

  const hasPurchasing = can('purchasing') || can('inventory');
  const hasHr = can('hr');

  // Filter contacts by permissions
  const visibleContactsDirect = contactsDirectItems.filter(item => {
    if (item.name === 'Vendors' && !hasPurchasing && user?.role !== 'admin') return false;
    return isPathAllowed(item.path);
  });

  const canAccessEmployees = (hasHr || user?.role === 'admin') && isPathAllowed('/contacts/employees');

  // -------------------------------------------------------------
  // 3. REAL ESTATE ITEMS (REAL ESTATE TEMPLATE ONLY)
  // -------------------------------------------------------------
  const reDefinitionsSubItems = [
    { name: 'Projects',   icon: <Building size={16} />,  path: '/units-registry?tab=projects' },
    { name: 'Developers', icon: <Building2 size={16} />, path: '/units-registry?tab=developers' },
    { name: 'Phases',     icon: <Layers size={16} />,    path: '/units-registry?tab=phases' }
  ];

  const reDirectItems = [
    { name: 'Units',        icon: <Key size={18} />,         path: '/units-registry' },
    { name: 'Reservations', icon: <CheckSquare size={18} />, path: '/deals?tab=reservations' },
    { name: 'Contracts',    icon: <FileText size={18} />,    path: '/deals?tab=contracts' },
    { name: 'Installments', icon: <CreditCard size={18} />,  path: '/deals?tab=installments' }
  ];

  // -------------------------------------------------------------
  // 4. SALES ITEMS (BOTH TEMPLATES)
  // -------------------------------------------------------------
  const rawSalesItems = [
    { name: 'Quotations',  icon: <FileText size={18} />,    path: '/finance?tab=Quotations' },
    { name: 'Salesmen',    icon: <Users size={18} />,       path: '/sales/salesmen' },
    { name: 'Targets',     icon: <Award size={18} />,       path: '/sales/target' },
    { name: 'Commissions', icon: <DollarSign size={18} />,  path: '/deals?tab=commissions' },
    { name: 'Handover',    icon: <Key size={18} />,         path: '/deals?tab=handover' }
  ];
  const salesItems = filterByAllowed(rawSalesItems);

  // -------------------------------------------------------------
  // 5. FINANCE ITEMS (ALL 9 OPERATIONS - BOTH TEMPLATES)
  // -------------------------------------------------------------
  const rawFinanceItems = [
    { name: 'Overview',          icon: <LayoutDashboard size={18} />, path: '/finance?tab=Overview' },
    { name: 'Invoices',          icon: <FileText size={18} />,        path: '/finance?tab=Invoices' },
    { name: 'Receipts',          icon: <ArrowDownLeft size={18} />,   path: '/finance?tab=Receipts' },
    { name: 'Payments',          icon: <CreditCard size={18} />,      path: '/finance?tab=Payments' },
    { name: 'Expenses',          icon: <DollarSign size={18} />,      path: '/finance?tab=Expenses' },
    { name: 'Customer Accounts', icon: <Users size={18} />,           path: '/finance?tab=Customers' },
    { name: 'Vendor Accounts',   icon: <Building2 size={18} />,       path: '/finance?tab=Vendors' },
    { name: 'Treasury',          icon: <Wallet size={18} />,          path: '/finance?tab=Treasury' },
    { name: 'Reports',           icon: <BarChart3 size={18} />,       path: '/finance?tab=Reports' }
  ];
  const financeItems = filterByAllowed(rawFinanceItems);

  // -------------------------------------------------------------
  // 6. MARKETING ITEMS
  // -------------------------------------------------------------
  const rawWhatsappSubItems = [
    { name: 'WhatsApp Campaigns', icon: <Send size={16} />,          path: '/marketing/whatsapp-campaigns' },
    { name: 'WhatsApp Chat',      icon: <MessageCircle size={16} />, path: '/whatsapp-chat' },
    { name: 'WhatsApp Chatbot',   icon: <Bot size={16} />,           path: '/marketing/whatsapp-chatbots' },
    { name: 'WhatsApp Settings',  icon: <AdminSettingsIcon size={16} />, path: '/integrations/whatsapp', roleGuard: ['admin'] }
  ];

  const whatsappSubItems = rawWhatsappSubItems.filter(item => {
    if (item.roleGuard && !item.roleGuard.includes(user?.role)) return false;
    return isPathAllowed(item.path);
  });

  const canAccessMetaForms = isPathAllowed('/integrations/meta-forms');

  // -------------------------------------------------------------
  // 7. HR ITEMS (ADMINISTRATION & SYSTEM HR)
  // -------------------------------------------------------------
  const rawHrItems = [
    { name: 'Dashboard for HR',    icon: <UserCheck size={18} />, path: '/hr/dashboard', roleGuard: ['admin', 'manager'] },
    { name: 'Payroll',             icon: <DollarSign size={18} />, path: '/hr/payroll', roleGuard: ['admin', 'manager'] },
    { name: 'Activity Definition', icon: <FileText size={18} />,   path: '/hr/activity-definition', roleGuard: ['admin', 'manager'] },
    { name: 'Activity Balance',    icon: <Scale size={18} />,      path: '/hr/activity-balance', roleGuard: ['admin', 'manager'] },
    { name: 'Shifts',              icon: <Calendar size={18} />,   path: '/hr/shifts', roleGuard: ['admin', 'manager'] },
    { name: 'Attendance Device',   icon: <Clock size={18} />,      path: '/hr/devices', roleGuard: ['admin', 'manager'] }
  ];

  const hrItems = (hasHr || user?.role === 'admin')
    ? rawHrItems.filter(item => {
        if (item.roleGuard && !item.roleGuard.includes(user?.role)) return false;
        return isPathAllowed(item.path);
      })
    : [];

  // -------------------------------------------------------------
  // 8. PURCHASES ITEMS
  // -------------------------------------------------------------
  const rawPurchasesItems = [
    { name: 'Purchase Request', icon: <FileText size={18} />,     path: '/purchases/requests' },
    { name: 'Purchase Invoice', icon: <ShoppingCart size={18} />, path: '/purchases' },
    { name: 'RFQs',             icon: <FileCheck size={18} />,    path: '/purchases/rfqs' },
    { name: 'Purchase Order',   icon: <FileText size={18} />,     path: '/purchases/orders' }
  ];

  const purchasesItems = (hasPurchasing || user?.role === 'admin')
    ? filterByAllowed(rawPurchasesItems)
    : [];

  // -------------------------------------------------------------
  // 9. REPORTS ITEMS (ERP REPORTS DORMANT/HIDDEN)
  // -------------------------------------------------------------
  const rawReportsItems = [
    { name: 'General Reports', icon: <BarChart3 size={18} />, path: '/reports' },
    { name: 'Finance Reports', icon: <Wallet size={18} />,    path: '/finance?tab=Reports' }
    // NOTE: ERP Reports is intentionally hidden for now until explicit ERP navigation activation
  ];
  const reportsItems = filterByAllowed(rawReportsItems);

  // -------------------------------------------------------------
  // 10. ADMIN ITEMS
  // -------------------------------------------------------------
  const rawAdminItems = [
    { name: 'Files',            icon: <FileText size={18} />,          path: '/files' },
    { name: 'Logs',             icon: <History size={18} />,           path: '/logs', roleGuard: ['admin'] },
    { name: 'Settings',         icon: <AdminSettingsIcon size={18} />, path: '/settings', roleGuard: ['admin'] },
    { name: 'Company Settings', icon: <Building2 size={18} />,         path: '/settings/company', roleGuard: ['admin'] },
    { name: 'Billing',          icon: <CreditCard size={18} />,        path: '/billing' }
  ];

  const adminItems = rawAdminItems.filter(item => {
    if (item.roleGuard && !item.roleGuard.includes(user?.role)) return false;
    return isPathAllowed(item.path);
  });

  const hasInventory = can('inventory');
  const inventoryItems = hasInventory ? filterByAllowed([]) : [];
  // Dormant Inventory check: hasInventory && inventoryItems.length > 0
  // Backward compatibility alias: hasPurchasing && purchasingItems.length > 0
  const purchasingItems = purchasesItems;

  const trialColor = trialDaysLeft !== null
    ? trialDaysLeft <= 3 ? '#ef4444' : trialDaysLeft <= 7 ? '#f59e0b' : '#10b981'
    : null;

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
        .group-header.sub-group-header {
          padding: 6px 10px;
          font-size: 12.5px;
          margin-top: 1px;
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
        .group-sub-items.nested {
          padding-left: 12px;
          border-left: 1.5px solid rgba(79,70,229,0.12);
          margin-left: 12px;
        }
        .group-sub-items.collapsed { max-height: 0; opacity: 0; }
        .group-sub-items.expanded { max-height: 800px; opacity: 1; }
        .group-sub-items a {
          padding: 6px 10px;
          font-size: 12.5px !important;
        }
        .sidebar.closed .group-sub-items { padding-left: 0; }
        .sidebar.closed .group-sub-items.nested { border-left: none; margin-left: 0; }

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

      {/* Navigation */}
      <nav className="sidebar-nav">
        
        {/* TOP LEVEL: Dashboard */}
        {isPathAllowed('/dashboard') && (
          <NavLink to="/dashboard" className={() => isItemActive('/dashboard') ? 'active' : ''}>
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </NavLink>
        )}

        {/* 1. MY PROFILE GROUP */}
        {profileItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setProfileOpen(prev => !prev)} title={!isOpen ? 'My Profile' : undefined}>
              <UserCircle size={18} className="main-icon" />
              <span className="group-label">My Profile</span>
              {isOpen && (profileOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && profileOpen ? 'expanded' : 'collapsed'}`}>
              {profileItems.map(item => (
                <NavLink key={item.name} to={item.path} className={() => isItemActive(item.path) ? 'active' : ''}>
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 2. CONTACTS GROUP */}
        {(visibleContactsDirect.length > 0 || canAccessEmployees) && (
          <>
            <div className="group-header" onClick={() => isOpen && setContactsOpen(prev => !prev)} title={!isOpen ? 'Contacts' : undefined}>
              <Users size={18} className="main-icon" />
              <span className="group-label">Contacts</span>
              {isOpen && (contactsOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && contactsOpen ? 'expanded' : 'collapsed'}`}>
              {visibleContactsDirect.map(item => (
                <NavLink key={item.name} to={item.path} className={() => isItemActive(item.path) ? 'active' : ''}>
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}

              {/* Employees Sub-Hierarchy: Master + Departments + Job Titles */}
              {canAccessEmployees && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '4px' }}>
                    <NavLink 
                      to="/contacts/employees" 
                      style={{ flex: 1 }}
                      className={() => (location.pathname === '/contacts/employees' && (!location.search || location.search.includes('tab=employees')) ? 'active' : '')}
                    >
                      <Briefcase size={17} />
                      <span>Employees</span>
                    </NavLink>
                    {isOpen && (
                      <span 
                        onClick={(e) => { e.stopPropagation(); setContactsEmployeesOpen(prev => !prev); }}
                        style={{ cursor: 'pointer', padding: '6px', color: 'var(--text-muted)' }}
                        title="Toggle Departments & Job Titles"
                      >
                        {contactsEmployeesOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                      </span>
                    )}
                  </div>
                  <div className={`group-sub-items nested ${isOpen && contactsEmployeesOpen ? 'expanded' : 'collapsed'}`}>
                    {employeeSubItems.map(subItem => (
                      <NavLink key={subItem.name} to={subItem.path} className={() => isItemActive(subItem.path) ? 'active' : ''}>
                        {subItem.icon}
                        <span>{subItem.name}</span>
                      </NavLink>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* 3. REAL ESTATE GROUP (VISIBLE ONLY WHEN template === 'real_estate') */}
        {isRealEstate && isPathAllowed('/units-registry') && (
          <>
            <div className="group-header" onClick={() => isOpen && setRealEstateOpen(prev => !prev)} title={!isOpen ? 'Real Estate' : undefined}>
              <Building2 size={18} className="main-icon" />
              <span className="group-label">Real Estate</span>
              {isOpen && (realEstateOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && realEstateOpen ? 'expanded' : 'collapsed'}`}>
              
              {/* Definitions Sub-Hierarchy: Projects, Developers, Phases */}
              <div 
                className="group-header sub-group-header" 
                onClick={() => isOpen && setReDefinitionsOpen(prev => !prev)}
                title={!isOpen ? 'Definitions' : undefined}
              >
                <Layers size={16} className="main-icon" />
                <span className="group-label">Definitions</span>
                {isOpen && (reDefinitionsOpen ? <ChevronDown size={13} className="group-chevron" /> : <ChevronUp size={13} className="group-chevron" />)}
              </div>
              <div className={`group-sub-items nested ${isOpen && reDefinitionsOpen ? 'expanded' : 'collapsed'}`}>
                {reDefinitionsSubItems.map(subItem => (
                  <NavLink key={subItem.name} to={subItem.path} className={() => isItemActive(subItem.path) ? 'active' : ''}>
                    {subItem.icon}
                    <span>{subItem.name}</span>
                  </NavLink>
                ))}
              </div>

              {/* Real Estate Core: Units, Reservations, Contracts, Installments */}
              {reDirectItems.map(item => (
                <NavLink key={item.name} to={item.path} className={() => isItemActive(item.path) ? 'active' : ''}>
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 4. SALES GROUP (Quotations, Salesmen, Targets, Commissions, Handover) */}
        {salesItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setSalesOpen(prev => !prev)} title={!isOpen ? 'Sales' : undefined}>
              <ShoppingBag size={18} className="main-icon" />
              <span className="group-label">Sales</span>
              {isOpen && (salesOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && salesOpen ? 'expanded' : 'collapsed'}`}>
              {salesItems.map(item => (
                <NavLink key={item.name} to={item.path} className={() => isItemActive(item.path) ? 'active' : ''}>
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 5. FINANCE GROUP (ALL 9 OPERATIONS - Overview, Invoices, Receipts, Payments, Expenses, Customer Accounts, Vendor Accounts, Treasury, Reports) */}
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
                  className={() => isItemActive(item.path) ? 'active' : ''}
                >
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 6. MARKETING GROUP (Meta Forms + WhatsApp: Campaigns, Chat, Chatbot, Settings) */}
        {(canAccessMetaForms || whatsappSubItems.length > 0) && (
          <>
            <div className="group-header" onClick={() => isOpen && setMarketingOpen(prev => !prev)} title={!isOpen ? 'Marketing' : undefined}>
              <Share2 size={18} className="main-icon" />
              <span className="group-label">Marketing</span>
              {isOpen && (marketingOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && marketingOpen ? 'expanded' : 'collapsed'}`}>
              {canAccessMetaForms && (
                <NavLink to="/integrations/meta-forms" className={() => isItemActive('/integrations/meta-forms') ? 'active' : ''}>
                  <FileText size={17} />
                  <span>Meta Forms</span>
                </NavLink>
              )}

              {whatsappSubItems.length > 0 && (
                <>
                  <div 
                    className="group-header sub-group-header" 
                    onClick={() => isOpen && setMarketingWhatsappOpen(prev => !prev)}
                    title={!isOpen ? 'WhatsApp' : undefined}
                  >
                    <MessageCircle size={16} className="main-icon" />
                    <span className="group-label">WhatsApp</span>
                    {isOpen && (marketingWhatsappOpen ? <ChevronDown size={13} className="group-chevron" /> : <ChevronUp size={13} className="group-chevron" />)}
                  </div>
                  <div className={`group-sub-items nested ${isOpen && marketingWhatsappOpen ? 'expanded' : 'collapsed'}`}>
                    {whatsappSubItems.map(subItem => (
                      <NavLink key={subItem.name} to={subItem.path} className={() => isItemActive(subItem.path) ? 'active' : ''}>
                        {subItem.icon}
                        <span>{subItem.name}</span>
                      </NavLink>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* 7. HR GROUP (Dashboard for HR, Payroll, Activity Definition, Activity Balance, Shifts, Attendance Device) */}
        {hrItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setHrOpen(prev => !prev)} title={!isOpen ? 'HR' : undefined}>
              <UserCheck size={18} className="main-icon" />
              <span className="group-label">HR</span>
              {isOpen && (hrOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && hrOpen ? 'expanded' : 'collapsed'}`}>
              {hrItems.map(item => (
                <NavLink key={item.name} to={item.path} className={() => isItemActive(item.path) ? 'active' : ''}>
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 8. PURCHASES GROUP (Purchase Request, Purchase Invoice, RFQs, Purchase Order) */}
        {hasPurchasing && purchasingItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setPurchasesOpen(prev => !prev)} title={!isOpen ? 'Purchases' : undefined}>
              <ShoppingCart size={18} className="main-icon" />
              <span className="group-label">Purchases</span>
              {isOpen && (purchasesOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && purchasesOpen ? 'expanded' : 'collapsed'}`}>
              {purchasesItems.map(item => (
                <NavLink key={item.name} to={item.path} className={() => isItemActive(item.path) ? 'active' : ''}>
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 9. REPORTS GROUP (General Reports, Finance Reports) */}
        {reportsItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setReportsOpen(prev => !prev)} title={!isOpen ? 'Reports' : undefined}>
              <BarChart3 size={18} className="main-icon" />
              <span className="group-label">Reports</span>
              {isOpen && (reportsOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && reportsOpen ? 'expanded' : 'collapsed'}`}>
              {reportsItems.map(item => (
                <NavLink key={item.name} to={item.path} className={() => isItemActive(item.path) ? 'active' : ''}>
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 10. ADMIN GROUP (Files, Logs, Settings, Company Settings, Billing) */}
        {adminItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setAdminOpen(prev => !prev)} title={!isOpen ? 'Admin' : undefined}>
              <AdminSettingsIcon size={18} className="main-icon" />
              <span className="group-label">Admin</span>
              {isOpen && (adminOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && adminOpen ? 'expanded' : 'collapsed'}`}>
              {adminItems.map(item => (
                <NavLink key={item.name} to={item.path} className={() => isItemActive(item.path) ? 'active' : ''}>
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

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
