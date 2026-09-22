import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';

const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="layout-wrapper">
      <style>{`
        .layout-wrapper {
          display: flex;
          min-height: 100vh;
          background-color: var(--bg-main, #f1f5f9);
          overflow-x: hidden;
          font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }
        .main-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          margin-left: ${isSidebarOpen ? 'var(--sidebar-w, 280px)' : '90px'};
          transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          min-width: 0;
          width: calc(100% - ${isSidebarOpen ? 'var(--sidebar-w, 280px)' : '90px'});
        }
        .content-area {
          flex: 1;
          padding: 24px 32px;
          overflow-y: auto;
          overflow-x: hidden;
          animation: fadeIn 0.4s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 768px) {
          .main-container {
            margin-left: 0 !important;
            width: 100% !important;
          }
          .content-area {
            padding: 16px;
          }
        }
        @media print {
          .layout-wrapper { display: block; }
          .main-container { margin-left: 0 !important; width: 100% !important; }
          .content-area { padding: 0 !important; }
          aside, header, nav, .sidebar-container, .header-container { display: none !important; }
        }
      `}</style>

      <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />

      <div className="main-container">
        <Header toggleSidebar={toggleSidebar} />
        
        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
