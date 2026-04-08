import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [leadSources, setLeadSources] = useState([]);
  const [loading, setLoading] = useState(false);

  // Core Data Fetchers
  const fetchCustomers = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/customers');
      setCustomers(res.data.data);
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
      setProducts(res.data.data);
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
      setDeals(res.data.data);
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
      setQuotations(res.data.data);
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
      setUsers(res.data.data);
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
      setDepartments(res.data.data);
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
      setLeadSources(res.data.data);
    } catch (err) {
      toast.error('Failed to load lead sources');
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
    users, fetchUsers,
    departments, fetchDepartments,
    leadSources, fetchLeadSources,
    loading
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);
