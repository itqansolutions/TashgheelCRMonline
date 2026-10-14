import React from 'react';
import SalesCycle from '../ERP/SalesCycle';
import SalesSubNav from '../../components/Sales/SalesSubNav';
import { useLanguage } from '../../context/LanguageContext';

const SalesOrder = () => {
  const { isRTL } = useLanguage();

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <SalesSubNav />
      <div style={{ maxWidth: '1300px', margin: '0 auto' }}>
        <SalesCycle />
      </div>
    </div>
  );
};

export default SalesOrder;
