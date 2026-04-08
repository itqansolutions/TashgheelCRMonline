import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, Users, ShoppingBag, 
  Handshake, CheckSquare, Wallet, 
  Users2, FileText, BarChart3, ChevronLeft, ChevronRight, History, Settings as SettingsIcon
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const { user } = useAuth();
  
  const navItems = [
    { name: 'Dashboard', icon: <LayoutDashboard />, path: '/' },
    { name: 'Customers', icon: <Users />, path: '/customers' },
    { name: 'Products', icon: <ShoppingBag />, path: '/products' },
    { name: 'Deals', icon: <Handshake />, path: '/deals' },
    { name: 'Tasks', icon: <CheckSquare />, path: '/tasks' },
    { name: 'Accounting', icon: <Wallet />, path: '/accounting' },
    { name: 'Employees', icon: <Users2 />, path: '/employees' },
    { name: 'Files', icon: <FileText />, path: '/files' },
    { name: 'Reports', icon: <BarChart3 />, path: '/reports' },
    { name: 'System Logs', icon: <History />, path: '/logs' },
    { name: 'Admin Settings', icon: <SettingsIcon />, path: '/settings' },
  ];

  // Filter items based on permissions
  const filteredItems = navItems.filter(item => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    
    const checkPath = item.path === '/' ? '/dashboard' : item.path;
    return user.allowedPages && user.allowedPages.includes(checkPath);
  });

  return (
    <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
      <style>{`
        .sidebar {
          height: 100vh;
          background: var(--glass-bg);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: var(--text-main);
          width: var(--sidebar-w);
          position: fixed;
          left: 0;
          top: 0;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 1001;
          display: flex;
          flex-direction: column;
          border-right: 1px solid var(--glass-border);
          box-shadow: 10px 0 30px rgba(0, 0, 0, 0.03);
        }
        .sidebar.closed {
          width: 90px;
        }
        .sidebar-header {
          height: var(--header-h);
          display: flex;
          align-items: center;
          padding: 0 24px;
          border-bottom: 1px solid var(--glass-border);
          justify-content: space-between;
        }
        .sidebar-header h2 {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: -0.02em;
          white-space: nowrap;
          overflow: hidden;
          transition: opacity 0.2s;
          color: var(--primary);
        }
        .sidebar.closed .sidebar-header h2 {
          opacity: 0;
          pointer-events: none;
        }
        .toggle-btn {
          background: rgba(79, 70, 229, 0.05);
          color: var(--primary);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6px;
          transition: all 0.2s;
        }
        .toggle-btn:hover {
          background: rgba(79, 70, 229, 0.1);
          transform: scale(1.05);
        }
        .sidebar-nav {
          flex: 1;
          padding: 24px 12px;
          overflow-y: auto;
          overflow-x: hidden;
        }
        .sidebar-nav a {
          display: flex;
          align-items: center;
          padding: 14px 16px;
          color: var(--text-muted);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          gap: 16px;
          border-radius: 12px;
          margin-bottom: 6px;
          position: relative;
        }
        .sidebar-nav a:hover {
          background-color: rgba(79, 70, 229, 0.05);
          color: var(--primary);
          transform: translateX(4px);
        }
        .sidebar-nav a.active {
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          color: white;
          box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.3);
        }
        .sidebar-nav a svg {
          min-width: 20px;
          width: 20px;
          height: 20px;
          transition: transform 0.3s;
        }
        .sidebar-nav a.active svg {
          transform: scale(1.1);
        }
        .sidebar-nav a span {
          white-space: nowrap;
          font-weight: 600;
          font-size: 15px;
          transition: opacity 0.2s;
        }
        .sidebar.closed .sidebar-nav a span {
          opacity: 0;
          pointer-events: none;
        }
        .sidebar-footer {
          padding: 24px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          text-align: center;
          border-top: 1px solid var(--glass-border);
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .sidebar.closed .sidebar-footer {
          display: none;
        }
      `}</style>
      
      <div className="sidebar-header">
        <h2>Tashgheel CRM</h2>
        <button label="toggle control" className="toggle-btn" onClick={toggleSidebar}>
          {isOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>

      <nav className="sidebar-nav">
        {filteredItems.map((item) => (
          <NavLink 
            key={item.name} 
            to={item.path} 
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            {item.icon}
            <span>{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        © 2024 Tashgheel V1.0
      </div>
    </div>
  );
};

export default Sidebar;
