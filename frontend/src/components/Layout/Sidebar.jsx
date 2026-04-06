import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, Users, ShoppingBag, 
  Handshake, CheckSquare, Wallet, 
  Users2, FileText, BarChart3, ChevronLeft, ChevronRight 
} from 'lucide-react';

const Sidebar = ({ isOpen, toggleSidebar }) => {
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
  ];

  return (
    <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
      <style>{`
        .sidebar {
          height: 100vh;
          background-color: var(--primary);
          color: white;
          width: var(--sidebar-w);
          position: fixed;
          left: 0;
          top: 0;
          transition: width 0.3s ease;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          box-shadow: 4px 0 10px rgba(0, 0, 0, 0.1);
        }
        .sidebar.closed {
          width: 80px;
        }
        .sidebar-header {
          height: var(--header-h);
          display: flex;
          align-items: center;
          padding: 0 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          justify-content: space-between;
        }
        .sidebar-header h2 {
          font-size: 18px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          transition: opacity 0.2s;
          color: white;
        }
        .sidebar.closed .sidebar-header h2 {
          opacity: 0;
          pointer-events: none;
        }
        .toggle-btn {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          transition: background 0.2s;
        }
        .toggle-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .sidebar-nav {
          flex: 1;
          padding: 20px 0;
          overflow-y: auto;
          overflow-x: hidden;
        }
        .sidebar-nav a {
          display: flex;
          align-items: center;
          padding: 12px 20px;
          color: rgba(255, 255, 255, 0.7);
          transition: all 0.2s;
          gap: 16px;
          border-left: 4px solid transparent;
        }
        .sidebar-nav a:hover {
          background-color: rgba(255, 255, 255, 0.05);
          color: white;
        }
        .sidebar-nav a.active {
          background-color: rgba(255, 255, 255, 0.1);
          color: white;
          border-left-color: #fbbf24;
        }
        .sidebar-nav a svg {
          min-width: 20px;
          width: 20px;
          height: 20px;
        }
        .sidebar-nav a span {
          white-space: nowrap;
          font-weight: 500;
          font-size: 14px;
          transition: opacity 0.2s;
        }
        .sidebar.closed .sidebar-nav a span {
          opacity: 0;
          pointer-events: none;
        }
        .sidebar-footer {
          padding: 20px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
          text-align: center;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
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
        {navItems.map((item) => (
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
