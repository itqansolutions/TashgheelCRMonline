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
  Folder, HelpCircle, Bot, Sparkles, CheckCircle2, ListTree, Globe
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useModule } from '../../hooks/useModule';
import { safeArray } from '../../utils/dataUtils';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const { user } = useAuth();
  const { lang, t, isRTL } = useLanguage();
  const { can, planName, trialDaysLeft } = useModule();
  const navigate = useNavigate();
  const location = useLocation();

  const hasRealEstate = can('real_estate') !== false && (user?.template_name === 'real_estate' || can('real_estate') === true);
  const isRealEstate = hasRealEstate;

  // -------------------------------------------------------------
  // Collapsible Group States (Accordion / Open-Close)
  // -------------------------------------------------------------
  const [profileOpen, setProfileOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(true);
  const [contactsEmployeesOpen, setContactsEmployeesOpen] = useState(false);
  const [realEstateOpen, setRealEstateOpen] = useState(true);
  const [reDefinitionsOpen, setReDefinitionsOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(true);
  const [warehouseOpen, setWarehouseOpen] = useState(true);
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
    '/my-deals': '/deals',
    '/my-tasks': '/tasks',
    '/my-customers': '/customers',
    '/my-units': '/units-registry',
    '/sales/orders': '/sales',
    '/sales/documents': '/sales',
    '/sales/price-tiers': '/sales',
    '/inventory/warehouses': '/inventory',
    '/inventory/movements': '/inventory',
    '/inventory/keepers': '/inventory',
    '/inventory/balances': '/inventory',
    '/inventory/transaction-impact': '/inventory',
    '/inventory/item-card': '/inventory',
  };
  // Personal self-service pages (server scopes data to the authenticated user)
  const SELF_SERVICE = ['/my-profile', '/my-payroll', '/activity-balance'];

  const allowed = safeArray(user?.allowedPages);
  const isPathAllowed = (path) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    const basePath = path.split('?')[0];
    if (SELF_SERVICE.includes(basePath)) return true;
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
  // -------------------------------------------------------------
  // 1. MY PROFILE ITEMS (All direct siblings)
  // -------------------------------------------------------------
  const hasPurchasing = can('purchasing') === true || (can('purchasing') !== false && can('inventory') === true);
  const hasHr = can('hr');
  const hasFinance = can('finance');
  const hasReports = can('reports') !== false;
  const hasCrm = can('crm');
  const hasSales = can('sales') !== false && (can('sales') === true || hasCrm);
  const hasMarketing = can('marketing') !== false && (can('marketing') === true || hasCrm);

  const rawProfileItems = [
    ...(hasHr ? [
      { name: 'My Attendance',    labelKey: 'sidebar.myAttendance',    icon: <Clock size={16} />,        path: '/my-attendance' },
      { name: 'My Requests',      labelKey: 'sidebar.myRequests',      icon: <FileText size={16} />,     path: '/my-requests' },
      { name: 'Approvals',        labelKey: 'sidebar.approvals',       icon: <ShieldCheck size={16} />,  path: '/approvals', roleGuard: ['admin', 'manager'] },
      { name: 'My Payroll',       labelKey: 'sidebar.myPayroll',       icon: <DollarSign size={16} />,   path: '/my-payroll' },
      { name: 'Activity Balance', labelKey: 'sidebar.activityBalance', icon: <Wallet size={16} />,       path: '/activity-balance' },
    ] : []),
    ...(hasCrm ? [
      { name: 'Deals',            labelKey: 'sidebar.deals',            icon: <Handshake size={16} />,    path: '/deals' },
      { name: 'Tasks',            labelKey: 'sidebar.tasks',            icon: <CheckSquare size={16} />,  path: '/tasks' },
      { name: 'Customers',        labelKey: 'sidebar.customers',        icon: <Users size={16} />,        path: '/customers' },
    ] : []),
    ...(isRealEstate ? [{ name: 'Units', labelKey: 'sidebar.units', icon: <Key size={16} />, path: '/units-registry' }] : [])
  ];

  const profileItems = rawProfileItems.filter(item => {
    if (item.roleGuard && !item.roleGuard.includes(user?.role)) return false;
    return isPathAllowed(item.path);
  });

  // -------------------------------------------------------------
  // 2. CONTACTS ITEMS
  // -------------------------------------------------------------
  const contactsDirectItems = [
    ...(hasCrm ? [{ name: 'Customers / Tenants', labelKey: 'sidebar.customersTenants', icon: <Users size={18} />, path: '/customers' }] : []),
    { name: 'Vendors',             labelKey: 'sidebar.vendors',          icon: <Truck size={18} />, path: '/contacts/vendors' }
  ];

  const employeeSubItems = [
    { name: 'Departments', labelKey: 'sidebar.departments', icon: <Building size={16} />,  path: '/contacts/employees?tab=departments' },
    { name: 'Job Titles',  labelKey: 'sidebar.jobTitles',   icon: <Briefcase size={16} />, path: '/contacts/employees?tab=jobtitles' }
  ];

  // Filter contacts by module entitlements & permissions
  const visibleContactsDirect = contactsDirectItems.filter(item => {
    if (item.name === 'Vendors' && !hasPurchasing) return false;
    return isPathAllowed(item.path);
  });

  // Employees & User management is always available to tenant Admin to manage seats, or when HR module is enabled
  const canAccessEmployees = (hasHr || user?.role === 'admin') && isPathAllowed('/contacts/employees');

  // -------------------------------------------------------------
  // 3. REAL ESTATE ITEMS (REAL ESTATE TEMPLATE ONLY)
  // -------------------------------------------------------------
  const reDefinitionsSubItems = [
    { name: 'Projects',   labelKey: 'sidebar.projects',   icon: <Building size={16} />,  path: '/units-registry?tab=projects' },
    { name: 'Developers', labelKey: 'sidebar.developers', icon: <Building2 size={16} />, path: '/units-registry?tab=developers' },
    { name: 'Phases',     labelKey: 'sidebar.phases',     icon: <Layers size={16} />,    path: '/units-registry?tab=phases' }
  ];

  const reDirectItems = [
    { name: 'Units',           labelKey: 'sidebar.units',          icon: <Key size={18} />,         path: '/units-registry' },
    { name: 'Reservations',    labelKey: 'sidebar.reservations',   icon: <CheckSquare size={18} />, path: '/reservations' },
    { name: 'Contracts',       labelKey: 'sidebar.contracts',      icon: <FileText size={18} />,    path: '/contracts' },
    { name: 'Installments',    labelKey: 'sidebar.installments',   icon: <CreditCard size={18} />,  path: '/installments' },
    { name: 'Property Finder', labelKey: 'sidebar.propertyFinder', icon: <Globe size={18} />,       path: '/integrations/property-finder', roleGuard: ['admin', 'manager'] }
  ];

  // -------------------------------------------------------------
  // 4. SALES ITEMS (BOTH TEMPLATES; Commissions & Handover are Real Estate workspaces)
  // -------------------------------------------------------------
  const rawSalesItems = [
    {
      name: isRealEstate ? 'RE Sales Management' : 'Sales Management',
      labelKey: isRealEstate ? 'sidebar.reSalesManagement' : 'sidebar.salesManagement',
      icon: <BarChart3 size={18} />,
      path: '/sales/management',
      roleGuard: ['admin', 'manager', 'supervisor']
    },
    { name: 'Quotations',     labelKey: 'sidebar.quotations',    icon: <FileText size={18} />,     path: '/finance?tab=Quotations' },
    ...(!isRealEstate ? [
      { name: 'Sales Orders',   labelKey: 'sidebar.salesOrders',   icon: <ShoppingCart size={18} />, path: '/sales/orders' },
      { name: 'Documents Hub',  labelKey: 'sidebar.documentsHub',  icon: <FileCheck size={18} />,    path: '/sales/documents' },
      { name: 'Price Tiers',    labelKey: 'sidebar.priceTiers',    icon: <DollarSign size={18} />,   path: '/sales/price-tiers' },
    ] : []),
    { name: 'Salesmen',       labelKey: 'sidebar.salesmen',      icon: <Users size={18} />,        path: '/sales/salesmen' },
    { name: 'Targets',        labelKey: 'sidebar.targets',       icon: <Award size={18} />,        path: '/sales/target' },
    ...(isRealEstate ? [
      { name: 'Commissions',  labelKey: 'sidebar.commissions',   icon: <DollarSign size={18} />,   path: '/commissions' },
      { name: 'Handover',     labelKey: 'sidebar.handover',      icon: <Key size={18} />,          path: '/handover' }
    ] : [])
  ];
  const salesItems = hasSales ? filterByAllowed(rawSalesItems) : [];

  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // 5. WAREHOUSE & INVENTORY ITEMS
  // -------------------------------------------------------------
  const rawWarehouseItems = [
    { name: 'Products',           labelKey: 'sidebar.products',          icon: <Package size={18} />,        path: '/products' },
    { name: 'Warehouses',         labelKey: 'sidebar.warehouses',        icon: <Building size={18} />,       path: '/inventory/warehouses' },
    { name: 'Keepers',            labelKey: 'sidebar.keepers',           icon: <ShieldCheck size={18} />,    path: '/inventory/keepers' },
    { name: 'Stock Balances',     labelKey: 'sidebar.stockBalances',     icon: <Scale size={18} />,          path: '/inventory/balances' },
    { name: 'Stock Movements',    labelKey: 'sidebar.stockMovements',    icon: <ArrowLeftRight size={18} />,  path: '/inventory/movements' },
    { name: 'Transaction Impact', labelKey: 'sidebar.transactionImpact', icon: <Activity size={18} />,       path: '/inventory/transaction-impact' },
    { name: 'Item Card',          labelKey: 'sidebar.itemCard',          icon: <CreditCard size={18} />,     path: '/inventory/item-card' }
  ];
  const hasInventory = can('inventory') === true;
  const inventoryItems = hasInventory ? filterByAllowed(rawWarehouseItems) : [];
  const warehouseItems = inventoryItems;

  // -------------------------------------------------------------
  // 6. FINANCE ITEMS (ALL 9 OPERATIONS - BOTH TEMPLATES)
  // -------------------------------------------------------------
  const rawFinanceItems = [
    { name: 'Overview',          labelKey: 'sidebar.overview',         icon: <LayoutDashboard size={18} />, path: '/finance?tab=Overview' },
    { name: 'Invoices',          labelKey: 'sidebar.invoices',         icon: <FileText size={18} />,        path: '/finance?tab=Invoices' },
    { name: 'Receipts',          labelKey: 'sidebar.receipts',         icon: <ArrowDownLeft size={18} />,   path: '/finance?tab=Receipts' },
    { name: 'Payments',          labelKey: 'sidebar.payments',         icon: <CreditCard size={18} />,      path: '/finance?tab=Payments' },
    { name: 'Expenses',          labelKey: 'sidebar.expenses',         icon: <DollarSign size={18} />,      path: '/finance?tab=Expenses' },
    { name: 'Customer Accounts', labelKey: 'sidebar.customerAccounts', icon: <Users size={18} />,           path: '/finance?tab=Customers' },
    { name: 'Vendor Accounts',   labelKey: 'sidebar.vendorAccounts',   icon: <Building2 size={18} />,       path: '/finance?tab=Vendors' },
    { name: 'Treasury',          labelKey: 'sidebar.treasury',         icon: <Wallet size={18} />,          path: '/finance?tab=Treasury' },
    { name: 'Reports',           labelKey: 'sidebar.reports',          icon: <BarChart3 size={18} />,       path: '/finance?tab=Reports' }
  ];
  const financeItems = hasFinance ? filterByAllowed(rawFinanceItems) : [];

  // -------------------------------------------------------------
  // 7. MARKETING ITEMS
  // -------------------------------------------------------------
  const rawWhatsappSubItems = [
    { name: 'WhatsApp Campaigns', labelKey: 'sidebar.whatsappCampaigns', icon: <Send size={16} />,          path: '/marketing/whatsapp-campaigns' },
    { name: 'WhatsApp Chat',      labelKey: 'sidebar.whatsappChat',      icon: <MessageCircle size={16} />, path: '/whatsapp-chat' },
    { name: 'WhatsApp Chatbot',   labelKey: 'sidebar.whatsappChatbot',   icon: <Bot size={16} />,           path: '/marketing/whatsapp-chatbots' },
    { name: 'WhatsApp Settings',  labelKey: 'sidebar.whatsappSettings',  icon: <AdminSettingsIcon size={16} />, path: '/integrations/whatsapp', roleGuard: ['admin'] }
  ];

  const whatsappSubItems = hasMarketing ? rawWhatsappSubItems.filter(item => {
    if (item.roleGuard && !item.roleGuard.includes(user?.role)) return false;
    return isPathAllowed(item.path);
  }) : [];

  const canAccessMetaForms = hasMarketing && isPathAllowed('/integrations/meta-forms');

  // -------------------------------------------------------------
  // 8. HR ITEMS (ADMINISTRATION & SYSTEM HR)
  // -------------------------------------------------------------
  const rawHrItems = [
    { name: 'Dashboard for HR',    labelKey: 'sidebar.hrDashboard',       icon: <UserCheck size={18} />, path: '/hr/dashboard', roleGuard: ['admin', 'manager'] },
    { name: 'Payroll',             labelKey: 'sidebar.payroll',           icon: <DollarSign size={18} />, path: '/hr/payroll', roleGuard: ['admin', 'manager'] },
    { name: 'Activity Definition', labelKey: 'sidebar.activityDefinition', icon: <FileText size={18} />,   path: '/hr/activity-definition', roleGuard: ['admin', 'manager'] },
    { name: 'Activity Balance',    labelKey: 'sidebar.activityBalance',    icon: <Scale size={18} />,      path: '/hr/activity-balance', roleGuard: ['admin', 'manager'] },
    { name: 'Shifts',              labelKey: 'sidebar.shifts',             icon: <Calendar size={18} />,   path: '/hr/shifts', roleGuard: ['admin', 'manager'] },
    { name: 'Attendance Device',   labelKey: 'sidebar.devices',            icon: <Clock size={18} />,      path: '/hr/devices', roleGuard: ['admin', 'manager'] }
  ];

  const hrItems = hasHr
    ? rawHrItems.filter(item => {
        if (item.roleGuard && !item.roleGuard.includes(user?.role)) return false;
        return isPathAllowed(item.path);
      })
    : [];

  // -------------------------------------------------------------
  // 9. PURCHASES ITEMS
  // -------------------------------------------------------------
  const rawPurchasesItems = [
    { name: 'Purchase Request', labelKey: 'sidebar.purchaseRequest', icon: <FileText size={18} />,     path: '/purchases/requests' },
    { name: 'Purchase Order',   labelKey: 'sidebar.purchaseOrder',   icon: <FileText size={18} />,     path: '/purchases/orders' },
    { name: 'Purchase Invoice', labelKey: 'sidebar.purchaseInvoice', icon: <ShoppingCart size={18} />, path: '/purchases' }
  ];

  const purchasesItems = hasPurchasing
    ? filterByAllowed(rawPurchasesItems)
    : [];

  // -------------------------------------------------------------
  // 10. REPORTS ITEMS (ERP REPORTS DORMANT/HIDDEN)
  // -------------------------------------------------------------
  const rawReportsItems = [
    ...(hasReports ? [{ name: 'General Reports', labelKey: 'sidebar.generalReports', icon: <BarChart3 size={18} />, path: '/reports' }] : []),
    ...(hasFinance ? [{ name: 'Finance Reports', labelKey: 'sidebar.financeReports', icon: <Wallet size={18} />,    path: '/finance?tab=Reports' }] : [])
    // NOTE: ERP Reports is intentionally hidden for now until explicit ERP navigation activation
  ];
  const reportsItems = filterByAllowed(rawReportsItems);

  // -------------------------------------------------------------
  // 11. ADMIN ITEMS
  // -------------------------------------------------------------
  const rawAdminItems = [
    { name: 'Files',            labelKey: 'sidebar.files',           icon: <FileText size={18} />,          path: '/files' },
    { name: 'Logs',             labelKey: 'sidebar.logs',            icon: <History size={18} />,           path: '/logs', roleGuard: ['admin'] },
    { name: 'Settings',         labelKey: 'sidebar.settings',        icon: <AdminSettingsIcon size={18} />, path: '/settings', roleGuard: ['admin'] },
    { name: 'Company Settings', labelKey: 'sidebar.companySettings', icon: <Building2 size={18} />,         path: '/settings/company', roleGuard: ['admin'] },
    { name: 'Billing',          labelKey: 'sidebar.billing',         icon: <CreditCard size={18} />,        path: '/billing' }
  ];

  const adminItems = rawAdminItems.filter(item => {
    if (item.roleGuard && !item.roleGuard.includes(user?.role)) return false;
    return isPathAllowed(item.path);
  });

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
          font-family: inherit;
        }
        .sidebar.closed { width: 68px; }

        /* RTL Directional Rules */
        [dir='rtl'] .sidebar {
          left: auto;
          right: 0;
          border-right: none;
          border-left: 1px solid var(--glass-border, #e2e8f0);
          box-shadow: -10px 0 30px rgba(0,0,0,0.03);
        }
        [dir='rtl'] .sidebar-nav a:hover {
          transform: translateX(-2px);
        }
        [dir='rtl'] .group-sub-items {
          padding-left: 0;
          padding-right: 8px;
        }
        [dir='rtl'] .group-sub-items.nested {
          padding-left: 0;
          padding-right: 12px;
          border-left: none;
          border-right: 1.5px solid rgba(79,70,229,0.12);
          margin-left: 0;
          margin-right: 12px;
        }

        @media (max-width: 768px) {
          .sidebar.closed { transform: translateX(-100%); width: var(--sidebar-w, 240px); }
          .sidebar.open { transform: translateX(0); width: var(--sidebar-w, 240px); }
          [dir='rtl'] .sidebar.closed { transform: translateX(100%); }
          [dir='rtl'] .sidebar.open { transform: translateX(0); }
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
        .sidebar.closed .group-sub-items { padding-left: 0; padding-right: 0; }
        .sidebar.closed .group-sub-items.nested { border-left: none; border-right: none; margin-left: 0; margin-right: 0; }

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
          {isRTL ? (isOpen ? <ChevronRight size={20}/> : <ChevronLeft size={20}/>) : (isOpen ? <ChevronLeft size={20}/> : <ChevronRight size={20}/>)}
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        
        {/* TOP LEVEL: Dashboard */}
        {isPathAllowed('/dashboard') && (
          <NavLink to="/dashboard" className={() => isItemActive('/dashboard') ? 'active' : ''}>
            <LayoutDashboard size={18} />
            <span>{t('sidebar.dashboard')}</span>
          </NavLink>
        )}

        {/* 1. MY PROFILE GROUP */}
        {profileItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setProfileOpen(prev => !prev)} title={!isOpen ? t('sidebar.myProfile') : undefined}>
              <UserCircle size={18} className="main-icon" />
              <span className="group-label">{t('sidebar.myProfile')}</span>
              {isOpen && (profileOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && profileOpen ? 'expanded' : 'collapsed'}`}>
              {profileItems.map(item => (
                <NavLink key={item.name} to={item.path} className={() => isItemActive(item.path) ? 'active' : ''}>
                  {item.icon}
                  <span>{item.labelKey ? t(item.labelKey) : item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 2. CONTACTS GROUP */}
        {(visibleContactsDirect.length > 0 || canAccessEmployees) && (
          <>
            <div className="group-header" onClick={() => isOpen && setContactsOpen(prev => !prev)} title={!isOpen ? t('sidebar.contacts') : undefined}>
              <Users size={18} className="main-icon" />
              <span className="group-label">{t('sidebar.contacts')}</span>
              {isOpen && (contactsOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && contactsOpen ? 'expanded' : 'collapsed'}`}>
              {visibleContactsDirect.map(item => (
                <NavLink key={item.name} to={item.path} className={() => isItemActive(item.path) ? 'active' : ''}>
                  {item.icon}
                  <span>{item.labelKey ? t(item.labelKey) : item.name}</span>
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
                      <span>{t('sidebar.employees')}</span>
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
                        <span>{subItem.labelKey ? t(subItem.labelKey) : subItem.name}</span>
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
            <div className="group-header" onClick={() => isOpen && setRealEstateOpen(prev => !prev)} title={!isOpen ? t('sidebar.realEstate') : undefined}>
              <Building2 size={18} className="main-icon" />
              <span className="group-label">{t('sidebar.realEstate')}</span>
              {isOpen && (realEstateOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && realEstateOpen ? 'expanded' : 'collapsed'}`}>
              
              {/* Definitions Sub-Hierarchy: Projects, Developers, Phases */}
              <div 
                className="group-header sub-group-header" 
                onClick={() => isOpen && setReDefinitionsOpen(prev => !prev)}
                title={!isOpen ? t('sidebar.definitions') : undefined}
              >
                <Layers size={16} className="main-icon" />
                <span className="group-label">{t('sidebar.definitions')}</span>
                {isOpen && (reDefinitionsOpen ? <ChevronDown size={13} className="group-chevron" /> : <ChevronUp size={13} className="group-chevron" />)}
              </div>
              <div className={`group-sub-items nested ${isOpen && reDefinitionsOpen ? 'expanded' : 'collapsed'}`}>
                {reDefinitionsSubItems.map(subItem => (
                  <NavLink key={subItem.name} to={subItem.path} className={() => isItemActive(subItem.path) ? 'active' : ''}>
                    {subItem.icon}
                    <span>{subItem.labelKey ? t(subItem.labelKey) : subItem.name}</span>
                  </NavLink>
                ))}
              </div>

              {/* Real Estate Core: Units, Reservations, Contracts, Installments */}
              {reDirectItems.map(item => (
                <NavLink key={item.name} to={item.path} className={() => isItemActive(item.path) ? 'active' : ''}>
                  {item.icon}
                  <span>{item.labelKey ? t(item.labelKey) : item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 4. SALES GROUP (Quotations, Salesmen, Targets, Commissions, Handover) */}
        {salesItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setSalesOpen(prev => !prev)} title={!isOpen ? t('sidebar.sales') : undefined}>
              <ShoppingBag size={18} className="main-icon" />
              <span className="group-label">{t('sidebar.sales')}</span>
              {isOpen && (salesOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && salesOpen ? 'expanded' : 'collapsed'}`}>
              {salesItems.map(item => (
                <NavLink key={item.name} to={item.path} className={() => isItemActive(item.path) ? 'active' : ''}>
                  {item.icon}
                  <span>{item.labelKey ? t(item.labelKey) : item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 5. WAREHOUSE GROUP (Products, Warehouses, Keepers, Stock Balances, Stock Movements, Transaction Impact, Item Card) */}
        {hasInventory && inventoryItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setWarehouseOpen(prev => !prev)} title={!isOpen ? t('sidebar.warehouse') : undefined}>
              <Package size={18} className="main-icon" />
              <span className="group-label">{t('sidebar.warehouse')}</span>
              {isOpen && (warehouseOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && warehouseOpen ? 'expanded' : 'collapsed'}`}>
              {warehouseItems.map(item => (
                <NavLink key={item.name} to={item.path} className={() => isItemActive(item.path) ? 'active' : ''}>
                  {item.icon}
                  <span>{item.labelKey ? t(item.labelKey) : item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 6. FINANCE GROUP (ALL 9 OPERATIONS - Overview, Invoices, Receipts, Payments, Expenses, Customer Accounts, Vendor Accounts, Treasury, Reports) */}
        {financeItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setFinanceOpen(prev => !prev)} title={!isOpen ? t('sidebar.finance') : undefined}>
              <Wallet size={18} className="main-icon" />
              <span className="group-label">{t('sidebar.finance')}</span>
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
                  <span>{item.labelKey ? t(item.labelKey) : item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 7. MARKETING GROUP (Meta Forms + WhatsApp: Campaigns, Chat, Chatbot, Settings) */}
        {(canAccessMetaForms || whatsappSubItems.length > 0) && (
          <>
            <div className="group-header" onClick={() => isOpen && setMarketingOpen(prev => !prev)} title={!isOpen ? t('sidebar.marketing') : undefined}>
              <Share2 size={18} className="main-icon" />
              <span className="group-label">{t('sidebar.marketing')}</span>
              {isOpen && (marketingOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && marketingOpen ? 'expanded' : 'collapsed'}`}>
              {canAccessMetaForms && (
                <NavLink to="/integrations/meta-forms" className={() => isItemActive('/integrations/meta-forms') ? 'active' : ''}>
                  <FileText size={17} />
                  <span>{t('sidebar.metaForms')}</span>
                </NavLink>
              )}
              {(user?.role === 'admin' || user?.role === 'manager') && (
                <NavLink to="/integrations/property-finder" className={() => isItemActive('/integrations/property-finder') ? 'active' : ''}>
                  <Globe size={17} />
                  <span>{t('sidebar.propertyFinder')}</span>
                </NavLink>
              )}

              {whatsappSubItems.length > 0 && (
                <>
                  <div 
                    className="group-header sub-group-header" 
                    onClick={() => isOpen && setMarketingWhatsappOpen(prev => !prev)}
                    title={!isOpen ? t('sidebar.whatsapp') : undefined}
                  >
                    <MessageCircle size={16} className="main-icon" />
                    <span className="group-label">{t('sidebar.whatsapp')}</span>
                    {isOpen && (marketingWhatsappOpen ? <ChevronDown size={13} className="group-chevron" /> : <ChevronUp size={13} className="group-chevron" />)}
                  </div>
                  <div className={`group-sub-items nested ${isOpen && marketingWhatsappOpen ? 'expanded' : 'collapsed'}`}>
                    {whatsappSubItems.map(subItem => (
                      <NavLink key={subItem.name} to={subItem.path} className={() => isItemActive(subItem.path) ? 'active' : ''}>
                        {subItem.icon}
                        <span>{subItem.labelKey ? t(subItem.labelKey) : subItem.name}</span>
                      </NavLink>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* 8. HR GROUP (Dashboard for HR, Payroll, Activity Definition, Activity Balance, Shifts, Attendance Device) */}
        {hrItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setHrOpen(prev => !prev)} title={!isOpen ? t('sidebar.hr') : undefined}>
              <UserCheck size={18} className="main-icon" />
              <span className="group-label">{t('sidebar.hr')}</span>
              {isOpen && (hrOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && hrOpen ? 'expanded' : 'collapsed'}`}>
              {hrItems.map(item => (
                <NavLink key={item.name} to={item.path} className={() => isItemActive(item.path) ? 'active' : ''}>
                  {item.icon}
                  <span>{item.labelKey ? t(item.labelKey) : item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 9. PURCHASES GROUP (Purchase Request, Purchase Invoice, RFQs, Purchase Order) */}
        {hasPurchasing && purchasingItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setPurchasesOpen(prev => !prev)} title={!isOpen ? t('sidebar.purchases') : undefined}>
              <ShoppingCart size={18} className="main-icon" />
              <span className="group-label">{t('sidebar.purchases')}</span>
              {isOpen && (purchasesOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && purchasesOpen ? 'expanded' : 'collapsed'}`}>
              {purchasesItems.map(item => (
                <NavLink key={item.name} to={item.path} className={() => isItemActive(item.path) ? 'active' : ''}>
                  {item.icon}
                  <span>{item.labelKey ? t(item.labelKey) : item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 10. REPORTS GROUP (General Reports, Finance Reports) */}
        {reportsItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setReportsOpen(prev => !prev)} title={!isOpen ? t('sidebar.reports') : undefined}>
              <BarChart3 size={18} className="main-icon" />
              <span className="group-label">{t('sidebar.reports')}</span>
              {isOpen && (reportsOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && reportsOpen ? 'expanded' : 'collapsed'}`}>
              {reportsItems.map(item => (
                <NavLink key={item.name} to={item.path} className={() => isItemActive(item.path) ? 'active' : ''}>
                  {item.icon}
                  <span>{item.labelKey ? t(item.labelKey) : item.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* 11. ADMIN GROUP (Files, Logs, Settings, Company Settings, Billing) */}
        {adminItems.length > 0 && (
          <>
            <div className="group-header" onClick={() => isOpen && setAdminOpen(prev => !prev)} title={!isOpen ? t('sidebar.admin') : undefined}>
              <AdminSettingsIcon size={18} className="main-icon" />
              <span className="group-label">{t('sidebar.admin')}</span>
              {isOpen && (adminOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && adminOpen ? 'expanded' : 'collapsed'}`}>
              {adminItems.map(item => (
                <NavLink key={item.name} to={item.path} className={() => isItemActive(item.path) ? 'active' : ''}>
                  {item.icon}
                  <span>{item.labelKey ? t(item.labelKey) : item.name}</span>
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
              {trialDaysLeft <= 0 ? t('sidebar.trialExpired') : t('sidebar.trialDaysLeft', { count: trialDaysLeft })}
            </span>
            <ArrowRight size={13} style={{ color: trialColor, flexShrink: 0, transform: isRTL ? 'rotate(180deg)' : 'none' }}/>
          </div>
          <div className="tb-sub" style={{ color: trialColor, opacity: 0.75 }}>
            {trialDaysLeft <= 0 ? t('sidebar.upgradeAccess') : t('sidebar.trialActiveNow')}
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
