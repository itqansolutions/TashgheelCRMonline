import React from 'react';
import { Outlet } from 'react-router-dom';
import CorporateNavbar from './components/CorporateNavbar';

const CorporateLayout = () => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      <CorporateNavbar />
      <main className="pt-20">
        <Outlet />
      </main>
    </div>
  );
};

export default CorporateLayout;
