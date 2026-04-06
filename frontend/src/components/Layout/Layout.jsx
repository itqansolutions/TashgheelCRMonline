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
          overflow-x: hidden;
        }
        .main-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          margin-left: ${isSidebarOpen ? 'var(--sidebar-w)' : '90px'};
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          min-width: 0;
        }
        .content-area {
          flex: 1;
          padding: 32px;
          overflow-y: auto;
          overflow-x: hidden;
          animation: fadeIn 0.5s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 1024px) {
          .main-container {
            margin-left: 0 !important;
          }
          .content-area {
            padding: 20px;
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
