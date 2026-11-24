import { useState, useEffect, useMemo } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Users, ShoppingBag, Handshake, CheckSquare, Wallet, 
  FileText, BarChart3, ChevronLeft, ChevronRight, History, 
  Settings as AdminSettingsIcon, Package, ArrowRight, DollarSign, CreditCard,
  Building2, UserCircle, ChevronDown, ChevronUp, Truck, Briefcase,
  Building, ShieldCheck, ArrowLeftRight, Scale,
  Share2, FileCheck, Send, MessageCircle,
  ShoppingCart, ArrowDownLeft, Calendar, Award, Key, Layers, Activity, UserCheck, Clock,
  Bot, Globe, ExternalLink
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useModule } from '../../hooks/useModule';
import { safeArray } from '../../utils/dataUtils';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();
  const { can, planName, trialDaysLeft } = useModule();

  const navigate = useNavigate();
  const location = useLocation();

  const [expandedGroups, setExpandedGroups] = useState({});

  // Sub-accordions inside specific workspaces
  const [profileOpen, setProfileOpen] = useState(false);

  const hasRealEstate = can('real_estate') !== false && (user?.template_name === 'real_estate' || can('real_estate') === true);
  const isRealEstate = hasRealEstate;

  // -------------------------------------------------------------
  // Allowed Pages Access Filter
  // -------------------------------------------------------------
  const ROUTE_ALIASES = useMemo(() => ({
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
  }), []);

  const SELF_SERVICE = useMemo(() => ['/my-profile', '/my-payroll', '/activity-balance'], []);

  const isPathAllowed = (path) => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'super_admin') return true;
    const basePath = path.split('?')[0];
    if (SELF_SERVICE.includes(basePath)) return true;
    const canonicalPath = ROUTE_ALIASES[basePath] || basePath;
    const allowed = safeArray(user?.allowedPages);
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
      return !location.search || location.search === '';
    }
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

  // -------------------------------------------------------------
  // Module Entitlements
  // -------------------------------------------------------------
  const hasPurchasing = can('purchasing') === true || (can('purchasing') !== false && can('inventory') === true);
  const hasHr = can('hr');
  const hasFinance = can('finance');
  const hasReports = can('reports') !== false;
  const hasCrm = can('crm');
  const hasSales = can('sales') !== false && (can('sales') === true || hasCrm);
  const hasMarketing = can('marketing') !== false && (can('marketing') === true || hasCrm);
  const hasInventory = can('inventory') === true;

  // -------------------------------------------------------------
  // 1. MY PROFILE ITEMS (Personal Self-Service)
  // Deduplicated: CRM items moved to Sales/CRM canonical workspace;
  // Units moved to Real Estate canonical workspace.
  // -------------------------------------------------------------
  const rawProfileItems = [
    ...(hasHr ? [
      { name: 'My Attendance',    labelKey: 'sidebar.myAttendance',    icon: <Clock size={16} />,        path: '/my-attendance' },
      { name: 'My Requests',      labelKey: 'sidebar.myRequests',      icon: <FileText size={16} />,     path: '/my-requests' },
      { name: 'Approvals',        labelKey: 'sidebar.approvals',       icon: <ShieldCheck size={16} />,  path: '/approvals', roleGuard: ['admin', 'manager'] },
      { name: 'My Payroll',       labelKey: 'sidebar.myPayroll',       icon: <DollarSign size={16} />,   path: '/my-payroll' },
      { name: 'Activity Balance', labelKey: 'sidebar.activityBalance', icon: <Wallet size={16} />,       path: '/activity-balance' },
    ] : []),

  ];

  const profileItems = rawProfileItems.filter(item => {
    if (item.roleGuard && !item.roleGuard.includes(user?.role)) return false;
    return isPathAllowed(item.path);
  });

  // -------------------------------------------------------------
  // 2. CONTACTS ITEMS (Customers, Vendors, Employees)
  // -------------------------------------------------------------
  const contactsDirectItems = [
    ...(hasCrm ? [{ name: 'Customers / Tenants', labelKey: 'sidebar.customersTenants', icon: <Users size={18} />, path: '/customers' }] : []),
    { name: 'Vendors',             labelKey: 'sidebar.vendors',          icon: <Truck size={18} />, path: '/contacts/vendors' }
  ];

  const employeeSubItems = [
    { name: 'Departments', labelKey: 'sidebar.departments', icon: <Building size={16} />,  path: '/contacts/employees?tab=departments' },
    { name: 'Job Titles',  labelKey: 'sidebar.jobTitles',   icon: <Briefcase size={16} />, path: '/contacts/employees?tab=jobtitles' }
  ];

  const visibleContactsDirect = contactsDirectItems.filter(item => {
    if (item.name === 'Vendors' && !hasPurchasing) return false;
    return isPathAllowed(item.path);
  });

  const canAccessEmployees = (hasHr || user?.role === 'admin') && isPathAllowed('/contacts/employees');

  // -------------------------------------------------------------
  // 3. REAL ESTATE ITEMS (REAL ESTATE TEMPLATE ONLY)
  // -------------------------------------------------------------
  const reDirectItems = [
    { name: 'Units',           labelKey: 'sidebar.units',          icon: <Key size={18} />,         path: '/units-registry' },
    { name: 'Reservations',    labelKey: 'sidebar.reservations',   icon: <CheckSquare size={18} />, path: '/reservations' },
    { name: 'Contracts',       labelKey: 'sidebar.contracts',      icon: <FileText size={18} />,    path: '/contracts' },
    { name: 'Installments',    labelKey: 'sidebar.installments',   icon: <CreditCard size={18} />,  path: '/installments' },
    { name: 'Property Finder', labelKey: 'sidebar.propertyFinder', icon: <Globe size={18} />,       path: '/integrations/property-finder', roleGuard: ['admin', 'manager'] }
  ];

  // -------------------------------------------------------------
  // 4. SALES ITEMS (Sales Suite + Daily Sales Work)
  // -------------------------------------------------------------
  const rawSalesItems = [
    ...(hasCrm ? [
      { name: 'Customers',        labelKey: 'sidebar.customers',        icon: <Users size={18} />,        path: '/customers' },
      { name: 'Deals',            labelKey: 'sidebar.deals',            icon: <Handshake size={18} />,    path: '/deals' },
      { name: 'Tasks',            labelKey: 'sidebar.tasks',            icon: <CheckSquare size={18} />,  path: '/tasks' },
    ] : []),
    ...(isRealEstate && isPathAllowed('/units-registry') ? [
      { name: 'Units',            labelKey: 'sidebar.units',            icon: <Key size={18} />,          path: '/units-registry', isShortcut: true }
    ] : []),
    {
      name: isRealEstate ? 'RE Sales Management' : 'Sales Management',
      labelKey: isRealEstate ? 'sidebar.reSalesManagement' : 'sidebar.salesManagement',
      icon: <BarChart3 size={18} />,
      path: '/sales/management',
      roleGuard: ['admin', 'manager', 'supervisor']
    },
    { name: 'Quotations',     labelKey: 'sidebar.quotations',    icon: <FileText size={18} />,     path: '/finance?tab=Quotations' },
    ...(!isRealEstate && hasSales ? [
      { name: 'Sales Orders',   labelKey: 'sidebar.salesOrders',   icon: <ShoppingCart size={18} />, path: '/sales/orders' },
      { name: 'Documents Hub',  labelKey: 'sidebar.documentsHub',  icon: <FileCheck size={18} />,    path: '/sales/documents' },
      { name: 'Price Tiers',    labelKey: 'sidebar.priceTiers',    icon: <DollarSign size={18} />,   path: '/sales/price-tiers' },
    ] : []),
    { name: 'Salesmen',       labelKey: 'sidebar.salesmen',      icon: <Users size={18} />,        path: '/sales/salesmen' },
    { name: 'Targets',        labelKey: 'sidebar.targets',       icon: <Award size={18} />,        path: '/sales/target' },
    ...(isRealEstate ? [
      { name: 'Commissions',  labelKey: 'sidebar.commissions',   icon: <DollarSign size={18} />,   path: '/commissions' },
      { name: 'Handover',     labelKey: 'sidebar.handover',      icon: <Key size={18} />,          path: '/handover' },
      { name: 'Rentals',      labelKey: 'sidebar.rentals',       icon: <Key size={18} />,          path: '/rentals' }
    ] : [])
  ];
  const salesItems = filterByAllowed(rawSalesItems).filter(item => {
    if(item.roleGuard && !item.roleGuard.includes(user?.role))return false;
    if (['/customers','/deals','/tasks','/sales/management','/finance?tab=Quotations'].includes(item.path)) return hasCrm;
    if (['/commissions','/handover','/rentals','/units-registry'].includes(item.path)) return hasRealEstate;
    return hasSales;
  });
  const dailyPaths = ['/customers', '/deals', '/tasks', '/units-registry'];
  const managementPaths = ['/sales/management', '/sales/salesmen', '/sales/target'];
  const dailySalesItems = salesItems.filter(item => dailyPaths.includes(item.path));
  const salesManagementItems = salesItems.filter(item => managementPaths.includes(item.path));
  const salesOperationItems = salesItems.filter(item => !dailyPaths.includes(item.path) && !managementPaths.includes(item.path));

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
  const inventoryItems = hasInventory ? filterByAllowed(rawWarehouseItems) : [];
  const warehouseItems = inventoryItems;

  // -------------------------------------------------------------
  // 6. FINANCE ITEMS (ALL 9 OPERATIONS)
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
  // 8. HR ITEMS
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
  const purchasesItems = hasPurchasing ? filterByAllowed(rawPurchasesItems) : [];
  const purchasingItems = purchasesItems;

  // -------------------------------------------------------------
  // 10. REPORTS ITEMS
  // Finance Reports clearly badged as shortcut pointing to Finance tab
  // -------------------------------------------------------------
  const rawReportsItems = [
    ...(hasReports ? [{ name: 'General Reports', labelKey: 'sidebar.generalReports', icon: <BarChart3 size={18} />, path: '/reports' }] : []),
    ...(hasFinance ? [{ name: 'Finance Reports', labelKey: 'sidebar.financeReports', icon: <Wallet size={18} />,    path: '/finance?tab=Reports', isShortcut: true }] : [])
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

  const trialColor = trialDaysLeft !== null
    ? trialDaysLeft <= 3 ? '#ef4444' : trialDaysLeft <= 7 ? '#f59e0b' : '#10b981'
    : null;

  // Helper to render workspace icon
  const getWorkspaceIcon = (wsId, size = 18) => {
    switch (wsId) {
      case 'sales': return <ShoppingBag size={size} />;
      case 'contacts': return <Users size={size} />;
      case 'real_estate': return <Building2 size={size} />;
      case 'finance': return <Wallet size={size} />;
      case 'inventory': return <Package size={size} />;
      case 'purchasing': return <ShoppingCart size={size} />;
      case 'hr': return <UserCheck size={size} />;
      case 'marketing': return <Share2 size={size} />;
      case 'reports': return <BarChart3 size={size} />;
      case 'admin': return <AdminSettingsIcon size={size} />;
      default: return <LayoutDashboard size={size} />;
    }
  };


  // Canonical sections, independent of the remembered workspace selection.
  const permitted = items => filterByAllowed(items).filter(item => !item.roleGuard || item.roleGuard.includes(user?.role));
  // Definitions remain reachable through local tabs under the unchanged directory gate.
  const employees = canAccessEmployees ? [
    {name:'Employees',labelKey:'sidebar.employees',path:'/contacts/employees',icon:<Briefcase size={18}/>}
  ] : [];
  const sections = [
    {id:'sales',label:'sidebar.sales',items:permitted(salesItems).filter(item=>item.path!=='/units-registry')},
    {id:'contacts',label:'sidebar.contacts',items:visibleContactsDirect.filter(item=>item.path!=='/customers' || !salesItems.some(s=>s.path==='/customers')).concat(hasHr ? [] : employees)},
    {id:'real_estate',label:'sidebar.realEstate',items:isRealEstate ? permitted(reDirectItems) : []},
    {id:'inventory',label:'sidebar.warehouse',items:inventoryItems},
    {id:'purchasing',label:'sidebar.purchases',items:purchasingItems},
    {id:'finance',label:'sidebar.finance',items:financeItems.length ? [{...financeItems[0],labelKey:'sidebar.finance'}] : []},
    {id:'hr',label:'sidebar.hr',items:[...(hasHr ? employees : []),...hrItems]},
    {id:'marketing',label:'sidebar.marketing',items:[...(!isRealEstate && hasMarketing && ['admin','manager'].includes(user?.role) && isPathAllowed('/integrations/property-finder') ? [{name:'Property Finder',labelKey:'sidebar.propertyFinder',path:'/integrations/property-finder',icon:<Globe size={18}/>}]:[]),...(canAccessMetaForms ? [{name:'Meta Forms',labelKey:'sidebar.metaForms',path:'/integrations/meta-forms',icon:<FileText size={18}/>}]:[]),...whatsappSubItems]},
    {id:'reports',label:'sidebar.reports',items:reportsItems.filter(item=>!financeItems.some(f=>f.path===item.path))},
    {id:'admin',label:'sidebar.admin',items:adminItems}
  ];
  const seen = new Set(['/dashboard',...profileItems.map(item=>item.path)]);
  const canonicalSections = sections.map(section=>({...section,items:section.items.filter(item=>{if(seen.has(item.path))return false;seen.add(item.path);return true;})})).filter(section=>section.items.length);
  const currentSection = canonicalSections.find(section=>section.items.some(item=>item.path.split('?')[0]===location.pathname));
  useEffect(()=>{if(currentSection)setExpandedGroups(prev=>({...prev,[currentSection.id]:true}));if(profileItems.some(item=>item.path.split('?')[0]===location.pathname))setProfileOpen(true);},[location.pathname,location.search,currentSection?.id]);

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
        [dir='rtl'] .workspace-dropdown {
          left: auto;
          right: 8px;
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

        /* Workspace Switcher Component */
        .workspace-switcher-container {
          position: relative;
          margin: 8px 8px 10px;
        }
        .workspace-trigger {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 10px;
          background: rgba(79, 70, 229, 0.06);
          border: 1px solid rgba(79, 70, 229, 0.15);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .workspace-trigger:hover, .workspace-trigger.active {
          background: rgba(79, 70, 229, 0.12);
          border-color: var(--primary);
          box-shadow: 0 2px 8px rgba(79, 70, 229, 0.12);
        }
        .workspace-trigger-left {
          display: flex; align-items: center; gap: 8px; min-width: 0;
        }
        .workspace-icon-badge {
          width: 28px; height: 28px; border-radius: 7px;
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          color: white;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 2px 6px rgba(79, 70, 229, 0.25);
        }
        .workspace-trigger-text {
          display: flex; flex-direction: column; text-align: start; line-height: 1.2;
          overflow: hidden;
        }
        .workspace-kicker {
          font-size: 9.5px; font-weight: 700; text-transform: uppercase;
          color: var(--primary); letter-spacing: 0.04em;
        }
        .workspace-current-name {
          font-size: 13px; font-weight: 700; color: var(--text-main);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .workspace-chevron {
          color: var(--text-muted); transition: transform 0.25s ease; flex-shrink: 0;
        }
        .workspace-chevron.rotated {
          transform: rotate(180deg);
        }
        .sidebar.closed .workspace-trigger {
          padding: 6px; justify-content: center;
        }
        .sidebar.closed .workspace-trigger-text,
        .sidebar.closed .workspace-chevron {
          display: none;
        }

        /* Workspace Dropdown */
        .workspace-dropdown {
          position: absolute; top: calc(100% + 6px); left: 0; right: 0;
          background: var(--bg-card, #ffffff);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 10px;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.12);
          padding: 6px;
          z-index: 1050;
          animation: dropFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes dropFade {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .workspace-dropdown-header {
          padding: 6px 8px; font-size: 10.5px; font-weight: 800;
          color: var(--text-muted); text-transform: uppercase;
          letter-spacing: 0.04em;
          border-bottom: 1px solid var(--border, #f1f5f9);
          margin-bottom: 4px;
        }
        .workspace-dropdown-item {
          display: flex; align-items: center; gap: 8px;
          padding: 7px 10px; border-radius: 6px; cursor: pointer;
          font-size: 12.5px; font-weight: 600; color: var(--text-main);
          transition: all 0.15s ease;
        }
        .workspace-dropdown-item:hover {
          background: rgba(79, 70, 229, 0.08); color: var(--primary);
        }
        .workspace-dropdown-item.selected {
          background: rgba(79, 70, 229, 0.12); color: var(--primary); font-weight: 700;
        }
        .ws-item-icon {
          display: flex; align-items: center; justify-content: center;
          color: inherit;
        }
        .ws-item-label { flex: 1; }
        .ws-item-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--primary);
        }

        .sidebar-nav { flex: 1; padding: 6px 8px; overflow-y: auto; overflow-x: hidden; }

        .sidebar-nav a {
          display: flex; align-items: center; padding: 7px 10px; color: var(--text-muted);
          transition: all 0.2s cubic-bezier(0.4,0,0.2,1); gap: 10px; border-radius: 8px;
          margin-bottom: 2px; position: relative; text-decoration: none;
        }
        .sidebar-nav a:hover { background: rgba(79,70,229,0.05); color: var(--primary); transform: translateX(2px); }
        .sidebar-nav a.active {
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          color: white; box-shadow: 0 6px 12px -2px rgba(79,70,229,0.25);
        }
        .sidebar-nav a svg { min-width: 17px; width: 17px; height: 17px; transition: transform 0.2s; }
        .sidebar-nav a.active svg { transform: scale(1.08); }
        .sidebar-nav a span { white-space: nowrap; font-weight: 600; font-size: 13px; transition: opacity 0.2s; }
        .sidebar.closed .sidebar-nav a span { opacity: 0; pointer-events: none; }

        /* Shortcut badge */
        .shortcut-pill {
          display: inline-flex; align-items: center; gap: 3px;
          font-size: 9.5px; font-weight: 700;
          padding: 2px 6px; border-radius: 4px;
          background: rgba(79, 70, 229, 0.1);
          color: var(--primary);
          text-transform: uppercase;
          margin-inline-start: auto;
        }
        .sidebar-nav a.active .shortcut-pill {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }
        .sidebar.closed .shortcut-pill { display: none; }

        /* Active Badge on Workspace Header */
        .active-badge {
          font-size: 9.5px; font-weight: 800; padding: 2px 6px;
          border-radius: 4px; background: rgba(79, 70, 229, 0.15);
          color: var(--primary); letter-spacing: 0.02em;
          margin-inline-end: 4px;
        }

        /* Group Headers */
        .group-header {
          display: flex; align-items: center; padding: 7px 10px; gap: 10px;
          border-radius: 8px; margin-bottom: 2px; cursor: pointer;
          color: var(--text-muted); transition: all 0.2s;
          border: 1px solid transparent;
        }
        .group-header:hover {
          background: rgba(79,70,229,0.04); color: var(--primary);
          border-color: rgba(79,70,229,0.1);
        }
        .group-header.active-ws-header {
          background: rgba(79,70,229,0.06);
          color: var(--primary);
          border-color: rgba(79,70,229,0.14);
          font-weight: 700;
        }
        .group-header.sub-group-header {
          padding: 6px 10px;
          font-size: 12.5px;
          margin-top: 1px;
        }
        .group-header svg.main-icon { min-width: 17px; width: 17px; height: 17px; }
        .group-label { flex: 1; font-weight: 600; font-size: 13px; white-space: nowrap; transition: opacity 0.2s; letter-spacing: 0.01em; }
        .sidebar.closed .group-label { opacity: 0; }
        .group-chevron { transition: all 0.2s; flex-shrink: 0; }
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
        .group-sub-items.expanded { max-height: 900px; opacity: 1; }
        .group-sub-items a {
          padding: 6px 10px;
          font-size: 12.5px !important;
        }
        .sidebar.closed .group-sub-items { padding-left: 0; padding-right: 0; }
        .sidebar.closed .group-sub-items.nested { border-left: none; border-right: none; margin-left: 0; margin-right: 0; }

        /* Workspace Block Separation */
        .workspace-group-block {
          margin-bottom: 4px;
        }
        .workspace-group-block.primary-active-workspace {
          margin-bottom: 10px;
        }
        .workspace-section-divider {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 10px 4px;
          margin-top: 6px;
          border-top: 1px solid var(--glass-border, #e2e8f0);
        }
        .workspace-section-divider span {
          font-size: 10px; font-weight: 800; color: var(--text-muted);
          text-transform: uppercase; letter-spacing: 0.05em;
          white-space: nowrap;
        }
        .sidebar.closed .workspace-section-divider { display: none; }

        .workspace-sub-section-header {
          padding: 8px 10px 3px;
          font-size: 9.5px;
          font-weight: 800;
          color: var(--primary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          opacity: 0.85;
        }
        .sidebar.closed .workspace-sub-section-header { display: none; }

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

      {/* Navigation Links */}
      <nav className="sidebar-nav">
        
        {/* TOP LEVEL: Dashboard (Always Available) */}
        {isPathAllowed('/dashboard') && (
          <NavLink to="/dashboard" className={() => isItemActive('/dashboard') ? 'active' : ''}>
            <LayoutDashboard size={18} />
            <span>{t('sidebar.dashboard')}</span>
          </NavLink>
        )}

        {/* TOP LEVEL: Personal Self-Service (My Profile) */}
        {profileItems.length > 0 && (
          <div className="workspace-group-block">
            <div 
              className="group-header" 
              onClick={() => isOpen && setProfileOpen(prev => !prev)} 
              title={!isOpen ? t('sidebar.myProfile') : undefined}
            >
              <UserCircle size={18} className="main-icon" />
              <span className="group-label">{t('sidebar.myProfile')}</span>
              {isOpen && (profileOpen ? <ChevronDown size={14} className="group-chevron" /> : <ChevronUp size={14} className="group-chevron" />)}
            </div>
            <div className={`group-sub-items ${isOpen && profileOpen ? 'expanded' : 'collapsed'}`}>
              {profileItems.map(item => (
                <NavLink key={item.name} to={item.path} className={() => isItemActive(item.path) ? 'active' : ''}>
                  {item.icon}
                  <span style={{ flex: 1 }}>{item.labelKey ? t(item.labelKey) : item.name}</span>
                  {item.isShortcut && (
                    <span className="shortcut-pill" title={t('sidebar.shortcut')}>
                      <ExternalLink size={10} />
                      {t('sidebar.shortcut')}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        )}

        {canonicalSections.map(section => <div key={section.id} className="workspace-group-block">
          <button type="button" className="group-header" aria-expanded={!!expandedGroups[section.id]} onClick={()=>{if(!isOpen)toggleSidebar();setExpandedGroups(prev=>({...prev,[section.id]:!isOpen || !prev[section.id]}));}} style={{width:'100%',border:0,background:'transparent',textAlign:'inherit'}} title={t(section.label)}>
            {getWorkspaceIcon(section.id)}<span className="group-label">{t(section.label)}</span>
            {isOpen && <ChevronDown size={14} style={{transform:expandedGroups[section.id]?'rotate(180deg)':undefined}}/>}
          </button>
          <div className={`group-sub-items ${isOpen && expandedGroups[section.id]?'expanded':'collapsed'}`}>
            {section.items.map(item=><NavLink key={item.path} to={item.path} className={()=>isItemActive(item.path) || (section.id==='finance' && location.pathname==='/finance')?'active':''}>{item.icon}<span>{t(item.labelKey)}</span></NavLink>)}
          </div>
        </div>)}

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
