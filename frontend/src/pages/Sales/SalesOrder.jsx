import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { ShoppingBag, Plus, Search, Filter, FileText, CheckCircle2, Clock, Truck, DollarSign } from 'lucide-react';
import SalesSubNav from '../../components/Sales/SalesSubNav';
import SalesCycle from '../ERP/SalesCycle';

const SalesOrder = () => {
  return (
    <div>
      <SalesSubNav />
      <div style={{ padding: '0 24px 24px', maxWidth: '1300px', margin: '0 auto' }}>
        <SalesCycle />
      </div>
    </div>
  );
};

export default SalesOrder;
