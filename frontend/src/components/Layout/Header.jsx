import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Bell, Search, User, LogOut, ChevronDown, Menu, Moon, Sun, Clock, Check, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import BranchSelector from './BranchSelector';

const Header = ({ toggleSidebar }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.data);
      setUnreadCount(res.data.unreadCount);
    } catch (err) {
      console.error('Failed to fetch notifications');
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Simple polling for "real-time" experience
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      fetchNotifications();
    } catch (err) {
      toast.error('Failed to update notifications');
    }
  };

  const handleNotificationClick = async (notif) => {
    try {
      if (!notif.is_read) {
        await api.patch(`/notifications/${notif.id}/read`);
      }
      setIsNotificationsOpen(false);
      if (notif.link) navigate(notif.link);
      fetchNotifications();
    } catch (err) {
      console.error('Error handling notification click');
    }
  };

  const getNotifIcon = (type) => {
    switch(type) {
      case 'INVOICE_PAID': return <Check size={16} color="#16a34a" />;
      case 'MOVEMENT_CREATED': return <Clock size={16} color="#3b82f6" />;
      case 'EMPLOYEE_LATE': return <User size={16} color="#f59e0b" />;
      case 'LOW_STOCK': return <AlertCircle size={16} color="#ef4444" />;
      case 'SYSTEM_ALERT': return <AlertCircle size={16} color="#ef4444" />;
      default: return <Bell size={16} color="var(--primary)" />;
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const handleGlobalSearch = (e) => {
    if (e.key === 'Enter') {
      toast.success(`Searching for: ${globalSearch}...`);
    }
  };

  useEffect(() => {
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
        .header-left { display: flex; align-items: center; gap: 16px; }
        .search-bar { display: flex; align-items: center; background: rgba(0, 0, 0, 0.03); border: 1px solid transparent; border-radius: 12px; padding: 10px 16px; width: 320px; gap: 12px; transition: all 0.3s; }
        .search-bar:focus-within { background: white; border-color: var(--primary); box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1); width: 400px; }
        .search-bar input { border: none; background: transparent; font-size: 14px; font-weight: 500; color: var(--text-main); width: 100%; outline: none; }
        
        .header-right { display: flex; align-items: center; gap: 20px; }
        .icon-btn { position: relative; color: var(--text-muted); transition: color 0.2s; background: none; border: none; cursor: pointer; padding: 8px; border-radius: 8px; }
        .icon-btn:hover { color: var(--primary); background: rgba(79, 70, 229, 0.05); }
        .badge { position: absolute; top: 2px; right: 2px; background-color: var(--danger); color: white; font-size: 10px; width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid var(--bg-card); font-weight: 700; }
        
        .notification-dropdown { position: absolute; top: 100%; right: 120px; width: 320px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1); margin-top: 12px; overflow: hidden; animation: slideIn 0.2s ease-out; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .notif-header { padding: 15px; border-bottom: 1px solid var(--border); background: #f8fafc; display: flex; justify-content: space-between; align-items: center; }
        .notif-list { max-height: 360px; overflow-y: auto; }
        .notif-item { padding: 12px 15px; border-bottom: 1px solid var(--border); transition: background 0.2s; cursor: pointer; display: flex; gap: 12px; }
        .notif-item:hover { background: #f1f5f9; }
        .notif-content p { margin: 0; font-size: 13px; font-weight: 600; }
        .notif-time { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; margin-top: 4px; }
        .notif-item .icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: rgba(79, 70, 229, 0.1); color: var(--primary); flex-shrink: 0; }

        .user-profile { display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 4px 8px; border-radius: 8px; transition: background 0.2s; position: relative; }
        .user-profile:hover { background-color: var(--bg-main); }
        .user-avatar { width: 40px; height: 40px; background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%); color: white; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; box-shadow: 0 4px 10px rgba(79, 70, 229, 0.2); }
        .user-dropdown { position: absolute; top: 100%; right: 0; width: 180px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); margin-top: 8px; padding: 8px; }
        .dropdown-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 6px; font-size: 14px; color: var(--text-main); transition: 0.2s; }
        .dropdown-item:hover { background-color: var(--bg-main); color: var(--primary); }
        .dropdown-item.logout { color: var(--danger); margin-top: 4px; border-top: 1px solid var(--border); padding-top: 12px; }
        .dropdown-item.logout:hover { background: #fef2f2; }
      `}</style>

      <div className="header-left" onClick={() => { setIsDropdownOpen(false); setIsNotificationsOpen(false); }}>
        <div className="search-bar">
          <Search size={18} color="var(--text-muted)" />
          <input 
            type="text" 
            placeholder="Search for customers, deals..." 
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            onKeyDown={handleGlobalSearch}
          />
        </div>
      </div>

      <div className="header-right">
        {user?.isDemo && (
          <div style={{ 
            background: 'var(--warning-light)', 
            color: 'var(--warning-dark)', 
            padding: '8px 16px', 
            borderRadius: '100px', 
            fontSize: '13px', 
            fontWeight: '800',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            border: '1px solid var(--warning)',
            boxShadow: '0 4px 6px rgba(245, 158, 11, 0.1)'
          }}>
            <AlertCircle size={16} />
            {localStorage.getItem('lang') === 'ar' ? 'وضع التجربة (Demo Mode)' : 'Demo Mode Active'}
          </div>
        )}
        <BranchSelector />
        
        <button label="toggle control" className="icon-btn" onClick={toggleTheme} title="Toggle Dark/Light Mode">
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>

        <div style={{ position: 'relative' }}>
          <button 
            label="notification alert" 
            className="icon-btn" 
            onClick={() => { setIsNotificationsOpen(!isNotificationsOpen); setIsDropdownOpen(false); }}
          >
            <Bell size={20} />
            {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
          </button>

          {isNotificationsOpen && (
            <div className="notification-dropdown">
              <div className="notif-header">
                <span style={{ fontWeight: '800', fontSize: '15px' }}>Notifications</span>
                <span 
                  style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: '600', cursor: 'pointer' }}
                  onClick={handleMarkAllRead}
                >
                  Mark all read
                </span>
              </div>
              <div className="notif-list">
                {notifications.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    No notifications yet.
                  </div>
                ) : (
                  notifications.map(n => (
                    <div 
                      key={n.id} 
                      className="notif-item" 
                      onClick={() => handleNotificationClick(n)}
                      style={{ opacity: n.is_read ? 0.6 : 1 }}
                    >
                      <div className="icon">
                        {getNotifIcon(n.type)}
                      </div>
                      <div className="notif-content">
                        <p style={{ color: n.is_read ? 'var(--text-muted)' : 'var(--text-main)' }}>{n.title}</p>
                        <span className="notif-time">
                          <Clock size={10} /> {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {!n.is_read && <div style={{ width: '8px', height: '8px', background: 'var(--primary)', borderRadius: '50%', marginLeft: 'auto', marginTop: '4px' }}></div>}
                    </div>
                  ))
                )}
              </div>
              <div style={{ padding: '12px', textAlign: 'center', background: '#f8fafc', borderTop: '1px solid var(--border)', fontSize: '12px', fontWeight: '600', color: 'var(--primary)', cursor: 'pointer' }}>
                View All Notifications
              </div>
            </div>
          )}
        </div>

        <div className="user-profile" onClick={() => { setIsDropdownOpen(!isDropdownOpen); setIsNotificationsOpen(false); }}>
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
              <div className="dropdown-item">
                <User size={16} /> Profile
              </div>
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
