import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Bell, Search, User, LogOut, ChevronDown, Menu, Moon, Sun } from 'lucide-react';

const Header = ({ toggleSidebar }) => {
  const { user, logout } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // Sync theme on mount
  useState(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  return (
    <header className="header">
      <style>{`
        .header {
          height: var(--header-h);
          background: var(--glass-bg);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--glass-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
          position: sticky;
          top: 0;
          z-index: 1000;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .search-bar {
          display: flex;
          align-items: center;
          background: rgba(0, 0, 0, 0.03);
          border: 1px solid transparent;
          border-radius: 12px;
          padding: 10px 16px;
          width: 320px;
          gap: 12px;
          transition: all 0.3s;
        }
        .search-bar:focus-within {
          background: white;
          border-color: var(--primary);
          box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1);
          width: 400px;
        }
        .search-bar input {
          border: none;
          background: transparent;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-main);
          width: 100%;
          outline: none;
        }
        .header-right {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .icon-btn {
          position: relative;
          color: var(--text-muted);
          transition: color 0.2s;
        }
        .icon-btn:hover {
          color: var(--primary);
        }
        .badge {
          position: absolute;
          top: -4px;
          right: -4px;
          background-color: var(--danger);
          color: white;
          font-size: 10px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid var(--bg-card);
        }
        .user-profile {
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 8px;
          transition: background 0.2s;
          position: relative;
        }
        .user-profile:hover {
          background-color: var(--bg-main);
        }
        .user-avatar {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          color: white;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 16px;
          box-shadow: 0 4px 10px rgba(79, 70, 229, 0.2);
        }
        .user-info {
          display: flex;
          flex-direction: column;
        }
        .user-name {
          font-size: 14px;
          font-weight: 600;
          line-height: 1.2;
        }
        .user-role {
          font-size: 12px;
          color: var(--text-muted);
          text-transform: capitalize;
        }
        .user-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          width: 180px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
          margin-top: 8px;
          padding: 8px;
        }
        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 5px 12px;
          border-radius: 6px;
          font-size: 14px;
          color: var(--text-main);
        }
        .dropdown-item:hover {
          background-color: var(--bg-main);
        }
        .dropdown-item.logout {
          color: var(--danger);
          margin-top: 4px;
          border-top: 1px solid var(--border);
          padding-top: 12px;
        }
      `}</style>

      <div className="header-left">
        <div className="search-bar">
          <Search size={18} />
          <input type="text" placeholder="Search for customers, deals..." />
        </div>
      </div>

      <div className="header-right">
        <button label="toggle control" className="icon-btn" onClick={toggleTheme}>
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>

        <button label="notification alert" className="icon-btn">
          <Bell size={20} />
          <span className="badge">3</span>
        </button>

        <div className="user-profile" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
          <div className="user-avatar">
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="user-info">
            <span className="user-name">{user?.name || 'Tashgheel User'}</span>
            <span className="user-role">{user?.role || 'Admin'}</span>
          </div>
          <ChevronDown size={16} color="var(--text-muted)" />
          
          {isDropdownOpen && (
            <div className="user-dropdown">
              <a href="#" className="dropdown-item">
                <User size={16} /> Profile
              </a>
              <div className="dropdown-item logout" onClick={logout}>
                <LogOut size={16} /> Logout
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
