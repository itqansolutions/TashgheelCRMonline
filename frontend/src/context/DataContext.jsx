import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { safeArray, safeObject } from '../utils/dataUtils';

const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [users, setUsers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [units, setUnits] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [leadSources, setLeadSources] = useState([]);
  const [settings, setSettings] = useState({});
  const [templateConfig, setTemplateConfig] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  // Core Data Fetchers
  const fetchUnits = async (showLoading = true) => {
      if (showLoading) setLoading(true);
      try {
          const res = await api.get('/re-units');
          setUnits(safeArray(res.data.data));
      } catch (err) {
          console.error('Failed to load units');
      } finally {
          setLoading(false);
      }
  };
  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      setSettings(safeObject(res.data.data));
    } catch (err) {
      console.error('Failed to load settings');
    }
  };
  const fetchCustomers = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/customers');
      setCustomers(safeArray(res.data.data));
    } catch (err) {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/products');
      setProducts(safeArray(res.data.data));
    } catch (err) {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const fetchDeals = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/deals');
      setDeals(safeArray(res.data.data));
      if (res.data.template_config) {
        setTemplateConfig(res.data.template_config);
      }
    } catch (err) {
      toast.error('Failed to load deals');
    } finally {
      setLoading(false);
    }
  };

  const fetchQuotations = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/quotations');
      setQuotations(safeArray(res.data.data));
    } catch (err) {
      toast.error('Failed to load quotations');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/users');
      setUsers(safeArray(res.data.data));
    } catch (err) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/departments');
      setDepartments(safeArray(res.data.data));
    } catch (err) {
      toast.error('Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  const fetchLeadSources = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/lead-sources');
      setLeadSources(safeArray(res.data.data));
    } catch (err) {
      toast.error('Failed to load lead sources');
    } finally {
      setLoading(false);
    }
  };

  const fetchExpenses = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/expenses');
      setExpenses(safeArray(res.data.data));
    } catch (err) {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/finance/payments'); // Assuming this route exists
      setPayments(safeArray(res.data.data));
    } catch (err) {
      toast.error('Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  // Shared state and actions
  const value = {
    customers, fetchCustomers,
    products, fetchProducts,
    deals, fetchDeals,
    quotations, fetchQuotations,
    expenses, fetchExpenses,
    payments, fetchPayments,
    users, fetchUsers,
    departments, fetchDepartments,
    leadSources, fetchLeadSources,
    settings, fetchSettings,
    templateConfig,
    units, fetchUnits,
    loading
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);
