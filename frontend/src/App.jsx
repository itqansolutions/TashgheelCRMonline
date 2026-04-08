import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { Toaster } from 'react-hot-toast';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Products from './pages/Products';
import Deals from './pages/Deals';
import Tasks from './pages/Tasks';
import Invoices from './pages/Invoices';
import Files from './pages/Files';
import Reports from './pages/Reports';
import Employees from './pages/Employees';
import Logs from './pages/Logs';
import Settings from './pages/Settings';

// Placeholder components for other modules
const Placeholder = ({ name }) => (
  <div style={{ padding: '24px', backgroundColor: 'white', borderRadius: '12px', border: '1px solid var(--border)' }}>
    <h2 style={{ color: 'var(--primary)', marginBottom: '16px' }}>{name} Module</h2>
    <p>This module is currently under development. Stay tuned for Phase 10!</p>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <Router>
          <Toaster position="top-right" reverseOrder={false} />
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />

            {/* Protected Dashboard Routes */}
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="customers" element={<Customers />} />
              <Route path="products" element={<Products />} />
              <Route path="deals" element={<Deals />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="accounting" element={<Invoices />} />
              <Route 
                path="employees" 
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <Employees />
                  </ProtectedRoute>
                } 
              />
              <Route path="files" element={<Files />} />
              <Route path="reports" element={<Reports />} />
              <Route 
                path="logs" 
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <Logs />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="settings" 
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <Settings />
                  </ProtectedRoute>
                } 
              />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </DataProvider>
    </AuthProvider>
  );
}

export default App;
