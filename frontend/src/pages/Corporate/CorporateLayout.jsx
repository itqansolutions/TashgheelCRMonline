import React from 'react';
import { Outlet } from 'react-router-dom';
import CorporateNavbar from './components/CorporateNavbar';
import StickyConversionBar from './components/StickyConversionBar';
import QuickLeadPopup from './components/QuickLeadPopup';

const CorporateLayout = () => {
  return (
    <div className="corporate-layout" style={{ 
      minHeight: '100vh', 
      backgroundColor: 'white',
      paddingTop: '120px' // Height of navbar (80) + sticky bar (40)
    }}>
      <StickyConversionBar />
      <CorporateNavbar />
      <main>
        <Outlet />
      </main>
      <QuickLeadPopup />
      {/* Footer will go here later */}
    </div>
  );
};

export default CorporateLayout;
