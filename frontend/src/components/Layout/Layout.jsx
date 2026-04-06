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
          background-color: var(--bg-main);
        }
        .main-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          margin-left: ${isSidebarOpen ? 'var(--sidebar-w)' : '80px'};
          transition: margin-left 0.3s ease;
          min-width: 0; /* Prevent flex box from expanding beyond viewport */
        }
        .content-area {
          flex: 1;
          padding: 24px;
          overflow-y: auto;
          overflow-x: hidden;
        }
        @media (max-width: 768px) {
          .main-container {
            margin-left: 0 !important;
          }
          .sidebar {
            left: -100%;
          }
          .sidebar.open {
            left: 0;
            width: 100%;
          }
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
