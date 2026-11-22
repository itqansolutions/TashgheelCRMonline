import { NavLink, useLocation } from 'react-router-dom';
import { 
  Handshake, Users, Target as TargetIcon, ShoppingBag, FileText, 
  Layers, BarChart3, CheckSquare, Key, FileCheck, DollarSign, ExternalLink
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useModule } from '../../hooks/useModule';

const SalesSubNav = () => {
  const { t, isRTL } = useLanguage();
  const { user } = useAuth();
  const { can } = useModule();
  const location = useLocation();

  const isRealEstate = user?.template_name === 'real_estate' || can('real_estate') === true;
  const canAccessManagement = ['admin', 'manager', 'supervisor'].includes(user?.role);
  const canAccessUnits = isRealEstate && (user?.role === 'admin' || user?.allowedPages?.includes('/units-registry'));

  // 1. Daily Sales Work Cluster
  const dailyWorkLinks = [
    { path: '/customers', label: t('sales.subNav.customers', 'Customers'), icon: <Users size={15} /> },
    { path: '/deals', label: t('sales.subNav.deals', 'Deals'), icon: <Handshake size={15} /> },
    { path: '/tasks', label: t('sales.subNav.tasks', 'My Tasks'), icon: <CheckSquare size={15} /> },
    ...(canAccessUnits ? [
      { path: '/units-registry', label: t('sales.subNav.units', 'Units'), icon: <Key size={15} />, isShortcut: true }
    ] : [])
  ];

  // 2. Sales Management Cluster
  const managementLinks = canAccessManagement ? [
    { 
      path: '/sales/management', 
      label: isRealEstate ? t('sales.subNav.reManagement', 'RE Sales Management') : t('sales.subNav.management', 'Sales Management'), 
      icon: <BarChart3 size={15} /> 
    },
    { path: '/sales/salesmen', label: t('sales.subNav.salesmen', 'Salesmen & Teams'), icon: <Users size={15} /> },
    { path: '/sales/target', label: t('sales.subNav.targets', 'Target & Goals'), icon: <TargetIcon size={15} /> },
  ] : [];

  // 3. Commercial Operations & Documents Cluster
  const operationsLinks = [
    { path: '/finance?tab=Quotations', label: t('sales.subNav.quotations', 'Quotations'), icon: <FileText size={15} /> },
    ...(!isRealEstate ? [
      { path: '/sales/orders', label: t('sales.subNav.orders', 'Sales Orders'), icon: <ShoppingBag size={15} /> },
      { path: '/sales/documents', label: t('sales.subNav.documents', 'Documents Hub'), icon: <FileCheck size={15} /> },
      { path: '/sales/price-tiers', label: t('sales.subNav.priceTiers', 'Price Tiers'), icon: <Layers size={15} /> },
    ] : [
      { path: '/commissions', label: t('sidebar.commissions', 'Commissions'), icon: <DollarSign size={15} /> },
      { path: '/handover', label: t('sidebar.handover', 'Handover'), icon: <Key size={15} /> },
    ])
  ];

  const isLinkActive = (itemPath) => {
    const [base, query] = itemPath.split('?');
    if (location.pathname !== base) return false;
    if (!query) {
      // If path has no query but current location has query tab, check if another link has that query
      return !location.search || location.search === '';
    }
    const itemParams = new URLSearchParams(query);
    const currentParams = new URLSearchParams(location.search);
    const itemTab = itemParams.get('tab');
    if (itemTab !== null) {
      return (currentParams.get('tab') || '').toLowerCase() === itemTab.toLowerCase();
    }
    return true;
  };

  const renderNavGroup = (title, items) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="subnav-cluster">
        {title && <span className="subnav-cluster-label">{title}</span>}
        <div className="subnav-cluster-items">
          {items.map((link) => {
            const active = isLinkActive(link.path);
            return (
              <NavLink
                key={link.path}
                to={link.path}
                className={`subnav-pill ${active ? 'active' : ''}`}
              >
                {link.icon}
                <span>{link.label}</span>
                {link.isShortcut && (
                  <span className="subnav-shortcut-tag" title={t('sidebar.shortcut')}>
                    <ExternalLink size={9} />
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="sales-subnav-container" dir={isRTL ? 'rtl' : 'ltr'}>
      <style>{`
        .sales-subnav-container {
          display: flex;
          align-items: center;
          gap: 12px;
          overflow-x: auto;
          padding: 8px 16px;
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
          scrollbar-width: thin;
        }
        .sales-subnav-container::-webkit-scrollbar {
          height: 4px;
        }
        .sales-subnav-container::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        .subnav-cluster {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .subnav-cluster-label {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #94a3b8;
          padding: 0 4px;
          white-space: nowrap;
        }
        .subnav-cluster-items {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .subnav-cluster-divider {
          width: 1px;
          height: 24px;
          background: #e2e8f0;
          flex-shrink: 0;
          margin: 0 4px;
        }
        .subnav-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 700;
          text-decoration: none;
          white-space: nowrap;
          color: #64748b;
          background: #f8fafc;
          border: 1px solid transparent;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .subnav-pill:hover {
          color: #0f172a;
          background: #f1f5f9;
          border-color: #cbd5e1;
        }
        .subnav-pill.active {
          color: #ffffff;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          box-shadow: 0 3px 8px rgba(79, 70, 229, 0.25);
          border-color: transparent;
        }
        .subnav-shortcut-tag {
          display: inline-flex;
          align-items: center;
          padding: 2px 4px;
          border-radius: 4px;
          background: rgba(79, 70, 229, 0.12);
          color: #4f46e5;
          margin-inline-start: 2px;
        }
        .subnav-pill.active .subnav-shortcut-tag {
          background: rgba(255, 255, 255, 0.25);
          color: #ffffff;
        }
      `}</style>

      {/* Cluster 1: Daily Sales Work */}
      {renderNavGroup(t('sales.sections.dailyWork', 'Daily Work'), dailyWorkLinks)}

      {/* Cluster 2: Sales Management (if authorized) */}
      {managementLinks.length > 0 && (
        <>
          <div className="subnav-cluster-divider" />
          {renderNavGroup(t('sales.sections.management', 'Management'), managementLinks)}
        </>
      )}

      {/* Cluster 3: Operations & Documents */}
      {operationsLinks.length > 0 && (
        <>
          <div className="subnav-cluster-divider" />
          {renderNavGroup(t('sales.sections.operations', 'Operations'), operationsLinks)}
        </>
      )}
    </div>
  );
};

export default SalesSubNav;
